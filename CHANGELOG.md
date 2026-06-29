# 変更履歴

このファイルは Juice の主な変更をまとめます。
形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準じ、
バージョンは [セマンティック バージョニング](https://semver.org/lang/ja/) に従います。

各リリース時は、このファイルに新しい節を追記し、その内容を GitHub Release の本文にも使います。
カテゴリは必要なものだけ使い、内部的な変更（docs / chore / refactor など）はユーザー向けには載せません。

- ✨ 新機能（Added）
- 🔧 改善（Changed）
- 🐛 修正（Fixed）
- ⚠️ 重要な変更（互換性に影響する変更・注意）
- 🔒 セキュリティ（Security）

## [Unreleased]

## [1.2.0] - 2026-06-29

### ✨ 新機能

- フレックス勤務対応: 1日の中で勤務場所（出社/テレワーク）を切り替えられるように
  なりました。アカウントメニューから切替でき、テレワークの工数は勤怠に `tw` 付きで
  出力され、テレワークへの切替時は在席ボードも追従します

### 🐛 修正

- ヘッダーの「juice」ロゴが中央からわずかに左へずれていたのを修正

## [1.1.0] - 2026-06-29

### ✨ 新機能

- アプリ内アップデート通知: 新しいバージョンが出るとアプリ内で知らせ、ワンクリックで
  DMG を取得・更新できるようになりました（起動時・6時間ごと・手動チェックに対応）

## [1.0.0] - 2026-06-24

### ✨ 新機能

- 初回リリース。作業セッションをタイマーで記録し、カレンダー・勤怠の確認、テーマや
  各種通知（アイドル / 経過時間 / ポモドーロ）に対応した macOS メニューバーアプリ

[Unreleased]: https://github.com/ryota-kanayama/juice/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/ryota-kanayama/juice/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ryota-kanayama/juice/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ryota-kanayama/juice/releases/tag/v1.0.0
