import { Xmark, Plus } from 'iconoir-react'
import { TimeField } from '@/components/ui/time-field'
import { Button } from '@/components/ui/button'
import { type IntervalDraft, draftMinutes } from '../../domain/intervalDraft'

interface Props {
  intervals: IntervalDraft[]
  onChange: (next: IntervalDraft[]) => void
}

/** 合計分を「90分」「1時間30分」のように整形する。 */
function formatMinutes(total: number): string {
  return `${total}分`
}

/** セッションの作業区間を並べて編集させる入力。時刻は "HH:mm" で扱う。 */
export function SessionIntervalList({ intervals, onChange }: Props) {
  const updateAt = (index: number, patch: Partial<IntervalDraft>): void => {
    onChange(intervals.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }
  const removeAt = (index: number): void => {
    onChange(intervals.filter((_, i) => i !== index))
  }
  const addRow = (): void => {
    onChange([...intervals, { start: '', end: '', running: false }])
  }

  // 削除できるのは行が2つ以上あるときだけ（最後の1行は残す）。稼働中の行は削除させない。
  const canRemove = intervals.length > 1

  return (
    <div className="flex flex-col gap-1.5">
      {intervals.map((d, i) => (
        <div key={i} data-interval-row className="flex items-center gap-1.5 text-[13px]">
          <TimeField
            value={d.start}
            onChange={next => updateAt(i, { start: next })}
            aria-label="開始時刻"
          />
          <span className="text-muted-foreground">–</span>
          {d.running ? (
            <span className="text-[12px] text-[var(--accent)]">稼働中</span>
          ) : (
            <TimeField
              value={d.end}
              onChange={next => updateAt(i, { end: next })}
              aria-label="終了時刻"
            />
          )}
          <span className="flex-1" />
          {!d.running && canRemove && (
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-1 text-muted-foreground transition-colors hover:text-[var(--accent)]"
              onClick={() => removeAt(i)}
              aria-label="区間を削除"
            >
              <Xmark width={13} height={13} />
            </button>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[12px]" onClick={addRow}>
          <Plus width={13} height={13} /> 区間を追加
        </Button>
        <span className="flex-1" />
        <span className="text-[12px] text-muted-foreground">
          合計: {formatMinutes(draftMinutes(intervals))}
        </span>
      </div>
    </div>
  )
}
