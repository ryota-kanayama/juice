import { useState, type ChangeEvent } from 'react'
import { THEMES, DARK_THEMES } from '../../themes'
import { useSetup } from '../../hooks/useSetup'
import { ThemeGrid } from '../ThemeGrid/ThemeGrid'
import { Input } from '@/components/ui/input'

const TOTAL_STEPS = 3

const nextButton =
  'flex-1 cursor-pointer rounded-[8px] border-0 bg-[image:var(--gradient-accent)] p-2.5 text-[14px] font-semibold text-white shadow-[0_4px_12px_var(--accent-light)] transition-all hover:-translate-y-px hover:shadow-[0_6px_16px_var(--accent-light)] disabled:transform-none disabled:cursor-not-allowed disabled:opacity-40'

export function SetupView() {
  const { activeThemeId, userName, setUserName, setTheme, complete } = useSetup()
  const [step, setStep] = useState(1)

  return (
    <div className="flex h-screen w-full flex-col overflow-y-auto bg-[var(--bg)] px-6 pb-5 pt-6 font-[var(--font-family)] antialiased">
      {/* Step 1: ウェルカム */}
      {step === 1 && (
        <div className="flex flex-1 flex-col animate-fade-in" key="step1">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="mb-3 block text-[56px]">🧃</span>
            <h1 className="mb-2 mt-0 text-[22px] font-bold text-[var(--text-primary)]">Juice へようこそ</h1>
            <p className="m-0 max-w-[280px] text-[13px] leading-[1.6] text-[var(--text-secondary)]">
              作業時間を記録して、チームに共有できるタイマーアプリです。
              かんたんな設定をしてはじめましょう。
            </p>
          </div>
        </div>
      )}

      {/* Step 2: ユーザー名入力 */}
      {step === 2 && (
        <div className="flex flex-1 flex-col animate-fade-in" key="step2">
          <div className="mb-5 text-center">
            <span className="mb-1 block text-[36px]">🧃</span>
            <h1 className="mb-1 mt-0 text-[18px] font-bold text-[var(--text-primary)]">ユーザー名</h1>
            <p className="m-0 text-xs text-[var(--text-secondary)]">勤怠連携に使用する Slack ユーザー名を入力してください</p>
          </div>
          <div className="mb-4">
            <Input
              type="text"
              className="w-full"
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
        <div className="flex flex-1 flex-col animate-fade-in" key="step3">
          <div className="mb-5 text-center">
            <span className="mb-1 block text-[36px]">🧃</span>
            <h1 className="mb-1 mt-0 text-[18px] font-bold text-[var(--text-primary)]">テーマ</h1>
            <p className="m-0 text-xs text-[var(--text-secondary)]">お好みのテーマを選んでください</p>
          </div>
          <div className="mb-4">
            <ThemeGrid themes={THEMES} activeThemeId={activeThemeId} onSelect={setTheme} size="compact" />
            <div className="mt-2">
              <ThemeGrid themes={DARK_THEMES} activeThemeId={activeThemeId} onSelect={setTheme} size="compact" />
            </div>
          </div>
        </div>
      )}

      {/* フッター: インジケーター + ボタン */}
      <div className="mt-auto flex shrink-0 flex-col gap-3">
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-all ${
                i + 1 === step ? 'bg-[var(--accent)] shadow-[0_0_8px_var(--accent-light)]' : 'bg-[var(--glass-border)]'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {step > 1 && (
            <button
              className="cursor-pointer rounded-[8px] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text-secondary)] transition-all [backdrop-filter:blur(8px)] hover:bg-[var(--bg-hover)]"
              onClick={() => setStep(s => s - 1)}
            >
              ← 戻る
            </button>
          )}
          {step === 1 && (
            <button className={nextButton} onClick={() => setStep(2)}>
              はじめる
            </button>
          )}
          {step === 2 && (
            <button
              className={nextButton}
              onClick={() => setStep(3)}
              disabled={!userName.trim()}
            >
              次へ
            </button>
          )}
          {step === 3 && (
            <button className={nextButton} onClick={complete}>
              完了
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
