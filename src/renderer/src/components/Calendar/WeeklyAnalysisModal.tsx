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
      <DialogContent className="w-[296px]" aria-describedby={undefined}>
        <DialogTitle className="text-[13px] font-bold">
          週次分析{analysis ? ` — ${analysis.weekLabel}` : ''}
        </DialogTitle>

        {loading || !analysis ? (
          <p className="py-4 text-center text-[12px] text-muted-foreground">読み込み中…</p>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="pb-1.5 pr-2 text-left text-[10px] font-medium text-muted-foreground"></th>
                {analysis.days.map(d => (
                  <th key={d.date} className="px-1 pb-1.5 text-center text-[10px] font-medium text-muted-foreground">
                    {d.dayLabel}
                  </th>
                ))}
                <th className="px-1 pb-1.5 text-center text-[10px] font-medium text-muted-foreground">週平均</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-1.5 pr-2 text-[10px] text-muted-foreground whitespace-nowrap">所定 (m)</td>
                {analysis.days.map(d => (
                  <td key={d.date} className="px-1 py-1.5 text-center tabular-nums">{d.scheduledMinutes}</td>
                ))}
                <td className="px-1 py-1.5 text-center text-muted-foreground">—</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-2 text-[10px] text-muted-foreground whitespace-nowrap">実稼働 (m)</td>
                {analysis.days.map(d => (
                  <td key={d.date} className="px-1 py-1.5 text-center tabular-nums">{fmt(d.actualMinutes)}</td>
                ))}
                <td className="px-1 py-1.5 text-center text-muted-foreground">—</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-2 text-[10px] text-muted-foreground whitespace-nowrap">PJ外 (m)</td>
                {analysis.days.map(d => (
                  <td key={d.date} className="px-1 py-1.5 text-center tabular-nums">{d.nonProjectMinutes}</td>
                ))}
                <td className="px-1 py-1.5 text-center text-muted-foreground">—</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-2 text-[10px] text-muted-foreground whitespace-nowrap">想定外 (m)</td>
                {analysis.days.map(d => (
                  <td key={d.date} className="px-1 py-1.5 text-center tabular-nums">{d.unexpectedMinutes}</td>
                ))}
                <td className="px-1 py-1.5 text-center text-muted-foreground">—</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-1.5 pr-2 text-[10px] text-foreground whitespace-nowrap">稼働率</td>
                {analysis.days.map(d => (
                  <td key={d.date} className="px-1 py-1.5 text-center tabular-nums text-[var(--accent)]">
                    {fmt(d.utilizationRate, '%')}
                  </td>
                ))}
                <td className="px-1 py-1.5 text-center tabular-nums text-[var(--accent)]">
                  {fmt(analysis.weeklyAvgUtilization, '%')}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  )
}
