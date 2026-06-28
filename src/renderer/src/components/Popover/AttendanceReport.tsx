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
    text, overageMinutes, hasZeroTask, canSend, copied, sending, sendResult, copy, send,
  } = useAttendanceReport(sessions, today)

  const [editField, setEditField] = useState<EditField | null>(null)
  const [dialogValue, setDialogValue] = useState('')
  const [confirmingSend, setConfirmingSend] = useState(false)

  // 0 分タスクを含む場合のみ確認を挟む。それ以外は即送信。
  function handleSendClick(): void {
    if (hasZeroTask) setConfirmingSend(true)
    else void send()
  }

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
            className={`group flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 ${workStart ? 'cursor-pointer' : 'cursor-default'}`}
            onDoubleClick={workStart ? () => openDialog('workStart') : undefined}
            title={workStart ? 'ダブルクリックで編集' : undefined}
          >
            <span className="text-[10px] text-muted-foreground">出勤</span>
            <span className={`text-[13px] font-semibold transition-colors ${workStart ? 'text-foreground group-hover:text-[var(--accent)]' : 'text-muted-foreground'}`}>
              {workStart ?? '--:--'}
            </span>
          </button>
          <span className="text-[13px] text-muted-foreground">〜</span>
          <button
            className={`group flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 ${workEnd ? 'cursor-pointer' : 'cursor-default'}`}
            onDoubleClick={workEnd ? () => openDialog('workEnd') : undefined}
            title={workEnd ? 'ダブルクリックで編集' : undefined}
          >
            <span className="text-[10px] text-muted-foreground">退勤</span>
            <span className={`text-[13px] font-semibold transition-colors ${workEnd ? 'text-foreground group-hover:text-[var(--accent)]' : 'text-muted-foreground'}`}>
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
          data-tour="att-copy"
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
                onClick={handleSendClick}
                data-tour="att-send"
                disabled={sending || !canSend}
              >
                {overageMinutes !== null
                  ? <><WarningTriangle width={14} height={14} /> 調整して送る</>
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
              <TooltipContent className="text-center">
                タイマー合計が実労働時間を超過したため、<br />
                超過分を自動調整しました<br />
                （一部タスクが0分になります）
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      <Dialog open={confirmingSend} onOpenChange={open => { if (!open) setConfirmingSend(false) }}>
        <DialogContent className="max-w-[280px]" aria-describedby={undefined}>
          <DialogTitle>送信確認</DialogTitle>
          <p className="text-sm text-muted-foreground">0分のタスクが含まれています。本当に送信しますか？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingSend(false)}>キャンセル</Button>
            <Button onClick={() => { setConfirmingSend(false); void send() }}>送信</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
