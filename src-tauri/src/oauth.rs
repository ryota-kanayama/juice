// Slack サインインの OAuth フロー（Electron 版 src/main/auth/signIn.ts の Rust 移植）。
// ブラウザで proxy/auth/start?state=… を開き、juice://auth?token&state コールバックを
// deep-link で受けて state 照合 → トークン保存 → auth-changed 配信、を行う。
//
// 注: macOS では juice:// スキームは Info.plist（パッケージ版）でのみ OS に登録される。
// dev ビルドでは汎用バイナリに紐づくため、コールバックの E2E はパッケージ版で確認する
// （Electron 版と同じ制約）。

use crate::auth::AuthStore;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

const STATE_TTL_MS: i64 = 10 * 60 * 1000;

use crate::config::proxy_url;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

struct Pending {
    state: String,
    expires_at: i64,
}

/// 進行中のサインイン state を1つだけ保持する（managed state）。
#[derive(Default)]
pub struct PendingState(Mutex<Option<Pending>>);

fn random_state() -> String {
    let mut buf = [0u8; 16];
    getrandom::getrandom(&mut buf).expect("getrandom failed");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// ブラウザで Slack サインインを開始する。再度呼ぶと前回の state は無効になる。
pub fn start_sign_in(app: &AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let state = random_state();
    {
        let pending = app.state::<PendingState>();
        *pending.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(Pending {
            state: state.clone(),
            expires_at: now_ms() + STATE_TTL_MS,
        });
    }
    let url = format!("{}/auth/start?state={}", proxy_url(), state);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// juice://auth のコールバック URL から (token, state) を取り出す。
/// juice://auth 以外（パース不能・別スキーム・別ホスト）は None。
fn parse_callback(raw_url: &str) -> Option<(Option<String>, Option<String>)> {
    let url = url::Url::parse(raw_url).ok()?;
    if url.scheme() != "juice" || url.host_str() != Some("auth") {
        return None;
    }
    let find = |key: &str| {
        url.query_pairs()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.to_string())
    };
    Some((find("token"), find("state")))
}

/// 進行中の state とコールバックの state が一致し、期限内で、token がある場合のみ token を返す。
fn verify_callback(
    pending: &Pending,
    state: Option<String>,
    token: Option<String>,
    now: i64,
) -> Option<String> {
    if pending.state != state.unwrap_or_default() || now > pending.expires_at {
        return None;
    }
    token
}

/// juice://auth?token&state コールバックを処理する。
/// state 照合に成功した場合のみトークンを保存し true を返す。
pub fn handle_callback(app: &AppHandle, raw_url: &str) -> bool {
    let (token, state) = match parse_callback(raw_url) {
        Some(parsed) => parsed,
        None => return false,
    };

    // ワンショット: 成否によらず pending を使い捨てる
    let pending = app
        .state::<PendingState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take();

    // サインイン進行中でなければ静かに無視する（無関係・悪意あるコールバック対策）
    let pending = match pending {
        Some(p) => p,
        None => return false,
    };

    let token = match verify_callback(&pending, state, token, now_ms()) {
        Some(t) => t,
        None => {
            eprintln!("[oauth] callback rejected: state mismatch or expired");
            notify(app, "サインインに失敗しました。やり直してください。");
            crate::show_after_sign_in(app);
            return false;
        }
    };

    let store = app.state::<AuthStore>();
    if let Err(e) = store.save_token(&token) {
        eprintln!("[oauth] save_token failed: {e}");
        notify(app, "サインインに失敗しました。やり直してください。");
        crate::show_after_sign_in(app);
        return false;
    }
    let status = store.get_status(now_ms());
    let _ = app.emit("auth-changed", &status);
    notify(
        app,
        &format!("Slack にサインインしました（{}）", status.name.clone().unwrap_or_default()),
    );
    // ブラウザから戻ってきたので、サインインを始めた画面を前に出す（#149）
    crate::show_after_sign_in(app);
    true
}

fn notify(app: &AppHandle, body: &str) {
    crate::notify::show(app, body, crate::notify::OnClick::ShowPanel);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pending(state: &str, expires_at: i64) -> Pending {
        Pending {
            state: state.to_string(),
            expires_at,
        }
    }

    // --- random_state ---

    #[test]
    fn random_state_is_32_hex_chars() {
        let state = random_state();

        assert_eq!(state.len(), 32);
        assert!(state.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn random_state_differs_between_calls() {
        let a = random_state();
        let b = random_state();

        assert_ne!(a, b);
    }

    // --- parse_callback ---

    #[test]
    fn parse_callback_extracts_token_and_state() {
        let parsed = parse_callback("juice://auth?token=abc&state=xyz");

        assert_eq!(parsed, Some((Some("abc".into()), Some("xyz".into()))));
    }

    #[test]
    fn parse_callback_returns_none_token_when_missing() {
        let parsed = parse_callback("juice://auth?state=xyz");

        assert_eq!(parsed, Some((None, Some("xyz".into()))));
    }

    #[test]
    fn parse_callback_rejects_other_scheme() {
        let parsed = parse_callback("https://auth?token=abc&state=xyz");

        assert_eq!(parsed, None);
    }

    #[test]
    fn parse_callback_rejects_other_host() {
        let parsed = parse_callback("juice://other?token=abc&state=xyz");

        assert_eq!(parsed, None);
    }

    #[test]
    fn parse_callback_rejects_unparsable_url() {
        let parsed = parse_callback("not a url");

        assert_eq!(parsed, None);
    }

    // --- verify_callback ---

    #[test]
    fn verify_callback_accepts_matching_state_within_ttl() {
        let p = pending("s1", 1_000);

        let token = verify_callback(&p, Some("s1".into()), Some("tok".into()), 500);

        assert_eq!(token, Some("tok".to_string()));
    }

    #[test]
    fn verify_callback_accepts_exactly_at_expiry() {
        let p = pending("s1", 1_000);

        let token = verify_callback(&p, Some("s1".into()), Some("tok".into()), 1_000);

        assert_eq!(token, Some("tok".to_string()));
    }

    #[test]
    fn verify_callback_rejects_after_expiry() {
        let p = pending("s1", 1_000);

        let token = verify_callback(&p, Some("s1".into()), Some("tok".into()), 1_001);

        assert_eq!(token, None);
    }

    #[test]
    fn verify_callback_rejects_state_mismatch() {
        let p = pending("s1", 1_000);

        let token = verify_callback(&p, Some("other".into()), Some("tok".into()), 500);

        assert_eq!(token, None);
    }

    #[test]
    fn verify_callback_rejects_missing_state() {
        let p = pending("s1", 1_000);

        let token = verify_callback(&p, None, Some("tok".into()), 500);

        assert_eq!(token, None);
    }

    #[test]
    fn verify_callback_rejects_missing_token() {
        let p = pending("s1", 1_000);

        let token = verify_callback(&p, Some("s1".into()), None, 500);

        assert_eq!(token, None);
    }
}
