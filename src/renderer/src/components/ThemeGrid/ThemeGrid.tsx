import type { ThemeMeta } from '../../themes'
import { Check } from 'iconoir-react'
import styles from './ThemeGrid.module.css'

interface Props {
  themes: ThemeMeta[]
  activeThemeId: string
  onSelect: (themeId: string) => void
  size?: 'default' | 'compact'
}

export function ThemeGrid({ themes, activeThemeId, onSelect, size = 'default' }: Props) {
  const isCompact = size === 'compact'

  return (
    <div className={`${styles.grid} ${isCompact ? styles.gridCompact : ''}`}>
      {themes.map(theme => (
        <button
          key={theme.id}
          className={`${styles.card} ${isCompact ? styles.cardCompact : ''} ${activeThemeId === theme.id ? styles.active : ''}`}
          style={{ background: theme.bg }}
          onClick={() => onSelect(theme.id)}
        >
          <div className={styles.dots}>
            <span className={styles.dot} style={{ background: theme.accent }} />
            <span className={styles.dot} style={{ background: theme.textPrimary }} />
          </div>
          <span className={`${styles.label} ${isCompact ? styles.labelCompact : ''}`} style={{ color: theme.textPrimary }}>
            {theme.name}
          </span>
          {activeThemeId === theme.id && (
            <span className={styles.check} style={{ color: theme.accent }}>
              <Check width={14} height={14} />
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
