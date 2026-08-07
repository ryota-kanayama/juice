// ノート1バージョンぶんの描画。本文のパースは parseReleaseNotes に任せる。
import { parseReleaseNotes } from '../../releaseNotes/parseReleaseNotes'
import type { ReleaseNoteEntry } from '../../../../shared/types'

export function ReleaseNoteEntryView({ entry }: { entry: ReleaseNoteEntry }) {
  const blocks = parseReleaseNotes(entry.body)

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2 border-b border-border pb-1.5">
        <strong data-testid="release-note-version" className="text-[15px] font-semibold text-[var(--accent)]">
          v{entry.version}
        </strong>
        {entry.date && <span className="text-[12px] text-muted-foreground">{entry.date}</span>}
      </div>

      {blocks.map((block, i) =>
        block.kind === 'paragraph' ? (
          <p key={i} className="my-0 text-[13px] leading-relaxed text-foreground">
            {block.text}
          </p>
        ) : (
          <div key={i} className="flex flex-col gap-2">
            {(block.emoji || block.label) && (
              <h3 className="my-0 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                {block.emoji && (
                  <span
                    aria-hidden="true"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-light)] text-[11px]"
                  >
                    {block.emoji}
                  </span>
                )}
                {block.label}
              </h3>
            )}
            <ul className="my-0 list-none flex flex-col gap-1.5 pl-1">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-foreground">
                  <span aria-hidden="true" className="select-none text-muted-foreground">
                    ・
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </section>
  )
}
