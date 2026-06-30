// Electron 版 src/main/dailyStore.ts の Rust 移植。
// 日付ごとの勤務データを月単位の JSON（daily-YYYY-MM.json）で永続化する。
// day レコードは renderer から部分パッチ（任意キー）で来るため、構造体ではなく
// serde_json::Value(オブジェクト) で保持し、JS の {...existing, ...patch} を忠実に再現する。

use crate::session_store::{append_ext, is_date, is_year_month, StoreError};
use chrono::{Duration, Local, Utc};
use serde::Serialize;
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

const CURRENT_VERSION: i64 = 1;

pub struct DailyMonth {
    pub version: i64,
    pub days: Map<String, Value>,
}

/// importLegacy の各エントリ（date と任意 record オブジェクト）。
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

    fn lock(&self) -> MutexGuard<'_, ()> {
        self.write_lock.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn file_path(&self, year_month: &str) -> Result<PathBuf, StoreError> {
        if !is_year_month(year_month) {
            return Err(StoreError::InvalidYearMonth(year_month.to_string()));
        }
        Ok(self.data_dir.join(format!("daily-{year_month}.json")))
    }

    fn year_month_of(date: &str) -> Result<String, StoreError> {
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
        if let Ok(c) = std::fs::read_to_string(&path) {
            if let Some(m) = Self::parse_month(&c) {
                return Ok(m);
            }
        }
        if let Ok(c) = std::fs::read_to_string(append_ext(&path, ".bak")) {
            if let Some(m) = Self::parse_month(&c) {
                return Ok(m);
            }
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
        let _guard = self.lock();
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
            let _guard = self.lock();
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
            let _guard = self.lock();
            let mut month = self.get_month(&year_month)?;
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
        std::fs::create_dir_all(&self.data_dir)?;
        let path = self.file_path(year_month)?;
        let tmp = append_ext(&path, ".tmp");
        let bak = append_ext(&path, ".bak");
        let json = serde_json::to_string_pretty(&DailyMonthOut {
            version: CURRENT_VERSION,
            days: &month.days,
        })?;
        std::fs::write(&tmp, json)?;
        let _ = std::fs::rename(&path, &bak);
        std::fs::rename(&tmp, &path)?;
        Ok(())
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
    use serde_json::json;
    use tempfile::TempDir;

    fn new_store() -> (DailyStore, TempDir) {
        let dir = TempDir::new().unwrap();
        (DailyStore::new(dir.path().to_path_buf()), dir)
    }

    #[test]
    fn non_existent_month_is_empty() {
        let (s, _d) = new_store();
        let m = s.get_month("2026-06").unwrap();
        assert_eq!(m.version, 1);
        assert!(m.days.is_empty());
        assert!(s.get_day("2026-06-17").unwrap().is_none());
    }

    #[test]
    fn set_day_merges_and_stamps_updated_at() {
        let (s, _d) = new_store();
        s.set_day("2026-06-17", json!({ "workStart": "09:00", "telework": true }))
            .unwrap();
        s.set_day("2026-06-17", json!({ "workEnd": "18:00" })).unwrap();
        let day = s.get_day("2026-06-17").unwrap().unwrap();
        assert_eq!(day["workStart"], "09:00");
        assert_eq!(day["telework"], true);
        assert_eq!(day["workEnd"], "18:00");
        let updated = day["updatedAt"].as_str().unwrap();
        // /^\d{4}-\d{2}-\d{2}T.*Z$/ 相当
        assert!(updated.contains('T') && updated.ends_with('Z'));
        assert_eq!(updated.as_bytes()[4], b'-');
    }

    #[test]
    fn written_with_version_1() {
        let (s, dir) = new_store();
        s.set_day("2026-06-17", json!({ "workStart": "09:00" })).unwrap();
        let raw: Value = serde_json::from_str(
            &std::fs::read_to_string(dir.path().join("daily-2026-06.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(raw["version"], 1);
        assert_eq!(raw["days"]["2026-06-17"]["workStart"], "09:00");
    }

    #[test]
    fn restore_from_bak_on_corrupt() {
        let (s, dir) = new_store();
        s.set_day("2026-06-17", json!({ "workStart": "09:00" })).unwrap();
        s.set_day("2026-06-17", json!({ "workEnd": "18:00" })).unwrap(); // .bak が作られる
        std::fs::write(dir.path().join("daily-2026-06.json"), "{ broken").unwrap();
        let day = s.get_day("2026-06-17").unwrap().unwrap();
        assert_eq!(day["workStart"], "09:00"); // .bak の内容（workEnd 前）
    }

    #[test]
    fn import_legacy_groups_and_skips_existing() {
        let (s, _d) = new_store();
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
        assert_eq!(s.get_day("2026-06-17").unwrap().unwrap()["workStart"], "08:00");
        assert_eq!(s.get_day("2026-06-18").unwrap().unwrap()["telework"], true);
        assert_eq!(s.get_day("2026-05-01").unwrap().unwrap()["workStart"], "10:00");
    }

    #[test]
    fn prune_removes_old_days() {
        let (s, _d) = new_store();
        let recent = chrono::Local::now().format("%Y-%m-%d").to_string();
        s.set_day("2000-01-01", json!({ "workStart": "09:00" })).unwrap();
        s.set_day(&recent, json!({ "workStart": "09:00" })).unwrap();
        s.prune(90).unwrap();
        assert!(s.get_day("2000-01-01").unwrap().is_none());
        assert!(s.get_day(&recent).unwrap().is_some());
    }

    #[test]
    fn rejects_invalid_year_month_and_date() {
        let (s, _d) = new_store();
        assert!(s.get_month("2026/06").is_err());
        assert!(s.set_day("2026-6-1", json!({})).is_err());
    }
}
