import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useWeeklyAnalysis } from '../../hooks/useWeeklyAnalysis'

interface Props {
  date: string | null
  onClose: () => void
}

function fmt(value: number | null, suffix = ''): string {
  if (value === null) return '—'
  return `${value}${suffix}`
}

export function WeeklyAnalysisModal({ date, onClose }: Props) {
  const { analysis, loading } = useWeeklyAnalysis(date)

  return (
    <Dialog open={date !== null} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-[560px]" aria-describedby={undefined}>
        <DialogTitle className="text-[14px] font-bold">
          週次分析{analysis ? ` — ${analysis.weekLabel}` : ''}
        </DialogTitle>

        {loading || !analysis ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">読み込み中…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className="py-1.5 pr-3 text-left text-[11px] font-medium text-muted-foreground"></th>
                  {analysis.days.map(d => (
                    <th key={d.date} className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
                      {d.dayLabel}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">週平均</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-3 text-[11px] text-muted-foreground whitespace-nowrap">所定稼働時間 (m)</td>
                  {analysis.days.map(d => (
                    <td key={d.date} className="px-2 py-2 text-center tabular-nums">{d.scheduledMinutes}</td>
                  ))}
                  <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 text-[11px] text-muted-foreground whitespace-nowrap">実稼働時間 (m)</td>
                  {analysis.days.map(d => (
                    <td key={d.date} className="px-2 py-2 text-center tabular-nums">{fmt(d.actualMinutes)}</td>
                  ))}
                  <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 text-[11px] text-muted-foreground whitespace-nowrap">PJ外作業 (m)</td>
                  {analysis.days.map(d => (
                    <td key={d.date} className="px-2 py-2 text-center tabular-nums">{d.nonProjectMinutes}</td>
                  ))}
                  <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 text-[11px] text-muted-foreground whitespace-nowrap">想定外作業 (m)</td>
                  {analysis.days.map(d => (
                    <td key={d.date} className="px-2 py-2 text-center tabular-nums">{d.unexpectedMinutes}</td>
                  ))}
                  <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                </tr>
                <tr className="font-semibold">
                  <td className="py-2 pr-3 text-[11px] text-foreground whitespace-nowrap">稼働率</td>
                  {analysis.days.map(d => (
                    <td key={d.date} className="px-2 py-2 text-center tabular-nums text-[var(--accent)]">
                      {fmt(d.utilizationRate, '%')}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center tabular-nums text-[var(--accent)]">
                    {fmt(analysis.weeklyAvgUtilization, '%')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
