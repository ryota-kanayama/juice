/// <reference types="vite/client" />

import type { ElectronAPI } from './types/session'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
