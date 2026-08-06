import type { Session } from '../../types/session'

interface Props {
  session: Session
}

/** 一覧の展開時に出す、読み取り専用の区間表示。 */
export function SessionIntervals({ session }: Props) {
  if (session.times.length === 0) {
    return (
      <div data-session-intervals className="mt-1 text-[11px] text-muted-foreground">
        時刻の記録がありません
      </div>
    )
  }
  return (
    <div data-session-intervals className="mt-1 flex flex-col gap-0.5">
      {session.times.map((t, i) => (
        <span key={i} className="text-[11px] tabular-nums text-muted-foreground">
          {t.startTime.slice(11, 16)} – {t.endTime ? t.endTime.slice(11, 16) : '稼働中'}
        </span>
      ))}
    </div>
  )
}
