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

variable "allowed_team_id" {
  description = "許可する Slack ワークスペースの team ID（T 始まり）"
  type        = string
}

variable "attendance_api_url" {
  description = "勤怠 API の URL（.env から移設）"
  type        = string
}

variable "whiteboard_api_url" {
  description = "ホワイトボード API の URL（.env から移設）"
  type        = string
}

variable "attendance_user_overrides" {
  description = "勤怠 user_name の対応表（Slack user ID → 勤怠登録名の JSON。空で開始しエラーが出た人だけ追加する）"
  type        = string
  default     = "{}"
}

variable "ssm_secret_prefix" {
  description = "秘密パラメータ（SecureString）名のプレフィックス。末尾は / にする。例: /juice-proxy/"
  type        = string
  default     = "/juice-proxy/"
}
