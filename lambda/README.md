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
   `users:read` と `users:read.email` を追加
   （標準 OAuth フロー。`openid` 等の OIDC スコープは使わない）
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
# terraform.tfvars に「秘密でない」設定だけ記入する:
#   slack_client_id: 手順1で控えた値（Client ID は秘密ではない）
#   allowed_team_id: ワークスペースの team ID
#     （ブラウザで Slack を開いた URL app.slack.com/client/TXXXXXXX/...
#      の T 始まりの部分）
#   slack_channel_id: 既存 .env の MAIN_VITE_SLACK_CHANNEL_ID
#   attendance_api_url / whiteboard_api_url: 既存 .env の各 URL
```

秘密値は tfvars/tfstate に置かず、SSM Parameter Store(SecureString) に CLI で投入する
（プレフィックスは既定 `/juice-proxy/`、`ssm_secret_prefix` で変更可）:

```bash
REGION=ap-northeast-1
put() { aws ssm put-parameter --region "$REGION" --type SecureString --overwrite \
  --name "/juice-proxy/$1" --value "$2"; }

put SLACK_CLIENT_SECRET "手順1で控えた Client Secret"
put SESSION_SECRET      "$(openssl rand -hex 32)"   # JWT の HS256 署名鍵
put SLACK_BOT_TOKEN     "既存 .env の MAIN_VITE_SLACK_BOT_TOKEN"
put ATTENDANCE_API_KEY  "既存 .env の MAIN_VITE_ATTENDANCE_API_KEY"
put WHITEBOARD_API_KEY  "既存 .env の MAIN_VITE_WHITEBOARD_API_KEY"
```

```bash
terraform init
terraform apply        # 実行計画を確認して yes
```

`terraform.tfvars` は gitignore 済み。秘密は SSM にのみ存在し、tfstate には載らない。
SecureString は既定の AWS 管理キー `alias/aws/ssm` で暗号化される（追加料金なし）。
リージョンは既定で `ap-northeast-1`（変える場合は `region` 変数と上記 `REGION`）。

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

# 改竄 JWT での投稿は 401
curl -si -X POST -H "Authorization: Bearer xx.yy.zz" \
  -H "Content-Type: application/json" \
  -d '{"kind":"telework_start","projectCode":"ES1","projectName":"PJ"}' \
  "<FunctionUrl>api/slack.post" | head -1
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
- **キーローテーション**: SSM のパラメータを更新する（apply 不要、次のコールド起動で反映）
  例: `aws ssm put-parameter --type SecureString --overwrite --name /juice-proxy/SLACK_BOT_TOKEN --value '新トークン'`
- **全セッション失効**: `SESSION_SECRET` パラメータを新しい値に更新する（全 JWT が無効化される）
  例: `aws ssm put-parameter --type SecureString --overwrite --name /juice-proxy/SESSION_SECRET --value "$(openssl rand -hex 32)"`
- **個別失効（退職者・紛失端末）**: `juice-revocations` テーブルに当該ユーザーの
  失効時刻をセットする。これより前に発行された JWT が即座に無効化される
  （本人は再サインインで復帰可。sub は Slack の user ID = U 始まり）:
  ```bash
  NOW=$(date +%s); TTL=$((NOW + 90*24*60*60))  # ttl で 90 日後に自動削除
  aws dynamodb put-item --region ap-northeast-1 --table-name juice-revocations \
    --item "{\"sub\":{\"S\":\"U0XXXXXXX\"},\"revokedBefore\":{\"N\":\"$NOW\"},\"ttl\":{\"N\":\"$TTL\"}}"
  ```
- **全リソース削除**: `terraform destroy`（SSM パラメータは Terraform 管理外なので別途 `aws ssm delete-parameter` で削除）
- **勤怠の登録名の自動解決**: サインイン時に Slack の `users.info` から
  旧ユーザー名（@ハンドル）を取得し勤怠 user_name に使う。
  スコープ変更後は既存サインイン者の再サインインが必要
- **勤怠の登録名が一致しない人への対応**: 自動解決した旧ハンドルが勤怠 DB と
  ズレる人は、本人の Slack user ID（U 始まり）と勤怠システムの登録名を
  `attendance_user_overrides` に追加して `terraform apply`（対応表が最優先）
