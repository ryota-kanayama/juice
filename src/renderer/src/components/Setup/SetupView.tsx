import { useState } from 'react'
import { THEMES, DARK_THEMES } from '../../themes'
import { useSetup } from '../../hooks/useSetup'
import { ThemeGrid } from '../ThemeGrid/ThemeGrid'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const TOTAL_STEPS = 3

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
            <Card>
              <CardContent className="flex flex-col gap-1.5 p-4">
                <Label htmlFor="setup-name" className="text-[13px] text-foreground">ユーザー名</Label>
                <Input
                  id="setup-name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="例: kanayama"
                  autoFocus
                />
              </CardContent>
            </Card>
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
            <Card>
              <CardContent className="p-4">
                <ThemeGrid themes={THEMES} activeThemeId={activeThemeId} onSelect={setTheme} size="compact" />
                <div className="mt-2">
                  <ThemeGrid themes={DARK_THEMES} activeThemeId={activeThemeId} onSelect={setTheme} size="compact" />
                </div>
              </CardContent>
            </Card>
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
            <Button variant="outline" onClick={() => setStep(s => s - 1)}>← 戻る</Button>
          )}
          {step === 1 && (
            <Button className="flex-1" onClick={() => setStep(2)}>はじめる</Button>
          )}
          {step === 2 && (
            <Button className="flex-1" onClick={() => setStep(3)} disabled={!userName.trim()}>次へ</Button>
          )}
          {step === 3 && (
            <Button className="flex-1" onClick={complete}>完了</Button>
          )}
        </div>
      </div>
    </div>
  )
}
