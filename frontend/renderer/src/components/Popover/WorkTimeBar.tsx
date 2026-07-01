import { useState } from 'react'
import { formatTimeFromDate } from '../../../../shared/sessionUtils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TimeField } from '@/components/ui/time-field'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Props {
  workStart?: string | null
  workEnd?: string | null
  breakStart?: string | null
  breakEnd?: string | null
  onBreakStart?: () => void
  onBreakEnd?: () => void
  onWorkEnd?: (time: string) => void
  totalMinutes: number
  hasSessions: boolean
}

/**
 * 勤務時間バー。休憩/休憩終了/業務終了ボタンと、業務終了時刻の入力ダイアログ、
 * 当日の合計作業時間を表示する。
 */
export function WorkTimeBar({
  workStart = null, workEnd = null, breakStart = null, breakEnd = null,
  onBreakStart, onBreakEnd, onWorkEnd, totalMinutes, hasSessions,
}: Props) {
  const [endPickerOpen, setEndPickerOpen] = useState(false)
  const [timePickerValue, setTimePickerValue] = useState('')

  const handleWorkEnd = (): void => {
    setTimePickerValue(formatTimeFromDate(new Date()))
    setEndPickerOpen(true)
  }

  const handleTimePickerConfirm = (): void => {
    onWorkEnd?.(timePickerValue)
    setEndPickerOpen(false)
  }

  return (
    <>
      <Dialog open={endPickerOpen} onOpenChange={open => { if (!open) setEndPickerOpen(false) }}>
        <DialogContent className="max-w-[220px]" aria-describedby={undefined}>
          <DialogTitle>業務終了時刻</DialogTitle>
          <div onKeyDown={e => { if (e.key === 'Enter') handleTimePickerConfirm() }}>
            <TimeField
              aria-label="業務終了時刻"
              className="h-11 w-full justify-center text-xl"
              value={timePickerValue}
              onChange={setTimePickerValue}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndPickerOpen(false)}>キャンセル</Button>
            <Button onClick={handleTimePickerConfirm}>確定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="mb-2 mt-2" data-tour="demo-worktime">
        <CardContent className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            {workStart && !workEnd && (
              breakStart === null ? (
                <Button variant="outline" size="sm" className="h-7 border-amber-400 text-amber-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950" onClick={onBreakStart}>
                  休憩
                </Button>
              ) : breakEnd === null ? (
                <Button variant="outline" size="sm" className="h-7 border-amber-400 text-amber-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950" onClick={onBreakEnd}>
                  休憩終了
                </Button>
              ) : (
                <Button variant="destructive" size="sm" className="h-7" onClick={handleWorkEnd}>
                  終了
                </Button>
              )
            )}
            <span className="min-w-[90px] text-[11px] text-[var(--text-muted)]">
              {workStart ? `${workStart}${workEnd ? `〜${workEnd}` : '〜'}` : ''}
            </span>
          </div>
          {hasSessions && (
            <span>今日注いだ時間: <strong>{totalMinutes}分</strong></span>
          )}
        </CardContent>
      </Card>
    </>
  )
}
