import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { TimeField } from '@/components/ui/time-field'
import type { Session } from '../../types/session'
import { applyTimeEdit } from '../../domain/session'

interface Props {
  open: boolean
  session: Session | null
  /** 確定時に新しい開始/終了（"HH:mm"）を渡す */
  onSubmit: (startTime: string, endTime: string) => void
  onClose: () => void
}

/** "YYYY-MM-DDTHH:mm:ss" から "HH:mm" を取り出す */
const timeOf = (dateTime: string): string => dateTime.slice(11, 16)

/** 開始/終了時刻を編集する専用ダイアログ（区間を持つ完了済みセッション向け） */
export function SessionTimeEditDialog({ open, session, onSubmit, onClose }: Props) {
  const [start, setStart] = useState('00:00')
  const [end, setEnd] = useState('00:00')

  // ダイアログを開くたびに対象セッションの値で初期化する
  useEffect(() => {
    if (!session || session.times.length === 0) return
    const last = session.times[session.times.length - 1]
    setStart(timeOf(session.times[0].startTime))
    setEnd(last.endTime ? timeOf(last.endTime) : '00:00')
  }, [session])

  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(n => parseInt(n, 10))
    return h * 60 + m
  }
  const valid = toMinutes(end) > toMinutes(start)
  // 算出後の合計時間（プレビュー）。不正なら現在値のまま表示しない
  const previewTotal = session && valid ? applyTimeEdit(session, { startTime: start, endTime: end }).totalTime : null

  const handleSubmit = (): void => {
    if (valid) onSubmit(start, end)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[280px]" aria-describedby={undefined}>
        <DialogTitle>時刻を編集</DialogTitle>
        <div className="flex flex-col gap-3" onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}>
          <span className="text-[13px] font-medium text-foreground">{session?.name}</span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">開始</span>
            <TimeField
              aria-label="開始時刻"
              className="h-10 text-lg"
              value={start}
              onChange={setStart}
              autoFocus
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">終了</span>
            <TimeField
              aria-label="終了時刻"
              className="h-10 text-lg"
              value={end}
              onChange={setEnd}
            />
          </div>
          <div className="text-right text-xs text-muted-foreground">
            合計 <strong className="text-[var(--accent)]">{previewTotal ?? '—'}分</strong>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={handleSubmit} disabled={!valid}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
