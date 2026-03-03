export interface ThemeMeta {
  id: string
  name: string
  bg: string
  accent: string
  textPrimary: string
  dark?: boolean
}

export const THEMES: ThemeMeta[] = [
  { id: 'orange', name: 'Orange',  bg: '#FFFDF5', accent: '#FF9500', textPrimary: '#5C3D00' },
  { id: 'lemon',  name: 'Lemon',   bg: '#FFFFF0', accent: '#E8C800', textPrimary: '#5C5000' },
  { id: 'grape',  name: 'Grape',   bg: '#F8F0FF', accent: '#9B59B6', textPrimary: '#3D1F56' },
  { id: 'melon',  name: 'Melon',   bg: '#F0FFF4', accent: '#27AE60', textPrimary: '#1A3D2B' },
  { id: 'peach',  name: 'Peach',   bg: '#FFF5F0', accent: '#FF7675', textPrimary: '#5C2020' },
  { id: 'berry',  name: 'Berry',   bg: '#FFF0F5', accent: '#E84393', textPrimary: '#4A1A2E' },
]

export const DARK_THEMES: ThemeMeta[] = [
  { id: 'cocoa',      name: 'Cocoa',      bg: '#2C2018', accent: '#FF9500', textPrimary: '#FFF0E2', dark: true },
  { id: 'blackberry', name: 'Blackberry', bg: '#261C30', accent: '#B06CE8', textPrimary: '#F2EAFF', dark: true },
  { id: 'olive',      name: 'Olive',      bg: '#1A2820', accent: '#40C870', textPrimary: '#E8F8EC', dark: true },
  { id: 'plum',       name: 'Plum',       bg: '#2A1C28', accent: '#E84393', textPrimary: '#FCEAF5', dark: true },
]

export const ALL_THEMES: ThemeMeta[] = [...THEMES, ...DARK_THEMES]
