import { useState, type ChangeEvent } from 'react'
import { THEMES, DARK_THEMES } from '../../themes'
import { useSettings } from '../../hooks/useSettings'
import styles from './SettingsView.module.css'
import { ThemeGrid } from '../ThemeGrid/ThemeGrid'

type Section = 'theme' | 'notification' | 'account'

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: 'theme', label: 'テーマ' },
  { id: 'notification', label: '通知' },
  { id: 'account', label: 'アカウント' },
]

export function SettingsView() {
  const [activeSection, setActiveSection] = useState<Section>('theme')
  const {
    activeThemeId, idleEnabled, idleMinutes, elapsedEnabled, elapsedMinutes,
    userName, whiteboardEnabled, whiteboardEmail, slackProjectCode, slackProjectName,
    setTheme, setIdle, setElapsed, setUserName, setWhiteboard, setSlack,
  } = useSettings()

  return (
    <div className={styles.container}>
      <nav className={styles.sidebar}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`${styles.navItem} ${activeSection === item.id ? styles.navItemActive : ''}`}
            onClick={() => setActiveSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        {activeSection === 'theme' && (
          <>
            <h2 className={styles.heading}>ライト</h2>
            <ThemeGrid themes={THEMES} activeThemeId={activeThemeId} onSelect={setTheme} />
            <h2 className={styles.heading} style={{ marginTop: '1.5rem' }}>ダーク</h2>
            <ThemeGrid themes={DARK_THEMES} activeThemeId={activeThemeId} onSelect={setTheme} />
          </>
        )}

        {activeSection === 'account' && (
          <>
            <h2 className={styles.heading}>勤怠連携</h2>
            <div className={styles.idleRow}>
              <label className={styles.idleLabel}>
                ユーザー名
                <input
                  type="text"
                  className={styles.userNameInput}
                  value={userName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setUserName(e.target.value)}
                  placeholder="Slack ユーザー名"
                />
              </label>
            </div>

            <h2 className={styles.heading} style={{ marginTop: '1.5rem' }}>ホワイトボード連携</h2>
            <div className={styles.idleRow}>
              <label className={styles.idleLabel}>
                <input
                  type="checkbox"
                  checked={whiteboardEnabled}
                  onChange={e => setWhiteboard(e.target.checked, whiteboardEmail)}
                  className={styles.idleCheckbox}
                />
                タイマー開始時に出勤 / 勤怠送信時に退勤
              </label>
            </div>
            {whiteboardEnabled && (
              <div className={styles.idleRow}>
                <label className={styles.idleLabel}>
                  メールアドレス
                  <input
                    type="email"
                    className={styles.userNameInput}
                    value={whiteboardEmail}
                    onChange={e => setWhiteboard(whiteboardEnabled, e.target.value)}
                    placeholder="example@jsl.co.jp"
                  />
                </label>
              </div>
            )}

            <h2 className={styles.heading} style={{ marginTop: '1.5rem' }}>Slack連携</h2>
            <div className={styles.idleRow}>
              <label className={styles.idleLabel}>
                PJコード
                <input
                  type="text"
                  className={styles.userNameInput}
                  value={slackProjectCode}
                  onChange={e => setSlack(e.target.value, slackProjectName)}
                  placeholder="PJコード"
                />
              </label>
            </div>
            <div className={styles.idleRow}>
              <label className={styles.idleLabel}>
                プロジェクト名
                <input
                  type="text"
                  className={styles.userNameInput}
                  value={slackProjectName}
                  onChange={e => setSlack(slackProjectCode, e.target.value)}
                  placeholder="プロジェクト名"
                />
              </label>
            </div>
          </>
        )}

        {activeSection === 'notification' && (
          <>
            <h2 className={styles.heading}>アイドル通知</h2>
            <div className={styles.idleRow}>
              <label className={styles.idleLabel}>
                <input
                  type="checkbox"
                  checked={idleEnabled}
                  onChange={e => setIdle(e.target.checked, idleMinutes)}
                  className={styles.idleCheckbox}
                />
                タイマーを起動していない時に通知する
              </label>
            </div>
            {idleEnabled && (
              <div className={styles.idleRow}>
                <label className={styles.idleLabel}>
                  通知まで待機
                  <select
                    value={idleMinutes}
                    onChange={e => setIdle(idleEnabled, Number(e.target.value))}
                    className={styles.idleSelect}
                  >
                    <option value={1}>1分</option>
                    <option value={5}>5分</option>
                    <option value={15}>15分</option>
                    <option value={30}>30分</option>
                    <option value={60}>1時間</option>
                    <option value={90}>1時間30分</option>
                    <option value={120}>2時間</option>
                  </select>
                </label>
              </div>
            )}
            <h2 className={styles.heading} style={{ marginTop: '1.5rem' }}>経過時間通知</h2>
            <div className={styles.idleRow}>
              <label className={styles.idleLabel}>
                <input
                  type="checkbox"
                  checked={elapsedEnabled}
                  onChange={e => setElapsed(e.target.checked, elapsedMinutes)}
                  className={styles.idleCheckbox}
                />
                タイマー起動中に一定時間ごとに通知する
              </label>
            </div>
            {elapsedEnabled && (
              <div className={styles.idleRow}>
                <label className={styles.idleLabel}>
                  通知間隔
                  <select
                    value={elapsedMinutes}
                    onChange={e => setElapsed(elapsedEnabled, Number(e.target.value))}
                    className={styles.idleSelect}
                  >
                    <option value={1}>1分</option>
                    <option value={5}>5分</option>
                    <option value={15}>15分</option>
                    <option value={30}>30分</option>
                    <option value={60}>1時間</option>
                    <option value={90}>1時間30分</option>
                    <option value={120}>2時間</option>
                  </select>
                </label>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
