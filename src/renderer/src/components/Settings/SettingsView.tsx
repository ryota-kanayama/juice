import { useState } from 'react'
import { THEMES, DARK_THEMES } from '../../themes'
import { useSettings } from '../../hooks/useSettings'
import { useUpdate } from '../../hooks/useUpdate'
import { ThemeGrid } from '../ThemeGrid/ThemeGrid'
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

type Section = 'theme' | 'notification' | 'account' | 'analysis' | 'startup' | 'update'

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: 'theme', label: 'テーマ' },
  { id: 'notification', label: '通知' },
  { id: 'account', label: '連携' },
  { id: 'analysis', label: '分析' },
  { id: 'startup', label: '起動' },
  { id: 'update', label: 'アップデート' },
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
    whiteboardEnabled, breakBehavior, mainProjectCode, launchAtLogin,
    setTheme, setIdle, setElapsed, setPomodoro, setWhiteboard, setBreakBehavior, setMainProjectCode,
    setLaunchAtLogin,
  } = useSettings()
  const update = useUpdate()

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

            <Separator />
            <h3 className={heading}>休憩</h3>
            <Card>
              <CardContent className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">タイマーを一時停止する</p>
                  <p className="text-xs text-muted-foreground">OFF の場合、休憩ボタンを押すとタイマーが停止します（デフォルト）</p>
                </div>
                <Switch
                  checked={breakBehavior === 'pause'}
                  onCheckedChange={checked => setBreakBehavior(checked ? 'pause' : 'stop')}
                />
              </CardContent>
            </Card>
          </>
        )}

        {/* ─── 連携 ─── */}
        {activeSection === 'account' && (
          <>
            <h2 className={heading}>ホワイトボード連携</h2>
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
                    onCheckedChange={setWhiteboard}
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ─── 分析 ─── */}
        {activeSection === 'analysis' && (
          <>
            <h2 className={heading}>プロジェクト</h2>
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <div>
                    <Label htmlFor="mainProjectCode" className="text-[13px] font-medium text-foreground">
                      主プロジェクトコード
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      週次分析でこのコード以外の作業を「PJ外作業」として集計します
                    </p>
                  </div>
                  <input
                    id="mainProjectCode"
                    type="text"
                    value={mainProjectCode}
                    onChange={e => setMainProjectCode(e.target.value)}
                    placeholder="例: PROJ-001"
                    className="h-8 w-32 rounded-md border border-input bg-background px-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ─── 起動 ─── */}
        {activeSection === 'startup' && (
          <>
            <h2 className={heading}>起動</h2>
            <Card>
              <CardContent className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">ログイン時に起動</p>
                  <p className="text-xs text-muted-foreground">
                    macOS のログイン時に Juice を自動で起動します
                  </p>
                </div>
                <Switch checked={launchAtLogin} onCheckedChange={setLaunchAtLogin} />
              </CardContent>
            </Card>
          </>
        )}

        {/* ─── アップデート ─── */}
        {activeSection === 'update' && (
          <>
            <h2 className={heading}>アップデート</h2>
            <Card>
              <CardContent className="flex flex-col gap-3 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-foreground">現在のバージョン</span>
                  <span className="text-[13px] text-muted-foreground">
                    {update.currentVersion || update.info?.currentVersion || '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-foreground">状態</span>
                  <span className="text-[13px] text-muted-foreground">
                    {update.phase === 'available'
                      ? `更新があります（v${update.info?.latestVersion}）`
                      : update.phase === 'downloading'
                        ? `ダウンロード中… ${update.percent}%`
                        : update.phase === 'opened' || update.phase === 'installed'
                          ? '再起動で更新を適用'
                          : update.phase === 'error'
                            ? (update.error ?? '確認に失敗しました')
                            : '最新です'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md border border-input px-3 py-1.5 text-[13px]"
                    onClick={() => { update.check().catch(console.error) }}
                  >
                    更新を確認
                  </button>
                  {update.phase === 'available' && (
                    <button
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] text-white"
                      onClick={update.download}
                    >
                      ダウンロード
                    </button>
                  )}
                  {(update.phase === 'opened' || update.phase === 'installed') && (
                    <button
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] text-white"
                      onClick={update.restart}
                    >
                      再起動
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Tabs>
  )
}
