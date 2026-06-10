import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

interface TimeFieldProps {
  value: string                    // "HH:mm"
  onChange: (next: string) => void
  'aria-label'?: string
  autoFocus?: boolean
  className?: string
}

function splitValue(v: string): [string, string] {
  const [h = '00', m = '00'] = v.split(':')
  return [h.padStart(2, '0').slice(0, 2), m.padStart(2, '0').slice(0, 2)]
}

const pad = (n: number): string => String(n).padStart(2, '0')
const wrap = (n: number, max: number): number => ((n % max) + max) % max

const segCls =
  'w-[2.6ch] rounded-[5px] py-0.5 bg-transparent text-center outline-none tabular-nums [font-size:inherit] selection:bg-transparent selection:text-white focus:bg-[var(--accent)] focus:text-white'

export function TimeField({
  value,
  onChange,
  autoFocus,
  className,
  'aria-label': ariaLabel,
}: TimeFieldProps) {
  const init = splitValue(value)
  // h/m は JSX の value に渡すため state。hRef/mRef はその「鏡」で、
  // 同一レンダー周期内に時→分を連続変更したとき emit が最新値を参照できるようにする
  // （state はバッチ更新でクロージャが古いままになるため）。setH/setM とは必ずペアで更新する。
  const [h, setH] = useState(init[0])
  const [m, setM] = useState(init[1])
  const hRef = useRef(init[0])
  const mRef = useRef(init[1])
  const hourRef = useRef<HTMLInputElement>(null)
  const minRef = useRef<HTMLInputElement>(null)
  const lastEmitted = useRef(value)

  // 外部から value が変わった場合のみ同期（自分の emit では同期しない）
  useEffect(() => {
    if (value !== lastEmitted.current) {
      const [nh, nm] = splitValue(value)
      setH(nh); hRef.current = nh
      setM(nm); mRef.current = nm
      lastEmitted.current = value
    }
  }, [value])

  useEffect(() => {
    if (autoFocus) hourRef.current?.focus()
  }, [autoFocus])

  const emit = (nh: string, nm: string): void => {
    const out = `${pad(parseInt(nh || '0', 10))}:${pad(parseInt(nm || '0', 10))}`
    lastEmitted.current = out
    onChange(out)
  }

  const handleHour = (raw: string): void => {
    const digits = raw.replace(/\D/g, '').slice(-2)
    if (digits === '') {
      setH(''); hRef.current = ''
      emit('0', mRef.current)
      return
    }
    if (digits.length === 2) {
      const n = parseInt(digits, 10)
      if (n > 23) {
        const last = digits.slice(-1)
        setH(last); hRef.current = last
        emit(last, mRef.current)
        return
      }
      setH(digits); hRef.current = digits
      emit(digits, mRef.current)
      minRef.current?.focus()
      return
    }
    setH(digits); hRef.current = digits
    emit(digits, mRef.current)
    if (parseInt(digits, 10) >= 3) minRef.current?.focus()
  }

  const handleMinute = (raw: string): void => {
    const digits = raw.replace(/\D/g, '').slice(-2)
    if (digits === '') {
      setM(''); mRef.current = ''
      emit(hRef.current, '0')
      return
    }
    if (digits.length === 2) {
      const n = parseInt(digits, 10)
      if (n > 59) {
        const last = digits.slice(-1)
        setM(last); mRef.current = last
        emit(hRef.current, last)
        return
      }
      setM(digits); mRef.current = digits
      emit(hRef.current, digits)
      return
    }
    setM(digits); mRef.current = digits
    emit(hRef.current, digits)
  }

  const step = (which: 'h' | 'm', dir: 1 | -1): void => {
    if (which === 'h') {
      const nx = pad(wrap(parseInt(hRef.current || '0', 10) + dir, 24))
      setH(nx); hRef.current = nx
      emit(nx, mRef.current)
    } else {
      const nx = pad(wrap(parseInt(mRef.current || '0', 10) + dir, 60))
      setM(nx); mRef.current = nx
      emit(hRef.current, nx)
    }
  }

  const hourKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowUp') { e.preventDefault(); step('h', 1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step('h', -1) }
    else if (e.key === 'ArrowRight' || e.key === ':') { e.preventDefault(); minRef.current?.focus() }
  }

  const minKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowUp') { e.preventDefault(); step('m', 1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step('m', -1) }
    else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
      e.preventDefault()
      hourRef.current?.focus()
    }
  }

  const normalize = (): void => {
    const nh = pad(parseInt(hRef.current || '0', 10))
    const nm = pad(parseInt(mRef.current || '0', 10))
    setH(nh); hRef.current = nh
    setM(nm); mRef.current = nm
    // emit はキー入力ごとに発行済みだが、空欄からの blur 等で親と表示がずれないよう保証する
    if (`${nh}:${nm}` !== lastEmitted.current) emit(nh, nm)
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center rounded-md border border-input bg-transparent px-3 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring',
        className
      )}
    >
      <input
        ref={hourRef}
        aria-label="時"
        inputMode="numeric"
        maxLength={2}
        value={h}
        onChange={e => handleHour(e.target.value)}
        onKeyDown={hourKey}
        onFocus={e => e.target.select()}
        onBlur={normalize}
        className={segCls}
      />
      <span className="px-0.5 text-muted-foreground">:</span>
      <input
        ref={minRef}
        aria-label="分"
        inputMode="numeric"
        maxLength={2}
        value={m}
        onChange={e => handleMinute(e.target.value)}
        onKeyDown={minKey}
        onFocus={e => e.target.select()}
        onBlur={normalize}
        className={segCls}
      />
    </div>
  )
}
