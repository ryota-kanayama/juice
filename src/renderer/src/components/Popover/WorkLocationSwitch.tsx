import { Button } from '@/components/ui/button'
import type { WorkLocation } from '../../types/session'

interface Props {
  location: WorkLocation
  onSwitch: (loc: WorkLocation) => void
  /** コンテナの className を上書きする（配置先に合わせて調整するため） */
  className?: string
}

const LABEL: Record<WorkLocation, string> = {
  office: '出社',
  telework: 'テレワーク',
}

/** 現在の勤務場所を表示し、反対の場所へ切り替えるボタンを出す。 */
export function WorkLocationSwitch({ location, onSwitch, className }: Props) {
  const next: WorkLocation = location === 'office' ? 'telework' : 'office'
  return (
    <div className={className ?? 'mx-4 mt-2 flex items-center justify-between text-xs text-muted-foreground'}>
      <span>勤務場所: <span className="font-bold text-foreground">{LABEL[location]}</span></span>
      <Button
        variant="ghost"
        className="h-6 px-2 text-xs"
        onClick={() => onSwitch(next)}
      >
        {LABEL[next]}に切替
      </Button>
    </div>
  )
}
