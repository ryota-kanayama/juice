import { useState, useEffect, type ChangeEvent } from 'react'
import { THEMES, DARK_THEMES } from '../../themes'
import styles from './SetupView.module.css'

const TOTAL_STEPS = 3

export function SetupView() {
  const [step, setStep] = useState(1)
  const [userName, setUserName] = useState('')
  const [activeThemeId, setActiveThemeId] = useState('orange')

  useEffect(() => {
    window.electronAPI.getTheme().then(setActiveThemeId)
    window.electronAPI.onThemeChanged(setActiveThemeId)
  }, [])

  const handleSelectTheme = (themeId: string) => {
    document.documentElement.dataset.theme = themeId
    setActiveThemeId(themeId)
    window.electronAPI.setTheme(themeId)
  }

  const handleComplete = async () => {
    await window.electronAPI.setUserName(userName.trim())
    await window.electronAPI.completeSetup()
  }

  return (
    <div className={styles.container}>
      {/* Step 1: ウェルカム */}
      {step === 1 && (
        <div className={styles.stepContent} key="step1">
          <div className={styles.welcomeHeader}>
            <span className={styles.welcomeLogo}>🧃</span>
            <h1 className={styles.welcomeTitle}>Juice へようこそ</h1>
            <p className={styles.welcomeDescription}>
              作業時間を記録して、チームに共有できるタイマーアプリです。
              かんたんな設定をしてはじめましょう。
            </p>
          </div>
        </div>
      )}

      {/* Step 2: ユーザー名入力 */}
      {step === 2 && (
        <div className={styles.stepContent} key="step2">
          <div className={styles.header}>
            <span className={styles.logo}>🧃</span>
            <h1 className={styles.title}>ユーザー名</h1>
            <p className={styles.subtitle}>勤怠連携に使用する Slack ユーザー名を入力してください</p>
          </div>
          <div className={styles.section}>
            <input
              type="text"
              className={styles.input}
              value={userName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUserName(e.target.value)}
              placeholder="例: kanayama"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Step 3: テーマ選択 */}
      {step === 3 && (
        <div className={styles.stepContent} key="step3">
          <div className={styles.header}>
            <span className={styles.logo}>🧃</span>
            <h1 className={styles.title}>テーマ</h1>
            <p className={styles.subtitle}>お好みのテーマを選んでください</p>
          </div>
          <div className={styles.section}>
            <div className={styles.grid}>
              {THEMES.map(theme => (
                <button
                  key={theme.id}
                  className={`${styles.card} ${activeThemeId === theme.id ? styles.active : ''}`}
                  style={{ background: theme.bg }}
                  onClick={() => handleSelectTheme(theme.id)}
                >
                  <div className={styles.dots}>
                    <span className={styles.dot} style={{ background: theme.accent }} />
                    <span className={styles.dot} style={{ background: theme.textPrimary }} />
                  </div>
                  <span className={styles.label} style={{ color: theme.textPrimary }}>
                    {theme.name}
                  </span>
                  {activeThemeId === theme.id && (
                    <span className={styles.check} style={{ color: theme.accent }}>✓</span>
                  )}
                </button>
              ))}
            </div>
            <div className={styles.grid} style={{ marginTop: '8px' }}>
              {DARK_THEMES.map(theme => (
                <button
                  key={theme.id}
                  className={`${styles.card} ${activeThemeId === theme.id ? styles.active : ''}`}
                  style={{ background: theme.bg }}
                  onClick={() => handleSelectTheme(theme.id)}
                >
                  <div className={styles.dots}>
                    <span className={styles.dot} style={{ background: theme.accent }} />
                    <span className={styles.dot} style={{ background: theme.textPrimary }} />
                  </div>
                  <span className={styles.label} style={{ color: theme.textPrimary }}>
                    {theme.name}
                  </span>
                  {activeThemeId === theme.id && (
                    <span className={styles.check} style={{ color: theme.accent }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* フッター: インジケーター + ボタン */}
      <div className={styles.footer}>
        <div className={styles.stepIndicator}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <span
              key={i}
              className={`${styles.stepDot} ${i + 1 === step ? styles.stepDotActive : ''}`}
            />
          ))}
        </div>

        <div className={styles.buttonRow}>
          {step > 1 && (
            <button className={styles.backButton} onClick={() => setStep(s => s - 1)}>
              ← 戻る
            </button>
          )}
          {step === 1 && (
            <button className={styles.nextButton} onClick={() => setStep(2)}>
              はじめる
            </button>
          )}
          {step === 2 && (
            <button
              className={styles.nextButton}
              onClick={() => setStep(3)}
              disabled={!userName.trim()}
            >
              次へ
            </button>
          )}
          {step === 3 && (
            <button className={styles.nextButton} onClick={handleComplete}>
              完了
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
