export interface TourStep {
  target: string | null
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
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
  },
  {
    target: '[data-tour="help"]',
    title: '使い方はここから',
    body: '操作に迷ったら、いつでもここから見返せます。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="tab-timer"]',
    title: 'タイマー',
    body: '作業時間を記録するメイン画面です。',
    placement: 'top',
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
    body: '勤怠を集計してチームに共有できます。',
    placement: 'top',
  },
  {
    target: null,
    title: '準備完了',
    body: '詳しい操作は「?」から。それでは始めましょう！',
  },
]
