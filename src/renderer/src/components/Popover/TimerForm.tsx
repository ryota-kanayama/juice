import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  onStart: (name: string) => void
}

export function TimerForm({ onStart }: Props) {
  const [name, setName] = useState('')

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (!name.trim()) return
    onStart(name.trim())
    setName('')
  }

  return (
    <form onSubmit={handleSubmit} className="mx-4 mt-2.5 rounded-md border border-border bg-card p-2">
      <div className="flex items-stretch gap-2">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="どんなジュースにしますか？"
          type="text"
          aria-label="ジュースの種類"
          autoFocus
        />
        <Button type="submit" disabled={!name.trim()}>
          注ぐ
        </Button>
      </div>
    </form>
  )
}
