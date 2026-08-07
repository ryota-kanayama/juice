//! リリースノートの提供。CHANGELOG.md をビルド時に埋め込み、バージョンごとの節を切り出す。
//!
//! ネットワークに依存しないため、更新直後にオフラインでも確実に表示できる。
//! GitHub のリリース本文は CHANGELOG の該当節をコピーしたものなので、内容は同じで
//! 出所だけが1つに定まる。

use serde::Serialize;
use crate::update::compare_versions;
use std::cmp::Ordering;

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

/// この機能より前のバージョンから上がってきた既存ユーザーに見せる下限。
///
/// v2.1.0 の変更内容が誰にも伝わらなかったため、次の更新でまとめて見せる。
/// 一度でも新バージョンを起動すれば `last_seen_version` が入るので、この定数は二度と効かない。
const MIGRATION_FLOOR: &str = "2.1.0";

/// 表示範囲のルール。`last_seen` より新しく、`current` 以下の節を新しい順に返す。
/// 本文が空の節は落とす。
///
/// `last_seen` が空のとき:
///   - `setup_completed` = true  → 既存ユーザー。`MIGRATION_FLOOR` 以上を返す
///   - `setup_completed` = false → 新規インストール。何も返さない
fn select_entries(
    entries: &[ReleaseNoteEntry],
    last_seen: &str,
    current: &str,
    setup_completed: bool,
) -> Vec<ReleaseNoteEntry> {
    let last_seen = last_seen.trim();
    if last_seen.is_empty() && !setup_completed {
        return Vec::new();
    }

    let mut selected: Vec<ReleaseNoteEntry> = entries
        .iter()
        .filter(|e| !e.body.trim().is_empty())
        // 今動いているバージョンより新しい節は、まだこのアプリに入っていない
        .filter(|e| compare_versions(&e.version, current) != Ordering::Greater)
        .filter(|e| {
            if last_seen.is_empty() {
                // 移行: 下限そのものを含めるので Less のみ落とす
                compare_versions(&e.version, MIGRATION_FLOOR) != Ordering::Less
            } else {
                compare_versions(&e.version, last_seen) == Ordering::Greater
            }
        })
        .cloned()
        .collect();

    selected.sort_by(|a, b| compare_versions(&b.version, &a.version));
    selected
}

/// 範囲ルールが空だったときに、今のバージョンの節だけを返すフォールバック付き。
/// テストから任意のリストを渡せるよう分けてある。
fn entries_for_display_from(
    entries: &[ReleaseNoteEntry],
    last_seen: &str,
    current: &str,
    setup_completed: bool,
) -> Vec<ReleaseNoteEntry> {
    let selected = select_entries(entries, last_seen, current, setup_completed);
    if !selected.is_empty() {
        return selected;
    }
    entries
        .iter()
        .filter(|e| !e.body.trim().is_empty())
        .filter(|e| compare_versions(&e.version, current) == Ordering::Equal)
        .cloned()
        .collect()
}

/// 起動時の自動表示が使う。フォールバックを通さない
/// （通すと新規インストールでもウィンドウが開いてしまう）。
pub fn entries_since_last_seen(
    last_seen: &str,
    current: &str,
    setup_completed: bool,
) -> Vec<ReleaseNoteEntry> {
    select_entries(&parse_changelog(CHANGELOG), last_seen, current, setup_completed)
}

/// ウィンドウが読むコマンドが使う。設定から開き直したときのためにフォールバックを通す。
pub fn entries_for_display(
    last_seen: &str,
    current: &str,
    setup_completed: bool,
) -> Vec<ReleaseNoteEntry> {
    entries_for_display_from(&parse_changelog(CHANGELOG), last_seen, current, setup_completed)
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

    #[test]
    fn embedded_changelog_has_section_for_build_version() {
        // CHANGELOG のリネーム忘れを検知する。
        // ビルド時のバージョンの節が無いと、表示範囲のルールが常に空になり、
        // その版のリリースノートは起動時にも設定からも二度と出せなくなる。
        let version = env!("CARGO_PKG_VERSION");
        let entries = parse_changelog(CHANGELOG);
        assert!(
            entries
                .iter()
                .any(|e| e.version == version && !e.body.trim().is_empty()),
            "CHANGELOG.md に v{version} の節（本文つき）がありません。\
             リリース前に `## [Unreleased]` を `## [{version}] - YYYY-MM-DD` へリネームしてください。\
             忘れると、この版の変更点がユーザーに一度も表示されません。"
        );
    }

    fn entries() -> Vec<ReleaseNoteEntry> {
        vec![
            ReleaseNoteEntry { version: "2.3.0".into(), date: "2026-09-01".into(), body: "- 三".into() },
            ReleaseNoteEntry { version: "2.2.0".into(), date: "2026-08-20".into(), body: "- 二".into() },
            ReleaseNoteEntry { version: "2.1.0".into(), date: "2026-08-07".into(), body: "- 一".into() },
            ReleaseNoteEntry { version: "2.0.1".into(), date: "2026-07-10".into(), body: "- 零".into() },
        ]
    }

    fn versions(v: &[ReleaseNoteEntry]) -> Vec<String> {
        v.iter().map(|e| e.version.clone()).collect()
    }

    #[test]
    fn selects_only_newer_than_last_seen() {
        let got = select_entries(&entries(), "2.2.0", "2.3.0", true);
        assert_eq!(versions(&got), vec!["2.3.0"]);
    }

    #[test]
    fn includes_skipped_versions_newest_first() {
        let got = select_entries(&entries(), "2.0.1", "2.3.0", true);
        assert_eq!(versions(&got), vec!["2.3.0", "2.2.0", "2.1.0"]);
    }

    #[test]
    fn never_includes_versions_above_current() {
        // 2.3.0 の節はあるが、動いているのは 2.2.0
        let got = select_entries(&entries(), "2.0.1", "2.2.0", true);
        assert_eq!(versions(&got), vec!["2.2.0", "2.1.0"]);
    }

    #[test]
    fn empty_last_seen_with_setup_falls_back_to_migration_floor() {
        // この機能より前のバージョンから上がってきた既存ユーザー: 2.1.0 以降をまとめて出す
        let got = select_entries(&entries(), "", "2.3.0", true);
        assert_eq!(versions(&got), vec!["2.3.0", "2.2.0", "2.1.0"]);
    }

    #[test]
    fn empty_last_seen_without_setup_shows_nothing() {
        // 新規インストール。リリースノートは出さない
        let got = select_entries(&entries(), "", "2.3.0", false);
        assert!(got.is_empty());
    }

    #[test]
    fn downgrade_shows_nothing() {
        let got = select_entries(&entries(), "2.3.0", "2.2.0", true);
        assert!(got.is_empty());
    }

    #[test]
    fn skips_entries_with_empty_body() {
        let mut list = entries();
        list[0].body = "   \n".into();
        let got = select_entries(&list, "2.1.0", "2.3.0", true);
        assert_eq!(versions(&got), vec!["2.2.0"]);
    }

    #[test]
    fn display_falls_back_to_current_version_when_already_seen() {
        // 一度見たあと（last_seen == current）でも、設定から開き直せるように今の版を返す
        let got = entries_for_display_from(&entries(), "2.3.0", "2.3.0", true);
        assert_eq!(versions(&got), vec!["2.3.0"]);
    }

    #[test]
    fn display_returns_nothing_when_current_version_has_no_section() {
        let got = entries_for_display_from(&entries(), "9.9.9", "9.9.9", true);
        assert!(got.is_empty());
    }
}
