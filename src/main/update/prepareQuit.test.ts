import { describe, it, expect, vi } from 'vitest'
import { prepareQuitForUpdate, notifyRendererReady } from './prepareQuit'

describe('prepareQuitForUpdate', () => {
  it('send を呼び、notifyRendererReady で解決する', async () => {
    const send = vi.fn()
    const p = prepareQuitForUpdate(send, 10_000)
    expect(send).toHaveBeenCalledTimes(1)
    notifyRendererReady()
    await expect(p).resolves.toBeUndefined()
  })

  it('ack が来なくてもタイムアウトで解決する', async () => {
    vi.useFakeTimers()
    const send = vi.fn()
    const p = prepareQuitForUpdate(send, 3000)
    vi.advanceTimersByTime(3000)
    await expect(p).resolves.toBeUndefined()
    vi.useRealTimers()
  })
})
