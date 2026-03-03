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
      {/* メインビジュアル */}
      <div className={styles.timerSection}>
        <p className={styles.name}>{name}</p>
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
            <span className={styles.glassElapsed}>
              {Math.floor(elapsedSeconds / 60)}分経過
            </span>
          </div>
        </div>
      </div>

      {/* コントロール */}
      <div className={styles.controlSection}>
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

        <button className={styles.stopButton} onClick={() => onStop(projectCode, workCategory)}>
          やめる
        </button>
      </div>
    </div>
  )
}
