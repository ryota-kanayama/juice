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
  runtime          = "nodejs20.x"
  handler          = "handler.handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  memory_size      = 128
  timeout          = 10

  # 予約済み同時実行数は設定しない:
  # 新規アカウントは上限10で、予約すると未予約分が最低値10を割るため設定不可。
  # アカウント上限自体が flood 時の頭打ちとして機能する。
  # 上限引き上げを申請した場合は reserved_concurrent_executions = 5 を復活させること。

  environment {
    variables = {
      SLACK_CLIENT_ID           = var.slack_client_id
      SLACK_CLIENT_SECRET       = var.slack_client_secret
      ALLOWED_TEAM_ID           = var.allowed_team_id
      SESSION_SECRET            = var.session_secret
      SLACK_BOT_TOKEN           = var.slack_bot_token
      SLACK_CHANNEL_ID          = var.slack_channel_id
      ATTENDANCE_API_URL        = var.attendance_api_url
      ATTENDANCE_API_KEY        = var.attendance_api_key
      WHITEBOARD_API_URL        = var.whiteboard_api_url
      WHITEBOARD_API_KEY        = var.whiteboard_api_key
      ATTENDANCE_USER_OVERRIDES = var.attendance_user_overrides
    }
  }
}

resource "aws_lambda_function_url" "juice_proxy" {
  function_name      = aws_lambda_function.juice_proxy.function_name
  authorization_type = "NONE" # 認証はアプリレベルのセッション JWT で行う
}
