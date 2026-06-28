import { readFile } from 'fs/promises'
import { dirname, join } from 'path'

/** 実行ファイル(.../Contents/MacOS/Juice) から .../Contents/Info.plist を導く */
export function bundleInfoPlistPath(execPath: string): string {
  // execPath = <App>.app/Contents/MacOS/Juice → 2つ上が Contents
  const contentsDir = dirname(dirname(execPath))
  return join(contentsDir, 'Info.plist')
}

/** plist XML から CFBundleShortVersionString の値を取り出す。無ければ null */
export function parseShortVersionFromPlist(xml: string): string | null {
  const m = xml.match(
    /<key>CFBundleShortVersionString<\/key>\s*<string[^>]*>([^<]+)<\/string>/,
  )
  return m ? m[1].trim() : null
}

/** インストール済みアプリの表示バージョンを読む。失敗時は null */
export async function readInstalledVersion(execPath: string): Promise<string | null> {
  try {
    const xml = await readFile(bundleInfoPlistPath(execPath), 'utf-8')
    return parseShortVersionFromPlist(xml)
  } catch {
    return null
  }
}
