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

variable "slack_bot_token" {
  description = "Slack 投稿用 Bot トークン（既存 bot のものを .env から移設）"
  type        = string
  sensitive   = true
}

variable "slack_channel_id" {
  description = "テレワーク通知の投稿先チャンネル ID"
  type        = string
}

variable "attendance_api_url" {
  description = "勤怠 API の URL（.env から移設）"
  type        = string
}

variable "attendance_api_key" {
  description = "勤怠 API キー（.env から移設）"
  type        = string
  sensitive   = true
}

variable "whiteboard_api_url" {
  description = "ホワイトボード API の URL（.env から移設）"
  type        = string
}

variable "whiteboard_api_key" {
  description = "ホワイトボード API キー（.env から移設）"
  type        = string
  sensitive   = true
}

variable "attendance_user_overrides" {
  description = "勤怠 user_name の対応表（Slack user ID → 勤怠登録名の JSON。空で開始しエラーが出た人だけ追加する）"
  type        = string
  default     = "{}"
}
