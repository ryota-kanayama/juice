import { useState, useEffect, type ChangeEvent } from 'react'
import { THEMES, DARK_THEMES } from '../../themes'
import styles from './SettingsView.module.css'
import { Check } from 'iconoir-react'

type Section = 'theme' | 'notification' | 'account'

export function SettingsView() {
  const [activeSection, setActiveSection] = useState<Section>('theme')
  const [activeThemeId, setActiveThemeId] = useState('rose')
  const [idleEnabled, setIdleEnabled] = useState(false)
  const [idleMinutes, setIdleMinutes] = useState(60)
  const [elapsedEnabled, setElapsedEnabled] = useState(false)
  const [elapsedMinutes, setElapsedMinutes] = useState(30)
  const [userName, setUserName] = useState('')
  const [whiteboardEnabled, setWhiteboardEnabled] = useState(false)
  const [whiteboardEmail, setWhiteboardEmail] = useState('')
  const [slackProjectCode, setSlackProjectCode] = useState('')
  const [slackProjectName, setSlackProjectName] = useState('')

  useEffect(() => {
    window.electronAPI.getTheme().then(setActiveThemeId)
    window.electronAPI.onThemeChanged(setActiveThemeId)
    window.electronAPI.getIdleSettings().then(({ enabled, minutes }) => {
      setIdleEnabled(enabled)
      setIdleMinutes(minutes)
    })
    window.electronAPI.getElapsedSettings().then(({ enabled, minutes }) => {
      setElapsedEnabled(enabled)
      setElapsedMinutes(minutes)
    })
    window.electronAPI.getUserName().then(setUserName)
    window.electronAPI.getWhiteboardSettings().then(({ enabled, email }) => {
      setWhiteboardEnabled(enabled)
      setWhiteboardEmail(email)
    })
    window.electronAPI.getSlackSettings().then(({ projectCode, projectName }) => {
      setSlackProjectCode(projectCode)
      setSlackProjectName(projectName)
    })
  }, [])

  const handleSelect = (themeId: string) => {
    // 即時反映（IPC待ちなし）
    document.documentElement.dataset.theme = themeId
    setActiveThemeId(themeId)
    window.electronAPI.setTheme(themeId)
  }

  const handleIdleToggle = (e: ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked
    setIdleEnabled(enabled)
    window.electronAPI.setIdleSettings(enabled, idleMinutes)
  }

  const handleIdleMinutesChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const minutes = Number(e.target.value)
    setIdleMinutes(minutes)
    window.electronAPI.setIdleSettings(idleEnabled, minutes)
  }

  const handleElapsedToggle = (e: ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked
    setElapsedEnabled(enabled)
    window.electronAPI.setElapsedSettings(enabled, elapsedMinutes)
  }

  const handleElapsedMinutesChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const minutes = Number(e.target.value)
    setElapsedMinutes(minutes)
    window.electronAPI.setElapsedSettings(elapsedEnabled, minutes)
  }

  const handleUserNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUserName(value)
    window.electronAPI.setUserName(value.trim())
  }

  const handleWhiteboardToggle = (e: ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked
    setWhiteboardEnabled(enabled)
    window.electronAPI.setWhiteboardSettings(enabled, whiteboardEmail)
  }

  const handleWhiteboardEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value
    setWhiteboardEmail(email)
    window.electronAPI.setWhiteboardSettings(whiteboardEnabled, email.trim())
  }

  const handleSlackProjectCodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSlackProjectCode(value)
    window.electronAPI.setSlackSettings(value.trim(), slackProjectName)
  }

  const handleSlackProjectNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSlackProjectName(value)
    window.electronAPI.setSlackSettings(slackProjectCode, value.trim())
  }

  const navItems: { id: Section; label: string }[] = [
    { id: 'theme', label: 'テーマ' },
    { id: 'notification', label: '通知' },
    { id: 'account', label: 'アカウント' },
  ]

  return (
    <div className={styles.container}>
      <nav className={styles.sidebar}>
        {navItems.map(item => (
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
            <div className={styles.grid}>
              {THEMES.map(theme => (
                <button
                  key={theme.id}
                  className={`${styles.card} ${activeThemeId === theme.id ? styles.active : ''}`}
                  style={{ background: theme.bg }}
                  onClick={() => handleSelect(theme.id)}
                >
                  <div className={styles.dots}>
                    <span className={styles.dot} style={{ background: theme.accent }} />
                    <span className={styles.dot} style={{ background: theme.textPrimary }} />
                  </div>
                  <span className={styles.label} style={{ color: theme.textPrimary }}>
                    {theme.name}
                  </span>
                  {activeThemeId === theme.id && (
                    <span className={styles.check} style={{ color: theme.accent }}><Check width={14} height={14} /></span>
                  )}
                </button>
              ))}
            </div>
            <h2 className={styles.heading} style={{ marginTop: '1.5rem' }}>ダーク</h2>
            <div className={styles.grid}>
              {DARK_THEMES.map(theme => (
                <button
                  key={theme.id}
                  className={`${styles.card} ${activeThemeId === theme.id ? styles.active : ''}`}
                  style={{ background: theme.bg }}
                  onClick={() => handleSelect(theme.id)}
                >
                  <div className={styles.dots}>
                    <span className={styles.dot} style={{ background: theme.accent }} />
                    <span className={styles.dot} style={{ background: theme.textPrimary }} />
                  </div>
                  <span className={styles.label} style={{ color: theme.textPrimary }}>
                    {theme.name}
                  </span>
                  {activeThemeId === theme.id && (
                    <span className={styles.check} style={{ color: theme.accent }}><Check width={14} height={14} /></span>
                  )}
                </button>
              ))}
            </div>
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
                  onChange={handleUserNameChange}
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
                  onChange={handleWhiteboardToggle}
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
                    onChange={handleWhiteboardEmailChange}
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
                  onChange={handleSlackProjectCodeChange}
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
                  onChange={handleSlackProjectNameChange}
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
                  onChange={handleIdleToggle}
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
                    onChange={handleIdleMinutesChange}
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
                  onChange={handleElapsedToggle}
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
                    onChange={handleElapsedMinutesChange}
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
