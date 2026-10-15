// Electron 版 src/main/settingsStore.ts の Rust 移植。
// 型付き設定オブジェクトを settings.json で永続化する。
// - 既知キーのみ採用し未知キー（旧 slackProjectCode 等）は書き戻し時に落ちる
// - themeId は旧→新テーマへ移行、未知は milk にフォールバック
// - read-modify-write を Mutex で直列化、tmp→rename 原子書き込み + .bak フォールバック

use crate::fs_util::{lock, read_json_with_backup, write_json_atomic, StoreError};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BreakBehavior {
    Stop,
    Pause,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme_id: String,
    pub idle_notification_enabled: bool,
    pub idle_notification_minutes: i64,
    pub elapsed_notification_enabled: bool,
    pub elapsed_notification_minutes: i64,
    pub pomodoro_enabled: bool,
    pub setup_completed: bool,
    pub whiteboard_enabled: bool,
    pub break_behavior: BreakBehavior,
    pub main_project_code: String,
    pub dismissed_update_version: String,
    pub last_seen_version: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme_id: "milk".to_string(),
            idle_notification_enabled: false,
            idle_notification_minutes: 60,
            elapsed_notification_enabled: false,
            elapsed_notification_minutes: 30,
            pomodoro_enabled: false,
            setup_completed: false,
            whiteboard_enabled: false,
            break_behavior: BreakBehavior::Stop,
            main_project_code: String::new(),
            dismissed_update_version: String::new(),
            last_seen_version: String::new(),
        }
    }
}

pub struct SettingsStore {
    data_dir: PathBuf,
    write_lock: Mutex<()>,
}

impl SettingsStore {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            write_lock: Mutex::new(()),
        }
    }

    fn file_path(&self) -> PathBuf {
        self.data_dir.join("settings.json")
    }

    fn parse(content: &str) -> Option<Settings> {
        let raw: RawSettings = serde_json::from_str(content).ok()?;
        Some(raw.into_settings())
    }

    /// プライマリ→.bak→デフォルトの順に読む。壊れていたときは退避したうえでデフォルトを使う
    /// （両方壊れていたときも同じ）。壊れてはいないが読めない（I/O エラー）ときだけ Err。
    /// 退避（rename）を伴うので、write_lock を取得済みの呼び出し元専用。自身ではロックを取らない。
    fn read_locked(&self) -> Result<Settings, StoreError> {
        match read_json_with_backup(&self.file_path(), Self::parse) {
            Ok(found) => Ok(found.map(|(_, settings)| settings).unwrap_or_default()),
            Err(StoreError::Corrupt(_)) => Ok(Settings::default()),
            Err(e) => Err(e),
        }
    }

    /// 書き込みと同じロックを取って読む。読めなかったとき（I/O エラー）はデフォルトを返す。
    /// write_lock は非再入なので、既にロックを持つ update からは read_locked を呼ぶこと。
    fn read_all(&self) -> Settings {
        let _guard = lock(&self.write_lock);
        self.read_locked().unwrap_or_default()
    }

    fn write_all(&self, settings: &Settings) -> Result<(), StoreError> {
        write_json_atomic(&self.file_path(), settings)
    }

    /// 現在の設定を読み、mutate を適用して書き戻す（直列化される）。
    /// 読めなかったとき（I/O エラー）はデフォルトで上書きせず、エラーを返す。
    fn update(&self, mutate: impl FnOnce(&mut Settings)) -> Result<(), StoreError> {
        let _guard = lock(&self.write_lock);
        let mut s = self.read_locked()?;
        mutate(&mut s);
        self.write_all(&s)
    }

    pub fn get_theme(&self) -> String {
        self.read_all().theme_id
    }
    pub fn set_theme(&self, theme_id: &str) -> Result<(), StoreError> {
        let v = theme_id.to_string();
        self.update(move |s| s.theme_id = v)
    }
    pub fn get_idle_settings(&self) -> (bool, i64) {
        let s = self.read_all();
        (s.idle_notification_enabled, s.idle_notification_minutes)
    }
    pub fn set_idle_settings(&self, enabled: bool, minutes: i64) -> Result<(), StoreError> {
        self.update(move |s| {
            s.idle_notification_enabled = enabled;
            s.idle_notification_minutes = minutes;
        })
    }
    pub fn get_elapsed_settings(&self) -> (bool, i64) {
        let s = self.read_all();
        (s.elapsed_notification_enabled, s.elapsed_notification_minutes)
    }
    pub fn set_elapsed_settings(&self, enabled: bool, minutes: i64) -> Result<(), StoreError> {
        self.update(move |s| {
            s.elapsed_notification_enabled = enabled;
            s.elapsed_notification_minutes = minutes;
        })
    }
    pub fn get_pomodoro_enabled(&self) -> bool {
        self.read_all().pomodoro_enabled
    }
    pub fn set_pomodoro_enabled(&self, enabled: bool) -> Result<(), StoreError> {
        self.update(move |s| s.pomodoro_enabled = enabled)
    }
    pub fn is_setup_completed(&self) -> bool {
        self.read_all().setup_completed
    }
    pub fn complete_setup(&self) -> Result<(), StoreError> {
        self.update(|s| s.setup_completed = true)
    }
    pub fn get_whiteboard_enabled(&self) -> bool {
        self.read_all().whiteboard_enabled
    }
    pub fn set_whiteboard_enabled(&self, enabled: bool) -> Result<(), StoreError> {
        self.update(move |s| s.whiteboard_enabled = enabled)
    }
    pub fn get_break_behavior(&self) -> BreakBehavior {
        self.read_all().break_behavior
    }
    pub fn set_break_behavior(&self, behavior: BreakBehavior) -> Result<(), StoreError> {
        self.update(move |s| s.break_behavior = behavior)
    }
    pub fn get_main_project_code(&self) -> String {
        self.read_all().main_project_code
    }
    pub fn set_main_project_code(&self, code: &str) -> Result<(), StoreError> {
        let v = code.to_string();
        self.update(move |s| s.main_project_code = v)
    }
    pub fn get_dismissed_update_version(&self) -> String {
        self.read_all().dismissed_update_version
    }
    pub fn set_dismissed_update_version(&self, version: &str) -> Result<(), StoreError> {
        let v = version.to_string();
        self.update(move |s| s.dismissed_update_version = v)
    }
    /// 最後にリリースノートを見せたバージョン。空なら一度も見せていない。
    pub fn get_last_seen_version(&self) -> String {
        self.read_all().last_seen_version
    }
    pub fn set_last_seen_version(&self, version: &str) -> Result<(), StoreError> {
        let v = version.to_string();
        self.update(move |s| s.last_seen_version = v)
    }
}

/// JSON 読み取り用（既知キーのみ・欠落許容）。未知キーは serde が無視＝書き戻しで落ちる。
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RawSettings {
    theme_id: Option<String>,
    idle_notification_enabled: Option<bool>,
    idle_notification_minutes: Option<i64>,
    elapsed_notification_enabled: Option<bool>,
    elapsed_notification_minutes: Option<i64>,
    pomodoro_enabled: Option<bool>,
    setup_completed: Option<bool>,
    whiteboard_enabled: Option<bool>,
    break_behavior: Option<String>,
    main_project_code: Option<String>,
    dismissed_update_version: Option<String>,
    last_seen_version: Option<String>,
}

impl RawSettings {
    fn into_settings(self) -> Settings {
        let d = Settings::default();
        Settings {
            theme_id: migrate_theme_id(&self.theme_id.unwrap_or(d.theme_id)),
            idle_notification_enabled: self
                .idle_notification_enabled
                .unwrap_or(d.idle_notification_enabled),
            idle_notification_minutes: self
                .idle_notification_minutes
                .unwrap_or(d.idle_notification_minutes),
            elapsed_notification_enabled: self
                .elapsed_notification_enabled
                .unwrap_or(d.elapsed_notification_enabled),
            elapsed_notification_minutes: self
                .elapsed_notification_minutes
                .unwrap_or(d.elapsed_notification_minutes),
            pomodoro_enabled: self.pomodoro_enabled.unwrap_or(d.pomodoro_enabled),
            setup_completed: self.setup_completed.unwrap_or(d.setup_completed),
            whiteboard_enabled: self.whiteboard_enabled.unwrap_or(d.whiteboard_enabled),
            // 'pause' のみ pause、それ以外（欠落/不正含む）は stop
            break_behavior: if self.break_behavior.as_deref() == Some("pause") {
                BreakBehavior::Pause
            } else {
                BreakBehavior::Stop
            },
            main_project_code: self.main_project_code.unwrap_or(d.main_project_code),
            dismissed_update_version: self
                .dismissed_update_version
                .unwrap_or(d.dismissed_update_version),
            last_seen_version: self.last_seen_version.unwrap_or(d.last_seen_version),
        }
    }
}

/// 旧テーマ ID を新テーマへ移行し、未知/無効は milk にフォールバックする。
fn migrate_theme_id(id: &str) -> String {
    let mapped = match id {
        "slate" => "milk",
        "rose" | "coral" | "peach" | "sakura" => "berry",
        "sky" | "ocean" => "soda",
        "lemon" | "honey" | "orange" | "juice" | "sunset" => "mandarin",
        "crimson" | "ember" | "night" | "deep" | "amber" | "charcoal" => "graphite",
        "melon" | "olive" | "forest" => "matcha",
        "cocoa" => "espresso",
        "blackberry" | "plum" => "cassis",
        "lavender" => "grape",
        other => other,
    };
    const VALID: &[&str] = &[
        "milk", "oatmilk", "matcha", "soda", "grape", "mandarin", "berry", "graphite", "midnight",
        "cassis", "espresso",
    ];
    if VALID.contains(&mapped) {
        mapped.to_string()
    } else {
        "milk".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs_util::{append_ext, corrupt_copies};
    use std::sync::Arc;
    use tempfile::TempDir;

    fn new_store() -> (SettingsStore, TempDir) {
        let dir = TempDir::new().unwrap();
        (SettingsStore::new(dir.path().to_path_buf()), dir)
    }

    // --- テーマ ---

    #[test]
    fn theme_defaults_to_milk() {
        let (s, _d) = new_store();

        let theme = s.get_theme();

        assert_eq!(theme, "milk");
    }

    #[test]
    fn saved_theme_is_returned() {
        let (s, _d) = new_store();
        s.set_theme("soda").unwrap();

        let theme = s.get_theme();

        assert_eq!(theme, "soda");
    }

    #[test]
    fn changing_theme_returns_latest() {
        let (s, _d) = new_store();
        s.set_theme("berry").unwrap();
        s.set_theme("soda").unwrap();

        let theme = s.get_theme();

        assert_eq!(theme, "soda");
    }

    #[test]
    fn old_theme_ids_migrate_to_new_ids() {
        let cases = [
            ("slate", "milk"),
            ("rose", "berry"),
            ("sky", "soda"),
            ("lemon", "mandarin"),
        ];
        for (old, new) in cases {
            let (s, _d) = new_store();
            s.set_theme(old).unwrap();

            let theme = s.get_theme();

            assert_eq!(theme, new, "{old} should migrate to {new}");
        }
    }

    #[test]
    fn graphite_theme_is_kept() {
        let (s, _d) = new_store();
        s.set_theme("graphite").unwrap();

        let theme = s.get_theme();

        assert_eq!(theme, "graphite");
    }

    #[test]
    fn new_theme_id_is_kept() {
        let (s, _d) = new_store();
        s.set_theme("cassis").unwrap();

        let theme = s.get_theme();

        assert_eq!(theme, "cassis");
    }

    #[test]
    fn unknown_theme_falls_back_to_milk() {
        let (s, _d) = new_store();
        s.set_theme("unknown-xyz").unwrap();

        let theme = s.get_theme();

        assert_eq!(theme, "milk");
    }

    // --- 経過通知 ---

    #[test]
    fn elapsed_settings_default_to_off_30() {
        let (s, _d) = new_store();

        let settings = s.get_elapsed_settings();

        assert_eq!(settings, (false, 30));
    }

    #[test]
    fn saved_elapsed_settings_are_returned() {
        let (s, _d) = new_store();
        s.set_elapsed_settings(true, 60).unwrap();

        let settings = s.get_elapsed_settings();

        assert_eq!(settings, (true, 60));
    }

    #[test]
    fn changing_elapsed_settings_returns_latest() {
        let (s, _d) = new_store();
        s.set_elapsed_settings(true, 60).unwrap();
        s.set_elapsed_settings(false, 15).unwrap();

        let settings = s.get_elapsed_settings();

        assert_eq!(settings, (false, 15));
    }

    // --- 離席検知 ---

    #[test]
    fn idle_settings_default_to_off_60() {
        let (s, _d) = new_store();

        let settings = s.get_idle_settings();

        assert_eq!(settings, (false, 60));
    }

    #[test]
    fn saved_idle_settings_are_returned() {
        let (s, _d) = new_store();
        s.set_idle_settings(true, 45).unwrap();

        let settings = s.get_idle_settings();

        assert_eq!(settings, (true, 45));
    }

    // --- ホワイトボード ---

    #[test]
    fn whiteboard_is_disabled_by_default() {
        let (s, _d) = new_store();

        let enabled = s.get_whiteboard_enabled();

        assert!(!enabled);
    }

    #[test]
    fn whiteboard_can_be_enabled() {
        let (s, _d) = new_store();
        s.set_whiteboard_enabled(true).unwrap();

        let enabled = s.get_whiteboard_enabled();

        assert!(enabled);
    }

    // --- ポモドーロ ---

    #[test]
    fn pomodoro_is_disabled_by_default() {
        let (s, _d) = new_store();

        let enabled = s.get_pomodoro_enabled();

        assert!(!enabled);
    }

    #[test]
    fn pomodoro_can_be_enabled() {
        let (s, _d) = new_store();
        s.set_pomodoro_enabled(true).unwrap();

        let enabled = s.get_pomodoro_enabled();

        assert!(enabled);
    }

    #[test]
    fn pomodoro_can_be_disabled_again() {
        let (s, _d) = new_store();
        s.set_pomodoro_enabled(true).unwrap();
        s.set_pomodoro_enabled(false).unwrap();

        let enabled = s.get_pomodoro_enabled();

        assert!(!enabled);
    }

    // --- 書き込みの堅牢性 ---

    #[test]
    fn corrupt_settings_are_restored_from_bak() {
        let (s, dir) = new_store();
        s.set_theme("soda").unwrap();
        s.set_elapsed_settings(true, 45).unwrap();
        std::fs::write(dir.path().join("settings.json"), "INVALID JSON").unwrap();

        // .bak には setTheme('soda') 直後の状態が入っている
        let theme = s.get_theme();

        assert_eq!(theme, "soda");
    }

    /// 本体も .bak も壊す。
    fn corrupt_both_files(dir: &TempDir) {
        let primary = dir.path().join("settings.json");
        std::fs::write(&primary, "INVALID primary").unwrap();
        std::fs::write(append_ext(&primary, ".bak"), "INVALID bak").unwrap();
    }

    #[test]
    fn both_corrupt_settings_fall_back_to_defaults() {
        let (s, dir) = new_store();
        corrupt_both_files(&dir);

        let theme = s.get_theme();

        assert_eq!(theme, "milk");
    }

    #[test]
    fn both_corrupt_settings_keep_corrupt_primary_content() {
        let (s, dir) = new_store();
        corrupt_both_files(&dir);

        s.get_theme();

        assert_eq!(
            corrupt_copies(dir.path(), "settings.json"),
            vec!["INVALID primary".to_string()]
        );
    }

    #[test]
    fn both_corrupt_settings_keep_corrupt_backup_content() {
        let (s, dir) = new_store();
        corrupt_both_files(&dir);

        s.get_theme();

        assert_eq!(
            corrupt_copies(dir.path(), "settings.json.bak"),
            vec!["INVALID bak".to_string()]
        );
    }

    // --- 読めないだけ（I/O エラー）の設定は壊れたものとして扱わない ---

    /// settings.json の位置にディレクトリを置いて、読み込みを I/O エラーにする。
    fn make_settings_unreadable(dir: &TempDir) -> PathBuf {
        let path = dir.path().join("settings.json");
        std::fs::create_dir(&path).unwrap();
        path
    }

    #[test]
    fn unreadable_settings_fall_back_to_defaults_on_read() {
        let (s, dir) = new_store();
        make_settings_unreadable(&dir);

        let theme = s.get_theme();

        assert_eq!(theme, "milk");
    }

    #[test]
    fn unreadable_settings_make_update_return_io_error() {
        let (s, dir) = new_store();
        make_settings_unreadable(&dir);

        let result = s.set_theme("soda");

        assert!(
            matches!(result, Err(StoreError::Io(_))),
            "既定値で上書きせず Io エラーになること: {result:?}"
        );
    }

    #[test]
    fn unreadable_settings_are_left_in_place_by_update() {
        let (s, dir) = new_store();
        let path = make_settings_unreadable(&dir);

        let _ = s.set_theme("soda");

        assert!(path.is_dir(), "何も書き換えないこと");
    }

    #[test]
    fn unreadable_settings_make_update_write_no_backup() {
        let (s, dir) = new_store();
        make_settings_unreadable(&dir);

        let _ = s.set_theme("soda");

        assert!(
            !append_ext(&dir.path().join("settings.json"), ".bak").exists(),
            ".bak へ退避しないこと"
        );
    }

    #[test]
    fn corrupt_settings_are_replaced_by_defaults_on_update() {
        let (s, dir) = new_store();
        corrupt_both_files(&dir);

        s.set_theme("soda").unwrap();

        assert_eq!(s.get_theme(), "soda");
    }

    // --- 読み取りも書き込みと同じロックで直列化する ---
    // 壊れたファイルの退避（rename）を伴うので、書き手の保存と交差してはならない。

    #[test]
    fn getter_waits_while_the_write_lock_is_held() {
        let (s, dir) = new_store();
        corrupt_both_files(&dir);
        let s = Arc::new(s);
        let guard = lock(&s.write_lock);
        let (tx, rx) = std::sync::mpsc::channel();
        let reader = {
            let s = Arc::clone(&s);
            std::thread::spawn(move || tx.send(s.get_theme()).unwrap())
        };

        let early = rx.recv_timeout(std::time::Duration::from_millis(200));

        drop(guard);
        reader.join().unwrap();
        assert_eq!(
            early,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout),
            "ロック中は読み取りが待たされること"
        );
    }

    #[test]
    fn bak_holds_previous_state_after_write() {
        let (s, dir) = new_store();
        s.set_theme("berry").unwrap();
        s.set_theme("matcha").unwrap();

        let bak: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(dir.path().join("settings.json.bak")).unwrap(),
        )
        .unwrap();

        assert_eq!(bak["themeId"], "berry");
    }

    #[test]
    fn concurrent_sets_keep_theme() {
        let (s, _d) = new_store();
        let s = Arc::new(s);

        run_concurrent_sets(&s);

        assert_eq!(s.get_theme(), "soda");
    }

    #[test]
    fn concurrent_sets_keep_elapsed_settings() {
        let (s, _d) = new_store();
        let s = Arc::new(s);

        run_concurrent_sets(&s);

        assert_eq!(s.get_elapsed_settings(), (true, 60));
    }

    #[test]
    fn concurrent_sets_keep_pomodoro_and_whiteboard() {
        let (s, _d) = new_store();
        let s = Arc::new(s);

        run_concurrent_sets(&s);

        assert!(s.get_pomodoro_enabled());
        assert!(s.get_whiteboard_enabled());
    }

    fn run_concurrent_sets(s: &Arc<SettingsStore>) {
        let tasks: Vec<Box<dyn FnOnce() + Send>> = vec![
            {
                let s = s.clone();
                Box::new(move || s.set_theme("soda").unwrap())
            },
            {
                let s = s.clone();
                Box::new(move || s.set_elapsed_settings(true, 60).unwrap())
            },
            {
                let s = s.clone();
                Box::new(move || s.set_pomodoro_enabled(true).unwrap())
            },
            {
                let s = s.clone();
                Box::new(move || s.set_whiteboard_enabled(true).unwrap())
            },
        ];
        let handles: Vec<_> = tasks.into_iter().map(std::thread::spawn).collect();
        for h in handles {
            h.join().unwrap();
        }
    }

    // --- 休憩時の動作 ---

    #[test]
    fn break_behavior_defaults_to_stop() {
        let (s, _d) = new_store();

        let behavior = s.get_break_behavior();

        assert_eq!(behavior, BreakBehavior::Stop);
    }

    #[test]
    fn saved_break_behavior_is_returned() {
        let (s, _d) = new_store();
        s.set_break_behavior(BreakBehavior::Pause).unwrap();

        let behavior = s.get_break_behavior();

        assert_eq!(behavior, BreakBehavior::Pause);
    }

    // --- バージョン記録 ---

    #[test]
    fn dismissed_update_version_defaults_to_empty() {
        let (s, _d) = new_store();

        let version = s.get_dismissed_update_version();

        assert_eq!(version, "");
    }

    #[test]
    fn saved_dismissed_update_version_is_returned() {
        let (s, _d) = new_store();
        s.set_dismissed_update_version("1.2.0").unwrap();

        let version = s.get_dismissed_update_version();

        assert_eq!(version, "1.2.0");
    }

    #[test]
    fn last_seen_version_defaults_to_empty() {
        let (s, _d) = new_store();

        // 初期値は空（＝まだ一度も記録していない）
        let version = s.get_last_seen_version();

        assert_eq!(version, "");
    }

    #[test]
    fn saved_last_seen_version_is_returned() {
        let (s, _d) = new_store();
        s.set_last_seen_version("2.2.0").unwrap();

        let version = s.get_last_seen_version();

        assert_eq!(version, "2.2.0");
    }

    // --- メインのプロジェクトコード ---

    #[test]
    fn main_project_code_defaults_to_empty() {
        let (s, _d) = new_store();

        let code = s.get_main_project_code();

        assert_eq!(code, "");
    }

    #[test]
    fn saved_main_project_code_is_returned() {
        let (s, _d) = new_store();
        s.set_main_project_code("PROJ-001").unwrap();

        let code = s.get_main_project_code();

        assert_eq!(code, "PROJ-001");
    }

    #[test]
    fn main_project_code_can_be_reset_to_empty() {
        let (s, _d) = new_store();
        s.set_main_project_code("PROJ-001").unwrap();
        s.set_main_project_code("").unwrap();

        let code = s.get_main_project_code();

        assert_eq!(code, "");
    }

    // --- セットアップ ---

    #[test]
    fn setup_is_not_completed_by_default() {
        let (s, _d) = new_store();

        let completed = s.is_setup_completed();

        assert!(!completed);
    }

    #[test]
    fn setup_is_completed_after_complete_setup() {
        let (s, _d) = new_store();
        s.complete_setup().unwrap();

        let completed = s.is_setup_completed();

        assert!(completed);
    }

    // --- 旧キー ---

    #[test]
    fn unknown_keys_are_dropped_on_rewrite() {
        let (s, dir) = new_store();
        let path = dir.path().join("settings.json");
        std::fs::write(
            &path,
            r#"{"themeId":"grape","slackProjectCode":"SE26010","userName":"Ryota"}"#,
        )
        .unwrap();

        s.set_theme("grape").unwrap(); // 書き戻しを誘発

        let written: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(written.get("slackProjectCode").is_none());
        assert!(written.get("userName").is_none());
    }

    #[test]
    fn known_keys_are_kept_on_rewrite() {
        let (s, dir) = new_store();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, r#"{"themeId":"grape","userName":"Ryota"}"#).unwrap();

        s.set_theme("grape").unwrap(); // 書き戻しを誘発

        let written: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(written["themeId"], "grape");
    }
}
