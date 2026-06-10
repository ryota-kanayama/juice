import type { Session } from '../../types/session'
import { useAttendanceReport } from '../../hooks/useAttendanceReport'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Check, Copy, SendDiagonal } from 'iconoir-react'

interface Props {
  sessions: Session[]
}

const actionButton =
  'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border-0 p-[9px] text-[13px] font-semibold text-white transition-all hover:-translate-y-px'

export function AttendanceReport({ sessions }: Props) {
  const { breakMinutes, setBreakMinutes, text, canSend, copied, sending, sendResult, copy, send } =
    useAttendanceReport(sessions)

  return (
    <Card className="flex min-h-0 flex-1 flex-col rounded-xl bg-[var(--glass-bg)] p-3 [backdrop-filter:blur(12px)]">
      <div className="mb-3 flex items-center gap-2">
        <Label htmlFor="break" className="text-xs text-muted-foreground">休憩</Label>
        <Input
          id="break"
          type="number"
          className="h-8 w-14 text-right text-[13px]"
          value={breakMinutes}
          min={0}
          onChange={e => setBreakMinutes(Number(e.target.value))}
        />
        <span className="text-xs text-muted-foreground">分</span>
      </div>

      <pre className="mb-3 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-[8px] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 font-mono text-xs leading-[1.7] text-[var(--text-primary)] [backdrop-filter:blur(8px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{text}</pre>

      <div className="flex shrink-0 gap-2">
        <Button
          className={`flex-1 ${copied ? 'bg-[linear-gradient(135deg,#26de81,#20c870)] text-white' : ''}`}
          onClick={copy}
        >
          {copied ? <><Check width={14} height={14} /> コピーしました</> : <><Copy width={14} height={14} /> コピー</>}
        </Button>
        <button
          className={`${actionButton} disabled:transform-none disabled:cursor-not-allowed disabled:opacity-60 ${
            sendResult === 'success'
              ? 'bg-[linear-gradient(135deg,#26de81,#20c870)]'
              : sendResult === 'error'
                ? 'bg-[linear-gradient(135deg,#ef4444,#dc2626)]'
                : 'bg-[linear-gradient(135deg,#3b82f6,#2563eb)] shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_16px_rgba(59,130,246,0.4)]'
          }`}
          onClick={send}
          disabled={sending || !canSend}
        >
          {sending ? '送信中...' : sendResult === 'success' ? <><Check width={14} height={14} /> 送信しました</> : sendResult === 'error' ? '送信失敗' : <><SendDiagonal width={14} height={14} /> 送る</>}
        </button>
      </div>
    </Card>
  )
}
