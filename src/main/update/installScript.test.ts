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
    const order = ['kill -0', 'hdiutil attach', 'mv "$APP"', 'cp -R', 'xattr -dr com.apple.quarantine']
    let last = -1
    for (const token of order) {
      const i = s.indexOf(token)
      expect(i, `"${token}" が見つからない`).toBeGreaterThan(-1)
      expect(i, `"${token}" の順序が不正`).toBeGreaterThan(last)
      last = i
    }
    // 成功時の最終 open "$APP" は xattr より後に位置すること（lastIndexOf で検証）
    const finalOpenIdx = s.lastIndexOf('open "$APP"')
    const xattrIdx = s.indexOf('xattr -dr com.apple.quarantine')
    expect(finalOpenIdx, '成功時の open "$APP" が xattr より後に位置する').toBeGreaterThan(xattrIdx)
  })

  it('コピー失敗時にロールバックする', () => {
    const s = buildInstallScript(base)
    expect(s).toContain('mv "$BACKUP" "$APP"')
  })

  it('ロールバック経路で旧版を再起動する', () => {
    const s = buildInstallScript(base)
    const rollbackIdx = s.indexOf('mv "$BACKUP" "$APP"')
    const openInRollbackIdx = s.indexOf('open "$APP"', rollbackIdx)
    expect(openInRollbackIdx, 'ロールバック経路に open "$APP" が含まれる').toBeGreaterThan(rollbackIdx)
  })

  it("シングルクォートを含むパスを安全にエスケープする", () => {
    const s = buildInstallScript({ ...base, appPath: `/Applications/My'App.app` })
    expect(s).toContain(`APP='/Applications/My'\\''App.app'`)
  })
})
