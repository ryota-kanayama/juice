import { useState, useEffect, useRef } from 'react'
import type { Session } from '../../types/session'
import { useAttendanceReport } from '../../hooks/useAttendanceReport'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Check, Copy, SendDiagonal, WarningTriangle } from 'iconoir-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

interface Props {
  sessions: Session[]
  today: string
}

const actionButton =
  'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border-0 p-[9px] text-[13px] font-semibold text-white transition-all hover:-translate-y-px'

export function AttendanceReport({ sessions, today }: Props) {
  const { breakMinutes, setBreakMinutes, text, overageMinutes, canSend, copied, sending, sendResult, copy, send } =
    useAttendanceReport(sessions, today)

  // 入力フィールドはローカル文字列 state で管理し、blur / Enter で確定する。
  // これにより途中入力（"4" → "45"）でカーソルが飛んだり値がリセットされるのを防ぐ。
  const [inputValue, setInputValue] = useState(String(breakMinutes))
  const inputFocusedRef = useRef(false)

  // 外部（自動計算）から breakMinutes が変わったときだけ inputValue に反映する
  useEffect(() => {
    if (!inputFocusedRef.current) {
      setInputValue(String(breakMinutes))
    }
  }, [breakMinutes])

  function commitInput(raw: string): void {
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n >= 0) {
      setBreakMinutes(n)
      setInputValue(String(n))
    } else {
      setInputValue(String(breakMinutes))
    }
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col rounded-xl bg-[var(--glass-bg)] p-3 [backdrop-filter:blur(12px)]">
      <div className="mb-3 flex items-center gap-2">
        <Label htmlFor="break" className="text-xs text-muted-foreground">休憩</Label>
        <Input
          id="break"
          type="text"
          inputMode="numeric"
          className="h-8 w-14 text-right text-[13px]"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onFocus={() => { inputFocusedRef.current = true }}
          onBlur={() => {
            inputFocusedRef.current = false
            commitInput(inputValue)
          }}
          onKeyDown={e => { if (e.key === 'Enter') commitInput(inputValue) }}
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
