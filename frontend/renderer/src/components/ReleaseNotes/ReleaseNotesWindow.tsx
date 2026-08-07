// リリースノートの独立ウィンドウ。
//   mode="current" … 更新後。同梱 CHANGELOG から範囲ルールで選ばれた節
//   mode="pending" … 更新前。GitHub から取得済みの本文
// 中身を描画できた時点で「見た」を記録する（current のみ）。閉じるイベントに依存しない。
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { releaseNotesRepository } from '../../repositories/releaseNotesRepository'
import { ReleaseNoteEntryView } from './ReleaseNoteEntryView'
import type { ReleaseNoteEntry } from '../../../../shared/types'

export function ReleaseNotesWindow({ mode }: { mode: 'current' | 'pending' }) {
  const [entries, setEntries] = useState<ReleaseNoteEntry[] | null>(null)

  useEffect(() => {
    let alive = true
    const load = mode === 'pending'
      ? releaseNotesRepository.getPending()
      : releaseNotesRepository.getCurrent()
    load
      .then(list => {
        if (!alive) return
        setEntries(list)
        // 実際に中身が出たときだけ記録する。空のまま記録すると次から出せなくなる
        if (mode === 'current' && list.length > 0) {
          releaseNotesRepository.markSeen().catch(console.error)
        }
      })
      .catch(err => {
        console.error('リリースノートの取得に失敗しました:', err)
        if (alive) setEntries([])
      })
    return () => { alive = false }
  }, [mode])

  const title = mode === 'pending' ? '次の更新の変更点' : 'Juice が新しくなりました'

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="shrink-0 border-b border-border px-5 py-3">
        <h1 className="text-[15px] font-semibold text-foreground">{title}</h1>
      </header>

      <main className="flex flex-1 flex-col gap-7 overflow-y-auto px-5 py-4">
        {entries === null ? null : entries.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">表示できる変更点がありません</p>
        ) : (
          entries.map(entry => <ReleaseNoteEntryView key={entry.version} entry={entry} />)
        )}
      </main>

      <footer className="flex shrink-0 justify-end border-t border-border px-5 py-3">
        <Button
          variant="outline"
          onClick={() => { releaseNotesRepository.close().catch(console.error) }}
        >
          閉じる
        </Button>
      </footer>
    </div>
  )
}
