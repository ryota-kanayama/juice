import { describe, it, expect } from 'vitest'
import { normalizeVersion, compareVersions, isNewerVersion } from './version'

describe('normalizeVersion', () => {
  it('先頭の v と空白を除去する', () => {
    expect(normalizeVersion('v1.2.3')).toBe('1.2.3')
    expect(normalizeVersion('  V1.0.0 ')).toBe('1.0.0')
    expect(normalizeVersion('1.0.0')).toBe('1.0.0')
  })
})

describe('compareVersions', () => {
  it('大小を数値として比較する', () => {
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1)
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })
  it('文字列順ではなく数値順（1.10.0 > 1.9.0）', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
  })
  it('v 接頭辞や桁数差を吸収する', () => {
    expect(compareVersions('v1.2', '1.2.0')).toBe(0)
    expect(compareVersions('2.0.0', 'v1.9.9')).toBe(1)
  })
})

describe('isNewerVersion', () => {
  it('candidate が新しいときだけ true', () => {
    expect(isNewerVersion('1.1.0', '1.0.0')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('0.9.0', '1.0.0')).toBe(false)
  })
})
