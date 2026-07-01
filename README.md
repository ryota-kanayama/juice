# Juice

作業セッションを時間区間として記録する macOS メニューバーアプリ。

## ダウンロード

[**最新版をダウンロード**](https://github.com/ryota-kanayama/juice/releases/latest) して、お使いの Mac に合った DMG を選んでください。

| Mac の種類 | ファイル |
| --- | --- |
| Apple Silicon（M1 以降） | `Juice-<バージョン>-arm64.dmg` |
| Intel Mac | `Juice-<バージョン>.dmg` |

> お使いの Mac の種類は、画面左上の  メニュー →「この Mac について」で確認できます。「チップ」が Apple M〜 なら Apple Silicon、「プロセッサ」が Intel なら Intel Mac です。

すべてのバージョンは [リリース一覧](https://github.com/ryota-kanayama/juice/releases) から確認できます。

## インストール

1. ダウンロードした `.dmg` を開く
2. **Juice** を `Applications` フォルダにドラッグ
3. `Applications` から Juice を起動

### ⚠️ 「開発元を確認できないため開けません」「"Juice"は破損しているため開けません」と出た場合

このアプリは現在 **未署名** のため、初回起動時に警告が表示されます。とくに Apple Silicon では「**アプリが破損しているため開けません**」という文言になることがありますが、ファイルが壊れているわけではなく、同じ原因（ダウンロード時の隔離属性）によるものです。次のどちらかで起動できます。

- **方法A**: `Applications` 内の Juice を **右クリック →「開く」** を選択 →「開く」をクリック
- **方法B**: ターミナルで以下を実行（「破損しています」と出る場合はこちらが確実）

  ```bash
  xattr -dr com.apple.quarantine /Applications/Juice.app
  ```

一度起動すれば、2回目以降は通常どおりダブルクリックで開けます。

## 開発

本アプリは **Tauri（Rust）+ React** 製。開発には Rust ツールチェインが必要。

```bash
# 開発（ホットリロード, Rust バックエンド + vite）
npm run tauri dev

# 型チェック
npm run typecheck

# テスト（フロント）
npm test

# Rust の単体テスト
cd src-tauri && cargo test --lib

# .app / DMG をビルド
npm run tauri build
```

## リリース（アップデート配信）

アプリは GitHub Releases の最新版を起動時・6時間ごとに確認し、新バージョンがあれば
アプリ内で通知する（実装は `src-tauri/src/update.rs`）。配信時は次の手順を踏む
（**version を上げ忘れると検知されない**）。

ビルドは **GitHub Actions（`.github/workflows/release.yml`）が両アーキテクチャ分を
自動生成**する。タグを push するとドラフトリリースに DMG が添付されるので、内容を確認
して公開する。手順:

1. `package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` の `version` を
   揃えて上げる
2. [`CHANGELOG.md`](CHANGELOG.md) にこのバージョンの節を追記する
   （形式はファイル冒頭のテンプレートに従う。リリース本文にも同じ内容を使う）
3. コミットして **`vX.Y.Z` タグを push** する
   （例: `git tag v2.0.1 && git push origin v2.0.1`）
4. CI が arm64 / x64 の DMG（`Juice_X.Y.Z_aarch64.dmg` / `Juice_X.Y.Z_x64.dmg`、**未署名**）を
   ビルドし、同タグの**ドラフトリリース**に添付する
5. ドラフトを開き、本文に CHANGELOG の該当節を貼って **公開（draft 解除）** する
   - アップデータは Tauri 命名（`_aarch64.dmg` / `_x64.dmg`）と Electron 命名
     （`-arm64.dmg` / 無印 `.dmg`）の**両方**で arch 一致アセットを選ぶ
     （`src-tauri/src/update.rs` の `select_dmg_asset`）。通常は Tauri 既定名のまま公開
   - **必ず正式リリースで公開する（pre-release / draft にしない）**。アプリは
     `releases/latest` を参照するが、このエンドポイントは pre-release / draft を
     除外するため、draft のままだと更新が検知されない
6. クライアントは6時間以内（または再起動・手動チェック）に更新を検知し、
   ワンクリックで DMG を取得・オープンできる

> ローカルで手元ビルドする場合は `npm run tauri build`（`src-tauri/target/release/bundle/dmg/`
> に出力）。マウント中の「Juice」ボリュームがあると `bundle_dmg.sh` が失敗するので
> `mount | grep -i juice` で確認し、あれば `hdiutil detach '/Volumes/Juice'` で外す。

### Electron → Tauri 引き継ぎリリース（初回のみ）

現行 Electron 版から Tauri 版へ既存ユーザーを自動移行させるための **1 回限りの橋渡し
リリース**。Electron 版の updater は DMG を **Electron 命名（`-arm64.dmg` / 無印 `.dmg`）**
でしか探さないため、この回だけ DMG を Electron 命名にリネームして添付する。

1. 通常どおりタグを push し、CI にドラフトリリースと DMG を作らせる（上記手順 1〜4）
2. ドラフトの DMG を**中身は Tauri のまま、ファイル名だけ Electron 命名にリネーム**して
   差し替える（ダウンロード→リネーム→再アップロード、または手元ビルドをリネームして添付）
   - `Juice_X.Y.Z_aarch64.dmg` → `Juice-X.Y.Z-arm64.dmg`
   - `Juice_X.Y.Z_x64.dmg`     → `Juice-X.Y.Z.dmg`
3. ドラフトを公開する。既存 Electron ユーザーの自動更新がこれを検知し、install スクリプトが
   `/Applications/Juice.app` を Tauri 版へ丸ごと置換（quarantine も除去）して再起動
   → 以降は Tauri 版として動く
4. この橋渡し以降のリリースは Tauri 既定名（`_aarch64.dmg` / `_x64.dmg`）のままでよい
   （Tauri 版 updater は両命名対応済み）

> 補足: 現状 .app / DMG は**未署名**。install スクリプトが `xattr -dr
> com.apple.quarantine` するため置換後は起動できるが、将来的には署名／公証を検討する。
