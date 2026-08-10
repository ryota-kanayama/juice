/* eslint-disable react-refresh/only-export-components --
   context + hook + provider を同居させる標準的な構成のため（Fast Refresh のみの制約）。 */
import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
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

export const DailyDataContext = createContext<DailyData | null>(null)

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

  // 同期の読み直し。ensureMonth とは勝つ側が逆で、ディスクの内容が勝つ。
  //
  // ensureMonth は「手元の楽観更新を古いディスクで潰さない」ために手元を優先する。
  // こちらは「他のウィンドウの変更を受け取る」ためのものなので、手元を優先すると
  // 相手の変更が永遠に届かない。スプレッドの順序が逆であることが本質なので、
  // 1つの関数にまとめて引数で分岐させないこと。
  const refreshMonth = useCallback((yearMonth: string): void => {
    dailyRepository.getMonth(yearMonth).then(month => {
      setDays(prev => ({ ...prev, ...month.days }))
    }).catch((err) => {
      // 失敗しても手元の内容は保つ。次の通知で再試行される
      console.error(`[DailyDataProvider] getMonth(${yearMonth}) の読み直しに失敗しました:`, err)
    })
  }, [])

  // 他のウィンドウでの書き込みを受け取って読み直す。
  // 読み込んでいない月は無視する（loadedRef が判定材料。読み直しでは変えない）。
  useEffect(() => {
    return dailyRepository.onChanged(({ yearMonth }) => {
      if (!loadedRef.current.has(yearMonth)) return
      refreshMonth(yearMonth)
    })
  }, [refreshMonth])

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
