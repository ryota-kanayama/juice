//! リリースノートの提供。CHANGELOG.md をビルド時に埋め込み、バージョンごとの節を切り出す。
//!
//! ネットワークに依存しないため、更新直後にオフラインでも確実に表示できる。
//! GitHub のリリース本文は CHANGELOG の該当節をコピーしたものなので、内容は同じで
//! 出所だけが1つに定まる。

use serde::Serialize;

/// ビルド時に埋め込む CHANGELOG（src-tauri/src から見たリポジトリルート）。
const CHANGELOG: &str = include_str!("../../CHANGELOG.md");

/// 1バージョンぶんのリリースノート。`body` は生の Markdown で、描画側でパースする。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNoteEntry {
    pub version: String,
    pub date: String,
    pub body: String,
}

/// `## [2.1.0] - 2026-08-07` 形式の見出しを (version, date) に分解する。
/// `[Unreleased]` はまだリリースされておらず、今動いているアプリには入っていないので None を返す。
/// 日付が無い見出し（`## [1.0.0]`）も受理し、date は空文字にする。
fn parse_heading(line: &str) -> Option<(String, String)> {
    let rest = line.strip_prefix("## [")?;
    let (version, rest) = rest.split_once(']')?;
    if version.eq_ignore_ascii_case("unreleased") {
        return None;
    }
    let date = rest.trim().trim_start_matches('-').trim().to_string();
    Some((version.to_string(), date))
}

/// CHANGELOG を `## [x.y.z]` 見出しで分割する。見出しより前の行（ファイル冒頭の説明）は捨てる。
pub fn parse_changelog(md: &str) -> Vec<ReleaseNoteEntry> {
    let mut out: Vec<ReleaseNoteEntry> = Vec::new();
    // (version, date, 本文の行)
    let mut current: Option<(String, String, Vec<&str>)> = None;

    let flush = |out: &mut Vec<ReleaseNoteEntry>, cur: Option<(String, String, Vec<&str>)>| {
        if let Some((version, date, lines)) = cur {
            out.push(ReleaseNoteEntry {
                version,
                date,
                body: lines.join("\n").trim().to_string(),
            });
        }
    };

    for line in md.lines() {
        if line.starts_with("## [") {
            flush(&mut out, current.take());
            // Unreleased は None になり、次の見出しまでの行がどこにも積まれない＝除外される
            current = parse_heading(line).map(|(v, d)| (v, d, Vec::new()));
            continue;
        }
        if let Some((_, _, lines)) = current.as_mut() {
            lines.push(line);
        }
    }
    flush(&mut out, current.take());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"# 変更履歴

説明文。

## [Unreleased]

### 🐛 修正

- まだ出ていない変更

## [2.1.0] - 2026-08-07

### ✨ 新機能

- カレンダーを独立したウィンドウで開けるようになりました

## [2.0.1] - 2026-07-10

### 🐛 修正

- キーボード入力が奪われるのを修正しました

## [1.0.0]

- 最初のリリース
"#;

    #[test]
    fn parses_version_date_and_body() {
        let entries = parse_changelog(SAMPLE);
        let v210 = entries.iter().find(|e| e.version == "2.1.0").unwrap();
        assert_eq!(v210.date, "2026-08-07");
        assert!(v210.body.starts_with("### ✨ 新機能"));
        assert!(v210.body.contains("カレンダーを独立したウィンドウ"));
        // 次の節の内容は混ざらない
        assert!(!v210.body.contains("キーボード入力"));
    }

    #[test]
    fn excludes_unreleased() {
        let entries = parse_changelog(SAMPLE);
        assert!(entries.iter().all(|e| e.version != "Unreleased"));
        // Unreleased の中身がどの節にも混ざらない
        assert!(entries.iter().all(|e| !e.body.contains("まだ出ていない変更")));
    }

    #[test]
    fn accepts_heading_without_date() {
        let entries = parse_changelog(SAMPLE);
        let v100 = entries.iter().find(|e| e.version == "1.0.0").unwrap();
        assert_eq!(v100.date, "");
        assert_eq!(v100.body, "- 最初のリリース");
    }

    #[test]
    fn returns_empty_when_no_headings() {
        assert!(parse_changelog("# タイトルだけ\n\n本文\n").is_empty());
    }

    #[test]
    fn embedded_changelog_has_entries() {
        // 埋め込みパスが正しいことの担保（include_str! のパスミスを検知する）
        let entries = parse_changelog(CHANGELOG);
        assert!(!entries.is_empty());
        assert!(entries.iter().any(|e| e.version == "2.1.0"));
    }
}
