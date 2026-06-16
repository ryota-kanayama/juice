terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.region
}

# `npm run build`（esbuild）の出力 dist/handler.js を zip 化してデプロイする
data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/../dist/handler.js"
  output_path = "${path.module}/../dist/handler.zip"
}

resource "aws_iam_role" "lambda" {
  name = "juice-proxy-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "juice_proxy" {
  function_name    = "juice-proxy"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  handler          = "handler.handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  memory_size      = 128
  timeout          = 10

  # 予約済み同時実行数は設定しない:
  # 新規アカウントは上限10で、予約すると未予約分が最低値10を割るため設定不可。
  # アカウント上限自体が flood 時の頭打ちとして機能する。
  # 上限引き上げを申請した場合は reserved_concurrent_executions = 5 を復活させること。

  # 秘密値は環境変数に置かず SSM Parameter Store(SecureString) から実行時に取得する。
  # ここには秘密でない設定と、秘密パラメータ名のプレフィックスのみを置く。
  environment {
    variables = {
      SLACK_CLIENT_ID           = var.slack_client_id
      ALLOWED_TEAM_ID           = var.allowed_team_id
      ATTENDANCE_API_URL        = var.attendance_api_url
      WHITEBOARD_API_URL        = var.whiteboard_api_url
      ATTENDANCE_USER_OVERRIDES = var.attendance_user_overrides
      SSM_SECRET_PREFIX         = var.ssm_secret_prefix
      REVOCATION_TABLE          = aws_dynamodb_table.revocations.name
    }
  }
}

# JWT 個別失効テーブル: ユーザー(sub)ごとの失効時刻(revokedBefore)を持つ。
# iat < revokedBefore のトークンを拒否する。退職者・紛失端末はこの sub を更新して即停止。
resource "aws_dynamodb_table" "revocations" {
  name         = "juice-revocations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sub"

  attribute {
    name = "sub"
    type = "S"
  }

  # ttl 属性で古い失効レコードを自動削除（トークン最大有効期間の経過後）
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

resource "aws_iam_role_policy" "dynamodb_revocations" {
  name = "juice-proxy-dynamodb-revocations"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem"]
      Resource = aws_dynamodb_table.revocations.arn
    }]
  })
}

# 秘密パラメータ（SecureString）は Terraform 管理外（CLI で投入）。
# ここでは取得・復号の権限のみを付与し、値は state に載せない。
data "aws_caller_identity" "current" {}

data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

resource "aws_iam_role_policy" "ssm_secrets" {
  name = "juice-proxy-ssm-secrets"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameters", "ssm:GetParameter"]
        Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_secret_prefix}*"
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = data.aws_kms_alias.ssm.target_key_arn
      }
    ]
  })
}

resource "aws_lambda_function_url" "juice_proxy" {
  function_name      = aws_lambda_function.juice_proxy.function_name
  authorization_type = "NONE" # 認証はアプリレベルのセッション JWT で行う
}
