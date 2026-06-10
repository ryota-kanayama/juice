// セッションの色（ジュースの色）パレット。

export const JUICE_COLORS = [
  '#FF6B6B', // いちご
  '#FF9500', // オレンジ
  '#F7B731', // レモン
  '#e17055', // グレープフルーツ
  '#fd79a8', // もも
  '#a29bfe', // ぶどう
  '#45aaf2', // ブルーベリー
  '#0984e3', // カシス
  '#26de81', // マスカット
  '#00b894', // キウイ
]

/** パレットからランダムに1色選ぶ */
export function randomColor(): string {
  return JUICE_COLORS[Math.floor(Math.random() * JUICE_COLORS.length)]
}
