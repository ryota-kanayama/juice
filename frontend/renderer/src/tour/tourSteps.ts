export interface TourStep {
  target: string | null
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  scene?: { tab?: 'timer' | 'attendance'; demo?: boolean }
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
    title: '記録を見る',
    body: '項目をクリックすると、その作業をいつからいつまで行ったかを確認できます。',
    placement: 'bottom',
    scene: { tab: 'timer', demo: true },
  },
  {
    target: '[data-session-item]',
    title: '記録を編集・並び替え',
    body: 'カーソルを合わせて鉛筆ボタンで編集、右クリックで削除、ドラッグで並び替えできます。',
    placement: 'bottom',
    scene: { tab: 'timer', demo: true },
  },
  {
    target: '[data-session-item]',
    title: 'あとから記録を足す',
    body: 'タイマーを回し忘れても、右クリックの「追加」から開始・終了の時刻を入れて記録できます。',
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
    body: '押すと大きな画面が開き、これまでの記録を週や月で振り返れます。',
    placement: 'top',
  },
  {
    target: null,
    title: 'カレンダーでできること',
    body: '週表示では作業が時間帯どおりに並び、同じ時間帯の作業は横に並びます。月表示では 1 か月分を見渡せます。',
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
    body: 'Slack に送信して勤怠を切ることができます。',
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
