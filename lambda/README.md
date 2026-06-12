# Juice 認証・プロキシ Lambda

Slack OIDC サインインとセッション JWT 発行を行う Lambda。
詳細設計: `docs/superpowers/specs/2026-06-11-secrets-lambda-slack-oidc-design.md`

## 前提

- Terraform と AWS CLI がセットアップ済み（`brew install terraform awscli`）
- AWS 認証情報が設定済み（`aws configure`）
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
npm run build          # esbuild で dist/handler.js を生成

cd terraform
cp terraform.tfvars.example terraform.tfvars
openssl rand -hex 32   # session_secret に使う値を生成
# terraform.tfvars に実値を記入する:
#   slack_client_id / slack_client_secret: 手順1で控えた値
#   allowed_team_id: ワークスペースの team ID
#     （ブラウザで Slack を開いた URL app.slack.com/client/TXXXXXXX/...
#      の T 始まりの部分）
#   session_secret: 上で生成した値

terraform init
terraform apply        # 実行計画を確認して yes
```

`terraform.tfvars` は秘密を含むため gitignore 済み。
リージョンは既定で `ap-northeast-1`（変える場合は `region` 変数）。

apply 完了時の Outputs に **function_url** が表示される。

※ function_url は末尾スラッシュ付き（`https://xxx.on.aws/`）で出力される。
以降の `<FunctionUrl>` 表記はこの末尾スラッシュ付き URL をそのまま使う
（手順4の `.env` だけは末尾スラッシュを取り除いて設定する）。

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
- **コード更新**: `npm run build` → `terraform apply`
- **キーローテーション**: `terraform.tfvars` を変更して `terraform apply`
- **全セッション失効**: `session_secret` を変更して `terraform apply`
- **全リソース削除**: `terraform destroy`
