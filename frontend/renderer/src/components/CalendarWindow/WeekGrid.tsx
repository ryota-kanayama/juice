import type { Session } from '../../types/session'
import { resolveJuiceColor } from '../../domain/colors'
import { hasReliableTimes } from '../../domain/session'
import { layoutOverlaps, type Span } from '../../domain/overlapLayout'
import { BlockTooltip } from './BlockTooltip'

interface Props {
  /** 日曜〜土曜の7日 "YYYY-MM-DD" */
  dates: string[]
  sessionsByDate: Record<string, Session[]>
  selectedDate: string
  holidays: Record<string, string>
  onSelectDate: (date: string) => void
  /** 帯のチップをダブルクリックしたときに編集を開く */
  onEditSession?: (session: Session) => void
}

/** グリッドの表示範囲（時）と1時間あたりの最小高さ(px)。 */
const START_HOUR = 8
const END_HOUR = 20
const HOUR_PX = 44
const HOUR_COUNT = END_HOUR - START_HOUR
/** グリッドの最小高さ(px)。ウィンドウが高いときはこれを超えて縦に伸びる。 */
const MIN_GRID_PX = HOUR_COUNT * HOUR_PX
/**
 * 短い記録が潰れて見えなくならないよう確保する最小高さ(px 相当)。
 * 作業名の1行（9px・leading-tight ≒ 11.25px）に、上下の padding 4px と
 * 透明ボーダー 2px を足した分が収まる値にする。
 */
const MIN_BLOCK_PX = 18
/** ブロックがこの高さ(px 相当)未満のときは作業名のみ1行で表示する。 */
const COMPACT_BLOCK_PX = 28

/**
 * グリッドは高さを固定せず縦に伸びるため、位置・高さは px ではなくグリッド高さに対する
 * 割合(%)で持つ。px 指定の閾値も最小高さ時点の割合に換算して扱う。
 */
const MIN_BLOCK_PCT = (MIN_BLOCK_PX / MIN_GRID_PX) * 100
const COMPACT_BLOCK_PCT = (COMPACT_BLOCK_PX / MIN_GRID_PX) * 100
const HOUR_PCT = 100 / HOUR_COUNT

/** 端数の長い小数が style 文字列に出ないよう丸めた % 表記にする。 */
function pct(value: number): string {
  return `${Number(value.toFixed(4))}%`
}

const WEEKDAYS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日']

/** "YYYY-MM-DDTHH:mm:ss" を、その日の 0:00 からの経過分に変換する。 */
function minutesOfDay(localDateTime: string): number {
  const time = localDateTime.split('T')[1] ?? '00:00:00'
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

interface Block {
  key: string
  name: string
  color: string
  top: number
  height: number
  label: string
  left: number
  width: number
  minutes: number
  projectCode: string
  workCategory: string
}

/** 1日ぶんの区間を、グリッド座標のブロックに変換する（範囲外はクリップ、稼働中は除外）。 */
function toBlocks(sessions: Session[]): Block[] {
  // 先にクリップ済みの区間を集め、重なりの配置をまとめて計算する
  const clipped: {
    key: string
    name: string
    color: string
    label: string
    span: Span
    minutes: number
    projectCode: string
    workCategory: string
  }[] = []
  for (const s of sessions) {
    s.times.forEach((t, i) => {
      if (!t.endTime) return
      const startMin = minutesOfDay(t.startTime)
      const endMin = minutesOfDay(t.endTime)
      const clippedStart = Math.max(startMin, START_HOUR * 60)
      const clippedEnd = Math.min(endMin, END_HOUR * 60)
      if (clippedEnd <= clippedStart) return
      clipped.push({
        key: `${s.id}-${i}`,
        name: s.name,
        color: resolveJuiceColor(s.color),
        // ツールチップは「実際に記録された内容」を伝えるものなので、グリッドの表示範囲で
        // 切り詰めたクリップ後の値ではなく、記録そのものの時刻・長さ（クリップ前）を使う
        label: `${t.startTime.split('T')[1].slice(0, 5)}–${t.endTime.split('T')[1].slice(0, 5)}`,
        span: { start: clippedStart, end: clippedEnd },
        minutes: Math.max(1, endMin - startMin),
        projectCode: s.projectCode,
        workCategory: s.workCategory,
      })
    })
  }

  const placements = layoutOverlaps(clipped.map(c => c.span))

  return clipped.map((c, i) => {
    const top = ((c.span.start - START_HOUR * 60) / (HOUR_COUNT * 60)) * 100
    const rawHeight = ((c.span.end - c.span.start) / (HOUR_COUNT * 60)) * 100
    // 短い記録でも視認できるよう最小高さを確保する。ただしグリッド最下部を超えないようクランプする
    const height = Math.min(Math.max(rawHeight, MIN_BLOCK_PCT), 100 - top)
    return {
      key: c.key,
      name: c.name,
      color: c.color,
      label: c.label,
      top,
      height,
      left: placements[i].left,
      width: placements[i].width,
      minutes: c.minutes,
      projectCode: c.projectCode,
      workCategory: c.workCategory,
    }
  })
}

export function WeekGrid({ dates, sessionsByDate, selectedDate, holidays, onSelectDate, onEditSession }: Props) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const cols = `44px repeat(7, minmax(0, 1fr))`

  // 時刻を信用できない記録（区間なし／合計が totalTime と食い違う）は帯にまとめる
  const untimedByDate: Record<string, Session[]> = {}
  let untimedCount = 0
  for (const date of dates) {
    const list = (sessionsByDate[date] ?? []).filter(s => !hasReliableTimes(s))
    untimedByDate[date] = list
    untimedCount += list.length
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* 曜日ヘッダー */}
      <div
        className="sticky top-0 z-10 grid shrink-0 rounded-t-[6px] border border-b-0 border-[var(--glass-border)] bg-card"
        style={{ gridTemplateColumns: cols }}
      >
        <div className="border-r border-[var(--glass-border)]" />
        {dates.map((date, i) => {
          const day = Number(date.slice(8, 10))
          const month = Number(date.slice(5, 7))
          const isSelected = date === selectedDate
          const isHoliday = date in holidays
          const color = (i === 0 || isHoliday) ? 'text-[#e74c3c]' : i === 6 ? 'text-[#3498db]' : 'text-[var(--text-muted)]'
          return (
            <button
              key={date}
              className={`cursor-pointer border-0 border-r border-[var(--glass-border)] py-1.5 text-center text-[11px] transition-colors last:border-r-0 ${isSelected ? 'bg-[var(--accent-light)] font-bold' : 'bg-transparent hover:bg-[var(--bg-hover)]'} ${color}`}
              onClick={() => onSelectDate(date)}
              aria-label={`${month}月${day}日 ${WEEKDAYS[i]}`}
              aria-pressed={isSelected}
            >
              {WEEKDAYS[i].charAt(0)} {day}
            </button>
          )
        })}
      </div>

      {/* 時刻なし帯。該当が無い週では描かない */}
      {untimedCount > 0 && (
        <div
          data-untimed-row
          className="grid shrink-0 border-x border-b border-[var(--glass-border)] bg-[var(--glass-bg)]"
          style={{ gridTemplateColumns: cols }}
        >
          <div className="flex items-center justify-end border-r border-[var(--glass-border)] pr-1 text-[9px] text-[var(--text-muted)]">
            時刻なし
          </div>
          {dates.map(date => (
            <div
              key={date}
              className="flex min-h-[22px] flex-col gap-px border-r border-[var(--glass-border)] p-px last:border-r-0"
              onClick={() => onSelectDate(date)}
            >
              {untimedByDate[date].map(s => (
                <BlockTooltip
                  key={s.id}
                  name={s.name}
                  minutes={s.totalTime}
                  projectCode={s.projectCode}
                  workCategory={s.workCategory}
                >
                  <div
                    data-untimed-chip
                    className="cursor-pointer truncate rounded-[3px] px-1 text-[9px] leading-[1.5] text-white"
                    style={{ background: resolveJuiceColor(s.color) }}
                    onDoubleClick={() => onEditSession?.(s)}
                  >
                    {s.name}
                  </div>
                </BlockTooltip>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 時間軸グリッド。高さは固定せず、余った縦幅いっぱいまで伸ばす（最低 MIN_GRID_PX） */}
      <div
        data-time-grid
        className="grid min-h-0 flex-1 rounded-b-[6px] border border-[var(--glass-border)]"
        style={{ gridTemplateColumns: cols, gridTemplateRows: '1fr', minHeight: `${MIN_GRID_PX}px` }}
      >
        {/* 時刻ガター */}
        <div className="relative border-r border-[var(--glass-border)]">
          {hours.slice(1).map((h, i) => (
            <span
              key={h}
              className="absolute right-1 -translate-y-1/2 text-[9px] text-[var(--text-muted)]"
              style={{ top: pct((i + 1) * HOUR_PCT) }}
            >{h}:00</span>
          ))}
        </div>

        {dates.map((date, i) => {
          const isSelected = date === selectedDate
          const isHoliday = date in holidays
          const tint = (i === 0 || isHoliday)
            ? 'rgba(231,76,60,.04)'
            : i === 6
              ? 'rgba(52,152,219,.04)'
              : 'transparent'
          return (
            <div
              key={date}
              className="relative border-r border-[var(--glass-border)] last:border-r-0"
              style={{
                // 選択列は記録ブロックの視認性を邪魔しない程度にごく薄く敷く（列全体を強い色で塗らない）
                // 時間の横罫線もグリッド高さ基準の割合で引き、縦に伸びても1時間ごとに保たれる
                background: `${isSelected ? 'color-mix(in srgb, var(--accent-light) 35%, transparent)' : tint} repeating-linear-gradient(to bottom, transparent 0, transparent calc(${pct(HOUR_PCT)} - 1px), var(--glass-border) calc(${pct(HOUR_PCT)} - 1px), var(--glass-border) ${pct(HOUR_PCT)})`,
              }}
              {...(isSelected ? { 'data-selected': date } : {})}
            >
              {toBlocks((sessionsByDate[date] ?? []).filter(hasReliableTimes)).map(b => (
                <BlockTooltip
                  key={b.key}
                  name={b.name}
                  timeRange={b.label.replace('–', ' – ')}
                  minutes={b.minutes}
                  projectCode={b.projectCode}
                  workCategory={b.workCategory}
                >
                  <div
                    data-event-block
                    className="absolute overflow-hidden rounded-[3px] py-0.5 pl-1 pr-1.5 text-[9px] leading-tight text-white shadow-sm"
                    style={{
                      top: pct(b.top),
                      height: pct(b.height),
                      left: pct(b.left),
                      width: pct(b.width),
                      // 隣のブロックと接して見えないよう、透明ボーダーで内側に寄せる。
                      // 縦は 1時間がグリッド高さの 1/12 しかなく、短い記録が潰れるため左右より薄くする
                      borderLeft: '2px solid transparent',
                      borderRight: '2px solid transparent',
                      borderTop: '1px solid transparent',
                      borderBottom: '1px solid transparent',
                      background: b.color,
                      backgroundClip: 'padding-box',
                    }}
                  >
                    <div className="truncate font-semibold">{b.name}</div>
                    {b.height >= COMPACT_BLOCK_PCT && <div className="truncate opacity-85">{b.label}</div>}
                  </div>
                </BlockTooltip>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
