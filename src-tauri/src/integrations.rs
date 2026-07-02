// Electron 版 src/main/integrations/{attendance,whiteboard}.ts + http.ts の Rust 移植。
// Lambda プロキシ経由で勤怠・ホワイトボードを送る。user_name/email は Lambda が JWT から解決。
//
// 判定ロジック（トークン有無・連携有効・401/失敗）を純粋関数に切り出して TDD し、
// 実 HTTP(reqwest) と副作用（連携発火・再サインイン促し）は薄い glue に寄せる。

use crate::auth::AuthStore;
use crate::settings_store::SettingsStore;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

pub const NEED_SIGNIN_MSG: &str = "Slack サインインが必要です（設定 > アカウント）";

/// httpPost 相当の結果（ネットワークエラーは status:0）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HttpResult {
    pub ok: bool,
    pub status: u16,
    pub body: String,
}

/// 勤怠送信の計画。
#[derive(Debug, PartialEq, Eq)]
pub enum AttendancePlan {
    /// 未サインイン。POST せずこのメッセージを結果 body にする。
    NeedSignIn(String),
    /// 送信する（url, JSON body, Bearer トークン）。
    Send {
        url: String,
        body: String,
        token: String,
    },
}

/// トークン有無から勤怠送信を計画する。
pub fn plan_attendance(proxy: &str, text: &str, token: Option<&str>) -> AttendancePlan {
    match token {
        None => AttendancePlan::NeedSignIn(NEED_SIGNIN_MSG.to_string()),
        Some(t) => AttendancePlan::Send {
            url: format!("{proxy}/api/attendance.send"),
            body: serde_json::json!({ "text": text }).to_string(),
            token: t.to_string(),
        },
    }
}

/// ホワイトボード更新の計画。
#[derive(Debug, PartialEq, Eq)]
pub enum WhiteboardPlan {
    /// 連携無効 → 何もしない。
    Skip,
    /// 未サインイン → 再サインインを促す。
    Prompt,
    /// 送信する（url, Bearer トークン）。body は常に "{}"。
    Send { url: String, token: String },
}

/// 連携有効/トークン有無から計画する。kind は "telework" | "leave"。
pub fn plan_whiteboard(
    proxy: &str,
    kind: &str,
    enabled: bool,
    token: Option<&str>,
) -> WhiteboardPlan {
    if !enabled {
        return WhiteboardPlan::Skip;
    }
    match token {
        None => WhiteboardPlan::Prompt,
        Some(t) => WhiteboardPlan::Send {
            url: format!("{proxy}/api/whiteboard.{kind}"),
            token: t.to_string(),
        },
    }
}

/// ホワイトボード応答の分類。
#[derive(Debug, PartialEq, Eq)]
pub enum WhiteboardOutcome {
    Done,
    Prompt,      // 401: 未認証/再認証要求
    Err(String), // その他の失敗
}

/// HTTP 結果からホワイトボードの後処理を分類する。
pub fn classify_whiteboard_response(status: u16, ok: bool, body: &str) -> WhiteboardOutcome {
    if status == 401 {
        WhiteboardOutcome::Prompt
    } else if !ok {
        WhiteboardOutcome::Err(format!("Whiteboard proxy error: {status} {body}"))
    } else {
        WhiteboardOutcome::Done
    }
}

// ---- glue（実 HTTP / 副作用） ----

use crate::config::proxy_url;

/// JSON + Bearer の POST。ネットワークエラーは status:0（Electron httpPost と同様 reject しない）。
async fn http_post(url: &str, body: String, token: &str) -> HttpResult {
    let send = reqwest::Client::new()
        .post(url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {token}"))
        .body(body)
        .send()
        .await;
    match send {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let ok = resp.status().is_success();
            let body = resp.text().await.unwrap_or_default();
            HttpResult { ok, status, body }
        }
        Err(e) => HttpResult {
            ok: false,
            status: 0,
            body: e.to_string(),
        },
    }
}

// サインイン促し通知はアプリ起動ごとに1回だけ（Electron 版 promptSignIn 相当）。
static PROMPTED: AtomicBool = AtomicBool::new(false);

fn prompt_sign_in(app: &AppHandle) {
    if PROMPTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = app
        .notification()
        .builder()
        .title("Juice")
        .body("連携機能には Slack サインインが必要です。設定 > アカウントからサインインしてください。")
        .show();
}

/// 勤怠を Lambda に送信。成功時はホワイトボード退勤を非同期発火する。
pub async fn send_attendance(app: &AppHandle, text: &str) -> HttpResult {
    let token = app.state::<AuthStore>().get_token();
    match plan_attendance(&proxy_url(), text, token.as_deref()) {
        AttendancePlan::NeedSignIn(msg) => HttpResult {
            ok: false,
            status: 0,
            body: msg,
        },
        AttendancePlan::Send { url, body, token } => {
            let result = http_post(&url, body, &token).await;
            if result.ok {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    send_whiteboard(&app, "leave").await;
                });
            }
            result
        }
    }
}

/// ホワイトボード状態を更新（telework / leave）。連携無効/未サインイン/401 は通知してスキップ。
pub async fn send_whiteboard(app: &AppHandle, kind: &str) {
    let enabled = app.state::<SettingsStore>().get_whiteboard_enabled();
    let token = app.state::<AuthStore>().get_token();
    match plan_whiteboard(&proxy_url(), kind, enabled, token.as_deref()) {
        WhiteboardPlan::Skip => {}
        WhiteboardPlan::Prompt => prompt_sign_in(app),
        WhiteboardPlan::Send { url, token } => {
            let result = http_post(&url, "{}".to_string(), &token).await;
            match classify_whiteboard_response(result.status, result.ok, &result.body) {
                WhiteboardOutcome::Done => {}
                WhiteboardOutcome::Prompt => prompt_sign_in(app),
                WhiteboardOutcome::Err(msg) => eprintln!("[whiteboard] {msg}"),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const PROXY: &str = "https://proxy.test";

    #[test]
    fn attendance_without_token_needs_signin() {
        match plan_attendance(PROXY, "text", None) {
            AttendancePlan::NeedSignIn(msg) => assert!(msg.contains("サインイン")),
            _ => panic!("expected NeedSignIn"),
        }
    }

    #[test]
    fn attendance_with_token_builds_request() {
        match plan_attendance(PROXY, "勤怠\n8:30 17:30 60", Some("jwt.x.y")) {
            AttendancePlan::Send { url, body, token } => {
                assert_eq!(url, "https://proxy.test/api/attendance.send");
                let v: Value = serde_json::from_str(&body).unwrap();
                assert_eq!(v["text"], "勤怠\n8:30 17:30 60");
                assert_eq!(token, "jwt.x.y");
            }
            _ => panic!("expected Send"),
        }
    }

    #[test]
    fn whiteboard_disabled_skips() {
        assert_eq!(
            plan_whiteboard(PROXY, "leave", false, Some("t")),
            WhiteboardPlan::Skip
        );
    }

    #[test]
    fn whiteboard_enabled_without_token_prompts() {
        assert_eq!(
            plan_whiteboard(PROXY, "telework", true, None),
            WhiteboardPlan::Prompt
        );
    }

    #[test]
    fn whiteboard_enabled_with_token_sends() {
        match plan_whiteboard(PROXY, "telework", true, Some("t")) {
            WhiteboardPlan::Send { url, token } => {
                assert_eq!(url, "https://proxy.test/api/whiteboard.telework");
                assert_eq!(token, "t");
            }
            _ => panic!("expected Send"),
        }
    }

    #[test]
    fn whiteboard_leave_url() {
        match plan_whiteboard(PROXY, "leave", true, Some("t")) {
            WhiteboardPlan::Send { url, .. } => {
                assert_eq!(url, "https://proxy.test/api/whiteboard.leave")
            }
            _ => panic!("expected Send"),
        }
    }

    #[test]
    fn classify_401_prompts() {
        assert_eq!(
            classify_whiteboard_response(401, false, "x"),
            WhiteboardOutcome::Prompt
        );
    }

    #[test]
    fn classify_success_done() {
        assert_eq!(
            classify_whiteboard_response(200, true, "{}"),
            WhiteboardOutcome::Done
        );
    }

    #[test]
    fn classify_other_error() {
        match classify_whiteboard_response(500, false, "boom") {
            WhiteboardOutcome::Err(msg) => {
                assert!(msg.contains("500"));
                assert!(msg.contains("boom"));
            }
            _ => panic!("expected Err"),
        }
    }
}
