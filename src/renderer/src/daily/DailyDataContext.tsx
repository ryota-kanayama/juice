import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react'
import type { DayRecord } from '../../../shared/types'
import { dailyRepository } from '../repositories/dailyRepository'

interface DailyData {
  /** キャッシュからの同期読み（未ロード月は null） */
  getDay: (date: string) => DayRecord | null
  /** 当該月を一度だけロードしキャッシュへ取り込む（冪等） */
  ensureMonth: (yearMonth: string) => void
  /** 部分更新（楽観的にキャッシュ反映 + IPC で write-through） */
  setDay: (date: string, patch: DayRecord) => Promise<void>
}

const DailyDataContext = createContext<DailyData | null>(null)

export function useDailyData(): DailyData {
  const ctx = useContext(DailyDataContext)
  if (!ctx) throw new Error('useDailyData は DailyDataProvider の内側で使う必要があります')
  return ctx
}

export function DailyDataProvider({ children }: { children: ReactNode }) {
  // date("YYYY-MM-DD") → DayRecord のフラットなキャッシュ（複数月を保持できる）
  const [days, setDays] = useState<Record<string, DayRecord>>({})
  // 多重ロードを防ぐためロード済み/ロード中の月を記録する
  const loadedRef = useRef<Set<string>>(new Set())

  const ensureMonth = useCallback((yearMonth: string): void => {
    if (loadedRef.current.has(yearMonth)) return
    loadedRef.current.add(yearMonth)
    dailyRepository.getMonth(yearMonth).then(month => {
      // 既にローカル更新済みの日（prev）を優先し、楽観反映を上書きしない
      setDays(prev => ({ ...month.days, ...prev }))
    }).catch((err) => {
      // ロード失敗時は loadedRef から外し、次回 ensureMonth で再試行できるようにする
      console.error(`[DailyDataProvider] getMonth(${yearMonth}) の取得に失敗しました:`, err)
      loadedRef.current.delete(yearMonth)
    })
  }, [])

  const getDay = useCallback((date: string): DayRecord | null => days[date] ?? null, [days])

  const setDay = useCallback(async (date: string, patch: DayRecord): Promise<void> => {
    setDays(prev => ({ ...prev, [date]: { ...prev[date], ...patch } }))
    await dailyRepository.setDay(date, patch)
  }, [])

  return (
    <DailyDataContext.Provider value={{ getDay, ensureMonth, setDay }}>
      {children}
    </DailyDataContext.Provider>
  )
}
