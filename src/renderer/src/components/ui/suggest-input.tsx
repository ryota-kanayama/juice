import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface SuggestOption {
  value: string
  sub?: string
}

interface SuggestInputProps extends React.ComponentProps<'input'> {
  options: SuggestOption[]
  /** 候補リストから明示的に選択したときだけ呼ばれる */
  onSelectOption: (option: SuggestOption) => void
  /** ドロップダウンの開閉状態が変わったときに呼ばれる */
  onOpenChange?: (open: boolean) => void
  /** true のとき候補リストを上方向に開く */
  dropUp?: boolean
}

const MAX_OPTIONS = 8

export function SuggestInput({ options, onSelectOption, onOpenChange, dropUp, onKeyDown, onFocus, onBlur, onChange, ...props }: SuggestInputProps) {
  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState(-1)

  const query = String(props.value ?? '').trim().toLowerCase()
  const filtered = options
    .filter(o => o.value.toLowerCase().includes(query))
    .slice(0, MAX_OPTIONS)

  // Fix 2: filtered の範囲外を指さないようにする
  const safeHighlight = highlight < filtered.length ? highlight : -1

  // 可視状態（open && filtered.length > 0）の変化を外部通知する
  const onOpenChangeRef = React.useRef(onOpenChange)
  React.useEffect(() => { onOpenChangeRef.current = onOpenChange })
  const visible = open && filtered.length > 0
  const visibleRef = React.useRef(false)
  React.useEffect(() => {
    visibleRef.current = visible
    onOpenChangeRef.current?.(visible)
  }, [visible])
  // unmount 時に開いたままなら閉を通知する（呼び出し元の開数カウンタの残留防止）
  React.useEffect(() => () => {
    if (visibleRef.current) onOpenChangeRef.current?.(false)
  }, [])

  const select = (option: SuggestOption): void => {
    onSelectOption(option)
    setOpen(false)
    setHighlight(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    // Fix 1: IME 変換中のキー操作には反応しない
    if (e.nativeEvent.isComposing || e.keyCode === 229) return

    if (open && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        // Fix 2: 移動の起点を safeHighlight にする
        setHighlight((safeHighlight + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        // Fix 2: 移動の起点を safeHighlight にする
        setHighlight(safeHighlight <= 0 ? filtered.length - 1 : safeHighlight - 1)
        return
      }
      // Fix 2: highlight < filtered.length も確認
      if (e.key === 'Enter' && safeHighlight >= 0 && safeHighlight < filtered.length) {
        e.preventDefault()
        select(filtered[safeHighlight])
        return
      }
      if (e.key === 'Escape') {
        setOpen(false)
        setHighlight(-1)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative w-full min-w-0">
      <Input
        {...props}
        autoComplete="off"
        onFocus={e => { setOpen(true); onFocus?.(e) }}
        onBlur={e => { setOpen(false); setHighlight(-1); onBlur?.(e) }}
        onChange={e => { setOpen(true); setHighlight(-1); onChange?.(e) }}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className={cn(
            'absolute left-0 right-0 z-50 m-0 list-none max-h-60 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-[var(--shadow-elevated)]',
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          )}
        >
          {filtered.map((option, i) => (
            <li
              // Fix 3: value 重複時の key 衝突を防ぐ
              key={`${option.value} ${option.sub ?? ''}`}
              role="option"
              aria-selected={i === safeHighlight}
              className={cn(
                'cursor-pointer rounded-[6px] px-2 py-1 text-[13px]',
                i === safeHighlight ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-foreground'
              )}
              onMouseDown={e => { e.preventDefault(); select(option) }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{option.value}</span>
              {option.sub && (
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted-foreground">
                  {option.sub}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
