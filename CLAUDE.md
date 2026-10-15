# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

日本語で回答してください。

## rules

markdownlintは実行するようにしてください。

ユーザー向けの変更（機能追加・修正など）を含むPRをマージする前は、`CHANGELOG.md`の`[Unreleased]`節に、その変更内容をユーザー向けの言葉で追記すること（内部的な変更のみの場合は不要）。

## Commands

```bash
# 開発（ホットリロード, Rust バックエンド + vite フロント）
# VSCode 拡張環境からは ELECTRON_RUN_AS_NODE を外して起動する
. "$HOME/.cargo/env" && env -u ELECTRON_RUN_AS_NODE npm run tauri dev

# フロントのみビルド（vite）
npm run build

# 型チェック（レンダラー + lambda）
npm run typecheck

# テスト（レンダラー・共有・lambda）
npm test
npm run test:watch
npx vitest run frontend/renderer/src/hooks/useTimer.test.ts

# Rust バックエンドの単体テスト
cd src-tauri && cargo test --lib

# パッケージ（macOS .app / DMG）
npm run tauri build

# 静的解析（フロント）
npm run lint

# ミューテーションテスト（Stryker。結果は reports/ に出る）
npm run mutation
```

## 作業の進め方

作業規律のスキルとフックは `.claude/` にある（一覧と使い分けは [.claude/README.md](.claude/README.md)）。

- `main` へ直接コミットしない。作業ブランチ + PR で進め、マージは `gh pr merge --squash`（フックが強制する）。
- 実装は `worktree` スキルで作業ツリー（`.claude/worktrees/<branch>`）を切って行う。ブランチ名はコミット種別の接頭辞を付ける（`feat/`・`fix/`・`chore/`・`ci/`・`test/` など）。
- 作業ツリーでは最初に `npm ci` を実行する（`node_modules` は作業ツリーごとに別）。Rust も `src-tauri/target` が別なので、初回の `cargo` は全体をビルドし直す。
- `tauri dev` は同時に1つしか動かない（`single-instance`）。製品版や別の作業ツリーの dev が動いていると、後から起動した側はエラーも出さずに終了する。
- コードを変更してコミットしたら `impl-review`、文書を更新したら `doc-review` を回す。`impl-review` は未実施を Stop フックが検知する。
- テストの書き方は `test-writing`。AAA は空行で区切り（マーカーコメントは付けない）、共通のテストデータは `frontend/renderer/src/test/factories.ts` を使う。

### 司令役を基本にする

**作業は `orchestrate` スキルの司令役として進める。** ユーザーが「司令として」と言わなくても、これが既定である。司令は設計判断・レビュー・PR を持ち、プロダクトコードは書かずに子へ出す。子の出し先は実行環境で決まる（次節）。

プロダクトコードを含まない軽微な変更（文書の誤字、設定1行など）は、司令が直接行ってよい。

### 着手前に実行環境を判定する

**最初に環境変数で実行環境を判定し、子の出し先を決める。** ユーザーは VSCode 拡張と herdr（AI エージェント向けの端末多重化ツール）を使い分けている。

```bash
echo "herdr=${HERDR_PANE_ID:-} entry=${CLAUDE_CODE_ENTRYPOINT:-}"
```

判定と出し先は次の表のとおり。上の行ほど優先する。VSCode の統合ターミナルで herdr を動かすと両方が立つが、そのときは herdr として扱う。

| 判定 | 実行環境 | 子の出し先 |
| --- | --- | --- |
| `HERDR_PANE_ID` が空でない | herdr のペイン | `herdr agent start` で別ペインに子セッションを立てる（`orchestrate` の手順どおり） |
| `CLAUDE_CODE_ENTRYPOINT` が `claude-vscode` | VSCode 拡張 | 子セッションを立てられないので、サブエージェントへ出す。Red/Green の分離は `tdd` の手順で行い、レビューは司令が持つ |
| どちらでもない | 素の端末など | 出し先をユーザーに確認する |

VSCode 拡張で並行作業が要るときは、herdr への切り替えをユーザーに提案する。VSCode 拡張から `tauri dev` を起動するときは `env -u ELECTRON_RUN_AS_NODE` を付ける（[Commands](#commands)）。

## アーキテクチャ

**Juice Timer** は **Tauri（Rust）+ React** で構築された macOS メニューバーアプリ。作業セッションを時間区間として記録し、JSON ファイルに保存する。元は Electron 製で、Chromium 由来のメモリ過大（アイドル時 ≈230MB）を主因に Tauri へ移行した。

### プロジェクト構成

- **`src-tauri/`** — Rust バックエンド。`src/lib.rs` が NSPanel ウィンドウ（`tauri-nspanel`）とトレイを構築し、`src/commands.rs` が全 Tauri コマンド（Electron 版 `ipcMain` ハンドラ相当）を公開する。データストアは `session_store.rs` / `daily_store.rs` / `settings_store.rs`、認証は `auth.rs`（Keychain）/ `oauth.rs`（Slack deep-link）、通知は `notif_scheduler.rs` / `notifications.rs`、アプリ内更新は `update.rs`。Electron 版 `src/main/*` を Rust 移植したもの。
- **`frontend/renderer/src/`** — React + TypeScript レンダラー（webview 内）。Electron 時代から無改修。
- **`frontend/`** — フロントのエントリ。`index.html` → `entry.ts` → `bridge.ts` → 既存レンダラー（`@/main`）の順で起動。
- **`bridge.ts`** — `window.bridge` を Tauri の `invoke` / `listen` へ転送する IPC ブリッジ。レンダラーはこのブリッジ越しにバックエンドと通信する（IPC の単一窓口）。
- **`vite.config.ts`** — フロントは `root: frontend`、`@`/`@renderer` エイリアスで `frontend/renderer/src` を参照。
- **`lambda/`** — Slack OAuth プロキシ（独立）。

### ウィンドウの挙動

メインのポップオーバーは **NSPanel**（フレームレス・非アクティベート・最前面）。トレイ左クリックでトグル表示し、`lib.rs` の panel delegate が **blur（key 喪失）で自動クローズ**する。配置は AppKit を直接叩いてカーソル下のメニューバー直下に出す（Tauri のマルチモニタ座標バグ回避）。背景は `windowEffects: hudWindow` で macOS vibrancy（すりガラス）。

> 注: 設定・セットアップ画面は移行途中で未実装。`App.tsx` の `window.location.hash` ルーティング（`#setup` / `#settings`）はレンダラーに残存している。

### データモデル

セッションは月ごとに1ファイルで保存される。**開発用と本番用でデータディレクトリが異なる**（Rust `resolve_data_dir`、Electron 版と互換）：

- **開発（debug ビルド）**: `~/Library/Application Support/juice-dev/`
- **本番（パッケージ版）**: `~/Library/Application Support/Juice/`

テストデータを投入する際は必ず `juice-dev/` に入れること。`Juice/` は本番データのため上書き・削除厳禁。

```ts
interface Session {
  id: string        // セッションレコードごとに一意
  taskId: string    // 同一タスクの区間間で共有（新規セッションでは id と同じ）
  name: string
  projectCode: string
  workCategory: string
  times: TimeInterval[]  // セッションごとに複数の区間（startMore で追記される）
  date: string      // "YYYY-MM-DD"
  color: string     // 16進数、JUICE_COLORS パレットから
  totalTime: number // 作業時間（分）。times があるときはその合計と一致する派生値
}

interface TimeInterval {
  startTime: string    // "YYYY-MM-DDTHH:mm:ss"（UTC ではなくローカル）
  endTime: string | null  // 稼働中は null
}
```

**時刻の不変条件**：`times` が1つ以上あるとき、`totalTime` は完了区間の合計
（`max(1, round(Σ(end - start) / 60000))`、稼働中の区間は除く）と一致する。
新規作成・編集・タイマー停止のすべての保存経路でこれを守る。`times` が空の
記録は時刻を持たない旧データで、`totalTime` が唯一の時間情報になる。
読み込み時に `totalTime` を区間から再計算してはならない（手入力で整えられた
値を壊すため）。

**重要**：`Session` 型は `frontend/shared/types.ts` で定義され、レンダラー（`frontend/renderer/src/types/session.ts`）と共有ユーティリティ（`frontend/shared/sessionUtils.ts`）から使われる。Rust 側は `src-tauri/src/types.rs` に同等の型をミラーしており、両者を変更する際は形を揃えること。

### 主要コンポーネント

- **`useTimer`** フック（`frontend/renderer/src/hooks/useTimer.ts`）— タイマー状態の中心。`start`、`startMore`（既存セッションを延長）、`stop` を公開する。`setInterval` で区間を管理。`stop` 時にシム→Tauri コマンド経由でディスクへ書き込む。
- **`PopoverView`**（`App.tsx` 内）— メイン UI を統括する。`todaySessions` の state を保持し、すべてのセッション変更（start・stop・update・startMore）を処理する。
- **`SessionStore`**（`src-tauri/src/session_store.rs`）— ファイルベースの永続化。年月ごとに JSON を読み書きする。

### テスト

フロントは **vitest** + **jsdom** + `@testing-library/react`。`window.electronAPI` は `frontend/renderer/src/test/setup.ts` でモックされる。バックエンド（Rust）は `cargo test --lib`（ストア・バージョン比較・アセット選択・JWT パース等の純粋ロジックを単体テスト）。
