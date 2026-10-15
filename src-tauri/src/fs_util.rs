// 3つのストア（session_store / daily_store / settings_store）が共有する
// ファイル入出力の部品。
// - 書き込みは tmp→rename で原子的に行い、旧ファイルは .bak に退避する
// - 読み込みは本体→.bak の順に試す（既定値への落とし込みは呼び出し側）

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("invalid yearMonth: {0}")]
    InvalidYearMonth(String),
    #[error("invalid session.date: {0}")]
    InvalidDate(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialize error: {0}")]
    Serde(#[from] serde_json::Error),
}

/// `${path}.ext` のようにパス末尾へ拡張子を付け足す（with_extension と違い置換しない）。
pub(crate) fn append_ext(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}

/// Mutex を取得する。直前の操作が panic で毒された場合も中身を取り出して継続する。
pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// value を整形 JSON にして path へ原子的に書く。
/// 親ディレクトリを作り、tmp へ書いてから、既存の本体を .bak へ退避し、tmp を本体へ rename する。
pub(crate) fn write_json_atomic<T: Serialize + ?Sized>(
    path: &Path,
    value: &T,
) -> Result<(), StoreError> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = append_ext(path, ".tmp");
    let bak = append_ext(path, ".bak");
    let json = serde_json::to_string_pretty(value)?;
    std::fs::write(&tmp, json)?;
    // 本体が未存在なら無視
    let _ = std::fs::rename(path, &bak);
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// 本体→.bak の順に読み、parse が Some を返した最初のものを (読み取り元のパス, 値) で返す。
/// どちらも読めない・パースできないときは None。
pub(crate) fn read_json_with_backup<T>(
    path: &Path,
    parse: impl Fn(&str) -> Option<T>,
) -> Option<(PathBuf, T)> {
    let read_one = |p: PathBuf| {
        let content = std::fs::read_to_string(&p).ok()?;
        parse(&content).map(|value| (p, value))
    };
    read_one(path.to_path_buf()).or_else(|| read_one(append_ext(path, ".bak")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use tempfile::tempdir;

    fn parse_json(content: &str) -> Option<Value> {
        serde_json::from_str(content).ok()
    }

    #[test]
    fn append_ext_adds_suffix_without_replacing_extension() {
        let path = Path::new("/data/sessions-2026-06.json");

        let appended = append_ext(path, ".bak");

        assert_eq!(appended, PathBuf::from("/data/sessions-2026-06.json.bak"));
    }

    #[test]
    fn lock_recovers_value_from_poisoned_mutex() {
        let mutex = Mutex::new(7);
        let _ = std::thread::scope(|s| {
            s.spawn(|| {
                let _guard = mutex.lock().unwrap();
                panic!("poison the mutex");
            })
            .join()
        });

        let guard = lock(&mutex);

        assert_eq!(*guard, 7);
    }

    #[test]
    fn write_json_atomic_creates_missing_parent_directories() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nested").join("data.json");

        write_json_atomic(&path, &json!({ "a": 1 })).unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\n  \"a\": 1\n}");
    }

    #[test]
    fn write_json_atomic_leaves_no_tmp_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");

        write_json_atomic(&path, &json!({ "a": 1 })).unwrap();

        assert!(!append_ext(&path, ".tmp").exists(), "tmp が残らないこと");
    }

    #[test]
    fn write_json_atomic_first_write_creates_no_backup() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");

        write_json_atomic(&path, &json!({ "a": 1 })).unwrap();

        assert!(
            !append_ext(&path, ".bak").exists(),
            "初回は .bak ができないこと"
        );
    }

    #[test]
    fn write_json_atomic_moves_previous_content_to_backup() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        write_json_atomic(&path, &json!({ "a": 1 })).unwrap();

        write_json_atomic(&path, &json!({ "a": 2 })).unwrap();

        assert_eq!(
            std::fs::read_to_string(append_ext(&path, ".bak")).unwrap(),
            "{\n  \"a\": 1\n}"
        );
    }

    #[test]
    fn write_json_atomic_replaces_primary_with_new_content() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        write_json_atomic(&path, &json!({ "a": 1 })).unwrap();

        write_json_atomic(&path, &json!({ "a": 2 })).unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\n  \"a\": 2\n}");
    }

    #[test]
    fn read_json_with_backup_reads_primary_and_returns_its_path() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(&path, r#"{"a":1}"#).unwrap();

        let read = read_json_with_backup(&path, parse_json);

        assert_eq!(read, Some((path, json!({ "a": 1 }))));
    }

    #[test]
    fn read_json_with_backup_falls_back_to_backup_when_primary_is_corrupt() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        let bak = append_ext(&path, ".bak");
        std::fs::write(&path, "{ broken").unwrap();
        std::fs::write(&bak, r#"{"a":1}"#).unwrap();

        let read = read_json_with_backup(&path, parse_json);

        assert_eq!(read, Some((bak, json!({ "a": 1 }))));
    }

    #[test]
    fn read_json_with_backup_falls_back_to_backup_when_primary_is_missing() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        let bak = append_ext(&path, ".bak");
        std::fs::write(&bak, r#"{"a":1}"#).unwrap();

        let read = read_json_with_backup(&path, parse_json);

        assert_eq!(read, Some((bak, json!({ "a": 1 }))));
    }

    #[test]
    fn read_json_with_backup_prefers_primary_over_backup() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(&path, r#"{"a":2}"#).unwrap();
        std::fs::write(append_ext(&path, ".bak"), r#"{"a":1}"#).unwrap();

        let read = read_json_with_backup(&path, parse_json);

        assert_eq!(read, Some((path, json!({ "a": 2 }))));
    }

    #[test]
    fn read_json_with_backup_returns_none_when_both_are_corrupt() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(&path, "{ broken").unwrap();
        std::fs::write(append_ext(&path, ".bak"), "also broken").unwrap();

        let read = read_json_with_backup(&path, parse_json);

        assert_eq!(read, None);
    }

    #[test]
    fn read_json_with_backup_returns_none_when_neither_file_exists() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");

        let read = read_json_with_backup(&path, parse_json);

        assert_eq!(read, None);
    }

    #[test]
    fn store_error_messages_are_unchanged() {
        let io = StoreError::Io(std::io::Error::other("disk full")).to_string();
        let year_month = StoreError::InvalidYearMonth("2026/06".into()).to_string();
        let date = StoreError::InvalidDate("x".into()).to_string();

        assert_eq!(
            (io, year_month, date),
            (
                "io error: disk full".to_string(),
                "invalid yearMonth: 2026/06".to_string(),
                "invalid session.date: x".to_string()
            )
        );
    }
}
