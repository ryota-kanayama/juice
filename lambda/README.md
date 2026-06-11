# Juice 認証・プロキシ Lambda

Slack OIDC サインインとセッション JWT 発行を行う Lambda。
詳細設計: `docs/superpowers/specs/2026-06-11-secrets-lambda-slack-oidc-design.md`

## 前提

- AWS CLI と SAM CLI がセットアップ済み（`brew install awscli aws-sam-cli`）
- 会社ワークスペースに Slack アプリを作成できる権限

## 1. Slack アプリの作成

1. <https://api.slack.com/apps> → **Create New App** → **From scratch**
2. App Name: `Juice`、ワークスペース: 会社ワークスペースを選択
3. **OAuth & Permissions** → Scopes → **User Token Scopes** に
   `openid` と `profile` を追加
4. **Basic Information** → App Credentials の **Client ID** と
   **Client Secret** を控える
5. Redirect URL はデプロイ後（手順3）に設定する

## 2. 初回デプロイ

```bash
cd lambda
npm install
openssl rand -hex 32   # SESSION_SECRET を生成して控える
sam build
sam deploy --guided
```

`--guided` の質問には以下を入力:

- Stack Name: `juice-proxy`
- Region: `ap-northeast-1`
- Parameter SlackClientId / SlackClientSecret: 手順1で控えた値
- Parameter AllowedTeamId: ワークスペースの team ID
  （ブラウザで Slack を開いた URL `app.slack.com/client/TXXXXXXX/...`
  の `T` 始まりの部分）
- Parameter SessionSecret: 生成した値
- 残りはデフォルトで OK（`samconfig.toml` に保存され、gitignore 済み）

デプロイ完了時の Outputs に **FunctionUrl** が表示される。

## 3. Slack アプリに Redirect URL を設定

**OAuth & Permissions** → Redirect URLs に
`<FunctionUrl>auth/callback` を追加して Save。
（例: `https://xxx.lambda-url.ap-northeast-1.on.aws/auth/callback`）

## 4. アプリ側の設定

リポジトリルートの `.env` に追加（末尾スラッシュなし）:

```bash
MAIN_VITE_PROXY_URL=https://xxx.lambda-url.ap-northeast-1.on.aws
```

## 5. 動作確認

```bash
# 認可リダイレクト（302 で slack.com が返る）
curl -si "<FunctionUrl>auth/start?state=$(openssl rand -hex 16)" | head -3

# 未認証は 401
curl -si "<FunctionUrl>auth/me" | head -1

# サインイン後（アプリで実施）、JWT を使って 200 を確認
curl -si -H "Authorization: Bearer <JWT>" "<FunctionUrl>auth/me"
```

アプリでの E2E は **パッケージ版で確認する**
（dev モードは `juice://` スキームが Electron.app に紐づかないため）:

```bash
npm run package
open dist-release/mac-arm64/Juice.app
# 設定 > アカウント > Slack でサインイン
```

## 運用

- **コスト監視**: AWS Budgets で月 $5 のアラートを設定しておく
  （Console → Budgets → Create budget）
- **キーローテーション**: `sam deploy` の parameter overrides を
  変更して再デプロイ
- **全セッション失効**: SessionSecret を変更して再デプロイ
