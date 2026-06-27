export interface TourStep {
  target: string | null
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  scene?: { tab?: 'timer' | 'calendar' | 'attendance'; demo?: boolean }
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: 'Juice へようこそ',
    body: '使い方を 1 分でご案内します。',
  },
  {
    target: '[data-tour="work-start"]',
    title: '業務を開始',
    body: 'まずはここから 1 日を始めます。',
    placement: 'top',
    scene: { tab: 'timer' },
  },
  {
    target: '[data-tour="help"]',
    title: '使い方はここから',
    body: '操作に迷ったら、いつでもここから見返せます。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="demo-pour"]',
    title: '作業を始める',
    body: '作業名を入力して「注ぐ」を押すと計測を開始します。',
    placement: 'bottom',
    scene: { tab: 'timer', demo: true },
  },
  {
    target: '[data-session-item]',
    title: '記録を操作する',
    body: 'ダブルクリックで編集、右クリックで追加・削除、ドラッグで並び替えできます。',
    placement: 'bottom',
    scene: { tab: 'timer', demo: true },
  },
  {
    target: '[data-tour="demo-worktime"]',
    title: '休憩・終了',
    body: '休憩や業務終了を記録でき、今日の合計時間もここに出ます。',
    placement: 'top',
    scene: { tab: 'timer', demo: true },
  },
  {
    target: '[data-tour="tab-calendar"]',
    title: 'カレンダー',
    body: '日々の記録をカレンダーで振り返れます。',
    placement: 'top',
  },
  {
    target: '[data-tour="tab-attendance"]',
    title: '勤怠',
    body: '勤怠を集計する画面です。出勤・退勤・休憩を確認できます。',
    placement: 'top',
    scene: { tab: 'attendance' },
  },
  {
    target: '[data-tour="att-copy"]',
    title: 'コピー',
    body: '集計した勤怠テキストをクリップボードにコピーできます。',
    placement: 'top',
    scene: { tab: 'attendance' },
  },
  {
    target: '[data-tour="att-send"]',
    title: '送る',
    body: '勤怠を Slack に送信して共有できます。',
    placement: 'top',
    scene: { tab: 'attendance' },
  },
  {
    target: null,
    title: '準備完了',
    body: '詳しい操作は「?」から。それでは始めましょう！',
    scene: { tab: 'timer' },
  },
]
