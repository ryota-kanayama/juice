// dev / preview の前に Electron 本体バイナリが入っているか保証する。
//
// electron の postinstall（install.js）がダウンロード途中で失敗すると
// node_modules/electron/dist と path.txt が欠け、electron-vite が
// 「Error: Electron uninstall」で起動できなくなる。
// install.js は冪等（インストール済みなら即 exit 0、欠けていれば取得）なので
// 起動前に毎回呼んで自己修復する。
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const installer = 'node_modules/electron/install.js'

if (!existsSync(installer)) {
  console.error(
    '\n[ensure-electron] electron パッケージが見つかりません。`npm install` を実行してください。\n'
  )
  process.exit(1)
}

try {
  execFileSync(process.execPath, [installer], { stdio: 'inherit' })
} catch {
  console.error(
    '\n[ensure-electron] Electron 本体の取得に失敗しました。ネットワークを確認のうえ\n' +
      '  node node_modules/electron/install.js\n' +
      'を手動で実行してください。\n'
  )
  process.exit(1)
}
