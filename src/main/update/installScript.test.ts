import { describe, it, expect } from 'vitest'
import { buildInstallScript } from './installScript'

const base = {
  pid: 4242,
  dmgPath: '/tmp/Juice-1.1.0-arm64.dmg',
  appPath: '/Applications/Juice.app',
  logPath: '/tmp/juice-update.log',
}

describe('buildInstallScript', () => {
  it('PID・DMG・APP・LOG を埋め込む', () => {
    const s = buildInstallScript(base)
    expect(s).toContain('PID=4242')
    expect(s).toContain(`DMG='/tmp/Juice-1.1.0-arm64.dmg'`)
    expect(s).toContain(`APP='/Applications/Juice.app'`)
    expect(s).toContain(`LOG='/tmp/juice-update.log'`)
  })

  it('終了待ち→マウント→退避→コピー→quarantine除去→open の順で構成する', () => {
    const s = buildInstallScript(base)
    const order = ['kill -0', 'hdiutil attach', 'mv "$APP"', 'cp -R', 'xattr -dr com.apple.quarantine', 'open "$APP"']
    let last = -1
    for (const token of order) {
      const i = s.indexOf(token)
      expect(i, `"${token}" が見つからない`).toBeGreaterThan(-1)
      expect(i, `"${token}" の順序が不正`).toBeGreaterThan(last)
      last = i
    }
  })

  it('コピー失敗時にロールバックする', () => {
    const s = buildInstallScript(base)
    expect(s).toContain('mv "$BACKUP" "$APP"')
  })

  it("シングルクォートを含むパスを安全にエスケープする", () => {
    const s = buildInstallScript({ ...base, appPath: `/Applications/My'App.app` })
    expect(s).toContain(`APP='/Applications/My'\\''App.app'`)
  })
})
