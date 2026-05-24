export interface ThemeMeta {
  id: string
  name: string
  bg: string
  accent: string
  accentSecondary?: string
  textPrimary: string
  dark?: boolean
}

export const THEMES: ThemeMeta[] = [
  // ニュートラル（shadcn系）
  { id: 'slate', name: 'Slate', bg: '#FAFAFA', accent: '#18181B', accentSecondary: '#27272A', textPrimary: '#18181B' },
  // ニュートラル面 + アクセント
  { id: 'rose',  name: 'Rose',  bg: '#FAFAFA', accent: '#E8546C', accentSecondary: '#D4405A', textPrimary: '#18181B' },
  { id: 'sky',   name: 'Sky',   bg: '#FAFAFA', accent: '#4A9FE8', accentSecondary: '#3580D0', textPrimary: '#18181B' },
  { id: 'lemon', name: 'Lemon', bg: '#FAFAFA', accent: '#E8C820', accentSecondary: '#D0A800', textPrimary: '#18181B' },
]

export const DARK_THEMES: ThemeMeta[] = [
  { id: 'graphite', name: 'Graphite', bg: '#18181B', accent: '#FAFAFA', accentSecondary: '#E4E4E7', textPrimary: '#FAFAFA', dark: true },
]
