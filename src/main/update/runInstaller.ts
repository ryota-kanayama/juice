import { spawn } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { buildInstallScript } from './installScript'

/**
 * 差し替えスクリプトを一時ファイルへ書き出し、アプリと切り離して起動する。
 * detached + unref により、アプリ（親）が quit してもスクリプトは生き残る。
 */
export function runInstaller(opts: {
  dmgPath: string
  appPath: string
  tmpDir: string
  pid?: number
}): void {
  const pid = opts.pid ?? process.pid
  const logPath = join(opts.tmpDir, 'juice-update.log')
  const scriptPath = join(opts.tmpDir, 'juice-update.sh')
  const script = buildInstallScript({ pid, dmgPath: opts.dmgPath, appPath: opts.appPath, logPath })
  writeFileSync(scriptPath, script, { mode: 0o755 })
  const child = spawn('/bin/bash', [scriptPath], { detached: true, stdio: 'ignore' })
  child.unref()
}
