// 時間軸上で重なる区間を横に並べるための配置計算(純粋関数)。
// Google カレンダーと同じ考え方で、列を割り当てたあと右隣が空いていれば幅を伸ばす。

export interface Span {
  /** 分単位の開始。start < end */
  start: number
  /** 分単位の終了 */
  end: number
}

export interface Placement {
  /** 列の左端(%) */
  left: number
  /** 幅(%)。left + width <= 100 */
  width: number
}

/** 端が接するだけ(end === start)は重なりとみなさない。 */
function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end
}

/**
 * 重なる区間を横に並べる。返り値は入力と同じ並び順・同じ長さ。
 * 重なりが連鎖する一団ごとに列を割り当て、右隣の列が空いていれば幅を伸ばす。
 */
export function layoutOverlaps(spans: Span[]): Placement[] {
  const result: Placement[] = new Array(spans.length)
  if (spans.length === 0) return result

  // 開始が早い順、同じ開始なら長い順。長いものを左に置くと Google カレンダーと同じ見え方になる
  const order = spans
    .map((_, i) => i)
    .sort((a, b) =>
      spans[a].start !== spans[b].start
        ? spans[a].start - spans[b].start
        : spans[b].end - spans[a].end,
    )

  let cluster: number[] = []
  let clusterEnd = -Infinity

  /** 溜まったクラスタに列を割り当て、幅を伸ばして result へ書き込む。 */
  const flush = (): void => {
    if (cluster.length === 0) return
    // 各列に入れた区間の添字(列の中では時刻順に並ぶ)
    const columns: number[][] = []
    const columnOf = new Map<number, number>()
    for (const i of cluster) {
      const target = columns.findIndex(col => spans[col[col.length - 1]].end <= spans[i].start)
      if (target >= 0) {
        columns[target].push(i)
        columnOf.set(i, target)
      } else {
        columns.push([i])
        columnOf.set(i, columns.length - 1)
      }
    }

    const total = columns.length
    for (const i of cluster) {
      const col = columnOf.get(i) as number
      // 右隣の列がこの時間帯で空いている間だけ伸ばす
      let span = 1
      for (let next = col + 1; next < total; next += 1) {
        if (columns[next].some(j => overlaps(spans[i], spans[j]))) break
        span += 1
      }
      result[i] = { left: (col / total) * 100, width: (span / total) * 100 }
    }
    cluster = []
    clusterEnd = -Infinity
  }

  for (const i of order) {
    // これまでの最大終了時刻より後に始まるなら、重なりの連鎖が切れている
    if (cluster.length > 0 && spans[i].start >= clusterEnd) flush()
    cluster.push(i)
    clusterEnd = Math.max(clusterEnd, spans[i].end)
  }
  flush()

  return result
}
