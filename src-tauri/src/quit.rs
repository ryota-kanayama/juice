// 終了処理（トレイ「終了」・更新インストール）の共通部分。
//
// イベント名 `update-prepare-quit`・コマンド名 `update_ready_to_quit` は互換のため
// update- のまま。トレイ終了も同じ経路を通る。

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const PREPARE_QUIT_TIMEOUT_SECS: u64 = 3;

/// update-prepare-quit の ack を待つ全員分の oneshot 送信端を保持する managed state。
#[derive(Default)]
pub struct PrepareQuitAck(std::sync::Mutex<Vec<tokio::sync::oneshot::Sender<()>>>);

impl PrepareQuitAck {
    /// 待機者を1人登録し、ack で解かれる受信端を返す。
    pub fn register(&self) -> tokio::sync::oneshot::Receiver<()> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.0.lock().unwrap_or_else(|e| e.into_inner()).push(tx);
        rx
    }

    /// 登録済みの待機者を全員解く。
    pub fn release_all(&self) {
        let waiters = std::mem::take(&mut *self.0.lock().unwrap_or_else(|e| e.into_inner()));
        for tx in waiters {
            let _ = tx.send(());
        }
    }
}

/// 終了処理の二重起動を防ぐゲート。最初の要求だけを受け付ける。
#[derive(Default)]
pub struct QuitGate(AtomicBool);

impl QuitGate {
    /// 最初の呼び出しだけ true、以後は false を返す。
    pub fn try_begin(&self) -> bool {
        !self.0.swap(true, Ordering::SeqCst)
    }
}

/// update-prepare-quit を送り（購読するのはメインのポップオーバーの TimerPage だけ）、
/// ack かタイムアウト(3s)を待つ。
pub async fn wait_for_renderer(app: &AppHandle) {
    let rx = app.state::<PrepareQuitAck>().register();
    let _ = app.emit("update-prepare-quit", ());
    let _ = tokio::time::timeout(Duration::from_secs(PREPARE_QUIT_TIMEOUT_SECS), rx).await;
}

/// renderer からの ack（保存完了）。wait_for_renderer の待機を解除する。
pub fn notify_renderer_ready(app: &AppHandle) {
    app.state::<PrepareQuitAck>().release_all();
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::oneshot::error::TryRecvError;

    #[test]
    fn one_ack_releases_every_registered_waiter() {
        let ack = PrepareQuitAck::default();
        let mut first = ack.register();
        let mut second = ack.register();

        ack.release_all();

        assert_eq!(
            (first.try_recv(), second.try_recv()),
            (Ok(()), Ok(())),
            "1回の ack で登録済みの待機者が全員解けること"
        );
    }

    #[test]
    fn ack_without_waiters_does_nothing() {
        let ack = PrepareQuitAck::default();

        ack.release_all();

        let mut later = ack.register();
        assert_eq!(
            later.try_recv(),
            Err(TryRecvError::Empty),
            "待機者がいない間の ack は、あとから登録した待機者を解かないこと"
        );
    }

    #[test]
    fn registering_a_later_waiter_does_not_release_earlier_ones() {
        let ack = PrepareQuitAck::default();
        let mut first = ack.register();

        let _second = ack.register();

        assert_eq!(
            first.try_recv(),
            Err(TryRecvError::Empty),
            "後から登録しても、先に登録した待機者は ack が来るまで待ち続けること"
        );
    }

    #[test]
    fn first_quit_request_is_accepted() {
        let gate = QuitGate::default();

        let accepted = gate.try_begin();

        assert!(accepted, "最初の終了要求は受け付けること");
    }

    #[test]
    fn second_quit_request_is_rejected() {
        let gate = QuitGate::default();
        gate.try_begin();

        let accepted = gate.try_begin();

        assert!(!accepted, "2回目の終了要求は受け付けないこと");
    }

    #[test]
    fn later_quit_requests_are_rejected() {
        let gate = QuitGate::default();
        gate.try_begin();
        gate.try_begin();

        let accepted = gate.try_begin();

        assert!(!accepted, "3回目以降の終了要求も受け付けないこと");
    }
}
