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
