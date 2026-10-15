// 終了処理（トレイ「終了」・更新インストール）の共通部分。

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const PREPARE_QUIT_TIMEOUT_SECS: u64 = 3;

/// update-prepare-quit の ack を待つための oneshot 送信端を保持する managed state。
#[derive(Default)]
pub struct UpdateAck(std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>);

/// 終了処理の二重起動を防ぐゲート。最初の要求だけを受け付ける。
#[derive(Default)]
pub struct QuitGate(AtomicBool);

impl QuitGate {
    /// 最初の呼び出しだけ true、以後は false を返す。
    pub fn try_begin(&self) -> bool {
        !self.0.swap(true, Ordering::SeqCst)
    }
}

/// 全ウィンドウへ update-prepare-quit を送り、ack かタイムアウト(3s)を待つ。
pub async fn wait_for_renderer(app: &AppHandle) {
    let (tx, rx) = tokio::sync::oneshot::channel();
    *app.state::<UpdateAck>().0.lock().unwrap_or_else(|e| e.into_inner()) = Some(tx);
    let _ = app.emit("update-prepare-quit", ());
    let _ = tokio::time::timeout(Duration::from_secs(PREPARE_QUIT_TIMEOUT_SECS), rx).await;
    *app.state::<UpdateAck>().0.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

/// renderer からの ack（保存完了）。wait_for_renderer の待機を解除する。
pub fn notify_renderer_ready(app: &AppHandle) {
    if let Some(tx) = app
        .state::<UpdateAck>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take()
    {
        let _ = tx.send(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
