// Electron 版 src/main/settingsStore.ts の Rust 移植。
// 型付き設定オブジェクトを settings.json で永続化する。
// - 既知キーのみ採用し未知キー（旧 slackProjectCode 等）は書き戻し時に落ちる
// - themeId は旧→新テーマへ移行、未知は milk にフォールバック
// - read-modify-write を Mutex で直列化、tmp→rename 原子書き込み + .bak フォールバック

use crate::session_store::{append_ext, StoreError};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

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

    fn lock(&self) -> MutexGuard<'_, ()> {
        self.write_lock.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn file_path(&self) -> PathBuf {
        self.data_dir.join("settings.json")
    }

    fn parse(content: &str) -> Option<Settings> {
        let raw: RawSettings = serde_json::from_str(content).ok()?;
        Some(raw.into_settings())
    }

    /// プライマリ→.bak→デフォルトの順に読む。失敗はすべてフォールバック。
    fn read_all(&self) -> Settings {
        let path = self.file_path();
        if let Ok(c) = std::fs::read_to_string(&path) {
            if let Some(s) = Self::parse(&c) {
                return s;
            }
        }
        if let Ok(c) = std::fs::read_to_string(append_ext(&path, ".bak")) {
            if let Some(s) = Self::parse(&c) {
                return s;
            }
        }
        Settings::default()
    }

    fn write_all(&self, settings: &Settings) -> Result<(), StoreError> {
        std::fs::create_dir_all(&self.data_dir)?;
        let path = self.file_path();
        let tmp = append_ext(&path, ".tmp");
        let bak = append_ext(&path, ".bak");
        let json = serde_json::to_string_pretty(settings)?;
        std::fs::write(&tmp, json)?;
        let _ = std::fs::rename(&path, &bak);
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }

    /// 現在の設定を読み、mutate を適用して書き戻す（直列化される）。
    fn update(&self, mutate: impl FnOnce(&mut Settings)) -> Result<(), StoreError> {
        let _guard = self.lock();
        let mut s = self.read_all();
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
    use std::sync::Arc;
    use tempfile::TempDir;

    fn new_store() -> (SettingsStore, TempDir) {
        let dir = TempDir::new().unwrap();
        (SettingsStore::new(dir.path().to_path_buf()), dir)
    }

    #[test]
    fn default_theme_is_milk() {
        let (s, _d) = new_store();
        assert_eq!(s.get_theme(), "milk");
    }

    #[test]
    fn save_and_get_theme() {
        let (s, _d) = new_store();
        s.set_theme("soda").unwrap();
        assert_eq!(s.get_theme(), "soda");
    }

    #[test]
    fn change_theme() {
        let (s, _d) = new_store();
        s.set_theme("berry").unwrap();
        s.set_theme("soda").unwrap();
        assert_eq!(s.get_theme(), "soda");
    }

    #[test]
    fn migrate_old_theme_ids() {
        let cases = [
            ("slate", "milk"),
            ("rose", "berry"),
            ("sky", "soda"),
            ("lemon", "mandarin"),
            ("graphite", "graphite"),
        ];
        for (old, new) in cases {
            let (s, _d) = new_store();
            s.set_theme(old).unwrap();
            assert_eq!(s.get_theme(), new, "{old} should migrate to {new}");
        }
    }

    #[test]
    fn new_theme_id_kept() {
        let (s, _d) = new_store();
        s.set_theme("cassis").unwrap();
        assert_eq!(s.get_theme(), "cassis");
    }

    #[test]
    fn unknown_theme_falls_back_to_milk() {
        let (s, _d) = new_store();
        s.set_theme("unknown-xyz").unwrap();
        assert_eq!(s.get_theme(), "milk");
    }

    #[test]
    fn elapsed_default() {
        let (s, _d) = new_store();
        assert_eq!(s.get_elapsed_settings(), (false, 30));
    }

    #[test]
    fn elapsed_save_and_change() {
        let (s, _d) = new_store();
        s.set_elapsed_settings(true, 60).unwrap();
        assert_eq!(s.get_elapsed_settings(), (true, 60));
        s.set_elapsed_settings(false, 15).unwrap();
        assert_eq!(s.get_elapsed_settings(), (false, 15));
    }

    #[test]
    fn idle_default_and_save() {
        let (s, _d) = new_store();
        assert_eq!(s.get_idle_settings(), (false, 60));
        s.set_idle_settings(true, 45).unwrap();
        assert_eq!(s.get_idle_settings(), (true, 45));
    }

    #[test]
    fn whiteboard_default_and_save() {
        let (s, _d) = new_store();
        assert!(!s.get_whiteboard_enabled());
        s.set_whiteboard_enabled(true).unwrap();
        assert!(s.get_whiteboard_enabled());
    }

    #[test]
    fn pomodoro_default_save_change() {
        let (s, _d) = new_store();
        assert!(!s.get_pomodoro_enabled());
        s.set_pomodoro_enabled(true).unwrap();
        assert!(s.get_pomodoro_enabled());
        s.set_pomodoro_enabled(false).unwrap();
        assert!(!s.get_pomodoro_enabled());
    }

    #[test]
    fn restore_from_bak_on_corrupt() {
        let (s, dir) = new_store();
        s.set_theme("soda").unwrap();
        s.set_elapsed_settings(true, 45).unwrap();
        std::fs::write(dir.path().join("settings.json"), "INVALID JSON").unwrap();
        // .bak には setTheme('soda') 直後の状態が入っている
        assert_eq!(s.get_theme(), "soda");
    }

    #[test]
    fn bak_created_on_write() {
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
    fn concurrent_sets_all_applied() {
        let (s, _d) = new_store();
        let s = Arc::new(s);
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
        assert_eq!(s.get_theme(), "soda");
        assert_eq!(s.get_elapsed_settings(), (true, 60));
        assert!(s.get_pomodoro_enabled());
        assert!(s.get_whiteboard_enabled());
    }

    #[test]
    fn break_behavior_default_and_set() {
        let (s, _d) = new_store();
        assert_eq!(s.get_break_behavior(), BreakBehavior::Stop);
        s.set_break_behavior(BreakBehavior::Pause).unwrap();
        assert_eq!(s.get_break_behavior(), BreakBehavior::Pause);
    }

    #[test]
    fn dismissed_update_version() {
        let (s, _d) = new_store();
        assert_eq!(s.get_dismissed_update_version(), "");
        s.set_dismissed_update_version("1.2.0").unwrap();
        assert_eq!(s.get_dismissed_update_version(), "1.2.0");
    }

    #[test]
    fn main_project_code_default_set_reset() {
        let (s, _d) = new_store();
        assert_eq!(s.get_main_project_code(), "");
        s.set_main_project_code("PROJ-001").unwrap();
        assert_eq!(s.get_main_project_code(), "PROJ-001");
        s.set_main_project_code("").unwrap();
        assert_eq!(s.get_main_project_code(), "");
    }

    #[test]
    fn setup_completed_flag() {
        let (s, _d) = new_store();
        assert!(!s.is_setup_completed());
        s.complete_setup().unwrap();
        assert!(s.is_setup_completed());
    }

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
        assert_eq!(written["themeId"], "grape");
    }
}
