variable "region" {
  description = "デプロイ先リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "slack_client_id" {
  description = "Slack アプリの Client ID"
  type        = string
  sensitive   = true
}

variable "slack_client_secret" {
  description = "Slack アプリの Client Secret"
  type        = string
  sensitive   = true
}

variable "allowed_team_id" {
  description = "許可する Slack ワークスペースの team ID（T 始まり）"
  type        = string
}

variable "session_secret" {
  description = "セッション JWT の HS256 署名鍵（openssl rand -hex 32 で生成）"
  type        = string
  sensitive   = true
}
