/**
 * 直列実行キュー。read-modify-write を伴うファイル操作を順番に実行し、
 * 並行 IPC による lost-update（後勝ちで一方の変更が消える）を防ぐ。
 *
 * 返された enqueue に渡した操作は、前の操作が解決（成功・失敗どちらでも）するまで待ってから実行される。
 */
export function createSerialQueue(): <T>(op: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(op: () => Promise<T>): Promise<T> => {
    const run = tail.then(op, op)
    // 失敗してもチェーンを止めないよう、キューの末尾は常に解決済みにする
    tail = run.then(() => undefined, () => undefined)
    return run
  }
}
