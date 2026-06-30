// Electron 版 src/main/sessionStore.ts の Rust 移植。
// セッションを月ごとの JSON（sessions-YYYY-MM.json）で永続化する。
// - read-modify-write は Mutex で直列化し、並行呼び出しでの lost-update を防ぐ
// - 書き込みは tmp→rename で原子的に行い、旧ファイルは .bak に退避する
// - 破損時は .bak へフォールバックする

use crate::types::{Session, TimeInterval, WorkLocation};
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

#[derive(Debug)]
pub enum StoreError {
    InvalidYearMonth(String),
    InvalidDate(String),
    Io(std::io::Error),
    Serde(serde_json::Error),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::InvalidYearMonth(s) => write!(f, "invalid yearMonth: {s}"),
            StoreError::InvalidDate(s) => write!(f, "invalid session.date: {s}"),
            StoreError::Io(e) => write!(f, "io error: {e}"),
            StoreError::Serde(e) => write!(f, "serialize error: {e}"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<std::io::Error> for StoreError {
    fn from(e: std::io::Error) -> Self {
        StoreError::Io(e)
    }
}

impl From<serde_json::Error> for StoreError {
    fn from(e: serde_json::Error) -> Self {
        StoreError::Serde(e)
    }
}

/// "YYYY-MM" を検証（パストラバーサル防止）。正規表現 ^\d{4}-\d{2}$ 相当。
fn is_year_month(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7
        && b[0..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5].is_ascii_digit()
        && b[6].is_ascii_digit()
}

/// "YYYY-MM-DD" を検証。正規表現 ^\d{4}-\d{2}-\d{2}$ 相当。
fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[0..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5].is_ascii_digit()
        && b[6].is_ascii_digit()
        && b[7] == b'-'
        && b[8].is_ascii_digit()
        && b[9].is_ascii_digit()
}

/// JSON 読み取り用の寛容な表現（欠落・null を許容し、後で既定値を埋める）。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawSession {
    id: String,
    task_id: String,
    name: String,
    #[serde(default)]
    project_code: Option<String>,
    #[serde(default)]
    work_category: Option<String>,
    times: Vec<TimeInterval>,
    date: String,
    color: String,
    #[serde(default)]
    total_time: Option<i64>,
    #[serde(default)]
    work_location: Option<WorkLocation>,
}

#[derive(Deserialize)]
struct RawSessionFile {
    sessions: Vec<RawSession>,
}

#[derive(Serialize)]
struct SessionFileOut<'a> {
    sessions: &'a [Session],
}

/// RawSession を正規の Session へ変換（projectCode/workCategory は空文字、
/// totalTime 欠落時は times[] から算出）。Electron 版 parse() と同じ補完。
fn into_session(r: RawSession) -> Session {
    let total_time = match r.total_time {
        Some(t) => t,
        None => total_time_from_intervals(&r.times),
    };
    Session {
        id: r.id,
        task_id: r.task_id,
        name: r.name,
        project_code: r.project_code.unwrap_or_default(),
        work_category: r.work_category.unwrap_or_default(),
        times: r.times,
        date: r.date,
        color: r.color,
        total_time,
        work_location: r.work_location,
    }
}

pub struct SessionStore {
    data_dir: PathBuf,
    write_lock: Mutex<()>,
}

impl SessionStore {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            write_lock: Mutex::new(()),
        }
    }

    /// write 系（read-modify-write）を直列化する write_lock を取得。
    /// 直前の操作が panic で毒された場合も中身を取り出して継続する。
    fn lock(&self) -> MutexGuard<'_, ()> {
        self.write_lock.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn file_path(&self, year_month: &str) -> Result<PathBuf, StoreError> {
        if !is_year_month(year_month) {
            return Err(StoreError::InvalidYearMonth(year_month.to_string()));
        }
        Ok(self.data_dir.join(format!("sessions-{year_month}.json")))
    }

    fn year_month_of(session: &Session) -> Result<String, StoreError> {
        if !is_date(&session.date) {
            return Err(StoreError::InvalidDate(session.date.clone()));
        }
        Ok(session.date[0..7].to_string())
    }

    /// ファイルを読んでパース。読み取り・パース失敗はいずれも None。
    fn read_parse(path: &Path) -> Option<Vec<Session>> {
        let content = std::fs::read_to_string(path).ok()?;
        let raw: RawSessionFile = serde_json::from_str(&content).ok()?;
        Some(raw.sessions.into_iter().map(into_session).collect())
    }

    pub fn get_sessions(&self, year_month: &str) -> Result<Vec<Session>, StoreError> {
        // 不正な yearMonth はここで即 throw（try の外で検証）
        let path = self.file_path(year_month)?;
        if let Some(v) = Self::read_parse(&path) {
            return Ok(v);
        }
        let bak = append_ext(&path, ".bak");
        if let Some(v) = Self::read_parse(&bak) {
            return Ok(v);
        }
        Ok(Vec::new())
    }

    pub fn save_session(&self, session: Session) -> Result<(), StoreError> {
        let year_month = Self::year_month_of(&session)?;
        let _guard = self.lock();
        let mut sessions = self.get_sessions(&year_month)?;
        sessions.push(session);
        self.write(&year_month, &sessions)
    }

    pub fn update_session(&self, session: Session) -> Result<(), StoreError> {
        let year_month = Self::year_month_of(&session)?;
        let _guard = self.lock();
        let mut sessions = self.get_sessions(&year_month)?;
        match sessions.iter().position(|s| s.id == session.id) {
            Some(i) => sessions[i] = session,
            None => sessions.push(session),
        }
        self.write(&year_month, &sessions)
    }

    pub fn delete_session(&self, id: &str, year_month: &str) -> Result<(), StoreError> {
        // 先に検証してから直列化（不正な yearMonth は即時に拒否する）
        self.file_path(year_month)?;
        let _guard = self.lock();
        let mut sessions = self.get_sessions(year_month)?;
        sessions.retain(|s| s.id != id);
        self.write(year_month, &sessions)
    }

    /// tmp へ書いてから rename で原子的に差し替え、旧ファイルは .bak へ退避する。
    fn write(&self, year_month: &str, sessions: &[Session]) -> Result<(), StoreError> {
        std::fs::create_dir_all(&self.data_dir)?;
        let path = self.file_path(year_month)?;
        let tmp = append_ext(&path, ".tmp");
        let bak = append_ext(&path, ".bak");
        let json = serde_json::to_string_pretty(&SessionFileOut { sessions })?;
        std::fs::write(&tmp, json)?;
        // プライマリが未存在なら無視
        let _ = std::fs::rename(&path, &bak);
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }
}

/// `${path}.ext` のようにパス末尾へ拡張子を付け足す（with_extension と違い置換しない）。
fn append_ext(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}

/// 旧フォーマット（totalTime なし）向けに times[] から合計分を算出。
/// 完了区間のみ合算し、Math.max(1, round(ms/60000)) と同じ計算をする。
fn total_time_from_intervals(times: &[TimeInterval]) -> i64 {
    let mut ms: i64 = 0;
    for t in times {
        if let Some(end) = &t.end_time {
            if let (Ok(start), Ok(end)) = (parse_local_dt(&t.start_time), parse_local_dt(end)) {
                ms += (end - start).num_milliseconds();
            }
        }
    }
    let minutes = (ms as f64 / 60000.0).round() as i64;
    minutes.max(1)
}

/// "YYYY-MM-DDTHH:mm:ss"（ローカル・タイムゾーンなし）をパースする。
fn parse_local_dt(s: &str) -> Result<NaiveDateTime, chrono::ParseError> {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::TimeInterval;
    use std::sync::Arc;
    use tempfile::TempDir;

    fn new_store() -> (SessionStore, TempDir) {
        let dir = TempDir::new().unwrap();
        let store = SessionStore::new(dir.path().to_path_buf());
        (store, dir)
    }

    fn sample(id: &str, date: &str) -> Session {
        Session {
            id: id.to_string(),
            task_id: id.to_string(),
            name: "テスト作業".to_string(),
            project_code: "".to_string(),
            work_category: "".to_string(),
            times: vec![TimeInterval {
                start_time: format!("{date}T10:00:00"),
                end_time: Some(format!("{date}T10:30:00")),
            }],
            date: date.to_string(),
            color: "#FF9500".to_string(),
            total_time: 30,
            work_location: None,
        }
    }

    #[test]
    fn non_existent_month_returns_empty() {
        let (store, _d) = new_store();
        assert_eq!(store.get_sessions("2026-02").unwrap(), vec![]);
    }

    #[test]
    fn save_and_retrieve() {
        let (store, _d) = new_store();
        let mut s = sample("test-id", "2026-02-25");
        s.project_code = "P001".to_string();
        s.work_category = "開発".to_string();
        store.save_session(s.clone()).unwrap();
        let got = store.get_sessions("2026-02").unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0], s);
    }

    #[test]
    fn append_times_via_update() {
        let (store, _d) = new_store();
        let s = sample("test-id", "2026-02-25");
        store.save_session(s.clone()).unwrap();
        let mut updated = s.clone();
        updated.times.push(TimeInterval {
            start_time: "2026-02-25T11:00:00".to_string(),
            end_time: Some("2026-02-25T11:30:00".to_string()),
        });
        store.update_session(updated).unwrap();
        let got = store.get_sessions("2026-02").unwrap();
        assert_eq!(got[0].times.len(), 2);
        assert_eq!(got[0].times[1].end_time.as_deref(), Some("2026-02-25T11:30:00"));
    }

    #[test]
    fn delete_by_id() {
        let (store, _d) = new_store();
        store.save_session(sample("delete-me", "2026-02-27")).unwrap();
        store.delete_session("delete-me", "2026-02").unwrap();
        assert_eq!(store.get_sessions("2026-02").unwrap().len(), 0);
    }

    #[test]
    fn delete_nonexistent_id_is_noop() {
        let (store, _d) = new_store();
        assert!(store.delete_session("no-such-id", "2026-02").is_ok());
    }

    #[test]
    fn restore_from_bak_on_corrupt_primary() {
        let (store, dir) = new_store();
        let s = sample("bak-id", "2026-02-25");
        store.save_session(s.clone()).unwrap();
        let mut updated = s.clone();
        updated.name = "更新済み".to_string();
        store.update_session(updated).unwrap();
        // プライマリを破損させる（.bak には1回目のデータが残っている）
        let primary = dir.path().join("sessions-2026-02.json");
        std::fs::write(&primary, "INVALID JSON").unwrap();
        let got = store.get_sessions("2026-02").unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].id, "bak-id");
    }

    #[test]
    fn both_corrupt_returns_empty() {
        let (store, dir) = new_store();
        let primary = dir.path().join("sessions-2026-02.json");
        std::fs::write(&primary, "BAD").unwrap();
        std::fs::write(format!("{}.bak", primary.display()), "BAD").unwrap();
        assert_eq!(store.get_sessions("2026-02").unwrap(), vec![]);
    }

    #[test]
    fn reject_path_traversal_year_month() {
        let (store, _d) = new_store();
        assert!(store.get_sessions("../../etc/passwd").is_err());
        assert!(store.delete_session("x", "../../../tmp/evil").is_err());
    }

    #[test]
    fn reject_invalid_date_on_save() {
        let (store, _d) = new_store();
        let mut bad = sample("bad", "2026-02-25");
        bad.date = "../../../tmp/evil".to_string();
        assert!(store.save_session(bad).is_err());
    }

    #[test]
    fn concurrent_saves_all_persisted() {
        let (store, _d) = new_store();
        let store = Arc::new(store);
        let handles: Vec<_> = (0..10)
            .map(|i| {
                let s = store.clone();
                std::thread::spawn(move || {
                    s.save_session(sample(&format!("id-{i}"), "2026-02-25")).unwrap()
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(store.get_sessions("2026-02").unwrap().len(), 10);
    }

    #[test]
    fn legacy_without_total_time_is_migrated() {
        let (store, dir) = new_store();
        let primary = dir.path().join("sessions-2026-02.json");
        let legacy = r##"{
          "sessions": [
            {
              "id": "legacy-id",
              "taskId": "legacy-id",
              "name": "旧データ",
              "projectCode": "",
              "workCategory": "",
              "times": [
                { "startTime": "2026-02-25T10:00:00", "endTime": "2026-02-25T10:30:00" },
                { "startTime": "2026-02-25T11:00:00", "endTime": "2026-02-25T11:15:00" }
              ],
              "date": "2026-02-25",
              "color": "#FF9500"
            }
          ]
        }"##;
        std::fs::write(&primary, legacy).unwrap();
        let got = store.get_sessions("2026-02").unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].total_time, 45);
    }
}
