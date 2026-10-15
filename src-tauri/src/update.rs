// アプリ内アップデート（Electron 版 src/main/update/* の Rust 完全移植）。
// 署名なし GitHub Releases から OS / arch に合うアセットを取得して差し替える。
//   macOS  : DMG を取得し、アプリ終了後に bash スクリプトで .app を自己差し替えする。
//   Windows: NSIS インストーラを取得し、パッシブモードで起動してアプリを終了する
//            （インストーラが入れ替え後にアプリを起動し直す）。
// dev / .app パス不明時は取得したファイルを開くだけ（従来挙動）。
//
// renderer へのイベント名はブリッジ(bridge.ts)の購読に合わせる:
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
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager};

const LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/ryota-kanayama/juice/releases/latest";
const CHECK_INTERVAL_SECS: u64 = 6 * 60 * 60;
/// 壁時計を見に起きる間隔。タイマー自体は短くし、経過の判定は壁時計で行う。
const WAKE_INTERVAL_SECS: u64 = 60;

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

/// 直近の更新チェック結果。更新前のリリースノート表示がここから本文を読む。
/// 取得は Rust 側で走っているので、フロントへ渡し直さずに済む。
#[derive(Default)]
pub struct LastChecked(std::sync::Mutex<Option<UpdateInfo>>);

impl LastChecked {
    pub fn set(&self, info: UpdateInfo) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(info);
    }
    pub fn get(&self) -> Option<UpdateInfo> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

/// `update_install` の二重実行を防ぐゲート。
#[allow(dead_code)] // Green で update_install から使う
#[derive(Default)]
pub struct InstallGate(std::sync::atomic::AtomicBool);

#[allow(dead_code)] // Green で update_install から使う
impl InstallGate {
    /// 実行を始められれば true。すでに実行中なら false。
    pub fn try_begin(&self) -> bool {
        todo!()
    }
    /// 実行の終了を知らせる。以降は再び始められる。
    pub fn finish(&self) {
        todo!()
    }
}

/// 画面で承認されたバージョンと、保持している直近のチェック結果が一致するときだけ、その情報を返す。
#[allow(dead_code)] // Green で update_install から使う
pub fn approved_update(_last: Option<UpdateInfo>, _approved: &str) -> Option<UpdateInfo> {
    todo!()
}

// ---- バージョン比較（Electron 版 shared/version.ts 相当） ----

/// 先頭の v/V と前後空白を除く。
fn normalize_version(v: &str) -> String {
    v.trim().trim_start_matches(['v', 'V']).to_string()
}

/// major.minor.patch を数値比較。桁欠落は 0 扱い。
pub(crate) fn compare_versions(a: &str, b: &str) -> Ordering {
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

/// Windows 向け NSIS インストーラ（Tauri 命名 `{productName}_{version}_x64-setup.exe`）を選ぶ。
/// 配布は x64 のみ（Arm 版 Windows は x64 エミュレーションで動く）。
fn select_windows_installer_asset(assets: &[ReleaseAsset]) -> Option<ReleaseAsset> {
    assets
        .iter()
        .find(|a| a.name.ends_with("_x64-setup.exe"))
        .cloned()
}

/// 実行中の OS に合うアセットを選ぶ。自己差し替えに対応しない OS は None
/// （install 時にリリースページを開く従来挙動へ落ちる）。
fn select_platform_asset(assets: &[ReleaseAsset]) -> Option<ReleaseAsset> {
    if cfg!(target_os = "macos") {
        select_dmg_asset(assets, current_arch())
    } else if cfg!(windows) {
        select_windows_installer_asset(assets)
    } else {
        None
    }
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
    let asset = select_platform_asset(&release.assets);
    let current = current_version(app);
    let info = UpdateInfo {
        has_update: is_newer_version(&latest, &current),
        current_version: current,
        latest_version: latest,
        release_url: release.html_url,
        download_url: asset.as_ref().map(|a| a.url.clone()),
        asset_name: asset.as_ref().map(|a| a.name.clone()),
        notes: release.body,
    };
    // 更新前のリリースノート表示が読めるよう控えておく
    app.state::<LastChecked>().set(info.clone());
    Ok(info)
}

/// 直近のチェック結果のうち、ユーザーに知らせるべきものだけを返す。
///
/// 起動時チェックの `update-available` は、レンダラーが購読を張るより前に飛ぶ
/// （実測で emit が約 0.4 秒、購読の完了はその数十倍あと）。Tauri のイベントは
/// バッファも再送もされないため、そのままだと起動のたびに取りこぼし、次の通知は
/// 6 時間後になる。レンダラーがマウント時にこれを引き直すことで取りこぼしを拾う。
pub fn pending_update(last: Option<UpdateInfo>, dismissed: &str) -> Option<UpdateInfo> {
    last.filter(|i| i.has_update && i.latest_version != dismissed)
}

async fn check_and_notify(app: &AppHandle) {
    match check_for_update(app).await {
        Ok(info) => {
            let dismissed = app.state::<SettingsStore>().get_dismissed_update_version();
            // 通知するかの判定は pending_update に一本化する（引き直し経路と同じ規則にする）
            if let Some(info) = pending_update(Some(info), &dismissed) {
                let _ = app.emit("update-available", &info);
            }
        }
        Err(e) => eprintln!("[update] check failed: {e}"),
    }
}

/// 前回の確認から `interval` 以上の実時間が経ったか。
///
/// 時計が巻き戻されると `elapsed` は Err を返す。そのまま待ち続けると二度と確認しなく
/// なるので、経過扱いにして一度確認しに行く。
fn wall_elapsed_reached(last: SystemTime, interval: Duration) -> bool {
    match last.elapsed() {
        Ok(e) => e >= interval,
        Err(_) => true,
    }
}

/// 起動時に1回 + 6時間ごとに更新確認する（Electron 版 startPeriodicCheck 相当）。
///
/// 経過の判定に壁時計（SystemTime）を使う。macOS の `Instant` は `CLOCK_UPTIME_RAW`
/// 相当で、スリープ中は進まず復帰しても取り戻さない（実測: 起動から 6.5 日のうち
/// 4.6 日がスリープだった環境では、Instant は 2 日ぶんしか進んでいなかった）。
/// tokio の sleep をそのまま 6 時間にすると、蓋を閉じる使い方では実時間で 20 時間近く
/// 空いてしまうため、短い間隔で起きて壁時計を見る形にする。
pub fn start_periodic_check(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        check_and_notify(&app).await;
        let mut last = SystemTime::now();
        loop {
            tokio::time::sleep(Duration::from_secs(WAKE_INTERVAL_SECS)).await;
            if wall_elapsed_reached(last, Duration::from_secs(CHECK_INTERVAL_SECS)) {
                check_and_notify(&app).await;
                last = SystemTime::now();
            }
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
#[cfg_attr(windows, allow(dead_code))] // macOS の .app 差し替え専用
fn shq(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// アプリ終了後に .app を差し替える bash スクリプトを生成する（Electron 版 installScript.ts 相当）。
#[cfg_attr(windows, allow(dead_code))] // macOS の .app 差し替え専用
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
#[cfg_attr(windows, allow(dead_code))] // macOS の .app 差し替え専用
fn run_installer(work_dir: &PathBuf, dmg_path: &str, app_path: &str) -> Result<(), String> {
    let log_path = work_dir.join("juice-update.log");
    let script_path = work_dir.join("juice-update.sh");
    let script = build_install_script(
        std::process::id(),
        dmg_path,
        app_path,
        &log_path.to_string_lossy(),
    );
    std::fs::write(&script_path, script).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
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
#[cfg_attr(windows, allow(dead_code))] // macOS の .app 差し替え専用
fn app_bundle_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors()
        .find(|p| p.extension().map(|e| e == "app").unwrap_or(false))
        .map(|p| p.to_path_buf())
}

/// NSIS インストーラをパッシブモード（進捗表示のみ・操作不要）で起動する。
/// /R はインストール完了後にアプリを起動し直すオプション。インストーラは起動中の
/// Juice を終了させてから入れ替えるが、呼び出し側でもすぐ exit して待たせない。
#[cfg(windows)]
fn run_windows_installer(installer: &std::path::Path) -> Result<(), String> {
    std::process::Command::new(installer)
        .args(["/P", "/R"])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// パッケージ版か（dev=debug ビルドは false）。
fn is_packaged() -> bool {
    !cfg!(debug_assertions)
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
    #[cfg(windows)]
    {
        // dev は自己差し替えしない → インストーラを開く（対話で入れる）
        if !is_packaged() {
            open_path_with_default(app, &dest);
            return;
        }
        crate::quit::wait_for_renderer(app).await;
        if let Err(e) = run_windows_installer(&dest) {
            eprintln!("[update] run_windows_installer failed: {e}");
            emit_progress(app, 0, true, Some("インストーラの起動に失敗しました".into()));
            return;
        }
        app.exit(0);
    }
    #[cfg(not(windows))]
    install_macos(app, &work_dir, &dest).await;
}

/// macOS: アプリ終了後に .app を DMG の中身へ差し替える。
#[cfg(not(windows))]
async fn install_macos(app: &AppHandle, work_dir: &PathBuf, dest: &PathBuf) {
    // dev / .app パス不明は自己差し替え不可 → DMG を開く従来挙動
    let app_path = match (is_packaged(), app_bundle_path()) {
        (true, Some(p)) => p,
        _ => {
            open_path_with_default(app, dest);
            return;
        }
    };
    crate::quit::wait_for_renderer(app).await;
    if let Err(e) = run_installer(work_dir, &dest.to_string_lossy(), &app_path.to_string_lossy()) {
        eprintln!("[update] run_installer failed: {e}");
        return;
    }
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_lowercase_v_prefix_and_space() {
        let v = normalize_version(" v1.2.3 ");

        assert_eq!(v, "1.2.3");
    }

    #[test]
    fn normalize_strips_uppercase_v_prefix() {
        let v = normalize_version("V2.0.0");

        assert_eq!(v, "2.0.0");
    }

    #[test]
    fn normalize_keeps_plain_version() {
        let v = normalize_version("1.0.0");

        assert_eq!(v, "1.0.0");
    }

    #[test]
    fn compare_same_versions_are_equal() {
        let o = compare_versions("1.0.0", "1.0.0");

        assert_eq!(o, Ordering::Equal);
    }

    #[test]
    fn compare_higher_minor_is_greater() {
        let o = compare_versions("1.1.0", "1.0.9");

        assert_eq!(o, Ordering::Greater);
    }

    #[test]
    fn compare_lower_patch_is_less() {
        let o = compare_versions("1.0.0", "1.0.1");

        assert_eq!(o, Ordering::Less);
    }

    #[test]
    fn compare_treats_missing_part_as_zero() {
        // 桁欠落は 0 扱い（1.0 == 1.0.0）
        let o = compare_versions("1.0", "1.0.0");

        assert_eq!(o, Ordering::Equal);
    }

    #[test]
    fn compare_missing_part_is_less_than_nonzero_part() {
        let o = compare_versions("1.2", "1.2.1");

        assert_eq!(o, Ordering::Less);
    }

    #[test]
    fn is_newer_true_for_higher_version() {
        let newer = is_newer_version("v1.1.0", "1.0.0");

        assert!(newer);
    }

    #[test]
    fn is_newer_false_for_same_version() {
        let newer = is_newer_version("1.0.0", "1.0.0");

        assert!(!newer);
    }

    #[test]
    fn is_newer_false_for_lower_version() {
        let newer = is_newer_version("0.9.0", "1.0.0");

        assert!(!newer);
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
    fn select_windows_picks_x64_setup_exe() {
        let mut list = assets();
        list.push(ReleaseAsset { name: "Juice_1.1.0_x64-setup.exe".into(), url: "u-win".into() });

        let a = select_windows_installer_asset(&list).unwrap();

        assert_eq!(a.url, "u-win");
    }

    #[test]
    fn select_windows_none_without_installer() {
        let a = select_windows_installer_asset(&assets());

        assert!(a.is_none());
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

        let a = select_dmg_asset(&only_arm, "x64");

        assert!(a.is_none());
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

        let a = select_dmg_asset(&only_arm, "x64");

        assert!(a.is_none());
    }

    fn install_script_for_spaced_paths() -> String {
        build_install_script(4242, "/tmp/a b.dmg", "/Applications/Juice.app", "/tmp/log")
    }

    #[test]
    fn install_script_embeds_pid() {
        let s = install_script_for_spaced_paths();

        assert!(s.contains("PID=4242"));
    }

    #[test]
    fn install_script_quotes_dmg_path() {
        let s = install_script_for_spaced_paths();

        assert!(s.contains("DMG='/tmp/a b.dmg'"));
    }

    #[test]
    fn install_script_quotes_app_path() {
        let s = install_script_for_spaced_paths();

        assert!(s.contains("APP='/Applications/Juice.app'"));
    }

    #[test]
    fn install_script_escapes_single_quote() {
        let s = build_install_script(1, "/tmp/x'y.dmg", "/A.app", "/l");

        // ' は '\'' へエスケープされる
        assert!(s.contains(r#"DMG='/tmp/x'\''y.dmg'"#));
    }

    /// 差し替えスクリプトを、偽のコマンドを差した PATH で実際に走らせる。
    /// 退避（mv）が失敗する状況（.app が無い）で、コピー（cp）まで進んだかを返す。
    #[cfg(unix)]
    fn script_reaches_cp_when_backup_move_fails() -> bool {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::TempDir::new().unwrap();
        let bin = dir.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        let cp_calls = dir.path().join("cp-calls");
        for name in ["hdiutil", "open", "xattr"] {
            std::fs::write(bin.join(name), "#!/bin/bash\nexit 0\n").unwrap();
        }
        std::fs::write(
            bin.join("cp"),
            format!("#!/bin/bash\necho called >> '{}'\nexit 0\n", cp_calls.display()),
        )
        .unwrap();
        for entry in std::fs::read_dir(&bin).unwrap() {
            let path = entry.unwrap().path();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let missing_app = dir.path().join("Missing.app");
        let script = build_install_script(
            999_999_999,
            "/dev/null",
            &missing_app.to_string_lossy(),
            &dir.path().join("log").to_string_lossy(),
        );
        let script_path = dir.path().join("update.sh");
        std::fs::write(&script_path, script).unwrap();

        std::process::Command::new("/bin/bash")
            .arg(&script_path)
            .env("PATH", format!("{}:/usr/bin:/bin", bin.display()))
            .status()
            .unwrap();

        cp_calls.exists()
    }

    #[cfg(unix)]
    #[test]
    fn install_script_stops_before_copy_when_backup_move_fails() {
        let reached_cp = script_reaches_cp_when_backup_move_fails();

        assert!(!reached_cp, "退避の mv が失敗したら cp -R に進まず中断すること");
    }

    #[test]
    fn install_gate_accepts_the_first_request() {
        let gate = InstallGate::default();

        let accepted = gate.try_begin();

        assert!(accepted);
    }

    #[test]
    fn install_gate_rejects_a_second_request_while_running() {
        let gate = InstallGate::default();
        gate.try_begin();

        let accepted = gate.try_begin();

        assert!(!accepted);
    }

    #[test]
    fn install_gate_accepts_again_after_finish() {
        let gate = InstallGate::default();
        gate.try_begin();
        gate.finish();

        let accepted = gate.try_begin();

        assert!(accepted);
    }

    #[test]
    fn approved_update_returns_info_when_version_matches() {
        let last = Some(sample_info("2.2.0", "notes"));

        let approved = approved_update(last, "2.2.0").unwrap();

        assert_eq!(approved.latest_version, "2.2.0");
    }

    #[test]
    fn approved_update_is_none_when_version_differs() {
        let last = Some(sample_info("2.3.0", "notes"));

        let approved = approved_update(last, "2.2.0");

        assert!(approved.is_none());
    }

    #[test]
    fn approved_update_is_none_when_never_checked() {
        let approved = approved_update(None, "2.2.0");

        assert!(approved.is_none());
    }

    #[test]
    fn approved_update_ignores_v_prefix_on_the_approved_version() {
        let last = Some(sample_info("2.2.0", "notes"));

        let approved = approved_update(last, "v2.2.0").unwrap();

        assert_eq!(approved.latest_version, "2.2.0");
    }

    #[test]
    fn approved_update_ignores_v_prefix_on_the_checked_version() {
        let last = Some(sample_info("v2.2.0", "notes"));

        let approved = approved_update(last, "2.2.0").unwrap();

        assert_eq!(approved.latest_version, "v2.2.0");
    }

    #[test]
    fn trusted_url_accepts_github_release() {
        let ok = is_trusted_github_url(
            "https://github.com/ryota-kanayama/juice/releases/download/v1/Juice.dmg",
        );

        assert!(ok);
    }

    #[test]
    fn trusted_url_accepts_github_objects_host() {
        let ok = is_trusted_github_url("https://objects.githubusercontent.com/abc/Juice.dmg");

        assert!(ok);
    }

    #[test]
    fn trusted_url_rejects_http() {
        let ok = is_trusted_github_url("http://github.com/x.dmg");

        assert!(!ok);
    }

    #[test]
    fn trusted_url_rejects_non_github_host() {
        let ok = is_trusted_github_url("https://evil.com/x.dmg");

        assert!(!ok);
    }

    #[test]
    fn trusted_url_rejects_lookalike_subdomain_host() {
        let ok = is_trusted_github_url("https://github.com.evil.com/x.dmg");

        assert!(!ok);
    }

    #[test]
    fn trusted_url_rejects_file_scheme() {
        let ok = is_trusted_github_url("file:///etc/passwd");

        assert!(!ok);
    }

    #[test]
    fn safe_asset_name_keeps_plain_name() {
        let n = safe_asset_name("Juice-1.0.dmg");

        assert_eq!(n.as_deref(), Some("Juice-1.0.dmg"));
    }

    #[test]
    fn safe_asset_name_reduces_traversal_to_file_name() {
        // パストラバーサルはファイル名成分だけに正規化される
        let n = safe_asset_name("../../etc/passwd");

        assert_eq!(n.as_deref(), Some("passwd"));
    }

    #[test]
    fn safe_asset_name_reduces_absolute_path_to_file_name() {
        let n = safe_asset_name("/abs/evil.dmg");

        assert_eq!(n.as_deref(), Some("evil.dmg"));
    }

    #[test]
    fn safe_asset_name_rejects_parent_dir() {
        let n = safe_asset_name("..");

        assert_eq!(n, None);
    }

    #[test]
    fn safe_asset_name_rejects_empty() {
        let n = safe_asset_name("");

        assert_eq!(n, None);
    }

    fn sample_info(version: &str, notes: &str) -> UpdateInfo {
        UpdateInfo {
            current_version: "2.1.0".into(),
            latest_version: version.into(),
            has_update: true,
            release_url: "https://github.com/x/y/releases/tag/v2.2.0".into(),
            download_url: None,
            asset_name: None,
            notes: notes.into(),
        }
    }

    #[test]
    fn wall_clock_reached_after_interval() {
        let last = SystemTime::now() - Duration::from_secs(7 * 60 * 60);

        let reached = wall_elapsed_reached(last, Duration::from_secs(6 * 60 * 60));

        assert!(reached);
    }

    #[test]
    fn wall_clock_not_reached_before_interval() {
        let last = SystemTime::now() - Duration::from_secs(60 * 60);

        let reached = wall_elapsed_reached(last, Duration::from_secs(6 * 60 * 60));

        assert!(!reached);
    }

    #[test]
    fn wall_clock_treats_backwards_clock_as_reached() {
        // 時計が巻き戻されたとき elapsed は Err を返す。待ち続けると永久に確認しなくなるので
        // 経過扱いにして一度確認しに行く。
        let last = SystemTime::now() + Duration::from_secs(60 * 60);

        let reached = wall_elapsed_reached(last, Duration::from_secs(6 * 60 * 60));

        assert!(reached);
    }

    #[test]
    fn pending_update_returns_info_when_update_available() {
        let info = sample_info("2.2.0", "notes");

        let pending = pending_update(Some(info), "").unwrap();

        assert_eq!(pending.latest_version, "2.2.0");
    }

    #[test]
    fn pending_update_is_none_when_no_update() {
        let mut info = sample_info("2.2.0", "notes");
        info.has_update = false;

        let pending = pending_update(Some(info), "");

        assert!(pending.is_none());
    }

    #[test]
    fn pending_update_is_none_when_dismissed() {
        let info = sample_info("2.2.0", "notes");

        let pending = pending_update(Some(info), "2.2.0");

        assert!(pending.is_none());
    }

    #[test]
    fn pending_update_is_none_when_never_checked() {
        let pending = pending_update(None, "");

        assert!(pending.is_none());
    }

    #[test]
    fn pending_update_ignores_dismissal_of_another_version() {
        let info = sample_info("2.3.0", "notes");

        let pending = pending_update(Some(info), "2.2.0").unwrap();

        assert_eq!(pending.latest_version, "2.3.0");
    }

    #[test]
    fn last_checked_starts_empty() {
        let s = LastChecked::default();

        let got = s.get();

        assert!(got.is_none());
    }

    fn last_checked_after_two_sets() -> LastChecked {
        let s = LastChecked::default();
        s.set(sample_info("2.2.0", "### ✨ 新機能\n\n- 何か"));
        s.set(sample_info("2.3.0", "### 🐛 修正\n\n- 別の何か"));
        s
    }

    #[test]
    fn last_checked_keeps_the_latest_version() {
        let s = last_checked_after_two_sets();

        let got = s.get().unwrap();

        assert_eq!(got.latest_version, "2.3.0");
    }

    #[test]
    fn last_checked_keeps_the_latest_notes() {
        let s = last_checked_after_two_sets();

        let got = s.get().unwrap();

        assert!(got.notes.contains("別の何か"));
    }

    #[test]
    fn trusted_url_accepts_github_subdomain() {
        let ok = is_trusted_github_url("https://api.github.com/repos/x/y/releases/latest");

        assert!(ok);
    }

    #[test]
    fn trusted_url_accepts_bare_githubusercontent_host() {
        let ok = is_trusted_github_url("https://githubusercontent.com/x.dmg");

        assert!(ok);
    }

    #[test]
    fn trusted_url_rejects_host_merely_ending_with_github_com() {
        let ok = is_trusted_github_url("https://evilgithub.com/x.dmg");

        assert!(!ok);
    }

    #[test]
    fn trusted_url_rejects_host_merely_ending_with_githubusercontent_com() {
        let ok = is_trusted_github_url("https://evilgithubusercontent.com/x.dmg");

        assert!(!ok);
    }

    #[test]
    fn str_field_returns_string_value() {
        let v = serde_json::json!({ "body": "notes" });

        let got = str_field(&v, "body");

        assert_eq!(got, "notes");
    }

    #[test]
    fn str_field_returns_empty_when_key_missing() {
        let v = serde_json::json!({});

        let got = str_field(&v, "body");

        assert_eq!(got, "");
    }

    #[test]
    fn str_field_returns_empty_when_value_is_not_string() {
        let v = serde_json::json!({ "body": 1 });

        let got = str_field(&v, "body");

        assert_eq!(got, "");
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn current_arch_is_arm64_on_aarch64() {
        assert_eq!(current_arch(), "arm64");
    }

    #[cfg(not(target_arch = "aarch64"))]
    #[test]
    fn current_arch_is_x64_elsewhere() {
        assert_eq!(current_arch(), "x64");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn select_platform_asset_picks_dmg_on_macos() {
        let list = vec![
            ReleaseAsset { name: "Juice_1.1.0_aarch64.dmg".into(), url: "u-arm".into() },
            ReleaseAsset { name: "Juice_1.1.0_x64.dmg".into(), url: "u-x64".into() },
        ];

        let a = select_platform_asset(&list);

        assert!(a.is_some());
    }
}
