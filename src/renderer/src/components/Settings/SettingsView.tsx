import { useState, type ChangeEvent } from 'react'
import { THEMES, DARK_THEMES } from '../../themes'
import { useSettings } from '../../hooks/useSettings'
import { ThemeGrid } from '../ThemeGrid/ThemeGrid'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccountSection } from './AccountSection'

type Section = 'theme' | 'notification' | 'account'

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: 'theme', label: 'テーマ' },
  { id: 'notification', label: '通知' },
  { id: 'account', label: 'アカウント' },
]

const heading = 'mb-2 mt-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'

const MINUTE_OPTIONS = [5, 15, 30, 60, 90, 120] as const

function minuteLabel(m: number): string {
  if (m === 60) return '1時間'
  if (m === 90) return '1時間30分'
  if (m === 120) return '2時間'
  return `${m}分`
}

export function SettingsView() {
  const [activeSection, setActiveSection] = useState<Section>('theme')
  const {
    activeThemeId, idleEnabled, idleMinutes, elapsedEnabled, elapsedMinutes, pomodoroEnabled,
    userName, whiteboardEnabled, whiteboardEmail, slackProjectCode, slackProjectName,
    setTheme, setIdle, setElapsed, setPomodoro, setUserName, setWhiteboard, setSlack,
  } = useSettings()

  return (
    <Tabs
      value={activeSection}
      onValueChange={(v) => setActiveSection(v as Section)}
      orientation="vertical"
      className="flex h-screen w-full font-[var(--font-family)] antialiased"
    >
      <TabsList className="flex h-full w-[120px] shrink-0 flex-col items-stretch justify-start gap-1 rounded-none border-r border-[var(--glass-border)] bg-[var(--glass-bg)] p-2">
        {NAV_ITEMS.map(item => (
          <TabsTrigger
            key={item.id}
            value={item.id}
            className="justify-start text-[13px] data-[state=active]:bg-[var(--accent-light)] data-[state=active]:text-[var(--accent)]"
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="flex-1 overflow-y-auto bg-[var(--bg)] px-3 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* ─── テーマ ─── */}
        {activeSection === 'theme' && (
          <>
            <h2 className={heading}>ライト</h2>
            <ThemeGrid themes={THEMES} activeThemeId={activeThemeId} onSelect={setTheme} />
            <h2 className={heading} style={{ marginTop: '1.5rem' }}>ダーク</h2>
            <ThemeGrid themes={DARK_THEMES} activeThemeId={activeThemeId} onSelect={setTheme} />
          </>
        )}

        {/* ─── 通知 ─── */}
        {activeSection === 'notification' && (
          <>
            <h2 className={heading}>アイドル通知</h2>
            <Card className="mb-4">
              <CardContent className="p-0">
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <div>
                    <Label htmlFor="idle" className="text-[13px] font-medium text-foreground">
                      アイドル通知
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      タイマーを起動していない時に通知する
                    </p>
                  </div>
                  <Switch
                    id="idle"
                    checked={idleEnabled}
                    onCheckedChange={(c) => setIdle(c, idleMinutes)}
                  />
                </div>
                {idleEnabled && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between gap-3 p-3.5">
                      <Label className="text-[13px] font-medium text-foreground">通知まで待機</Label>
                      <Select
                        value={String(idleMinutes)}
                        onValueChange={(v) => setIdle(idleEnabled, Number(v))}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MINUTE_OPTIONS.map(m => (
                            <SelectItem key={m} value={String(m)}>
                              {minuteLabel(m)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <h2 className={heading} style={{ marginTop: '1.5rem' }}>経過時間通知</h2>
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <div>
                    <Label htmlFor="elapsed" className="text-[13px] font-medium text-foreground">
                      経過時間通知
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      タイマー起動中に一定時間ごとに通知する
                    </p>
                  </div>
                  <Switch
                    id="elapsed"
                    checked={elapsedEnabled}
                    onCheckedChange={(c) => setElapsed(c, elapsedMinutes)}
                  />
                </div>
                {elapsedEnabled && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between gap-3 p-3.5">
                      <Label className="text-[13px] font-medium text-foreground">通知間隔</Label>
                      <Select
                        value={String(elapsedMinutes)}
                        onValueChange={(v) => setElapsed(elapsedEnabled, Number(v))}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MINUTE_OPTIONS.map(m => (
                            <SelectItem key={m} value={String(m)}>
                              {minuteLabel(m)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <h2 className={heading} style={{ marginTop: '1.5rem' }}>ポモドーロタイマー</h2>
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <div>
                    <Label htmlFor="pomodoro" className="text-[13px] font-medium text-foreground">
                      ポモドーロタイマー
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      25分ごとに5分の休憩を通知する
                    </p>
                  </div>
                  <Switch
                    id="pomodoro"
                    checked={pomodoroEnabled}
                    onCheckedChange={setPomodoro}
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ─── アカウント ─── */}
        {activeSection === 'account' && (
          <>
            <h2 className={heading}>Slack アカウント</h2>
            <AccountSection />
            <h2 className={heading}>勤怠連携</h2>
            <Card className="mb-4">
              <CardContent className="flex flex-col gap-3 p-3.5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="username" className="text-[13px] text-foreground">ユーザー名</Label>
                  <Input
                    id="username"
                    type="text"
                    className="h-8"
                    value={userName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setUserName(e.target.value)}
                    placeholder="Slack ユーザー名"
                  />
                </div>
              </CardContent>
            </Card>

            <h2 className={heading} style={{ marginTop: '1.5rem' }}>ホワイトボード連携</h2>
            <Card className="mb-4">
              <CardContent className="p-0">
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <div>
                    <Label htmlFor="whiteboard" className="text-[13px] font-medium text-foreground">
                      ホワイトボード連携
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      タイマー開始時に出勤 / 勤怠送信時に退勤
                    </p>
                  </div>
                  <Switch
                    id="whiteboard"
                    checked={whiteboardEnabled}
                    onCheckedChange={(c) => setWhiteboard(c, whiteboardEmail)}
                  />
                </div>
                {whiteboardEnabled && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-1.5 p-3.5">
                      <Label htmlFor="whiteboard-email" className="text-[13px] text-foreground">
                        メールアドレス
                      </Label>
                      <Input
                        id="whiteboard-email"
                        type="email"
                        className="h-8"
                        value={whiteboardEmail}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setWhiteboard(whiteboardEnabled, e.target.value)
                        }
                        placeholder="example@jsl.co.jp"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <h2 className={heading} style={{ marginTop: '1.5rem' }}>Slack連携</h2>
            <Card>
              <CardContent className="flex flex-col gap-3 p-3.5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="slack-pj-code" className="text-[13px] text-foreground">PJコード</Label>
                  <Input
                    id="slack-pj-code"
                    type="text"
                    className="h-8"
                    value={slackProjectCode}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setSlack(e.target.value, slackProjectName)
                    }
                    placeholder="PJコード"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="slack-pj-name" className="text-[13px] text-foreground">プロジェクト名</Label>
                  <Input
                    id="slack-pj-name"
                    type="text"
                    className="h-8"
                    value={slackProjectName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setSlack(slackProjectCode, e.target.value)
                    }
                    placeholder="プロジェクト名"
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Tabs>
  )
}
