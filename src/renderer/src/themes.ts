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
  { id: 'orange', name: 'Orange',  bg: '#FFFDF5', accent: '#FF9500', accentSecondary: '#F2720A', textPrimary: '#5C3D00' },
  { id: 'lemon',  name: 'Lemon',   bg: '#FFFFF0', accent: '#E8C800', accentSecondary: '#D4A000', textPrimary: '#5C5000' },
  { id: 'grape',  name: 'Grape',   bg: '#F8F0FF', accent: '#9B59B6', accentSecondary: '#7B68EE', textPrimary: '#3D1F56' },
  { id: 'melon',  name: 'Melon',   bg: '#F0FFF4', accent: '#27AE60', accentSecondary: '#1E8A50', textPrimary: '#1A3D2B' },
  { id: 'peach',  name: 'Peach',   bg: '#FFF5F0', accent: '#FF7675', accentSecondary: '#E84C4C', textPrimary: '#5C2020' },
  { id: 'berry',  name: 'Berry',   bg: '#FFF0F5', accent: '#E84393', accentSecondary: '#C03070', textPrimary: '#4A1A2E' },
]

export const DARK_THEMES: ThemeMeta[] = [
  { id: 'cocoa',      name: 'Cocoa',      bg: '#1E1510', accent: '#FF9500', accentSecondary: '#E87A00', textPrimary: '#FFF0E2', dark: true },
  { id: 'blackberry', name: 'Blackberry', bg: '#1A1028', accent: '#B06CE8', accentSecondary: '#7B68EE', textPrimary: '#F2EAFF', dark: true },
  { id: 'olive',      name: 'Olive',      bg: '#101E18', accent: '#40C870', accentSecondary: '#2AA858', textPrimary: '#E8F8EC', dark: true },
  { id: 'plum',       name: 'Plum',       bg: '#1E1018', accent: '#E84393', accentSecondary: '#C03070', textPrimary: '#FCEAF5', dark: true },
]

export const ALL_THEMES: ThemeMeta[] = [...THEMES, ...DARK_THEMES]
