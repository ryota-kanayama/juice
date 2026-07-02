import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { SuggestInput } from '@/components/ui/suggest-input'
import type { Suggestions } from '../../domain/suggestions'

export interface SessionFormValues {
  name: string
  projectCode: string
  workCategory: string
  totalTime: string
}

interface Props {
  open: boolean
  title: string
  submitLabel: string
  values: SessionFormValues
  suggestions: Suggestions
  onChange: (values: SessionFormValues) => void
  onSubmit: () => void
  onClose: () => void
}

/** セッションの追加・編集で共用するフォームダイアログ */
export function SessionFormDialog({ open, title, submitLabel, values, suggestions, onChange, onSubmit, onClose }: Props) {
  // ダイアログ内のドロップダウン開数。Escape でダイアログごと閉じないための判定に使う
  const [suggestOpenCount, setSuggestOpenCount] = useState(0)
  const handleSuggestOpenChange = (open: boolean): void => {
    setSuggestOpenCount(c => (open ? c + 1 : Math.max(0, c - 1)))
  }

  const canSubmit = Boolean(values.name.trim() && values.totalTime)
  const handleEnter = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && canSubmit) onSubmit()
  }

  const nameOptions = suggestions.names.map(s => ({
    value: s.name,
    sub: [s.projectCode, s.workCategory].filter(Boolean).join(' / ') || undefined,
  }))
  const projectCodeOptions = suggestions.projectCodes.map(v => ({ value: v }))
  const workCategoryOptions = suggestions.workCategories.map(v => ({ value: v }))

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent
        aria-describedby={undefined}
        onEscapeKeyDown={e => { if (suggestOpenCount > 0) e.preventDefault() }}
      >
        <DialogTitle>{title}</DialogTitle>
        <div className="flex flex-col gap-2">
          <SuggestInput
            placeholder="作業名（必須）"
            value={values.name}
            onChange={e => onChange({ ...values, name: e.target.value })}
            options={nameOptions}
            onSelectOption={o => {
              const meta = suggestions.names.find(n => n.name === o.value)
              onChange({
                ...values,
                name: o.value,
                projectCode: meta ? meta.projectCode : values.projectCode,
                workCategory: meta ? meta.workCategory : values.workCategory,
              })
            }}
            onOpenChange={handleSuggestOpenChange}
            onKeyDown={handleEnter}
            autoFocus
          />
          <div className="flex gap-2">
            <SuggestInput
              className="text-xs"
              placeholder="PJコード"
              value={values.projectCode}
              onChange={e => onChange({ ...values, projectCode: e.target.value })}
              options={projectCodeOptions}
              onSelectOption={o => onChange({ ...values, projectCode: o.value })}
              onOpenChange={handleSuggestOpenChange}
              onKeyDown={handleEnter}
            />
            <SuggestInput
              className="text-xs"
              placeholder="作業区分"
              value={values.workCategory}
              onChange={e => onChange({ ...values, workCategory: e.target.value })}
              options={workCategoryOptions}
              onSelectOption={o => onChange({ ...values, workCategory: o.value })}
              onOpenChange={handleSuggestOpenChange}
              onKeyDown={handleEnter}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">時間</span>
            <Input
              type="number"
              min="1"
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              placeholder="分"
              value={values.totalTime}
              onChange={e => onChange({ ...values, totalTime: e.target.value })}
              onKeyDown={handleEnter}
            />
            <span className="text-xs text-muted-foreground">分</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={onSubmit} disabled={!canSubmit}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
