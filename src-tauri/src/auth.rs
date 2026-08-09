// Electron 版 src/main/auth/authStore.ts の Rust 移植。
// セッション JWT を macOS Keychain(keyring) に保存し、payload から表示用ステータスを作る。
// 署名検証は Lambda 側の責務。ここは payload を読むだけ（base64url JSON）。
//
// 注: Electron 版は safeStorage で auth.enc を暗号化していた。互換性は無いため、
// 既存ユーザーは移行時に再ログインが必要（設計上許容）。

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::Serialize;
use std::path::PathBuf;

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
/// トークンの置き場所。dev と本番で分ける。
enum Backend {
    /// 本番: macOS Keychain
    Keychain { service: String, account: String },
    /// dev: データディレクトリ配下のファイル
    File(PathBuf),
}

pub struct AuthStore {
    backend: Backend,
}

impl Default for AuthStore {
    fn default() -> Self {
        Self::with_keychain()
    }
}

impl AuthStore {
    /// 本番は macOS Keychain、dev（debug ビルド）は data_dir 配下のファイルに置く。
    ///
    /// dev で Keychain を使うと、再ビルドのたびに実行ファイルの署名が変わって
    /// Keychain の ACL と一致しなくなり、起動のたびにパスワードを求められる。
    /// あわせて、これまで dev と本番が同じ Keychain 項目（Juice / auth-token）を
    /// 共有していたため、dev でサインイン・サインアウトすると本番のトークンまで
    /// 書き換わっていた。データディレクトリと同じく dev / 本番で分ける。
    pub fn new(data_dir: PathBuf) -> Self {
        if cfg!(debug_assertions) {
            Self::with_file(data_dir.join("auth-token"))
        } else {
            Self::with_keychain()
        }
    }

    fn with_keychain() -> Self {
        Self {
            backend: Backend::Keychain {
                service: "Juice".to_string(),
                account: "auth-token".to_string(),
            },
        }
    }

    fn with_file(path: PathBuf) -> Self {
        Self {
            backend: Backend::File(path),
        }
    }

    pub fn save_token(&self, jwt: &str) -> Result<(), String> {
        match &self.backend {
            Backend::Keychain { service, account } => keyring::Entry::new(service, account)
                .map_err(|e| e.to_string())?
                .set_password(jwt)
                .map_err(|e| e.to_string()),
            Backend::File(path) => write_token_file(path, jwt),
        }
    }

    /// 取得できない・未保存なら None。
    pub fn get_token(&self) -> Option<String> {
        match &self.backend {
            Backend::Keychain { service, account } => {
                keyring::Entry::new(service, account).ok()?.get_password().ok()
            }
            Backend::File(path) => {
                let s = std::fs::read_to_string(path).ok()?;
                let t = s.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(t.to_string())
                }
            }
        }
    }

    pub fn clear_token(&self) {
        match &self.backend {
            Backend::Keychain { service, account } => {
                if let Ok(e) = keyring::Entry::new(service, account) {
                    let _ = e.delete_credential();
                }
            }
            Backend::File(path) => {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    pub fn get_status(&self, now_ms: i64) -> AuthStatus {
        match self.get_token() {
            Some(t) => parse_auth_status(&t, now_ms),
            None => AuthStatus::default(),
        }
    }
}

/// トークンを本人だけが読める権限（0600）で書く。
fn write_token_file(path: &std::path::Path, jwt: &str) -> Result<(), String> {
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)
        .map_err(|e| e.to_string())?;
    f.write_all(jwt.as_bytes()).map_err(|e| e.to_string())?;
    // 既存ファイルを開いた場合は mode(0o600) が効かないため、明示的に締め直す
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| e.to_string())
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

    fn file_store() -> (AuthStore, tempfile::TempDir) {
        let dir = tempfile::TempDir::new().unwrap();
        (AuthStore::with_file(dir.path().join("auth-token")), dir)
    }

    #[test]
    fn file_backend_saves_and_reads_back() {
        let (s, _d) = file_store();
        assert_eq!(s.get_token(), None);
        s.save_token("jwt-value").unwrap();
        assert_eq!(s.get_token().as_deref(), Some("jwt-value"));
    }

    #[test]
    fn file_backend_overwrites_previous_token() {
        let (s, _d) = file_store();
        s.save_token("old").unwrap();
        s.save_token("new").unwrap();
        assert_eq!(s.get_token().as_deref(), Some("new"));
    }

    #[test]
    fn file_backend_clear_removes_token() {
        let (s, _d) = file_store();
        s.save_token("jwt-value").unwrap();
        s.clear_token();
        assert_eq!(s.get_token(), None);
        // 消したあとにもう一度消しても落ちない
        s.clear_token();
    }

    #[test]
    fn file_backend_treats_empty_file_as_no_token() {
        let (s, d) = file_store();
        std::fs::write(d.path().join("auth-token"), "   \n").unwrap();
        assert_eq!(s.get_token(), None);
    }

    #[test]
    fn file_backend_is_readable_only_by_owner() {
        use std::os::unix::fs::PermissionsExt;
        let (s, d) = file_store();
        s.save_token("jwt-value").unwrap();
        let mode = std::fs::metadata(d.path().join("auth-token"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600, "トークンのファイルは本人だけが読める権限にする");
    }

    #[test]
    fn file_backend_status_reflects_saved_token() {
        let (s, _d) = file_store();
        s.save_token(&fake_jwt(json!({ "name": "金山", "exp": FUTURE }))).unwrap();
        let st = s.get_status(NOW_MS);
        assert!(st.signed_in);
        assert_eq!(st.name.as_deref(), Some("金山"));
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
            backend: Backend::Keychain {
                service: "JuiceTest-roundtrip".to_string(),
                account: "smoke".to_string(),
            },
        };
        store.clear_token();
        assert_eq!(store.get_token(), None);
        store.save_token("a.b.c").unwrap();
        assert_eq!(store.get_token().as_deref(), Some("a.b.c"));
        store.clear_token();
        assert_eq!(store.get_token(), None);
    }
}
