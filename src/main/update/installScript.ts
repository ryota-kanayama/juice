export interface InstallScriptParams {
  pid: number
  dmgPath: string
  appPath: string
  logPath: string
}

/** 文字列をシングルクォートで安全に囲む（bash 用） */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/**
 * アプリ終了後に .app を差し替える bash スクリプトを生成する。
 * アプリ本体とは別プロセス（detached）で実行される前提。
 */
export function buildInstallScript(p: InstallScriptParams): string {
  return `#!/bin/bash
LOG=${shq(p.logPath)}
exec >>"$LOG" 2>&1
PID=${p.pid}
DMG=${shq(p.dmgPath)}
APP=${shq(p.appPath)}
APP_NAME="$(basename "$APP")"
MOUNT="$(mktemp -d)"
BACKUP="$APP.old"

# 1) アプリの終了を待つ（最大 ~30s の保険ループ）
for i in $(seq 1 100); do kill -0 "$PID" 2>/dev/null || break; sleep 0.3; done

# 2) DMG を専用マウントポイントへ（ボリューム名に依存しない）
hdiutil attach "$DMG" -nobrowse -mountpoint "$MOUNT" || exit 1

# 3) 退避 → コピー → 失敗時ロールバック
rm -rf "$BACKUP"
mv "$APP" "$BACKUP" 2>/dev/null
if ! cp -R "$MOUNT/$APP_NAME" "$APP"; then
  rm -rf "$APP"
  mv "$BACKUP" "$APP"
  hdiutil detach "$MOUNT" -quiet
  open "$APP"
  exit 1
fi
rm -rf "$BACKUP"

# 4) Gatekeeper 対策 → アンマウント → 新バージョン起動
xattr -dr com.apple.quarantine "$APP" 2>/dev/null
hdiutil detach "$MOUNT" -quiet || true
rmdir "$MOUNT" 2>/dev/null
open "$APP"
`
}
