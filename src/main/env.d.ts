/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  readonly MAIN_VITE_ATTENDANCE_API_URL: string
  readonly MAIN_VITE_ATTENDANCE_API_KEY: string
  readonly MAIN_VITE_WHITEBOARD_API_URL: string
  readonly MAIN_VITE_WHITEBOARD_API_KEY: string
  readonly MAIN_VITE_SLACK_BOT_TOKEN: string
  readonly MAIN_VITE_SLACK_CHANNEL_ID: string
}
