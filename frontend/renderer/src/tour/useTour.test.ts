import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTour } from './useTour'

beforeEach(() => localStorage.clear())

describe('useTour', () => {
  it('未完了なら自動で起動する', () => {
    const { result } = renderHook(() => useTour())
    expect(result.current.isActive).toBe(true)
    expect(result.current.index).toBe(0)
  })

  it('完了済みなら自動起動しない', () => {
    localStorage.setItem('juice.tourCompleted', 'true')
    const { result } = renderHook(() => useTour())
    expect(result.current.isActive).toBe(false)
  })

  it('next / prev で前後に動く', () => {
    const { result } = renderHook(() => useTour())
    act(() => result.current.next())
    expect(result.current.index).toBe(1)
    act(() => result.current.prev())
    expect(result.current.index).toBe(0)
  })

  it('finish で終了し完了フラグを保存する', () => {
    const { result } = renderHook(() => useTour())
    act(() => result.current.finish())
    expect(result.current.isActive).toBe(false)
    expect(localStorage.getItem('juice.tourCompleted')).toBe('true')
  })

  it('skip で終了し完了フラグを保存する', () => {
    const { result } = renderHook(() => useTour())
    act(() => result.current.skip())
    expect(result.current.isActive).toBe(false)
    expect(localStorage.getItem('juice.tourCompleted')).toBe('true')
  })

  it('完了後も start() で手動再生できる', () => {
    localStorage.setItem('juice.tourCompleted', 'true')
    const { result } = renderHook(() => useTour())
    expect(result.current.isActive).toBe(false)
    act(() => result.current.start())
    expect(result.current.isActive).toBe(true)
    expect(result.current.index).toBe(0)
  })
})
