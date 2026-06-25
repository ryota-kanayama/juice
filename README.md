# Juice

作業セッションを時間区間として記録する macOS メニューバーアプリ。

## ダウンロード

お使いの Mac に合わせて DMG をダウンロードしてください。

| Mac の種類 | ダウンロード |
| --- | --- |
| Apple Silicon（M1 以降） | [**Juice-1.0.0-arm64.dmg**](https://github.com/ryota-kanayama/juice/releases/download/v1.0.0/Juice-1.0.0-arm64.dmg) |
| Intel Mac | [**Juice-1.0.0.dmg**](https://github.com/ryota-kanayama/juice/releases/download/v1.0.0/Juice-1.0.0.dmg) |

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
