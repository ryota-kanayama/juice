import { useState } from 'react'
import { THEMES, DARK_THEMES } from '../../themes'
import { useSetup } from '../../hooks/useSetup'
import { useAuthStatus } from '../../hooks/useAuthStatus'
import { ThemeGrid } from '../ThemeGrid/ThemeGrid'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const TOTAL_STEPS = 3

export function SetupView() {
  const { activeThemeId, setTheme, complete } = useSetup()
  const { status, signIn } = useAuthStatus()
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

      {/* Step 2: Slack サインイン */}
      {step === 2 && (
        <div className="flex flex-1 flex-col animate-fade-in" key="step2">
          <h2 className="mb-1 text-[15px] font-semibold">Slack でサインイン</h2>
          <p className="mb-4 text-[12px] text-muted-foreground">
            サインインすると勤怠・ホワイトボード・Slack 通知の連携が使えます。
            あとから設定 &gt; アカウントでもサインインできます。
          </p>
          {status.signedIn ? (
            <p className="text-[13px] font-medium">✅ {status.name} としてサインイン済み</p>
          ) : (
            <Button onClick={signIn}>Slack でサインイン</Button>
          )}
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
            <Button
              className="flex-1"
              variant={status.signedIn ? 'default' : 'outline'}
              onClick={() => setStep(3)}
            >
              {status.signedIn ? '次へ' : 'あとで設定する'}
            </Button>
          )}
          {step === 3 && (
            <Button className="flex-1" onClick={complete}>完了</Button>
          )}
        </div>
      </div>
    </div>
  )
}
