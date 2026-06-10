import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { formatTimeFromDate } from '../../../../shared/sessionUtils'

interface Props {
  /** "YYYY-MM-DD" */
  date: string
  onStart: (time: string, telework: boolean) => void
  onTeleworkStart: () => void
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function formatJaDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  return `${y}年${m}月${d}日(${weekday})`
}

export function WorkStartOverlay({ date, onStart, onTeleworkStart }: Props) {
  const [time, setTime] = useState(() => formatTimeFromDate(new Date()))
  const [telework, setTelework] = useState(false)

  const handleStart = (): void => {
    onStart(time, telework)
    if (telework) onTeleworkStart()
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
      <span className="text-xs text-muted-foreground">{formatJaDate(date)}</span>
      <span className="text-base font-bold text-foreground">🧃 今日の業務を開始</span>
      <Input
        type="time"
        aria-label="業務開始時刻"
        className="h-11 w-32 text-center text-xl"
        value={time}
        onChange={e => setTime(e.target.value)}
      />
      <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-foreground">
        <Switch checked={telework} onCheckedChange={setTelework} aria-label="在宅" />
        在宅
      </label>
      <Button className="px-8" onClick={handleStart}>業務開始</Button>
    </div>
  )
}
