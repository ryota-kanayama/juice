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

  # flood されても課金が頭打ちになるようにする（社内ツール規模）
  reserved_concurrent_executions = 5

  environment {
    variables = {
      SLACK_CLIENT_ID     = var.slack_client_id
      SLACK_CLIENT_SECRET = var.slack_client_secret
      ALLOWED_TEAM_ID     = var.allowed_team_id
      SESSION_SECRET      = var.session_secret
    }
  }
}

resource "aws_lambda_function_url" "juice_proxy" {
  function_name      = aws_lambda_function.juice_proxy.function_name
  authorization_type = "NONE" # 認証はアプリレベルのセッション JWT で行う
}
