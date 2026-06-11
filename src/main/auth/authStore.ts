import { safeStorage } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { AuthStatus } from '../../shared/ipc'

/** セッション JWT を safeStorage で暗号化してファイル保存する */
export class AuthStore {
  constructor(private dataDir: string) {}

  private get filePath(): string {
    return join(this.dataDir, 'auth.enc')
  }

  async saveToken(jwt: string): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    await writeFile(this.filePath, safeStorage.encryptString(jwt))
  }

  /** 復号できない・存在しない場合は null */
  async getToken(): Promise<string | null> {
    try {
      return safeStorage.decryptString(await readFile(this.filePath))
    } catch {
      return null
    }
  }

  async clearToken(): Promise<void> {
    await rm(this.filePath, { force: true })
  }

  /** JWT の payload（base64url JSON）から表示用ステータスを作る。署名検証は Lambda 側の責務 */
  async getStatus(): Promise<AuthStatus> {
    const token = await this.getToken()
    if (!token) return { signedIn: false }
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'))
      if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
        return { signedIn: false }
      }
      return {
        signedIn: true,
        name: typeof payload.name === 'string' ? payload.name : undefined,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      }
    } catch {
      return { signedIn: false }
    }
  }
}
