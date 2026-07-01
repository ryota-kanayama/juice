// アプリ内アップデート（Electron 版 src/main/update/* の Rust 完全移植）。
// 署名なし GitHub Releases から arch 一致の DMG を取得し、アプリ終了後に bash スクリプトで
// .app を自己差し替えする。dev / .app パス不明時は DMG を開くだけ（従来挙動）。
//
// renderer へのイベント名はシム(electron-api-shim.ts)の購読に合わせる:
//   update-available / update-progress / update-prepare-quit
//
// セキュリティ設計（受容済みトレードオフ）:
//   コード署名検証は行わない（署名鍵運用を避ける方針・ユーザー決定）。代わりに
//   (1) 取得元を HTTPS + GitHub ドメインに限定（is_trusted_github_url）し MITM を緩和、
//   (2) asset 名を basename 化＋プロセス専用ディレクトリへ隔離してパストラバーサル/予測可能
//       パス攻撃を防止する。配信物の真正性は GitHub Releases + TLS に依存する。

use crate::settings_store::SettingsStore;
use serde::Serialize;
use std::cmp::Ordering;
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/ryota-kanayama/juice/releases/latest";
const CHECK_INTERVAL_SECS: u64 = 6 * 60 * 60;
const PREPARE_QUIT_TIMEOUT_SECS: u64 = 3;

// ---- 型 ----

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_url: String,
    pub download_url: Option<String>,
    pub asset_name: Option<String>,
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseAsset {
    pub name: String,
    pub url: String,
}

pub struct GithubRelease {
    pub tag_name: String,
    pub html_url: String,
    pub body: String,
    pub assets: Vec<ReleaseAsset>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    percent: i64,
    done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// update-prepare-quit の ack を待つための oneshot 送信端を保持する managed state。
#[derive(Default)]
pub struct UpdateAck(std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>);

// ---- バージョン比較（Electron 版 shared/version.ts 相当） ----

/// 先頭の v/V と前後空白を除く。
fn normalize_version(v: &str) -> String {
    v.trim().trim_start_matches(['v', 'V']).to_string()
}

/// major.minor.patch を数値比較。桁欠落は 0 扱い。
fn compare_versions(a: &str, b: &str) -> Ordering {
    let pa = parse_parts(a);
    let pb = parse_parts(b);
    let len = pa.len().max(pb.len());
    for i in 0..len {
        let da = pa.get(i).copied().unwrap_or(0);
        let db = pb.get(i).copied().unwrap_or(0);
        match da.cmp(&db) {
            Ordering::Equal => continue,
            ord => return ord,
        }
    }
    Ordering::Equal
}

fn parse_parts(v: &str) -> Vec<u64> {
    normalize_version(v)
        .split('.')
        .map(|n| n.parse::<u64>().unwrap_or(0))
        .collect()
}

/// candidate が current より新しければ true。
fn is_newer_version(candidate: &str, current: &str) -> bool {
    compare_versions(candidate, current) == Ordering::Greater
}

// ---- アセット選択（Electron 版 selectAsset.ts 相当） ----

/// arm64 向け DMG か。Tauri 命名（`_aarch64.dmg`）と Electron 命名（`-arm64.dmg`）の両方。
fn is_arm64_dmg(name: &str) -> bool {
    name.ends_with("_aarch64.dmg") || name.ends_with("-arm64.dmg")
}

/// 実行 arch に合う DMG を選ぶ。
/// Electron→Tauri 移行の橋渡しのため、両者の命名を受理する:
///   arm64 : `_aarch64.dmg`（Tauri） / `-arm64.dmg`（Electron）
///   x64   : `_x64.dmg`（Tauri） / 無印 `.dmg`（Electron、arm64 でないもの）
/// arm64 の DMG を x64 機が誤選択しないよう明確に除外する。
fn select_dmg_asset(assets: &[ReleaseAsset], arch: &str) -> Option<ReleaseAsset> {
    if arch == "arm64" {
        return assets.iter().find(|a| is_arm64_dmg(&a.name)).cloned();
    }
    // x64: 明示 `_x64.dmg` を優先、無ければ arm64 でない `.dmg`（Electron 無印）
    assets
        .iter()
        .find(|a| a.name.ends_with("_x64.dmg"))
        .or_else(|| {
            assets
                .iter()
                .find(|a| a.name.ends_with(".dmg") && !is_arm64_dmg(&a.name))
        })
        .cloned()
}

/// std の ARCH を Electron の process.arch 表記へ。
fn current_arch() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "arm64",
        _ => "x64",
    }
}

// ---- GitHub Release 取得 ----

async fn fetch_latest_release() -> Result<GithubRelease, String> {
    // GitHub API は User-Agent 必須。
    let client = reqwest::Client::builder()
        .user_agent("juice-updater")
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(LATEST_RELEASE_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("GitHub API responded {}", res.status()));
    }
    let raw: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let assets = raw
        .get("assets")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let name = a.get("name").and_then(|v| v.as_str())?;
                    let url = a.get("browser_download_url").and_then(|v| v.as_str())?;
                    Some(ReleaseAsset {
                        name: name.to_string(),
                        url: url.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(GithubRelease {
        tag_name: str_field(&raw, "tag_name"),
        html_url: str_field(&raw, "html_url"),
        body: str_field(&raw, "body"),
        assets,
    })
}

fn str_field(v: &serde_json::Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string()
}

/// ダウンロード/リリースURLが HTTPS かつ GitHub ドメインかを検証する。
/// 署名検証なし方式（ユーザー決定）の MITM 緩和として、取得元を信頼ドメインに限定する。
fn is_trusted_github_url(raw: &str) -> bool {
    match url::Url::parse(raw) {
        Ok(u) => {
            u.scheme() == "https"
                && u.host_str().map_or(false, |h| {
                    h == "github.com"
                        || h.ends_with(".github.com")
                        || h == "githubusercontent.com"
                        || h.ends_with(".githubusercontent.com")
                })
        }
        Err(_) => false,
    }
}

/// asset 名からディレクトリ成分を落とし、安全なファイル名のみ返す（パストラバーサル防止）。
fn safe_asset_name(name: &str) -> Option<String> {
    let base = std::path::Path::new(name).file_name()?.to_string_lossy().to_string();
    if base.is_empty() || base == "." || base == ".." {
        return None;
    }
    Some(base)
}

/// 本プロセス専用の作業ディレクトリを作る（共有 /tmp の予測可能パス・symlink 攻撃を回避）。
fn update_work_dir() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join(format!("juice-update-{}", std::process::id()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

// ---- チェック ----

fn current_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

pub async fn check_for_update(app: &AppHandle) -> Result<UpdateInfo, String> {
    let release = fetch_latest_release().await?;
    let latest = normalize_version(&release.tag_name);
    let asset = select_dmg_asset(&release.assets, current_arch());
    let current = current_version(app);
    Ok(UpdateInfo {
        has_update: is_newer_version(&latest, &current),
        current_version: current,
        latest_version: latest,
        release_url: release.html_url,
        download_url: asset.as_ref().map(|a| a.url.clone()),
        asset_name: asset.as_ref().map(|a| a.name.clone()),
        notes: release.body,
    })
}

async fn check_and_notify(app: &AppHandle) {
    match check_for_update(app).await {
        Ok(info) => {
            let dismissed = app.state::<SettingsStore>().get_dismissed_update_version();
            if info.has_update && info.latest_version != dismissed {
                let _ = app.emit("update-available", &info);
            }
        }
        Err(e) => eprintln!("[update] check failed: {e}"),
    }
}

/// 起動時に1回 + 6時間ごとに更新確認する（Electron 版 startPeriodicCheck 相当）。
pub fn start_periodic_check(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            check_and_notify(&app).await;
            tokio::time::sleep(Duration::from_secs(CHECK_INTERVAL_SECS)).await;
        }
    });
}

// ---- ダウンロード ----

fn emit_progress(app: &AppHandle, percent: i64, done: bool, error: Option<String>) {
    let _ = app.emit(
        "update-progress",
        Progress {
            percent,
            done,
            error,
        },
    );
}

async fn download_file(app: &AppHandle, url: &str, dest: &PathBuf) -> Result<(), String> {
    let res = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("download failed: {}", res.status()));
    }
    let total = res.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut received: u64 = 0;
    let mut res = res;
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if total > 0 {
            emit_progress(app, ((received as f64 / total as f64) * 100.0).round() as i64, false, None);
        }
    }
    emit_progress(app, 100, false, None);
    Ok(())
}

// ---- インストール（.app 自己差し替え） ----

/// bash 用にシングルクォートで安全に囲む。
fn shq(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// アプリ終了後に .app を差し替える bash スクリプトを生成する（Electron 版 installScript.ts 相当）。
fn build_install_script(pid: u32, dmg_path: &str, app_path: &str, log_path: &str) -> String {
    format!(
        r#"#!/bin/bash
LOG={log}
exec >>"$LOG" 2>&1
PID={pid}
DMG={dmg}
APP={app}
APP_NAME="$(basename "$APP")"
MOUNT="$(mktemp -d)"
BACKUP="$APP.old"

# 1) アプリの終了を待つ（最大 ~30s の保険ループ）
for i in $(seq 1 100); do kill -0 "$PID" 2>/dev/null || break; sleep 0.3; done

# 2) DMG を専用マウントポイントへ（ボリューム名に依存しない）
hdiutil attach "$DMG" -nobrowse -mountpoint "$MOUNT" || exit 1

# 3) 退避 → コピー → 失敗時ロールバック
rm -rf "$BACKUP"
mv "$APP" "$BACKUP" 2>/dev/null
if ! cp -R "$MOUNT/$APP_NAME" "$APP"; then
  rm -rf "$APP"
  mv "$BACKUP" "$APP"
  hdiutil detach "$MOUNT" -quiet
  open "$APP"
  exit 1
fi
rm -rf "$BACKUP"

# 4) Gatekeeper 対策 → アンマウント → 新バージョン起動
xattr -dr com.apple.quarantine "$APP" 2>/dev/null
hdiutil detach "$MOUNT" -quiet || true
rmdir "$MOUNT" 2>/dev/null
open "$APP"
"#,
        log = shq(log_path),
        pid = pid,
        dmg = shq(dmg_path),
        app = shq(app_path),
    )
}

/// 差し替えスクリプトを一時ファイルへ書き、アプリと切り離して起動する（detached）。
/// work_dir はプロセス専用ディレクトリ（共有 /tmp の予測可能パスを避ける）。
fn run_installer(work_dir: &PathBuf, dmg_path: &str, app_path: &str) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let log_path = work_dir.join("juice-update.log");
    let script_path = work_dir.join("juice-update.sh");
    let script = build_install_script(
        std::process::id(),
        dmg_path,
        app_path,
        &log_path.to_string_lossy(),
    );
    std::fs::write(&script_path, script).map_err(|e| e.to_string())?;
    std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| e.to_string())?;
    // detached: 親(アプリ)が exit してもスクリプトは生き残る。
    std::process::Command::new("/bin/bash")
        .arg(&script_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 実行中の .app バンドルのパス（.../Juice.app）。dev など特定できなければ None。
fn app_bundle_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors()
        .find(|p| p.extension().map(|e| e == "app").unwrap_or(false))
        .map(|p| p.to_path_buf())
}

/// パッケージ版か（dev=debug ビルドは false）。
fn is_packaged() -> bool {
    !cfg!(debug_assertions)
}

/// 全ウィンドウへ update-prepare-quit を送り、ack かタイムアウト(3s)を待つ。
async fn wait_for_renderer(app: &AppHandle) {
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

fn open_with_default(app: &AppHandle, target: String) {
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_url(target, None::<&str>);
}

fn open_path_with_default(app: &AppHandle, path: &PathBuf) {
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_path(path.to_string_lossy().to_string(), None::<&str>);
}

/// 更新を適用する（Electron 版 updateService.install 相当）。
pub async fn install(app: &AppHandle) {
    let info = match check_for_update(app).await {
        Ok(i) => i,
        Err(e) => {
            eprintln!("[update] install: re-check failed: {e}");
            emit_progress(app, 0, true, Some("更新情報の取得に失敗しました".into()));
            return;
        }
    };
    let (url, name) = match (info.download_url.clone(), info.asset_name.clone()) {
        (Some(u), Some(n)) => (u, n),
        // arch 一致 DMG が無ければリリースページを開く従来挙動（信頼ドメインのみ）
        _ => {
            if is_trusted_github_url(&info.release_url) {
                open_with_default(app, info.release_url);
            }
            return;
        }
    };
    // 取得元を HTTPS + GitHub ドメインに限定（署名なし方式の MITM 緩和）
    if !is_trusted_github_url(&url) {
        eprintln!("[update] install: untrusted download url rejected: {url}");
        emit_progress(app, 0, true, Some("ダウンロード元が不正です".into()));
        return;
    }
    // asset 名はディレクトリ成分を落とし、専用ディレクトリ内に限定（パストラバーサル防止）
    let safe_name = match safe_asset_name(&name) {
        Some(n) => n,
        None => {
            emit_progress(app, 0, true, Some("アセット名が不正です".into()));
            return;
        }
    };
    let work_dir = match update_work_dir() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[update] work dir failed: {e}");
            emit_progress(app, 0, true, Some("作業ディレクトリの作成に失敗しました".into()));
            return;
        }
    };
    let dest = work_dir.join(&safe_name);
    match download_file(app, &url, &dest).await {
        Ok(()) => emit_progress(app, 100, true, None),
        Err(e) => {
            eprintln!("[update] install: download failed: {e}");
            emit_progress(app, 0, true, Some("ダウンロードに失敗しました".into()));
            return;
        }
    }
    // dev / .app パス不明は自己差し替え不可 → DMG を開く従来挙動
    let app_path = match (is_packaged(), app_bundle_path()) {
        (true, Some(p)) => p,
        _ => {
            open_path_with_default(app, &dest);
            return;
        }
    };
    wait_for_renderer(app).await;
    if let Err(e) = run_installer(&work_dir, &dest.to_string_lossy(), &app_path.to_string_lossy()) {
        eprintln!("[update] run_installer failed: {e}");
        return;
    }
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_v_prefix_and_space() {
        assert_eq!(normalize_version(" v1.2.3 "), "1.2.3");
        assert_eq!(normalize_version("V2.0.0"), "2.0.0");
        assert_eq!(normalize_version("1.0.0"), "1.0.0");
    }

    #[test]
    fn compare_basic() {
        assert_eq!(compare_versions("1.0.0", "1.0.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.1.0", "1.0.9"), Ordering::Greater);
        assert_eq!(compare_versions("1.0.0", "1.0.1"), Ordering::Less);
    }

    #[test]
    fn compare_handles_missing_parts() {
        // 桁欠落は 0 扱い（1.0 == 1.0.0）
        assert_eq!(compare_versions("1.0", "1.0.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.2", "1.2.1"), Ordering::Less);
    }

    #[test]
    fn is_newer_works() {
        assert!(is_newer_version("v1.1.0", "1.0.0"));
        assert!(!is_newer_version("1.0.0", "1.0.0"));
        assert!(!is_newer_version("0.9.0", "1.0.0"));
    }

    fn assets() -> Vec<ReleaseAsset> {
        // Tauri の DMG 命名（{productName}_{version}_{arch}.dmg）
        vec![
            ReleaseAsset { name: "Juice_1.1.0_aarch64.dmg".into(), url: "u-arm".into() },
            ReleaseAsset { name: "Juice_1.1.0_x64.dmg".into(), url: "u-x64".into() },
            ReleaseAsset { name: "Juice_1.1.0_aarch64.dmg.tar.gz".into(), url: "u-sig".into() },
        ]
    }

    #[test]
    fn select_arm64_picks_aarch64_dmg() {
        let a = select_dmg_asset(&assets(), "arm64").unwrap();
        assert_eq!(a.url, "u-arm");
    }

    #[test]
    fn select_x64_picks_x64_dmg() {
        let a = select_dmg_asset(&assets(), "x64").unwrap();
        assert_eq!(a.url, "u-x64");
    }

    #[test]
    fn select_none_when_arch_absent() {
        // aarch64 のみ → x64 機は選べない（誤選択しない）
        let only_arm = vec![ReleaseAsset { name: "Juice_1.1.0_aarch64.dmg".into(), url: "u".into() }];
        assert!(select_dmg_asset(&only_arm, "x64").is_none());
    }

    // ---- 橋渡し: Electron 命名（-arm64.dmg / 無印 .dmg）も受理する ----

    fn electron_assets() -> Vec<ReleaseAsset> {
        vec![
            ReleaseAsset { name: "Juice-1.4.0-arm64.dmg".into(), url: "e-arm".into() },
            ReleaseAsset { name: "Juice-1.4.0.dmg".into(), url: "e-x64".into() },
        ]
    }

    #[test]
    fn select_arm64_accepts_electron_naming() {
        let a = select_dmg_asset(&electron_assets(), "arm64").unwrap();
        assert_eq!(a.url, "e-arm");
    }

    #[test]
    fn select_x64_accepts_electron_plain_dmg_not_arm() {
        // Electron 無印 .dmg を選び、-arm64.dmg は誤選択しない
        let a = select_dmg_asset(&electron_assets(), "x64").unwrap();
        assert_eq!(a.url, "e-x64");
    }

    #[test]
    fn select_x64_electron_only_arm_is_none() {
        let only_arm = vec![ReleaseAsset { name: "Juice-1.4.0-arm64.dmg".into(), url: "e".into() }];
        assert!(select_dmg_asset(&only_arm, "x64").is_none());
    }

    #[test]
    fn install_script_quotes_paths_and_embeds_pid() {
        let s = build_install_script(4242, "/tmp/a b.dmg", "/Applications/Juice.app", "/tmp/log");
        assert!(s.contains("PID=4242"));
        assert!(s.contains("DMG='/tmp/a b.dmg'"));
        assert!(s.contains("APP='/Applications/Juice.app'"));
    }

    #[test]
    fn install_script_escapes_single_quote() {
        let s = build_install_script(1, "/tmp/x'y.dmg", "/A.app", "/l");
        // ' は '\'' へエスケープされる
        assert!(s.contains(r#"DMG='/tmp/x'\''y.dmg'"#));
    }

    #[test]
    fn trusted_url_requires_https_github() {
        assert!(is_trusted_github_url(
            "https://github.com/ryota-kanayama/juice/releases/download/v1/Juice.dmg"
        ));
        assert!(is_trusted_github_url(
            "https://objects.githubusercontent.com/abc/Juice.dmg"
        ));
        // http / 非GitHub / 別スキームは拒否
        assert!(!is_trusted_github_url("http://github.com/x.dmg"));
        assert!(!is_trusted_github_url("https://evil.com/x.dmg"));
        assert!(!is_trusted_github_url("https://github.com.evil.com/x.dmg"));
        assert!(!is_trusted_github_url("file:///etc/passwd"));
    }

    #[test]
    fn safe_asset_name_strips_path_components() {
        assert_eq!(safe_asset_name("Juice-1.0.dmg").as_deref(), Some("Juice-1.0.dmg"));
        // パストラバーサルはファイル名成分だけに正規化される
        assert_eq!(safe_asset_name("../../etc/passwd").as_deref(), Some("passwd"));
        assert_eq!(safe_asset_name("/abs/evil.dmg").as_deref(), Some("evil.dmg"));
        assert_eq!(safe_asset_name(".."), None);
        assert_eq!(safe_asset_name(""), None);
    }
}
