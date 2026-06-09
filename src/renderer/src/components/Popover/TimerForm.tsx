import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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
    <Card className="mx-4 mt-2.5">
      <CardContent className="p-2">
        <form onSubmit={handleSubmit}>
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
      </CardContent>
    </Card>
  )
}
