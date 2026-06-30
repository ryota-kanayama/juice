// Electron 版 src/main/integrations/holidays.ts の Rust 移植。
// 日本の祝日マップ("YYYY-MM-DD" → 祝日名)を公開 API から取得し、プロセス内でキャッシュする。
// 失敗時は空マップを返し、キャッシュは「成功時のみ」行う（失敗は次回リトライ）。

use std::collections::HashMap;
use std::sync::Mutex;

const HOLIDAYS_URL: &str = "https://holidays-jp.github.io/api/v1/date.json";

pub struct HolidaysClient {
    cache: Mutex<Option<HashMap<String, String>>>,
}

impl Default for HolidaysClient {
    fn default() -> Self {
        Self::new()
    }
}

impl HolidaysClient {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(None),
        }
    }

    fn cached(&self) -> Option<HashMap<String, String>> {
        self.cache.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn store(&self, map: HashMap<String, String>) {
        *self.cache.lock().unwrap_or_else(|e| e.into_inner()) = Some(map);
    }

    /// fetch 結果(Option)を受けてキャッシュ方針を適用する。成功(Some)時のみキャッシュ。
    fn apply(&self, fetched: Option<HashMap<String, String>>) -> HashMap<String, String> {
        match fetched {
            Some(map) => {
                self.store(map.clone());
                map
            }
            None => HashMap::new(),
        }
    }

    /// 祝日マップを取得（キャッシュ優先）。失敗時は空マップ。
    pub async fn get(&self) -> HashMap<String, String> {
        if let Some(c) = self.cached() {
            return c;
        }
        let fetched = fetch_holidays(HOLIDAYS_URL).await;
        self.apply(fetched)
    }
}

/// JSON 本文を祝日マップへ。オブジェクト(文字列値)のみ Some、それ以外/エラーは None。
pub fn parse_holidays(body: &str) -> Option<HashMap<String, String>> {
    serde_json::from_str::<HashMap<String, String>>(body).ok()
}

/// 実 HTTP 取得（非 2xx / 通信エラー / パース失敗は None）。
async fn fetch_holidays(url: &str) -> Option<HashMap<String, String>> {
    let resp = reqwest::get(url).await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let body = resp.text().await.ok()?;
    parse_holidays(&body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_object() {
        let body = r#"{"2026-01-01":"元日","2026-01-12":"成人の日"}"#;
        let map = parse_holidays(body).unwrap();
        assert_eq!(map.get("2026-01-01").map(String::as_str), Some("元日"));
        assert_eq!(map.len(), 2);
    }

    #[test]
    fn parse_empty_object_is_some_empty() {
        let map = parse_holidays("{}").unwrap();
        assert!(map.is_empty());
    }

    #[test]
    fn parse_array_is_none() {
        assert!(parse_holidays(r#"["a","b"]"#).is_none());
    }

    #[test]
    fn parse_null_is_none() {
        assert!(parse_holidays("null").is_none());
    }

    #[test]
    fn parse_invalid_json_is_none() {
        assert!(parse_holidays("{ broken").is_none());
    }

    #[test]
    fn apply_some_caches_result() {
        let client = HolidaysClient::new();
        let mut m = HashMap::new();
        m.insert("2026-01-01".to_string(), "元日".to_string());
        let returned = client.apply(Some(m.clone()));
        assert_eq!(returned, m);
        // 成功はキャッシュされる
        assert_eq!(client.cached(), Some(m));
    }

    #[test]
    fn apply_none_returns_empty_without_caching() {
        let client = HolidaysClient::new();
        let returned = client.apply(None);
        assert!(returned.is_empty());
        // 失敗はキャッシュしない（次回リトライ）
        assert_eq!(client.cached(), None);
    }
}
