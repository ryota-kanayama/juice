import { useState } from 'react'
import { SuggestInput } from '@/components/ui/suggest-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { NameSuggestion } from '../../domain/suggestions'

interface Props {
  onStart: (name: string, projectCode?: string, workCategory?: string) => void
  nameSuggestions?: NameSuggestion[]
}

export function TimerForm({ onStart, nameSuggestions = [] }: Props) {
  const [name, setName] = useState('')
  // 候補から明示的に選択した場合のみ PJコード・作業区分を引き継ぐ
  const [selected, setSelected] = useState<NameSuggestion | null>(null)

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (!name.trim()) return
    onStart(name.trim(), selected?.projectCode, selected?.workCategory)
    setName('')
    setSelected(null)
  }

  const options = nameSuggestions.map(s => ({
    value: s.name,
    sub: [s.projectCode, s.workCategory].filter(Boolean).join(' / ') || undefined,
  }))

  return (
    <Card className="mx-4 mt-2.5">
      <CardContent className="p-2">
        <form onSubmit={handleSubmit}>
          <div className="flex items-stretch gap-2">
            <SuggestInput
              value={name}
              onChange={e => { setName(e.target.value); setSelected(null) }}
              options={options}
              onSelectOption={option => {
                setName(option.value)
                setSelected(nameSuggestions.find(s => s.name === option.value) ?? null)
              }}
              placeholder="どんなジュースにしますか？"
              type="text"
              aria-label="ジュースの種類"
              className="min-w-0 px-2.5 text-[13px]"
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
