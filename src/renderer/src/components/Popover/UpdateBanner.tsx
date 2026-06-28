// src/renderer/src/components/Popover/UpdateBanner.tsx
import type { UpdateState } from '../../hooks/useUpdate'

interface Props {
  update: UpdateState
}

/** ポップオーバー上部のアップデート通知バナー。状態に応じて文言・操作が変わる */
export function UpdateBanner({ update }: Props) {
  const { phase, info, percent, restart, download, dismiss } = update
  if (phase === 'idle' || phase === 'error' || !info) return null

  const bar = 'flex items-center justify-between gap-2 px-3 py-2 text-[12px] [-webkit-app-region:no-drag]'

  if (phase === 'available') {
    return (
      <div className={`${bar} bg-[var(--accent-light)] text-[var(--accent)]`}>
        <span>新しいバージョン v{info.latestVersion} があります</span>
        <span className="flex items-center gap-2">
          <button className="font-semibold underline" onClick={download}>更新</button>
          <button aria-label="閉じる" onClick={dismiss}>✕</button>
        </span>
      </div>
    )
  }

  if (phase === 'downloading') {
    return (
      <div className={`${bar} bg-[var(--accent-light)] text-[var(--accent)]`}>
        <span>ダウンロード中… {percent}%</span>
        <button className="opacity-50" disabled>更新</button>
      </div>
    )
  }

  // opened / installed: 再起動を促す
  const message =
    phase === 'installed'
      ? '新バージョンがインストールされました'
      : 'Applications にドラッグして置き換え、完了したら再起動してください'
  return (
    <div className={`${bar} bg-[var(--accent-light)] text-[var(--accent)]`}>
      <span>{message}</span>
      <button
        className={phase === 'installed' ? 'font-bold underline' : 'font-semibold underline'}
        onClick={restart}
      >
        再起動
      </button>
    </div>
  )
}
