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
    /// 本体も .bak も読めない（引数は本体のパス）。壊れたファイルは .corrupt-<日時> へ退避済み。
    #[error("corrupt data file: {}", .0.display())]
    Corrupt(PathBuf),
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
/// 本体も .bak も存在しないときは Ok(None)。
/// 壊れているもの（読めない・パースできない）は .corrupt-<日時> へ退避し、
/// 本体も .bak も読めないときは Err(StoreError::Corrupt(本体のパス)) を返す。
pub(crate) fn read_json_with_backup<T>(
    path: &Path,
    parse: impl Fn(&str) -> Option<T>,
) -> Result<Option<(PathBuf, T)>, StoreError> {
    let read_one = |p: PathBuf| {
        let content = std::fs::read_to_string(&p).ok()?;
        parse(&content).map(|value| (p, value))
    };
    Ok(read_one(path.to_path_buf()).or_else(|| read_one(append_ext(path, ".bak"))))
}

/// テスト共通: `<file_name>.corrupt-` で始まる退避ファイルの中身を、ファイル名順に返す。
#[cfg(test)]
pub(crate) fn corrupt_copies(dir: &Path, file_name: &str) -> Vec<String> {
    let prefix = format!("{file_name}.corrupt-");
    let mut found: Vec<(String, String)> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap())
        .filter(|e| e.file_name().to_string_lossy().starts_with(&prefix))
        .map(|e| {
            (
                e.file_name().to_string_lossy().into_owned(),
                std::fs::read_to_string(e.path()).unwrap(),
            )
        })
        .collect();
    found.sort();
    found.into_iter().map(|(_, content)| content).collect()
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

    /// ディレクトリ直下のファイル名を昇順で返す。
    fn file_names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    /// tmp の位置にディレクトリを置き、tmp への書き込みを失敗させる。
    fn block_tmp_with_directory(path: &Path) {
        std::fs::create_dir(append_ext(path, ".tmp")).unwrap();
    }

    #[test]
    fn write_json_atomic_creates_missing_parent_directories() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nested").join("data.json");

        write_json_atomic(&path, &json!({ "a": 1 })).unwrap();

        assert!(path.is_file(), "親ディレクトリごとファイルができること");
    }

    #[test]
    fn write_json_atomic_writes_pretty_printed_json() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");

        write_json_atomic(&path, &json!({ "a": 1 })).unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\n  \"a\": 1\n}");
    }

    #[test]
    fn write_json_atomic_leaves_no_tmp_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");

        write_json_atomic(&path, &json!({ "a": 1 })).unwrap();

        assert_eq!(file_names(dir.path()), vec!["data.json".to_string()]);
    }

    #[test]
    fn write_json_atomic_returns_io_error_when_tmp_cannot_be_written() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        block_tmp_with_directory(&path);

        let result = write_json_atomic(&path, &json!({ "a": 1 }));

        assert!(
            matches!(result, Err(StoreError::Io(_))),
            "tmp に書けないときは Io エラーになること: {result:?}"
        );
    }

    #[test]
    fn write_json_atomic_returns_io_error_when_rename_to_primary_fails() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        // 本体の位置にディレクトリがあり、退避先 .bak も空でないディレクトリなので、
        // 本体の退避も tmp の差し替えも失敗する
        std::fs::create_dir(&path).unwrap();
        std::fs::create_dir_all(append_ext(&path, ".bak").join("keep")).unwrap();

        let result = write_json_atomic(&path, &json!({ "a": 1 }));

        assert!(
            matches!(result, Err(StoreError::Io(_))),
            "本体への rename が失敗したときは Io エラーになること: {result:?}"
        );
    }

    #[test]
    fn write_json_atomic_keeps_primary_when_tmp_cannot_be_written() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(&path, r#"{"a":1}"#).unwrap();
        block_tmp_with_directory(&path);

        let _ = write_json_atomic(&path, &json!({ "a": 2 }));

        assert_eq!(
            std::fs::read_to_string(&path).ok(),
            Some(r#"{"a":1}"#.to_string())
        );
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

        let read = read_json_with_backup(&path, parse_json).unwrap();

        assert_eq!(read, Some((path, json!({ "a": 1 }))));
    }

    #[test]
    fn read_json_with_backup_falls_back_to_backup_when_primary_is_corrupt() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        let bak = append_ext(&path, ".bak");
        std::fs::write(&path, "{ broken").unwrap();
        std::fs::write(&bak, r#"{"a":1}"#).unwrap();

        let read = read_json_with_backup(&path, parse_json).unwrap();

        assert_eq!(read, Some((bak, json!({ "a": 1 }))));
    }

    #[test]
    fn read_json_with_backup_falls_back_to_backup_when_primary_is_missing() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        let bak = append_ext(&path, ".bak");
        std::fs::write(&bak, r#"{"a":1}"#).unwrap();

        let read = read_json_with_backup(&path, parse_json).unwrap();

        assert_eq!(read, Some((bak, json!({ "a": 1 }))));
    }

    #[test]
    fn read_json_with_backup_prefers_primary_over_backup() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(&path, r#"{"a":2}"#).unwrap();
        std::fs::write(append_ext(&path, ".bak"), r#"{"a":1}"#).unwrap();

        let read = read_json_with_backup(&path, parse_json).unwrap();

        assert_eq!(read, Some((path, json!({ "a": 2 }))));
    }

    #[test]
    fn read_json_with_backup_returns_none_when_neither_file_exists() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");

        let read = read_json_with_backup(&path, parse_json).unwrap();

        assert_eq!(read, None);
    }

    #[test]
    fn read_json_with_backup_moves_corrupt_primary_aside_when_backup_is_readable() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(&path, "{ broken").unwrap();
        std::fs::write(append_ext(&path, ".bak"), r#"{"a":1}"#).unwrap();

        let _ = read_json_with_backup(&path, parse_json);

        assert_eq!(
            corrupt_copies(dir.path(), "data.json"),
            vec!["{ broken".to_string()]
        );
    }

    #[test]
    fn read_json_with_backup_removes_corrupt_primary_from_its_place_when_backup_is_readable() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(&path, "{ broken").unwrap();
        std::fs::write(append_ext(&path, ".bak"), r#"{"a":1}"#).unwrap();

        let _ = read_json_with_backup(&path, parse_json);

        assert!(!path.exists(), "壊れた本体は元の場所から移動されること");
    }

    #[test]
    fn read_json_with_backup_leaves_backup_in_place_when_primary_is_corrupt() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        let bak = append_ext(&path, ".bak");
        std::fs::write(&path, "{ broken").unwrap();
        std::fs::write(&bak, r#"{"a":1}"#).unwrap();

        let _ = read_json_with_backup(&path, parse_json);

        assert_eq!(std::fs::read_to_string(&bak).unwrap(), r#"{"a":1}"#);
    }

    #[test]
    fn read_json_with_backup_creates_no_corrupt_copy_when_primary_is_missing() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(append_ext(&path, ".bak"), r#"{"a":1}"#).unwrap();

        let _ = read_json_with_backup(&path, parse_json);

        assert_eq!(file_names(dir.path()), vec!["data.json.bak".to_string()]);
    }

    /// 本体も .bak も壊れているファイル組を作り、本体のパスを返す。
    fn both_corrupt(dir: &Path) -> PathBuf {
        let path = dir.join("data.json");
        std::fs::write(&path, "{ broken").unwrap();
        std::fs::write(append_ext(&path, ".bak"), "also broken").unwrap();
        path
    }

    #[test]
    fn read_json_with_backup_returns_corrupt_error_when_both_are_corrupt() {
        let dir = tempdir().unwrap();
        let path = both_corrupt(dir.path());

        let read = read_json_with_backup(&path, parse_json);

        assert!(
            matches!(read, Err(StoreError::Corrupt(ref p)) if *p == path),
            "本体のパスを持つ Corrupt エラーになること: {read:?}"
        );
    }

    #[test]
    fn read_json_with_backup_keeps_corrupt_primary_content_when_both_are_corrupt() {
        let dir = tempdir().unwrap();
        let path = both_corrupt(dir.path());

        let _ = read_json_with_backup(&path, parse_json);

        assert_eq!(
            corrupt_copies(dir.path(), "data.json"),
            vec!["{ broken".to_string()]
        );
    }

    #[test]
    fn read_json_with_backup_keeps_corrupt_backup_content_when_both_are_corrupt() {
        let dir = tempdir().unwrap();
        let path = both_corrupt(dir.path());

        let _ = read_json_with_backup(&path, parse_json);

        assert_eq!(
            corrupt_copies(dir.path(), "data.json.bak"),
            vec!["also broken".to_string()]
        );
    }

    #[test]
    fn read_json_with_backup_leaves_no_original_file_when_both_are_corrupt() {
        let dir = tempdir().unwrap();
        let path = both_corrupt(dir.path());

        let _ = read_json_with_backup(&path, parse_json);

        let originals: Vec<String> = file_names(dir.path())
            .into_iter()
            .filter(|n| !n.contains(".corrupt-"))
            .collect();
        assert_eq!(originals, Vec::<String>::new());
    }

    #[test]
    fn read_json_with_backup_returns_corrupt_error_when_only_primary_exists_and_is_corrupt() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(&path, "{ broken").unwrap();

        let read = read_json_with_backup(&path, parse_json);

        assert!(
            matches!(read, Err(StoreError::Corrupt(ref p)) if *p == path),
            "本体のパスを持つ Corrupt エラーになること: {read:?}"
        );
    }

    #[test]
    fn read_json_with_backup_moves_lone_corrupt_primary_aside() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(&path, "{ broken").unwrap();

        let _ = read_json_with_backup(&path, parse_json);

        assert_eq!(
            corrupt_copies(dir.path(), "data.json"),
            vec!["{ broken".to_string()]
        );
    }

    #[test]
    fn read_json_with_backup_returns_corrupt_error_when_only_backup_exists_and_is_corrupt() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(append_ext(&path, ".bak"), "also broken").unwrap();

        let read = read_json_with_backup(&path, parse_json);

        assert!(
            matches!(read, Err(StoreError::Corrupt(ref p)) if *p == path),
            "本体のパスを持つ Corrupt エラーになること: {read:?}"
        );
    }

    #[test]
    fn read_json_with_backup_moves_lone_corrupt_backup_aside() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("data.json");
        std::fs::write(append_ext(&path, ".bak"), "also broken").unwrap();

        let _ = read_json_with_backup(&path, parse_json);

        assert_eq!(
            corrupt_copies(dir.path(), "data.json.bak"),
            vec!["also broken".to_string()]
        );
    }

    #[test]
    fn read_json_with_backup_treats_moved_away_files_as_missing_on_next_read() {
        let dir = tempdir().unwrap();
        let path = both_corrupt(dir.path());
        let _ = read_json_with_backup(&path, parse_json);

        let read = read_json_with_backup(&path, parse_json).unwrap();

        assert_eq!(read, None);
    }

    #[test]
    fn io_error_message_is_prefixed_with_io_error() {
        let msg = StoreError::Io(std::io::Error::other("disk full")).to_string();

        assert_eq!(msg, "io error: disk full");
    }

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

    #[test]
    fn serde_error_message_is_prefixed_with_serialize_error() {
        let cause = serde_json::from_str::<Value>("{").unwrap_err();

        let msg = StoreError::Serde(cause).to_string();

        assert_eq!(
            msg,
            "serialize error: EOF while parsing an object at line 1 column 1"
        );
    }
}
