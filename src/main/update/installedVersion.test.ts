import { describe, it, expect } from 'vitest'
import { bundleInfoPlistPath, parseShortVersionFromPlist } from './installedVersion'

describe('bundleInfoPlistPath', () => {
  it('実行ファイルパスから Info.plist のパスを導く', () => {
    expect(bundleInfoPlistPath('/Applications/Juice.app/Contents/MacOS/Juice'))
      .toBe('/Applications/Juice.app/Contents/Info.plist')
  })
})

describe('parseShortVersionFromPlist', () => {
  it('CFBundleShortVersionString を取り出す', () => {
    const xml = `
      <dict>
        <key>CFBundleIdentifier</key><string>com.kanaami.juice</string>
        <key>CFBundleShortVersionString</key><string>1.2.0</string>
      </dict>`
    expect(parseShortVersionFromPlist(xml)).toBe('1.2.0')
  })
  it('キーが無ければ null', () => {
    expect(parseShortVersionFromPlist('<dict></dict>')).toBeNull()
  })
  it('属性付き <string> タグでも値を取り出す', () => {
    const xml = `<key>CFBundleShortVersionString</key><string foo="bar">1.2.0</string>`
    expect(parseShortVersionFromPlist(xml)).toBe('1.2.0')
  })
})
