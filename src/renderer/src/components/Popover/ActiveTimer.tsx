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

// 15分で満杯（最大100%）
function juiceLevel(seconds: number): number {
  return Math.min((seconds / 900) * 100, 100)
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

        {/* 円形波アニメーション */}
        <div className={styles.circleContainer} aria-hidden="true">
          <div className={styles.circle} style={{ borderColor: color }}>
            {/* 泡 — 線のみの円 */}
            <svg className={styles.bubbleSvg} viewBox="0 0 120 120" style={{ clipPath: `inset(calc(${100 - level}% + 20px) 0 0 0)` }}>
              <circle className={styles.bubble1} cx="35" cy="0" r="4" fill="none" stroke={color} strokeWidth="1.5" />
              <circle className={styles.bubble2} cx="75" cy="0" r="3" fill="none" stroke={color} strokeWidth="1.5" />
              <circle className={styles.bubble3} cx="55" cy="0" r="2.5" fill="none" stroke={color} strokeWidth="1" />
            </svg>
            {/* 波線 */}
            <svg
              className={styles.waveSvg}
              data-testid="juice-level"
              style={{ top: `${100 - level}%` }}
              viewBox="0 0 900 20"
              preserveAspectRatio="none"
            >
              <path
                className={styles.wavePath}
                d="M0,10 q150,10 300,0 t300,0 q150,10 300,0"
                fill="none"
                stroke={color}
                strokeWidth="2"
              />
            </svg>
            <span className={styles.circleElapsed}>
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
