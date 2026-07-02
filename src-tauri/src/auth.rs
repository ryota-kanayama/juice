// Electron 版 src/main/auth/authStore.ts の Rust 移植。
// セッション JWT を macOS Keychain(keyring) に保存し、payload から表示用ステータスを作る。
// 署名検証は Lambda 側の責務。ここは payload を読むだけ（base64url JSON）。
//
// 注: Electron 版は safeStorage で auth.enc を暗号化していた。互換性は無いため、
// 既存ユーザーは移行時に再ログインが必要（設計上許容）。

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::Serialize;

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub signed_in: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}

/// JWT payload から AuthStatus を作る。3パート/復号/exp(number・未期限) を満たさなければ
/// signedIn:false。name は name クレーム、avatarUrl は picture クレーム、expiresAt は exp の ISO。
pub fn parse_auth_status(token: &str, now_ms: i64) -> AuthStatus {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return AuthStatus::default();
    }
    let payload = match decode_payload(parts[1]) {
        Some(p) => p,
        None => return AuthStatus::default(),
    };
    // exp は数値かつ未期限であること（exp*1000 > now）
    let exp = match payload.get("exp").and_then(serde_json::Value::as_f64) {
        Some(e) => e,
        None => return AuthStatus::default(),
    };
    if exp * 1000.0 <= now_ms as f64 {
        return AuthStatus::default();
    }
    AuthStatus {
        signed_in: true,
        name: payload
            .get("name")
            .and_then(serde_json::Value::as_str)
            .map(String::from),
        avatar_url: payload
            .get("picture")
            .and_then(serde_json::Value::as_str)
            .map(String::from),
        expires_at: Some(iso_from_exp(exp as i64)),
    }
}

/// JWT の base64url payload を JSON Value にデコードする。
fn decode_payload(b64: &str) -> Option<serde_json::Value> {
    let bytes = URL_SAFE_NO_PAD.decode(b64).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// exp(秒) を JS の Date.toISOString() 同形式 "YYYY-MM-DDTHH:MM:SS.sssZ" にする。
fn iso_from_exp(exp_secs: i64) -> String {
    chrono::DateTime::from_timestamp(exp_secs, 0)
        .unwrap_or_default()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

/// セッション JWT を Keychain に保存・取得・削除する。
pub struct AuthStore {
    service: String,
    account: String,
}

impl Default for AuthStore {
    fn default() -> Self {
        Self::new()
    }
}

impl AuthStore {
    pub fn new() -> Self {
        Self {
            service: "Juice".to_string(),
            account: "auth-token".to_string(),
        }
    }

    fn entry(&self) -> Option<keyring::Entry> {
        keyring::Entry::new(&self.service, &self.account).ok()
    }

    pub fn save_token(&self, jwt: &str) -> Result<(), String> {
        self.entry()
            .ok_or_else(|| "keyring entry 作成失敗".to_string())?
            .set_password(jwt)
            .map_err(|e| e.to_string())
    }

    /// 取得できない・未保存なら None。
    pub fn get_token(&self) -> Option<String> {
        self.entry()?.get_password().ok()
    }

    pub fn clear_token(&self) {
        if let Some(e) = self.entry() {
            let _ = e.delete_credential();
        }
    }

    pub fn get_status(&self, now_ms: i64) -> AuthStatus {
        match self.get_token() {
            Some(t) => parse_auth_status(&t, now_ms),
            None => AuthStatus::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // 固定時刻（2023-11頃 ms）。future/past はこれを基準にする。
    const NOW_MS: i64 = 1_700_000_000_000;
    const FUTURE: i64 = 2_000_000_000; // 2033年（未期限）
    const PAST: i64 = 1_600_000_000; // 2020年（期限切れ）

    fn fake_jwt(claims: serde_json::Value) -> String {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"HS256","typ":"JWT"}"#);
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
        format!("{header}.{payload}.sig")
    }

    #[test]
    fn valid_token_returns_name_and_exp() {
        let token = fake_jwt(json!({ "name": "金山", "exp": FUTURE }));
        let s = parse_auth_status(&token, NOW_MS);
        assert!(s.signed_in);
        assert_eq!(s.name.as_deref(), Some("金山"));
        // 2_000_000_000 秒 = 2033-05-18T03:33:20Z
        assert_eq!(s.expires_at.as_deref(), Some("2033-05-18T03:33:20.000Z"));
    }

    #[test]
    fn picture_becomes_avatar_url() {
        let token = fake_jwt(json!({ "name": "金山", "picture": "https://slack.test/a.png", "exp": FUTURE }));
        assert_eq!(
            parse_auth_status(&token, NOW_MS).avatar_url.as_deref(),
            Some("https://slack.test/a.png")
        );
    }

    #[test]
    fn missing_picture_is_none() {
        let token = fake_jwt(json!({ "name": "金山", "exp": FUTURE }));
        assert_eq!(parse_auth_status(&token, NOW_MS).avatar_url, None);
    }

    #[test]
    fn expired_token_is_signed_out() {
        let token = fake_jwt(json!({ "name": "x", "exp": PAST }));
        assert_eq!(parse_auth_status(&token, NOW_MS), AuthStatus::default());
    }

    #[test]
    fn non_jwt_is_signed_out() {
        assert_eq!(parse_auth_status("not-a-jwt", NOW_MS), AuthStatus::default());
    }

    #[test]
    fn broken_payload_is_signed_out() {
        // 3パートだが payload が base64url JSON でない
        assert_eq!(
            parse_auth_status("aaa.!!!notbase64!!!.sig", NOW_MS),
            AuthStatus::default()
        );
    }

    #[test]
    fn missing_exp_is_signed_out() {
        let token = fake_jwt(json!({ "name": "x" }));
        assert_eq!(parse_auth_status(&token, NOW_MS), AuthStatus::default());
    }

    #[test]
    fn default_status_is_signed_out() {
        let s = AuthStatus::default();
        assert!(!s.signed_in);
        assert_eq!(s.name, None);
    }

    // 実 Keychain に触れるため通常は除外。`cargo test -- --ignored` で手動確認する。
    #[test]
    #[ignore = "touches real macOS Keychain"]
    fn keychain_roundtrip() {
        let store = AuthStore {
            service: "JuiceTest-roundtrip".to_string(),
            account: "smoke".to_string(),
        };
        store.clear_token();
        assert_eq!(store.get_token(), None);
        store.save_token("a.b.c").unwrap();
        assert_eq!(store.get_token().as_deref(), Some("a.b.c"));
        store.clear_token();
        assert_eq!(store.get_token(), None);
    }
}
