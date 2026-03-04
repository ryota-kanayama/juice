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
  // 赤系
  { id: 'rose',    name: 'Rose',    bg: '#FFF5F5', accent: '#E8546C', accentSecondary: '#D4405A', textPrimary: '#4A1520' },
  { id: 'coral',   name: 'Coral',   bg: '#FFF4F0', accent: '#FF6B4A', accentSecondary: '#E8523A', textPrimary: '#4A1A10' },
  // 青系
  { id: 'sky',     name: 'Sky',     bg: '#F0F7FF', accent: '#4A9FE8', accentSecondary: '#3580D0', textPrimary: '#102840' },
  { id: 'ocean',   name: 'Ocean',   bg: '#F0F4FF', accent: '#5468E8', accentSecondary: '#4050D0', textPrimary: '#151840' },
  // 黄色系
  { id: 'lemon',   name: 'Lemon',   bg: '#FFFEF0', accent: '#E8C820', accentSecondary: '#D0A800', textPrimary: '#403800' },
  { id: 'honey',   name: 'Honey',   bg: '#FFFBF0', accent: '#E8A020', accentSecondary: '#D08800', textPrimary: '#402800' },
]

export const DARK_THEMES: ThemeMeta[] = [
  // 赤系
  { id: 'crimson',  name: 'Crimson',  bg: '#1E1012', accent: '#E8546C', accentSecondary: '#C84058', textPrimary: '#FFE8EC', dark: true },
  { id: 'ember',    name: 'Ember',    bg: '#1E1410', accent: '#FF6B4A', accentSecondary: '#E85838', textPrimary: '#FFEAE4', dark: true },
  // 青系
  { id: 'night',    name: 'Night',    bg: '#0E1620', accent: '#4A9FE8', accentSecondary: '#3880D0', textPrimary: '#E4F0FF', dark: true },
  { id: 'deep',     name: 'Deep',     bg: '#10121E', accent: '#5468E8', accentSecondary: '#4858D0', textPrimary: '#E8ECFF', dark: true },
  // 黄色系
  { id: 'midnight', name: 'Midnight', bg: '#1A1810', accent: '#E8C820', accentSecondary: '#C8A800', textPrimary: '#FFF8E0', dark: true },
  { id: 'amber',    name: 'Amber',    bg: '#1E1810', accent: '#E8A020', accentSecondary: '#C88800', textPrimary: '#FFF4E0', dark: true },
]

export const ALL_THEMES: ThemeMeta[] = [...THEMES, ...DARK_THEMES]
