import { useState, useEffect } from 'react'
import { formatLocalDate } from '../../../shared/sessionUtils'

/**
 * ローカルの「今日」(YYYY-MM-DD) を返す単一ソース。
 * 日付が変わると自動更新する（深夜0時のタイマー・フォーカス復帰・タブ可視化）。
 * 各 hook が個別に formatLocalDate(Date.now()) を評価して二系統化するのを防ぐ。
 */
export function useToday(): string {
  const [today, setToday] = useState(() => formatLocalDate(Date.now()))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const scheduleNextMidnight = (): void => {
      const now = new Date()
      // 翌日 00:00:01（日付境界を確実に跨いだ直後）に発火させる
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      clearTimeout(timer)
      timer = setTimeout(sync, next.getTime() - now.getTime())
    }

    function sync(): void {
      const current = formatLocalDate(Date.now())
      setToday(prev => (prev === current ? prev : current))
      scheduleNextMidnight()
    }

    const onVisible = (): void => { if (!document.hidden) sync() }

    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', onVisible)
    scheduleNextMidnight()

    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return today
}
