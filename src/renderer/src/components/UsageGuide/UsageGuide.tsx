interface GuideItem {
  title: string
  description: string
}

const GUIDE_ITEMS: GuideItem[] = [
  { title: '作業を始める', description: '作業名を入力して「注ぐ」を押すと計測を開始します。' },
  { title: '記録を編集', description: '一覧の項目をダブルクリックすると編集できます。' },
  { title: '追加・削除', description: '一覧を右クリックしてメニューから追加・削除します。' },
  { title: '並び替え', description: '項目をドラッグすると順序を入れ替えられます。' },
  { title: '休憩・終了', description: 'カード下部のボタンで休憩や業務終了を記録します。' },
  { title: '勤怠を調整', description: '勤怠タブで出勤・退勤・休憩の時刻をダブルクリックして編集します。' },
  { title: '共有', description: '勤怠タブの「コピー」「送る」でチームに共有します。' },
]

export function UsageGuide() {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {GUIDE_ITEMS.map(item => (
        <li key={item.title} className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-foreground">{item.title}</span>
          <span className="text-[12px] leading-snug text-muted-foreground">{item.description}</span>
        </li>
      ))}
    </ul>
  )
}
