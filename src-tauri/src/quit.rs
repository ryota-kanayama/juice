// 終了処理（トレイ「終了」・更新インストール）の共通部分。

/// 終了処理の二重起動を防ぐゲート。最初の要求だけを受け付ける。
#[derive(Default)]
pub struct QuitGate;

impl QuitGate {
    /// 最初の呼び出しだけ true、以後は false を返す。
    pub fn try_begin(&self) -> bool {
        todo!()
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
