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
}

const MAX_OPTIONS = 8

export function SuggestInput({ options, onSelectOption, onKeyDown, onFocus, onBlur, onChange, ...props }: SuggestInputProps) {
  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState(-1)

  const query = String(props.value ?? '').trim().toLowerCase()
  const filtered = options
    .filter(o => o.value.toLowerCase().includes(query))
    .slice(0, MAX_OPTIONS)

  const select = (option: SuggestOption): void => {
    onSelectOption(option)
    setOpen(false)
    setHighlight(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (open && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight(h => (h + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight(h => (h <= 0 ? filtered.length - 1 : h - 1))
        return
      }
      if (e.key === 'Enter' && highlight >= 0) {
        e.preventDefault()
        select(filtered[highlight])
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
          className="absolute left-0 right-0 top-full z-50 m-0 mt-1 list-none overflow-hidden rounded-md border border-border bg-card p-1 shadow-[var(--shadow-elevated)]"
        >
          {filtered.map((option, i) => (
            <li
              key={option.value}
              role="option"
              aria-selected={i === highlight}
              className={cn(
                'cursor-pointer rounded-[6px] px-2 py-1 text-[13px]',
                i === highlight ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-foreground'
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
