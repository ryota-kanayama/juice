// アプリ共通の設定値。特に Lambda プロキシ URL の解決を1か所に集約する。
//
// 経緯: 以前は oauth.rs と integrations.rs がそれぞれ proxy_url() を持ち、oauth 側だけ
// DEFAULT へフォールバックし、integrations 側は unwrap_or_default()（空文字列）だった。
// その結果「サインイン(OAuth)は成功するのに勤怠/ホワイトボード送信だけ URL が空で失敗」
// という不具合が発生した。解決を1関数に統一して再発を防ぐ。

/// Lambda プロキシ URL（Electron 版 MAIN_VITE_PROXY_URL 相当）。実行時 env で上書き可。
const DEFAULT_PROXY_URL: &str =
    "https://ssahpea3hpg7cnfhvnurknzwuy0inogz.lambda-url.ap-northeast-1.on.aws";

/// プロキシ URL を返す。JUICE_PROXY_URL が未設定/空なら DEFAULT を使う（絶対に空にしない）。
pub fn proxy_url() -> String {
    match std::env::var("JUICE_PROXY_URL") {
        Ok(v) if !v.trim().is_empty() => v,
        _ => DEFAULT_PROXY_URL.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// proxy_url は常に絶対 https URL を返す（空文字列だと送信 URL がホスト無しになり失敗する）。
    #[test]
    fn proxy_url_is_absolute_https() {
        // JUICE_PROXY_URL が設定されていても、少なくとも絶対 URL であること。
        let url = proxy_url();
        assert!(!url.is_empty(), "proxy_url must not be empty");
        assert!(
            url.starts_with("https://") || url.starts_with("http://"),
            "proxy_url must be absolute, got: {url}"
        );
    }

    #[test]
    fn default_is_valid_absolute_url() {
        assert!(DEFAULT_PROXY_URL.starts_with("https://"));
    }
}
