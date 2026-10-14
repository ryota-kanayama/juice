// Electron 版 src/main/sessionStore.ts の Rust 移植。
// セッションを月ごとの JSON（sessions-YYYY-MM.json）で永続化する。
// - read-modify-write は Mutex で直列化し、並行呼び出しでの lost-update を防ぐ
//   （読み取りも移行の write を伴いうるので同じロックで直列化する）
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
pub(crate) fn is_year_month(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7
        && b[0..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5].is_ascii_digit()
        && b[6].is_ascii_digit()
}

/// "YYYY-MM-DD" を検証。正規表現 ^\d{4}-\d{2}-\d{2}$ 相当。
pub(crate) fn is_date(s: &str) -> bool {
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

/// セッションファイルの現行フォーマット版数。
/// 1（暗黙・version 無し）→ 2: 単区間で totalTime と食い違う記録の終了時刻を補正済み。
const SESSION_FILE_VERSION: u32 = 2;

/// 移行前の中身を1回だけ退避する専用ファイルの接尾辞。
/// write() の .bak は保存のたびに上書きされるので、移行前の状態は別名で残す。
const PRE_MIGRATION_BACKUP_SUFFIX: &str = ".pre-v2.bak";

#[derive(Deserialize)]
struct RawSessionFile {
    #[serde(default)]
    version: u32,
    sessions: Vec<RawSession>,
}

#[derive(Serialize)]
struct SessionFileOut<'a> {
    version: u32,
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

    /// ファイルへ触れる操作（read-modify-write と、移行を伴う読み取り）を直列化する
    /// write_lock を取得。非再入なので、保持したまま取り直さないこと。
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

    pub(crate) fn year_month_of(session: &Session) -> Result<String, StoreError> {
        if !is_date(&session.date) {
            return Err(StoreError::InvalidDate(session.date.clone()));
        }
        Ok(session.date[0..7].to_string())
    }

    /// ファイルを読んでパース。読み取り・パース失敗はいずれも None。
    /// 返り値は (ファイルの version, セッション)。version 無しは 1 とみなす。
    fn read_parse(path: &Path) -> Option<(u32, Vec<Session>)> {
        let content = std::fs::read_to_string(path).ok()?;
        let raw: RawSessionFile = serde_json::from_str(&content).ok()?;
        let version = if raw.version == 0 { 1 } else { raw.version };
        Some((version, raw.sessions.into_iter().map(into_session).collect()))
    }

    pub fn get_sessions(&self, year_month: &str) -> Result<Vec<Session>, StoreError> {
        // 読み取りは移行の write を伴いうるので、書き込みと同じロックで直列化する。
        // write_lock は非再入なので、既にロックを持つ write 系からは
        // get_sessions_locked を直接呼ぶこと（ここを呼ぶとデッドロックする）。
        let _guard = self.lock();
        self.get_sessions_locked(year_month)
    }

    /// write_lock を取得済みの呼び出し元専用の読み取り。自身ではロックを取らない。
    fn get_sessions_locked(&self, year_month: &str) -> Result<Vec<Session>, StoreError> {
        // 不正な yearMonth はここで即 throw（try の外で検証）
        let path = self.file_path(year_month)?;
        // 読み取り元のパスも覚えておく（移行前の退避はこのファイルを複製する）
        let read = Self::read_parse(&path)
            .map(|parsed| (path.clone(), parsed))
            .or_else(|| {
                let bak = append_ext(&path, ".bak");
                Self::read_parse(&bak).map(|parsed| (bak, parsed))
            });
        let Some((source, (version, sessions))) = read else {
            return Ok(Vec::new());
        };
        if version >= SESSION_FILE_VERSION {
            return Ok(sessions);
        }
        // 一度だけの移行。
        // write() が作る .bak は移行後の最初の保存で上書きされてしまうため、
        // 移行前の中身は専用名で1回だけ退避する（既にあれば作り直さない）。
        // 退避に失敗したら移行そのものを中止し、移行前の内容を返す。
        let pre = append_ext(&path, PRE_MIGRATION_BACKUP_SUFFIX);
        if !pre.exists() {
            if let Err(e) = std::fs::copy(&source, &pre) {
                eprintln!("[juice] session migration {year_month} aborted (backup failed): {e}");
                return Ok(sessions);
            }
        }
        // 保存に失敗したら移行前の内容を返す（表示と保存内容を食い違わせない。次回起動で再試行される）
        let original = sessions.clone();
        let (migrated, changed) = migrate_sessions(sessions);
        eprintln!("[juice] session migration {year_month}: {changed} sessions adjusted");
        match self.write(year_month, &migrated) {
            Ok(()) => Ok(migrated),
            Err(e) => {
                eprintln!("[juice] session migration {year_month} aborted (persist failed): {e}");
                Ok(original)
            }
        }
    }

    pub fn save_session(&self, session: Session) -> Result<(), StoreError> {
        let year_month = Self::year_month_of(&session)?;
        let _guard = self.lock();
        let mut sessions = self.get_sessions_locked(&year_month)?;
        sessions.push(session);
        self.write(&year_month, &sessions)
    }

    pub fn update_session(&self, session: Session) -> Result<(), StoreError> {
        let year_month = Self::year_month_of(&session)?;
        let _guard = self.lock();
        let mut sessions = self.get_sessions_locked(&year_month)?;
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
        let mut sessions = self.get_sessions_locked(year_month)?;
        sessions.retain(|s| s.id != id);
        self.write(year_month, &sessions)
    }

    /// tmp へ書いてから rename で原子的に差し替え、旧ファイルは .bak へ退避する。
    fn write(&self, year_month: &str, sessions: &[Session]) -> Result<(), StoreError> {
        std::fs::create_dir_all(&self.data_dir)?;
        let path = self.file_path(year_month)?;
        let tmp = append_ext(&path, ".tmp");
        let bak = append_ext(&path, ".bak");
        let json = serde_json::to_string_pretty(&SessionFileOut {
            version: SESSION_FILE_VERSION,
            sessions,
        })?;
        std::fs::write(&tmp, json)?;
        // プライマリが未存在なら無視
        let _ = std::fs::rename(&path, &bak);
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }
}

/// `${path}.ext` のようにパス末尾へ拡張子を付け足す（with_extension と違い置換しない）。
pub(crate) fn append_ext(path: &Path, suffix: &str) -> PathBuf {
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

/// 旧データの補正。区間が1つで合計が total_time と食い違う記録だけ、
/// 終了時刻を「開始 + total_time 分」に書き換える。
/// 区間が複数のものはどれを直すべきか判断できないため触らない（週表示では
/// 「時刻なし」帯に出る）。区間なし・稼働中を含むものも対象外。
/// 返り値は (補正後のセッション, 補正した件数)。
fn migrate_sessions(sessions: Vec<Session>) -> (Vec<Session>, usize) {
    let mut changed = 0;
    let migrated = sessions
        .into_iter()
        .map(|mut s| {
            if s.times.len() != 1 {
                return s;
            }
            let Some(end) = s.times[0].end_time.clone() else {
                return s;
            };
            let (Ok(start_dt), Ok(end_dt)) =
                (parse_local_dt(&s.times[0].start_time), parse_local_dt(&end))
            else {
                return s;
            };
            let actual = ((end_dt - start_dt).num_milliseconds() as f64 / 60000.0).round() as i64;
            let actual = actual.max(1);
            if actual == s.total_time || s.total_time < 1 {
                return s;
            }
            // セッションファイルはユーザーが編集しうる信用できない入力。
            // 巨大な total_time でも panic せず、そのセッションは触らずに残す。
            let Some(delta) = chrono::TimeDelta::try_minutes(s.total_time) else {
                return s;
            };
            let Some(fixed) = start_dt.checked_add_signed(delta) else {
                return s;
            };
            let fixed_str = fixed.format("%Y-%m-%dT%H:%M:%S").to_string();
            eprintln!(
                "[juice] migrate {} {}: {} -> {} ({}分 -> {}分)",
                s.date, s.name, end, fixed_str, actual, s.total_time
            );
            s.times[0].end_time = Some(fixed_str);
            changed += 1;
            s
        })
        .collect();
    (migrated, changed)
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

    fn interval(start: &str, end: Option<&str>) -> TimeInterval {
        TimeInterval {
            start_time: start.to_string(),
            end_time: end.map(|s| s.to_string()),
        }
    }

    fn session_with(id: &str, times: Vec<TimeInterval>, total: i64) -> Session {
        Session {
            id: id.to_string(),
            task_id: id.to_string(),
            name: "作業".to_string(),
            project_code: String::new(),
            work_category: String::new(),
            times,
            date: "2026-05-20".to_string(),
            color: "#FF9500".to_string(),
            total_time: total,
            work_location: None,
        }
    }

    /// 未移行（version 無し・単区間が totalTime と食い違う）の月ファイルを置く。
    fn write_legacy_month(dir: &TempDir) {
        let raw = r##"{"sessions":[{"id":"a","taskId":"a","name":"作業","times":[{"startTime":"2026-05-20T10:00:00","endTime":"2026-05-20T10:01:00"}],"date":"2026-05-20","color":"#FF9500","totalTime":30}]}"##;
        std::fs::write(dir.path().join("sessions-2026-05.json"), raw).unwrap();
    }

    // --- 読み書き ---

    #[test]
    fn non_existent_month_returns_empty() {
        let (store, _d) = new_store();

        let got = store.get_sessions("2026-02").unwrap();

        assert_eq!(got, vec![]);
    }

    #[test]
    fn saved_session_is_the_only_one_retrieved() {
        let (store, _d) = new_store();
        store.save_session(sample("test-id", "2026-02-25")).unwrap();

        let got = store.get_sessions("2026-02").unwrap();

        assert_eq!(got.len(), 1);
    }

    #[test]
    fn saved_session_is_retrieved_unchanged() {
        let (store, _d) = new_store();
        let mut s = sample("test-id", "2026-02-25");
        s.project_code = "P001".to_string();
        s.work_category = "開発".to_string();
        store.save_session(s.clone()).unwrap();

        let got = store.get_sessions("2026-02").unwrap();

        assert_eq!(got[0], s);
    }

    fn append_interval_via_update(store: &SessionStore) {
        let s = sample("test-id", "2026-02-25");
        store.save_session(s.clone()).unwrap();
        let mut updated = s;
        updated.times.push(TimeInterval {
            start_time: "2026-02-25T11:00:00".to_string(),
            end_time: Some("2026-02-25T11:30:00".to_string()),
        });
        store.update_session(updated).unwrap();
    }

    #[test]
    fn update_appends_interval() {
        let (store, _d) = new_store();
        append_interval_via_update(&store);

        let got = store.get_sessions("2026-02").unwrap();

        assert_eq!(got[0].times.len(), 2);
    }

    #[test]
    fn update_keeps_appended_interval_end_time() {
        let (store, _d) = new_store();
        append_interval_via_update(&store);

        let got = store.get_sessions("2026-02").unwrap();

        assert_eq!(got[0].times[1].end_time.as_deref(), Some("2026-02-25T11:30:00"));
    }

    #[test]
    fn delete_removes_session_by_id() {
        let (store, _d) = new_store();
        store.save_session(sample("delete-me", "2026-02-27")).unwrap();
        store.delete_session("delete-me", "2026-02").unwrap();

        let got = store.get_sessions("2026-02").unwrap();

        assert_eq!(got.len(), 0);
    }

    #[test]
    fn delete_nonexistent_id_is_noop() {
        let (store, _d) = new_store();

        let result = store.delete_session("no-such-id", "2026-02");

        assert!(result.is_ok());
    }

    // --- 破損からの復旧 ---

    fn corrupt_primary_after_two_writes(store: &SessionStore, dir: &TempDir) {
        let s = sample("bak-id", "2026-02-25");
        store.save_session(s.clone()).unwrap();
        let mut updated = s;
        updated.name = "更新済み".to_string();
        store.update_session(updated).unwrap();
        // プライマリを破損させる（.bak には1回目のデータが残っている）
        let primary = dir.path().join("sessions-2026-02.json");
        std::fs::write(&primary, "INVALID JSON").unwrap();
    }

    #[test]
    fn corrupt_primary_is_restored_from_bak() {
        let (store, dir) = new_store();
        corrupt_primary_after_two_writes(&store, &dir);

        let got = store.get_sessions("2026-02").unwrap();

        assert_eq!(got.len(), 1);
    }

    #[test]
    fn restored_session_is_from_bak_content() {
        let (store, dir) = new_store();
        corrupt_primary_after_two_writes(&store, &dir);

        let got = store.get_sessions("2026-02").unwrap();

        assert_eq!(got[0].name, "テスト作業");
    }

    #[test]
    fn both_corrupt_returns_empty() {
        let (store, dir) = new_store();
        let primary = dir.path().join("sessions-2026-02.json");
        std::fs::write(&primary, "BAD").unwrap();
        std::fs::write(format!("{}.bak", primary.display()), "BAD").unwrap();

        let got = store.get_sessions("2026-02").unwrap();

        assert_eq!(got, vec![]);
    }

    // --- 入力検証 ---

    #[test]
    fn get_sessions_rejects_path_traversal_year_month() {
        let (store, _d) = new_store();

        let result = store.get_sessions("../../etc/passwd");

        assert!(result.is_err());
    }

    #[test]
    fn delete_session_rejects_path_traversal_year_month() {
        let (store, _d) = new_store();

        let result = store.delete_session("x", "../../../tmp/evil");

        assert!(result.is_err());
    }

    #[test]
    fn save_rejects_invalid_date() {
        let (store, _d) = new_store();
        let mut bad = sample("bad", "2026-02-25");
        bad.date = "../../../tmp/evil".to_string();

        let result = store.save_session(bad);

        assert!(result.is_err());
    }

    // --- 並行書き込み ---

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

    // --- 旧データの読み込み ---

    fn write_legacy_without_total_time(dir: &TempDir) {
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
    }

    #[test]
    fn legacy_without_total_time_is_still_one_session() {
        let (store, dir) = new_store();
        write_legacy_without_total_time(&dir);

        let got = store.get_sessions("2026-02").unwrap();

        assert_eq!(got.len(), 1);
    }

    #[test]
    fn legacy_without_total_time_sums_intervals() {
        let (store, dir) = new_store();
        write_legacy_without_total_time(&dir);

        let got = store.get_sessions("2026-02").unwrap();

        assert_eq!(got[0].total_time, 45);
    }

    // --- migrate_sessions ---

    #[test]
    fn migrate_counts_single_interval_mismatch() {
        let sessions = vec![session_with(
            "a",
            vec![interval("2026-05-20T10:00:00", Some("2026-05-20T10:01:00"))],
            30,
        )];

        let (_, changed) = migrate_sessions(sessions);

        assert_eq!(changed, 1);
    }

    #[test]
    fn migrate_extends_single_interval_to_total_time() {
        let sessions = vec![session_with(
            "a",
            vec![interval("2026-05-20T10:00:00", Some("2026-05-20T10:01:00"))],
            30,
        )];

        let (migrated, _) = migrate_sessions(sessions);

        assert_eq!(
            migrated[0].times[0].end_time.as_deref(),
            Some("2026-05-20T10:30:00")
        );
    }

    #[test]
    fn migrate_counts_overlong_interval() {
        let sessions = vec![session_with(
            "a",
            vec![interval("2026-05-20T09:00:00", Some("2026-05-20T18:22:00"))],
            65,
        )];

        let (_, changed) = migrate_sessions(sessions);

        assert_eq!(changed, 1);
    }

    #[test]
    fn migrate_shrinks_overlong_interval_to_total_time() {
        let sessions = vec![session_with(
            "a",
            vec![interval("2026-05-20T09:00:00", Some("2026-05-20T18:22:00"))],
            65,
        )];

        let (migrated, _) = migrate_sessions(sessions);

        assert_eq!(
            migrated[0].times[0].end_time.as_deref(),
            Some("2026-05-20T10:05:00")
        );
    }

    fn multi_interval_session() -> Vec<Session> {
        vec![session_with(
            "a",
            vec![
                interval("2026-05-20T09:00:00", Some("2026-05-20T10:00:00")),
                interval("2026-05-20T13:00:00", Some("2026-05-20T14:00:00")),
            ],
            200,
        )]
    }

    #[test]
    fn migrate_does_not_count_multi_interval() {
        let (_, changed) = migrate_sessions(multi_interval_session());

        assert_eq!(changed, 0);
    }

    #[test]
    fn migrate_keeps_multi_interval_total_time() {
        let (migrated, _) = migrate_sessions(multi_interval_session());

        assert_eq!(migrated[0].total_time, 200);
    }

    #[test]
    fn migrate_keeps_multi_interval_end_times() {
        let (migrated, _) = migrate_sessions(multi_interval_session());

        assert_eq!(
            migrated[0].times[1].end_time.as_deref(),
            Some("2026-05-20T14:00:00")
        );
    }

    #[test]
    fn migrate_does_not_count_empty_times() {
        let sessions = vec![session_with("a", vec![], 45)];

        let (_, changed) = migrate_sessions(sessions);

        assert_eq!(changed, 0);
    }

    #[test]
    fn migrate_keeps_empty_times_empty() {
        let sessions = vec![session_with("a", vec![], 45)];

        let (migrated, _) = migrate_sessions(sessions);

        assert!(migrated[0].times.is_empty());
    }

    fn running_interval_session() -> Vec<Session> {
        vec![session_with(
            "a",
            vec![interval("2026-05-20T10:00:00", None)],
            30,
        )]
    }

    #[test]
    fn migrate_does_not_count_running_interval() {
        let (_, changed) = migrate_sessions(running_interval_session());

        assert_eq!(changed, 0);
    }

    #[test]
    fn migrate_keeps_running_interval_open() {
        let (migrated, _) = migrate_sessions(running_interval_session());

        assert!(migrated[0].times[0].end_time.is_none());
    }

    #[test]
    fn migrate_leaves_matching_session_alone() {
        let sessions = vec![session_with(
            "a",
            vec![interval("2026-05-20T10:00:00", Some("2026-05-20T10:30:00"))],
            30,
        )];

        let (_, changed) = migrate_sessions(sessions);

        assert_eq!(changed, 0);
    }

    // 手で壊されうる値。panic せずそのセッションを触らないこと
    fn out_of_range_total_time_session() -> Vec<Session> {
        vec![session_with(
            "a",
            vec![interval("2026-05-20T10:00:00", Some("2026-05-20T10:01:00"))],
            999_999_999_999_999,
        )]
    }

    #[test]
    fn migrate_does_not_count_out_of_range_total_time() {
        let (_, changed) = migrate_sessions(out_of_range_total_time_session());

        assert_eq!(changed, 0);
    }

    #[test]
    fn migrate_keeps_end_time_when_total_time_out_of_range() {
        let (migrated, _) = migrate_sessions(out_of_range_total_time_session());

        assert_eq!(
            migrated[0].times[0].end_time.as_deref(),
            Some("2026-05-20T10:01:00")
        );
    }

    // --- 読み込み時の移行 ---

    #[test]
    fn get_sessions_applies_migration() {
        let (store, dir) = new_store();
        write_legacy_month(&dir);

        let got = store.get_sessions("2026-05").unwrap();

        assert_eq!(
            got[0].times[0].end_time.as_deref(),
            Some("2026-05-20T10:30:00")
        );
    }

    #[test]
    fn get_sessions_marks_file_as_version_2() {
        let (store, dir) = new_store();
        write_legacy_month(&dir);

        store.get_sessions("2026-05").unwrap();

        let content = std::fs::read_to_string(dir.path().join("sessions-2026-05.json")).unwrap();
        assert!(content.contains("\"version\": 2"));
    }

    #[test]
    fn second_get_sessions_returns_same_result() {
        let (store, dir) = new_store();
        write_legacy_month(&dir);
        store.get_sessions("2026-05").unwrap();

        let second = store.get_sessions("2026-05").unwrap();

        assert_eq!(
            second[0].times[0].end_time.as_deref(),
            Some("2026-05-20T10:30:00")
        );
    }

    #[test]
    fn migration_keeps_original_in_pre_migration_backup() {
        let (store, dir) = new_store();
        write_legacy_month(&dir);

        store.get_sessions("2026-05").unwrap();

        // 移行前の内容が専用の退避ファイルに残る
        let pre =
            std::fs::read_to_string(dir.path().join("sessions-2026-05.json.pre-v2.bak")).unwrap();
        assert!(pre.contains("2026-05-20T10:01:00"));
    }

    #[test]
    fn pre_migration_backup_keeps_original_after_later_save() {
        let (store, dir) = new_store();
        write_legacy_month(&dir);
        store.get_sessions("2026-05").unwrap();

        // 移行後に保存すると write() の .bak は移行後の内容で潰れるが、
        // 専用の退避ファイルは移行前のままでなければならない
        store.save_session(sample("later", "2026-05-21")).unwrap();

        let pre =
            std::fs::read_to_string(dir.path().join("sessions-2026-05.json.pre-v2.bak")).unwrap();
        assert!(pre.contains("2026-05-20T10:01:00"));
    }

    #[test]
    fn pre_migration_backup_has_no_migrated_content_after_later_save() {
        let (store, dir) = new_store();
        write_legacy_month(&dir);
        store.get_sessions("2026-05").unwrap();

        store.save_session(sample("later", "2026-05-21")).unwrap();

        let pre =
            std::fs::read_to_string(dir.path().join("sessions-2026-05.json.pre-v2.bak")).unwrap();
        assert!(!pre.contains("2026-05-20T10:30:00"));
    }

    // version 2 と明記されていれば、合計が食い違っていても触らない
    fn write_v2_month(dir: &TempDir) {
        let raw = r##"{"version":2,"sessions":[{"id":"a","taskId":"a","name":"作業","times":[{"startTime":"2026-05-20T10:00:00","endTime":"2026-05-20T10:01:00"}],"date":"2026-05-20","color":"#FF9500","totalTime":30}]}"##;
        std::fs::write(dir.path().join("sessions-2026-05.json"), raw).unwrap();
    }

    #[test]
    fn already_v2_file_keeps_end_time() {
        let (store, dir) = new_store();
        write_v2_month(&dir);

        let got = store.get_sessions("2026-05").unwrap();

        assert_eq!(
            got[0].times[0].end_time.as_deref(),
            Some("2026-05-20T10:01:00")
        );
    }

    #[test]
    fn already_v2_file_creates_no_pre_migration_backup() {
        let (store, dir) = new_store();
        write_v2_month(&dir);

        store.get_sessions("2026-05").unwrap();

        // 移行が走っていないので退避ファイルも作られない
        assert!(!dir.path().join("sessions-2026-05.json.pre-v2.bak").exists());
    }

    // --- ロックの直列化 ---

    /// 未移行の月へ別スレッドで保存し、デッドロックしないかを時間を計って確かめる。
    /// save_session はロックを保持したまま読み取りへ入る。読み取り側が同じ
    /// 非再入 Mutex を取り直すと自己デッドロックする。
    fn save_on_unmigrated_month(store: Arc<SessionStore>) -> Result<bool, String> {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let r = store.save_session(sample("later", "2026-05-21"));
            let _ = tx.send(r.is_ok());
        });
        // タイムアウト時に store へ触れると本体側がロックを握ったままなので更にブロックする
        rx.recv_timeout(std::time::Duration::from_secs(5))
            .map_err(|_| "deadlock".to_string())
    }

    #[test]
    fn save_on_unmigrated_month_does_not_deadlock() {
        let (store, dir) = new_store();
        write_legacy_month(&dir);

        let result = save_on_unmigrated_month(Arc::new(store));

        assert_eq!(result, Ok(true));
    }

    #[test]
    fn save_on_unmigrated_month_keeps_both_sessions() {
        let (store, dir) = new_store();
        write_legacy_month(&dir);
        let store = Arc::new(store);
        save_on_unmigrated_month(store.clone()).unwrap();

        let got = store.get_sessions("2026-05").unwrap();

        assert_eq!(got.len(), 2);
    }

    #[test]
    fn save_on_unmigrated_month_also_applies_migration() {
        let (store, dir) = new_store();
        write_legacy_month(&dir);
        let store = Arc::new(store);
        save_on_unmigrated_month(store.clone()).unwrap();

        let got = store.get_sessions("2026-05").unwrap();

        let migrated = got.iter().find(|s| s.id == "a").unwrap();
        assert_eq!(migrated.times[0].end_time.as_deref(), Some("2026-05-20T10:30:00"));
    }

    /// 読み取り経由の移行も write を伴うため、書き込みと直列化されないと
    /// 直前に保存されたセッションを移行側の write が消しうる。
    fn race_reads_and_writes(store: &Arc<SessionStore>) {
        let handles: Vec<_> = (0..8)
            .flat_map(|i| {
                let w = store.clone();
                let r = store.clone();
                [
                    std::thread::spawn(move || {
                        w.save_session(sample(&format!("id-{i}"), "2026-05-21")).unwrap()
                    }),
                    std::thread::spawn(move || {
                        r.get_sessions("2026-05").unwrap();
                    }),
                ]
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
    }

    #[test]
    fn read_migration_does_not_drop_concurrent_saves() {
        let (store, dir) = new_store();
        write_legacy_month(&dir);
        let store = Arc::new(store);

        race_reads_and_writes(&store);

        // 移行対象の1件 + 保存した8件がすべて残る
        assert_eq!(store.get_sessions("2026-05").unwrap().len(), 9);
    }

    #[test]
    fn read_migration_still_applies_under_concurrent_saves() {
        let (store, dir) = new_store();
        write_legacy_month(&dir);
        let store = Arc::new(store);

        race_reads_and_writes(&store);

        let got = store.get_sessions("2026-05").unwrap();
        let migrated = got.iter().find(|s| s.id == "a").unwrap();
        assert_eq!(migrated.times[0].end_time.as_deref(), Some("2026-05-20T10:30:00"));
    }

    // --- is_date ---

    #[test]
    fn is_date_accepts_yyyy_mm_dd() {
        assert!(is_date("2026-02-25"));
    }

    #[test]
    fn is_date_rejects_wrong_length() {
        assert!(!is_date("2026-02-255"));
    }

    #[test]
    fn is_date_rejects_non_digit_in_year() {
        assert!(!is_date("20x6-02-25"));
    }

    #[test]
    fn is_date_rejects_wrong_first_separator() {
        assert!(!is_date("2026/02-25"));
    }

    #[test]
    fn is_date_rejects_non_digit_in_month_tens() {
        assert!(!is_date("2026-x2-25"));
    }

    #[test]
    fn is_date_rejects_non_digit_in_month_ones() {
        assert!(!is_date("2026-0x-25"));
    }

    #[test]
    fn is_date_rejects_wrong_second_separator() {
        assert!(!is_date("2026-02/25"));
    }

    #[test]
    fn is_date_rejects_non_digit_in_day_tens() {
        assert!(!is_date("2026-02-x5"));
    }

    #[test]
    fn is_date_rejects_non_digit_in_day_ones() {
        assert!(!is_date("2026-02-2x"));
    }

    // --- StoreError の表示 ---

    #[test]
    fn invalid_year_month_error_message_names_the_input() {
        let msg = StoreError::InvalidYearMonth("2026/06".into()).to_string();

        assert_eq!(msg, "invalid yearMonth: 2026/06");
    }

    #[test]
    fn invalid_date_error_message_names_the_input() {
        let msg = StoreError::InvalidDate("x".into()).to_string();

        assert_eq!(msg, "invalid session.date: x");
    }

    // --- migrate_sessions の境界値 ---

    #[test]
    fn migrate_leaves_zero_total_time_alone() {
        let sessions = vec![session_with(
            "a",
            vec![interval("2026-05-20T10:00:00", Some("2026-05-20T10:10:00"))],
            0,
        )];

        let (_, changed) = migrate_sessions(sessions);

        assert_eq!(changed, 0);
    }

    #[test]
    fn migrate_leaves_negative_total_time_alone() {
        let sessions = vec![session_with(
            "a",
            vec![interval("2026-05-20T10:00:00", Some("2026-05-20T10:10:00"))],
            -5,
        )];

        let (_, changed) = migrate_sessions(sessions);

        assert_eq!(changed, 0);
    }

    #[test]
    fn migrate_fixes_session_with_total_time_of_one_minute() {
        let sessions = vec![session_with(
            "a",
            vec![interval("2026-05-20T10:00:00", Some("2026-05-20T10:10:00"))],
            1,
        )];

        let (migrated, _) = migrate_sessions(sessions);

        assert_eq!(
            migrated[0].times[0].end_time.as_deref(),
            Some("2026-05-20T10:01:00")
        );
    }
}
