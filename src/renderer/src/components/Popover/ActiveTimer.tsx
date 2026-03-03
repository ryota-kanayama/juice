import { useState } from 'react'
import styles from './ActiveTimer.module.css'

interface Props {
  name: string
  elapsedSeconds: number
  color: string
  initialProjectCode?: string
  initialWorkCategory?: string
  onStop: (projectCode: string, workCategory: string) => void
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

// 60分で満杯（最大100%）
function juiceLevel(seconds: number): number {
  return Math.min((seconds / 3600) * 100, 100)
}

export function ActiveTimer({ name, elapsedSeconds, color, initialProjectCode, initialWorkCategory, onStop }: Props) {
  const [projectCode, setProjectCode] = useState(initialProjectCode ?? '')
  const [workCategory, setWorkCategory] = useState(initialWorkCategory ?? '')
  const level = juiceLevel(elapsedSeconds)

  return (
    <div className={styles.container}>
      <p className={styles.name}>{name}</p>

      <div className={styles.metaInputs}>
        <input
          className={styles.metaInput}
          value={projectCode}
          onChange={e => setProjectCode(e.target.value)}
          placeholder="PJコード"
          aria-label="PJコード"
          autoFocus
        />
        <input
          className={styles.metaInput}
          value={workCategory}
          onChange={e => setWorkCategory(e.target.value)}
          placeholder="作業区分"
          aria-label="作業区分"
        />
      </div>

      <p className={styles.pouring}>ジュースを注いでいます</p>

      {/* ジュースアニメーション */}
      <div className={styles.juiceScene} aria-hidden="true">
        {/* ボトル */}
        <div className={styles.bottle}>
          <div className={styles.bottleCap} style={{ background: color }} />
          <div className={styles.bottleBody} style={{ background: color }}>
            <div className={styles.bottleShine} />
            <div className={styles.bottleLabel} />
          </div>
          <div className={styles.bottleShoulder} style={{ background: color }} />
          <div className={styles.bottleNeck} style={{ background: color }} />
        </div>

        {/* 注ぎストリーム */}
        <div className={styles.pourStream} style={{ background: color }} />

        {/* 飛び散る雫 */}
        <div className={styles.drop1} style={{ background: color }} />
        <div className={styles.drop2} style={{ background: color }} />

        {/* グラス */}
        <div className={styles.glass}>
          <div
            className={styles.juiceLevel}
            data-testid="juice-level"
            style={{ height: `${level}%`, background: color }}
          >
            <div className={styles.bubble1} />
            <div className={styles.bubble2} />
          </div>
        </div>
      </div>

      <p className={styles.elapsed}>{formatTime(elapsedSeconds)}</p>

      <button className={styles.stopButton} onClick={() => onStop(projectCode, workCategory)}>
        やめる
      </button>
    </div>
  )
}
