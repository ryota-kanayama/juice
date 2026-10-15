// Electron 版 src/main/dailyStore.ts の Rust 移植。
// 日付ごとの勤務データを月単位の JSON（daily-YYYY-MM.json）で永続化する。
// day レコードは renderer から部分パッチ（任意キー）で来るため、構造体ではなく
// serde_json::Value(オブジェクト) で保持し、JS の {...existing, ...patch} を忠実に再現する。

use crate::fs_util::{lock, read_json_with_backup, write_json_atomic, StoreError};
use crate::session_store::{is_date, is_year_month};
use chrono::{Duration, Local, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::Mutex;

const CURRENT_VERSION: i64 = 1;

#[derive(Debug)]
pub struct DailyMonth {
    pub version: i64,
    pub days: Map<String, Value>,
}

/// importLegacy の各エントリ（date と任意 record オブジェクト）。
#[derive(Deserialize)]
pub struct LegacyEntry {
    pub date: String,
    pub record: Value,
}

#[derive(Serialize)]
struct DailyMonthOut<'a> {
    version: i64,
    days: &'a Map<String, Value>,
}

pub struct DailyStore {
    data_dir: PathBuf,
    write_lock: Mutex<()>,
}

impl DailyStore {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            write_lock: Mutex::new(()),
        }
    }

    fn file_path(&self, year_month: &str) -> Result<PathBuf, StoreError> {
        if !is_year_month(year_month) {
            return Err(StoreError::InvalidYearMonth(year_month.to_string()));
        }
        Ok(self.data_dir.join(format!("daily-{year_month}.json")))
    }

    pub(crate) fn year_month_of(date: &str) -> Result<String, StoreError> {
        if !is_date(date) {
            return Err(StoreError::InvalidDate(date.to_string()));
        }
        Ok(date[0..7].to_string())
    }

    /// version は数値なら採用しなければ 1、days は無ければ {}。Electron 版 parse() と同じ。
    fn parse_month(content: &str) -> Option<DailyMonth> {
        let v: Value = serde_json::from_str(content).ok()?;
        let version = v.get("version").and_then(Value::as_i64).unwrap_or(CURRENT_VERSION);
        let days = v
            .get("days")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        Some(DailyMonth { version, days })
    }

    pub fn get_month(&self, year_month: &str) -> Result<DailyMonth, StoreError> {
        let path = self.file_path(year_month)?; // 不正な yearMonth はここで即 throw
        if let Some((_, month)) = read_json_with_backup(&path, Self::parse_month)? {
            return Ok(month);
        }
        Ok(DailyMonth {
            version: CURRENT_VERSION,
            days: Map::new(),
        })
    }

    pub fn get_day(&self, date: &str) -> Result<Option<Value>, StoreError> {
        let month = self.get_month(&Self::year_month_of(date)?)?;
        Ok(month.days.get(date).cloned())
    }

    pub fn set_day(&self, date: &str, patch: Value) -> Result<(), StoreError> {
        let year_month = Self::year_month_of(date)?;
        let _guard = lock(&self.write_lock);
        let mut month = self.get_month(&year_month)?;
        let mut record = month
            .days
            .get(date)
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        if let Some(p) = patch.as_object() {
            for (k, val) in p {
                record.insert(k.clone(), val.clone());
            }
        }
        record.insert("updatedAt".to_string(), Value::String(now_iso()));
        month.days.insert(date.to_string(), Value::Object(record));
        self.write(&year_month, &month)
    }

    /// localStorage からの一括移行。月ごとにまとめて書き、既存日は上書きしない。
    pub fn import_legacy(&self, entries: Vec<LegacyEntry>) -> Result<(), StoreError> {
        // 月ごとにグループ化（date 検証も兼ねる）
        let mut by_month: std::collections::BTreeMap<String, Vec<(String, Value)>> =
            std::collections::BTreeMap::new();
        for e in entries {
            let ym = Self::year_month_of(&e.date)?;
            by_month.entry(ym).or_default().push((e.date, e.record));
        }
        for (year_month, list) in by_month {
            let _guard = lock(&self.write_lock);
            let mut month = self.get_month(&year_month)?;
            let stamp = now_iso();
            for (date, record) in list {
                if month.days.contains_key(&date) {
                    continue; // 既にデータがある日は触らない
                }
                let mut obj = record.as_object().cloned().unwrap_or_default();
                obj.insert("updatedAt".to_string(), Value::String(stamp.clone()));
                month.days.insert(date, Value::Object(obj));
            }
            self.write(&year_month, &month)?;
        }
        Ok(())
    }

    /// keepDays より古い日付エントリを全月ファイルから削除する。
    pub fn prune(&self, keep_days: i64) -> Result<(), StoreError> {
        let cutoff = (Local::now() - Duration::days(keep_days))
            .format("%Y-%m-%d")
            .to_string();
        let read_dir = match std::fs::read_dir(&self.data_dir) {
            Ok(rd) => rd,
            Err(_) => return Ok(()), // dataDir 未存在なら何もしない
        };
        let mut months: Vec<String> = Vec::new();
        for entry in read_dir.flatten() {
            let name = entry.file_name();
            if let Some(ym) = parse_daily_filename(&name.to_string_lossy()) {
                months.push(ym);
            }
        }
        for year_month in months {
            let _guard = lock(&self.write_lock);
            let mut month = match self.get_month(&year_month) {
                Ok(month) => month,
                // 壊れた月は退避済み。他の月の整理は続ける
                Err(StoreError::Corrupt(_)) => continue,
                Err(e) => return Err(e),
            };
            let before = month.days.len();
            month.days.retain(|date, _| date.as_str() >= cutoff.as_str());
            if month.days.len() != before {
                self.write(&year_month, &month)?;
            }
        }
        Ok(())
    }

    /// tmp→rename の原子的書き込み。version は常に CURRENT_VERSION で書く。
    fn write(&self, year_month: &str, month: &DailyMonth) -> Result<(), StoreError> {
        let path = self.file_path(year_month)?;
        write_json_atomic(
            &path,
            &DailyMonthOut {
                version: CURRENT_VERSION,
                days: &month.days,
            },
        )
    }
}

/// "YYYY-MM-DDTHH:mm:ss.SSSZ"（UTC・Z 終端）。JS の Date.toISOString() 相当。
fn now_iso() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// "daily-YYYY-MM.json" から "YYYY-MM" を取り出す（.bak/.tmp は対象外）。
fn parse_daily_filename(name: &str) -> Option<String> {
    let ym = name.strip_prefix("daily-")?.strip_suffix(".json")?;
    if is_year_month(ym) {
        Some(ym.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs_util::{append_ext, corrupt_copies};
    use serde_json::json;
    use std::sync::Arc;
    use tempfile::TempDir;

    fn new_store() -> (DailyStore, TempDir) {
        let dir = TempDir::new().unwrap();
        (DailyStore::new(dir.path().to_path_buf()), dir)
    }

    #[test]
    fn non_existent_month_has_version_1() {
        let (s, _d) = new_store();

        let m = s.get_month("2026-06").unwrap();

        assert_eq!(m.version, 1);
    }

    #[test]
    fn non_existent_month_has_no_days() {
        let (s, _d) = new_store();

        let m = s.get_month("2026-06").unwrap();

        assert!(m.days.is_empty());
    }

    #[test]
    fn non_existent_day_is_none() {
        let (s, _d) = new_store();

        let day = s.get_day("2026-06-17").unwrap();

        assert!(day.is_none());
    }

    #[test]
    fn set_day_keeps_earlier_fields_when_merging() {
        let (s, _d) = new_store();
        s.set_day("2026-06-17", json!({ "workStart": "09:00", "telework": true }))
            .unwrap();
        s.set_day("2026-06-17", json!({ "workEnd": "18:00" })).unwrap();

        let day = s.get_day("2026-06-17").unwrap().unwrap();

        assert_eq!(day["workStart"], "09:00");
        assert_eq!(day["telework"], true);
    }

    #[test]
    fn set_day_adds_new_fields_when_merging() {
        let (s, _d) = new_store();
        s.set_day("2026-06-17", json!({ "workStart": "09:00" })).unwrap();
        s.set_day("2026-06-17", json!({ "workEnd": "18:00" })).unwrap();

        let day = s.get_day("2026-06-17").unwrap().unwrap();

        assert_eq!(day["workEnd"], "18:00");
    }

    #[test]
    fn set_day_stamps_updated_at_as_utc_iso() {
        let (s, _d) = new_store();
        s.set_day("2026-06-17", json!({ "workStart": "09:00" })).unwrap();

        let day = s.get_day("2026-06-17").unwrap().unwrap();

        let updated = day["updatedAt"].as_str().unwrap();
        // /^\d{4}-\d{2}-\d{2}T.*Z$/ 相当
        assert!(updated.contains('T') && updated.ends_with('Z'));
        assert_eq!(updated.as_bytes()[4], b'-');
    }

    #[test]
    fn file_is_written_with_version_1() {
        let (s, dir) = new_store();
        s.set_day("2026-06-17", json!({ "workStart": "09:00" })).unwrap();

        let raw: Value = serde_json::from_str(
            &std::fs::read_to_string(dir.path().join("daily-2026-06.json")).unwrap(),
        )
        .unwrap();

        assert_eq!(raw["version"], 1);
    }

    #[test]
    fn file_holds_day_record_under_its_date() {
        let (s, dir) = new_store();
        s.set_day("2026-06-17", json!({ "workStart": "09:00" })).unwrap();

        let raw: Value = serde_json::from_str(
            &std::fs::read_to_string(dir.path().join("daily-2026-06.json")).unwrap(),
        )
        .unwrap();

        assert_eq!(raw["days"]["2026-06-17"]["workStart"], "09:00");
    }

    #[test]
    fn corrupt_file_is_restored_from_bak() {
        let (s, dir) = new_store();
        s.set_day("2026-06-17", json!({ "workStart": "09:00" })).unwrap();
        s.set_day("2026-06-17", json!({ "workEnd": "18:00" })).unwrap(); // .bak が作られる
        std::fs::write(dir.path().join("daily-2026-06.json"), "{ broken").unwrap();

        let day = s.get_day("2026-06-17").unwrap().unwrap();

        assert_eq!(day["workStart"], "09:00"); // .bak の内容（workEnd 前）
    }

    #[test]
    fn corrupt_file_is_moved_aside_when_restored_from_bak() {
        let (s, dir) = new_store();
        s.set_day("2026-06-17", json!({ "workStart": "09:00" })).unwrap();
        s.set_day("2026-06-17", json!({ "workEnd": "18:00" })).unwrap();
        std::fs::write(dir.path().join("daily-2026-06.json"), "{ broken").unwrap();

        s.get_month("2026-06").unwrap();

        assert_eq!(
            corrupt_copies(dir.path(), "daily-2026-06.json"),
            vec!["{ broken".to_string()]
        );
    }

    /// 2026-06 の本体も .bak も壊す。本体のパスを返す。
    fn corrupt_both_files(dir: &TempDir) -> PathBuf {
        let primary = dir.path().join("daily-2026-06.json");
        std::fs::write(&primary, "BAD primary").unwrap();
        std::fs::write(append_ext(&primary, ".bak"), "BAD bak").unwrap();
        primary
    }

    #[test]
    fn get_month_returns_corrupt_error_when_both_are_corrupt() {
        let (s, dir) = new_store();
        let primary = corrupt_both_files(&dir);

        let result = s.get_month("2026-06");

        assert!(
            matches!(result, Err(StoreError::Corrupt(ref p)) if *p == primary),
            "本体のパスを持つ Corrupt エラーになること: {result:?}"
        );
    }

    #[test]
    fn get_month_keeps_corrupt_primary_content_when_both_are_corrupt() {
        let (s, dir) = new_store();
        corrupt_both_files(&dir);

        let _ = s.get_month("2026-06");

        assert_eq!(
            corrupt_copies(dir.path(), "daily-2026-06.json"),
            vec!["BAD primary".to_string()]
        );
    }

    #[test]
    fn get_month_keeps_corrupt_backup_content_when_both_are_corrupt() {
        let (s, dir) = new_store();
        corrupt_both_files(&dir);

        let _ = s.get_month("2026-06");

        assert_eq!(
            corrupt_copies(dir.path(), "daily-2026-06.json.bak"),
            vec!["BAD bak".to_string()]
        );
    }

    #[test]
    fn set_day_returns_corrupt_error_when_both_are_corrupt() {
        let (s, dir) = new_store();
        let primary = corrupt_both_files(&dir);

        let result = s.set_day("2026-06-17", json!({ "workStart": "09:00" }));

        assert!(
            matches!(result, Err(StoreError::Corrupt(ref p)) if *p == primary),
            "本体のパスを持つ Corrupt エラーになること: {result:?}"
        );
    }

    #[test]
    fn set_day_writes_nothing_when_both_are_corrupt() {
        let (s, dir) = new_store();
        let primary = corrupt_both_files(&dir);

        let _ = s.set_day("2026-06-17", json!({ "workStart": "09:00" }));

        assert!(!primary.exists(), "月ファイルが新しく書かれないこと");
    }

    fn import_three_legacy_entries(s: &DailyStore) {
        s.set_day("2026-06-17", json!({ "workStart": "08:00" })).unwrap();
        s.import_legacy(vec![
            LegacyEntry {
                date: "2026-06-17".into(),
                record: json!({ "workStart": "09:00" }),
            }, // 既存→無視
            LegacyEntry {
                date: "2026-06-18".into(),
                record: json!({ "telework": true }),
            },
            LegacyEntry {
                date: "2026-05-01".into(),
                record: json!({ "workStart": "10:00" }),
            },
        ])
        .unwrap();
    }

    #[test]
    fn import_legacy_skips_existing_day() {
        let (s, _d) = new_store();
        import_three_legacy_entries(&s);

        let day = s.get_day("2026-06-17").unwrap().unwrap();

        assert_eq!(day["workStart"], "08:00");
    }

    #[test]
    fn import_legacy_adds_new_day_in_existing_month() {
        let (s, _d) = new_store();
        import_three_legacy_entries(&s);

        let day = s.get_day("2026-06-18").unwrap().unwrap();

        assert_eq!(day["telework"], true);
    }

    #[test]
    fn import_legacy_adds_day_in_another_month() {
        let (s, _d) = new_store();
        import_three_legacy_entries(&s);

        let day = s.get_day("2026-05-01").unwrap().unwrap();

        assert_eq!(day["workStart"], "10:00");
    }

    #[test]
    fn prune_removes_days_older_than_limit() {
        let (s, _d) = new_store();
        s.set_day("2000-01-01", json!({ "workStart": "09:00" })).unwrap();

        s.prune(90).unwrap();

        assert!(s.get_day("2000-01-01").unwrap().is_none());
    }

    #[test]
    fn prune_keeps_recent_days() {
        let (s, _d) = new_store();
        let recent = chrono::Local::now().format("%Y-%m-%d").to_string();
        s.set_day(&recent, json!({ "workStart": "09:00" })).unwrap();

        s.prune(90).unwrap();

        assert!(s.get_day(&recent).unwrap().is_some());
    }

    /// year_month の月ファイルを本体も .bak も壊して置く。
    fn corrupt_month(dir: &TempDir, year_month: &str) {
        let primary = dir.path().join(format!("daily-{year_month}.json"));
        std::fs::write(&primary, "BAD primary").unwrap();
        std::fs::write(append_ext(&primary, ".bak"), "BAD bak").unwrap();
    }

    #[test]
    fn prune_returns_ok_when_some_months_are_corrupt() {
        let (s, dir) = new_store();
        s.set_day("2019-02-10", json!({ "workStart": "09:00" })).unwrap();
        corrupt_month(&dir, "2019-01");
        corrupt_month(&dir, "2019-03");

        let result = s.prune(90);

        assert!(result.is_ok(), "壊れた月があっても Ok を返すこと: {result:?}");
    }

    #[test]
    fn prune_removes_old_days_from_intact_months_around_corrupt_ones() {
        let (s, dir) = new_store();
        // read_dir の順序に依らないよう、壊れた月と正常な月を交互に置く
        for ym in ["2019-01", "2019-03", "2019-05"] {
            corrupt_month(&dir, ym);
        }
        for date in ["2019-02-10", "2019-04-10", "2019-06-10"] {
            s.set_day(date, json!({ "workStart": "09:00" })).unwrap();
        }

        s.prune(90).unwrap();

        let remaining: Vec<Option<Value>> = ["2019-02-10", "2019-04-10", "2019-06-10"]
            .iter()
            .map(|d| s.get_day(d).unwrap())
            .collect();
        assert_eq!(remaining, vec![None, None, None]);
    }

    #[test]
    fn import_legacy_returns_corrupt_error_when_the_month_is_corrupt() {
        let (s, dir) = new_store();
        corrupt_month(&dir, "2026-06");

        let result = s.import_legacy(vec![LegacyEntry {
            date: "2026-06-17".into(),
            record: json!({ "workStart": "09:00" }),
        }]);

        let primary = dir.path().join("daily-2026-06.json");
        assert!(
            matches!(result, Err(StoreError::Corrupt(ref p)) if *p == primary),
            "本体のパスを持つ Corrupt エラーになること: {result:?}"
        );
    }

    #[test]
    fn import_legacy_writes_nothing_when_the_month_is_corrupt() {
        let (s, dir) = new_store();
        corrupt_month(&dir, "2026-06");

        let _ = s.import_legacy(vec![LegacyEntry {
            date: "2026-06-17".into(),
            record: json!({ "workStart": "09:00" }),
        }]);

        assert!(
            !dir.path().join("daily-2026-06.json").exists(),
            "月ファイルが新しく書かれないこと"
        );
    }

    // --- 読み取りも書き込みと同じロックで直列化する ---
    // 壊れたファイルの退避（rename）を伴うので、書き手の保存と交差してはならない。

    /// write_lock を保持したまま f を別スレッドで走らせ、200ms 以内に終わるかを返す。
    /// 終わったら Some(結果)、待たされたら None（ロックを放した後に必ず完了を待つ）。
    fn run_while_locked<T: Send + 'static>(
        s: &Arc<DailyStore>,
        f: impl FnOnce(&DailyStore) -> T + Send + 'static,
    ) -> Option<T> {
        let guard = lock(&s.write_lock);
        let (tx, rx) = std::sync::mpsc::channel();
        let worker = {
            let s = Arc::clone(s);
            std::thread::spawn(move || tx.send(f(&s)).unwrap())
        };

        let early = rx.recv_timeout(std::time::Duration::from_millis(200)).ok();

        drop(guard);
        worker.join().unwrap();
        early
    }

    #[test]
    fn get_month_waits_while_the_write_lock_is_held() {
        let (s, dir) = new_store();
        corrupt_month(&dir, "2026-06");

        let early = run_while_locked(&Arc::new(s), |s| s.get_month("2026-06").is_err());

        assert_eq!(early, None, "ロック中は読み取りが待たされること");
    }

    #[test]
    fn get_day_waits_while_the_write_lock_is_held() {
        let (s, dir) = new_store();
        corrupt_month(&dir, "2026-06");

        let early = run_while_locked(&Arc::new(s), |s| s.get_day("2026-06-17").is_err());

        assert_eq!(early, None, "ロック中は読み取りが待たされること");
    }

    #[test]
    fn get_month_rejects_invalid_year_month() {
        let (s, _d) = new_store();

        let result = s.get_month("2026/06");

        assert!(result.is_err());
    }

    #[test]
    fn set_day_rejects_invalid_date() {
        let (s, _d) = new_store();

        let result = s.set_day("2026-6-1", json!({}));

        assert!(result.is_err());
    }
}
