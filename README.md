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

```bash
# 開発（ホットリロード）
npm run dev

# 型チェック
npm run typecheck

# テスト
npm test

# DMG をビルド（無署名）
CSC_IDENTITY_AUTO_DISCOVERY=false npm run package
```

## リリース（アップデート配信）

アプリは GitHub Releases の最新版を起動時・6時間ごとに確認し、新バージョンがあれば
アプリ内で通知する。配信時は次の手順を踏む（**version を上げ忘れると検知されない**）。

1. `package.json` の `version` を上げる（例 `1.0.0` → `1.1.0`）
2. [`CHANGELOG.md`](CHANGELOG.md) にこのバージョンの節を追記する
   （形式はファイル冒頭のテンプレートに従う。リリース本文にも同じ内容を使う）
3. `CSC_IDENTITY_AUTO_DISCOVERY=false npm run package` で arm64 / x64 の DMG をビルド
4. GitHub Release を `vX.Y.Z` タグで作成し、本文に CHANGELOG の該当節を貼り、
   `Juice-X.Y.Z-arm64.dmg` と `Juice-X.Y.Z.dmg`（および blockmap・latest-mac.yml）を添付する
   - **必ず正式リリースで公開する（pre-release にしない）**。アプリは
     `releases/latest` を参照するが、このエンドポイントは pre-release / draft を
     除外するため、pre-release のままだと更新が検知されない
5. クライアントは6時間以内（または再起動・手動チェック）に更新を検知し、
   ワンクリックで DMG を取得・オープンできる
