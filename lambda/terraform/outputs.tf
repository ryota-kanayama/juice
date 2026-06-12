output "function_url" {
  description = "Juice アプリの MAIN_VITE_PROXY_URL に設定する URL"
  value       = aws_lambda_function_url.juice_proxy.function_url
}
