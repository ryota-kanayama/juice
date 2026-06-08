import { useState, type ChangeEvent } from 'react'
import { THEMES, DARK_THEMES } from '../../themes'
import { useSettings } from '../../hooks/useSettings'
import { ThemeGrid } from '../ThemeGrid/ThemeGrid'
import { Input } from '@/components/ui/input'

type Section = 'theme' | 'notification' | 'account'

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: 'theme', label: 'テーマ' },
  { id: 'notification', label: '通知' },
  { id: 'account', label: 'アカウント' },
]

const heading = 'mb-4 mt-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]'
const idleRow = 'mb-3'
const idleLabel = 'flex cursor-pointer items-center gap-2 text-[13px] text-[var(--text-primary)]'
const idleCheckbox = 'h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]'
const idleSelect =
  'ml-2 cursor-pointer rounded-[6px] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-1.5 py-[3px] text-xs text-[var(--text-primary)] transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-light)] focus:outline-none'

export function SettingsView() {
  const [activeSection, setActiveSection] = useState<Section>('theme')
  const {
    activeThemeId, idleEnabled, idleMinutes, elapsedEnabled, elapsedMinutes,
    userName, whiteboardEnabled, whiteboardEmail, slackProjectCode, slackProjectName,
    setTheme, setIdle, setElapsed, setUserName, setWhiteboard, setSlack,
  } = useSettings()

  return (
    <div className="flex h-screen w-full overflow-hidden font-[var(--font-family)] antialiased">
      <nav className="flex w-[120px] shrink-0 flex-col border-r border-[var(--glass-border)] bg-[var(--glass-bg)] py-4 [backdrop-filter:blur(12px)]">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`block w-full cursor-pointer border-0 border-l-[3px] bg-transparent px-4 py-2 text-left text-[13px] transition-all ${
              activeSection === item.id
                ? 'border-l-[var(--accent)] bg-[var(--accent-light)] font-semibold text-[var(--accent)]'
                : 'border-l-transparent font-medium text-[var(--text-primary)] hover:bg-[var(--glass-bg)]'
            }`}
            onClick={() => setActiveSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto bg-[var(--bg)] px-3 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {activeSection === 'theme' && (
          <>
            <h2 className={heading}>ライト</h2>
            <ThemeGrid themes={THEMES} activeThemeId={activeThemeId} onSelect={setTheme} />
            <h2 className={heading} style={{ marginTop: '1.5rem' }}>ダーク</h2>
            <ThemeGrid themes={DARK_THEMES} activeThemeId={activeThemeId} onSelect={setTheme} />
          </>
        )}

        {activeSection === 'account' && (
          <>
            <h2 className={heading}>勤怠連携</h2>
            <div className={idleRow}>
              <label className={idleLabel}>
                ユーザー名
                <Input
                  type="text"
                  className="ml-2 h-8 w-[140px]"
                  value={userName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setUserName(e.target.value)}
                  placeholder="Slack ユーザー名"
                />
              </label>
            </div>

            <h2 className={heading} style={{ marginTop: '1.5rem' }}>ホワイトボード連携</h2>
            <div className={idleRow}>
              <label className={idleLabel}>
                <input
                  type="checkbox"
                  checked={whiteboardEnabled}
                  onChange={e => setWhiteboard(e.target.checked, whiteboardEmail)}
                  className={idleCheckbox}
                />
                タイマー開始時に出勤 / 勤怠送信時に退勤
              </label>
            </div>
            {whiteboardEnabled && (
              <div className={idleRow}>
                <label className={idleLabel}>
                  メールアドレス
                  <Input
                    type="email"
                    className="ml-2 h-8 w-[140px]"
                    value={whiteboardEmail}
                    onChange={e => setWhiteboard(whiteboardEnabled, e.target.value)}
                    placeholder="example@jsl.co.jp"
                  />
                </label>
              </div>
            )}

            <h2 className={heading} style={{ marginTop: '1.5rem' }}>Slack連携</h2>
            <div className={idleRow}>
              <label className={idleLabel}>
                PJコード
                <Input
                  type="text"
                  className="ml-2 h-8 w-[140px]"
                  value={slackProjectCode}
                  onChange={e => setSlack(e.target.value, slackProjectName)}
                  placeholder="PJコード"
                />
              </label>
            </div>
            <div className={idleRow}>
              <label className={idleLabel}>
                プロジェクト名
                <Input
                  type="text"
                  className="ml-2 h-8 w-[140px]"
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
            <h2 className={heading}>アイドル通知</h2>
            <div className={idleRow}>
              <label className={idleLabel}>
                <input
                  type="checkbox"
                  checked={idleEnabled}
                  onChange={e => setIdle(e.target.checked, idleMinutes)}
                  className={idleCheckbox}
                />
                タイマーを起動していない時に通知する
              </label>
            </div>
            {idleEnabled && (
              <div className={idleRow}>
                <label className={idleLabel}>
                  通知まで待機
                  <select
                    value={idleMinutes}
                    onChange={e => setIdle(idleEnabled, Number(e.target.value))}
                    className={idleSelect}
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
            <h2 className={heading} style={{ marginTop: '1.5rem' }}>経過時間通知</h2>
            <div className={idleRow}>
              <label className={idleLabel}>
                <input
                  type="checkbox"
                  checked={elapsedEnabled}
                  onChange={e => setElapsed(e.target.checked, elapsedMinutes)}
                  className={idleCheckbox}
                />
                タイマー起動中に一定時間ごとに通知する
              </label>
            </div>
            {elapsedEnabled && (
              <div className={idleRow}>
                <label className={idleLabel}>
                  通知間隔
                  <select
                    value={elapsedMinutes}
                    onChange={e => setElapsed(elapsedEnabled, Number(e.target.value))}
                    className={idleSelect}
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
