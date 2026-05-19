import log from 'electron-log/main'

// メインプロセス用ロガー。
// 出力先: ~/Library/Logs/Juice/main.log (macOS) — electron-log のデフォルト。
// console.* の呼び出しもこのファイルに流す。
log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = process.env['NODE_ENV'] === 'development' ? 'debug' : 'info'

export const logger = log
