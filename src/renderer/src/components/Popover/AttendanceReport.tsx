import { useState } from 'react'
import type { Session } from '../../types/session'
import { useAttendanceReport } from '../../hooks/useAttendanceReport'
import { isValidWorkTime } from '../../domain/attendance'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TimeField } from '@/components/ui/time-field'
import { Check, Copy, SendDiagonal, WarningTriangle } from 'iconoir-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Props {
  sessions: Session[]
  today: string
}

type EditField = 'workStart' | 'workEnd' | 'break'

const actionButton =
  'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border-0 p-[9px] text-[13px] font-semibold text-white transition-all hover:-translate-y-px'

export function AttendanceReport({ sessions, today }: Props) {
  const {
    breakMinutes, setBreakMinutes,
    workStart, setWorkStart,
    workEnd, setWorkEnd,
    text, overageMinutes, canSend, copied, sending, sendResult, copy, send,
  } = useAttendanceReport(sessions, today)

  const [editField, setEditField] = useState<EditField | null>(null)
  const [dialogValue, setDialogValue] = useState('')

  function openDialog(field: EditField): void {
    setEditField(field)
    if (field === 'workStart') setDialogValue(workStart ?? '')
    else if (field === 'workEnd') setDialogValue(workEnd ?? '')
    else setDialogValue(String(breakMinutes))
  }

  function confirmDialog(): void {
    if (editField === 'workStart') {
      if (isValidWorkTime(dialogValue)) setWorkStart(dialogValue)
    } else if (editField === 'workEnd') {
      if (isValidWorkTime(dialogValue)) setWorkEnd(dialogValue)
    } else if (editField === 'break') {
      const n = parseInt(dialogValue, 10)
      if (!isNaN(n) && n >= 0) setBreakMinutes(n)
    }
    setEditField(null)
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col rounded-xl bg-[var(--glass-bg)] p-3 [backdrop-filter:blur(12px)]">
      <Dialog open={editField !== null} onOpenChange={open => { if (!open) setEditField(null) }}>
        <DialogContent className="max-w-[220px]" aria-describedby={undefined}>
          <DialogTitle>
            {editField === 'workStart' ? '出勤時刻' : editField === 'workEnd' ? '退勤時刻' : editField === 'break' ? '休憩時間' : ''}
          </DialogTitle>
          <div onKeyDown={e => { if (e.key === 'Enter') confirmDialog() }}>
            {editField === 'break' ? (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  className="h-11 w-full text-center text-xl"
                  value={dialogValue}
                  onChange={e => setDialogValue(e.target.value)}
                  autoFocus
                />
                <span className="text-sm text-muted-foreground">分</span>
              </div>
            ) : (
              <TimeField
                aria-label={editField === 'workStart' ? '出勤時刻' : '退勤時刻'}
                className="h-11 w-full justify-center text-xl"
                value={dialogValue}
                onChange={setDialogValue}
                autoFocus
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditField(null)}>キャンセル</Button>
            <Button onClick={confirmDialog}>確定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mb-3 flex items-center justify-between rounded-[8px] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 [backdrop-filter:blur(8px)]">
        <div className="flex items-center gap-3">
          <button
            className="group flex cursor-pointer flex-col items-center gap-0.5 border-0 bg-transparent p-0"
            onDoubleClick={() => openDialog('workStart')}
            title="ダブルクリックで編集"
          >
            <span className="text-[10px] text-muted-foreground">出勤</span>
            <span className={`text-[13px] font-semibold transition-colors group-hover:text-[var(--accent)] ${workStart ? 'text-foreground' : 'text-muted-foreground'}`}>
              {workStart ?? '--:--'}
            </span>
          </button>
          <span className="text-[13px] text-muted-foreground">〜</span>
          <button
            className="group flex cursor-pointer flex-col items-center gap-0.5 border-0 bg-transparent p-0"
            onDoubleClick={() => openDialog('workEnd')}
            title="ダブルクリックで編集"
          >
            <span className="text-[10px] text-muted-foreground">退勤</span>
            <span className={`text-[13px] font-semibold transition-colors group-hover:text-[var(--accent)] ${workEnd ? 'text-foreground' : 'text-muted-foreground'}`}>
              {workEnd ?? '--:--'}
            </span>
          </button>
        </div>
        <div className="h-4 w-px bg-border" />
        <button
          className="group flex cursor-pointer flex-col items-center gap-0.5 border-0 bg-transparent p-0"
          onDoubleClick={() => openDialog('break')}
          title="ダブルクリックで編集"
        >
          <span className="text-[10px] text-muted-foreground">休憩</span>
          <span className="text-[13px] font-semibold text-foreground transition-colors group-hover:text-[var(--accent)]">
            {breakMinutes}分
          </span>
        </button>
      </div>

      <pre className="mb-3 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-[8px] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 font-mono text-xs leading-[1.7] text-[var(--text-primary)] [backdrop-filter:blur(8px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{text}</pre>

      <div className="flex shrink-0 gap-2">
        <Button
          className={`flex-1 ${copied ? 'bg-[linear-gradient(135deg,#26de81,#20c870)] text-white' : ''}`}
          onClick={copy}
        >
          {copied ? <><Check width={14} height={14} /> コピーしました</> : <><Copy width={14} height={14} /> コピー</>}
        </Button>
        <TooltipProvider delayDuration={450}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`${actionButton} disabled:transform-none disabled:cursor-not-allowed disabled:opacity-60 ${
                  overageMinutes !== null
                    ? 'bg-[linear-gradient(135deg,#f59e0b,#d97706)]'
                    : sendResult === 'success'
                      ? 'bg-[linear-gradient(135deg,#26de81,#20c870)]'
                      : sendResult === 'auth' || sendResult === 'error'
                        ? 'bg-[linear-gradient(135deg,#ef4444,#dc2626)]'
                        : 'bg-[linear-gradient(135deg,#3b82f6,#2563eb)] shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_16px_rgba(59,130,246,0.4)]'
                }`}
                onClick={send}
                disabled={sending || !canSend || overageMinutes !== null}
              >
                {overageMinutes !== null
                  ? <><WarningTriangle width={14} height={14} /> {overageMinutes}分超過</>
                  : sending
                    ? '送信中...'
                    : sendResult === 'success'
                      ? <><Check width={14} height={14} /> 送信しました</>
                      : sendResult === 'auth'
                        ? '認証が必要です'
                        : sendResult === 'error'
                          ? '送信失敗'
                          : <><SendDiagonal width={14} height={14} /> 送る</>}
              </button>
            </TooltipTrigger>
            {overageMinutes !== null && (
              <TooltipContent>作業時間が実稼働時間を超過しています</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </Card>
  )
}
