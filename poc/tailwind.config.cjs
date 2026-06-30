/** @type {import('tailwindcss').Config} */
// 参照: ルート tailwind.config.js を流用。content だけ poc 視点に調整。
module.exports = {
  darkMode: 'class',
  content: [
    '../src/renderer/src/**/*.{ts,tsx}',
    './front/**/*.{ts,tsx,html}',
  ],
  corePlugins: {
    // 既存CSS Modules画面の崩れを防ぐため全体リセットは無効化
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--sc-border))',
        input: 'hsl(var(--sc-input))',
        ring: 'hsl(var(--sc-ring))',
        background: 'hsl(var(--sc-background))',
        foreground: 'hsl(var(--sc-foreground))',
        primary: {
          DEFAULT: 'hsl(var(--sc-primary))',
          foreground: 'hsl(var(--sc-primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--sc-secondary))',
          foreground: 'hsl(var(--sc-secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--sc-destructive))',
          foreground: 'hsl(var(--sc-destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--sc-muted))',
          foreground: 'hsl(var(--sc-muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--sc-accent))',
          foreground: 'hsl(var(--sc-accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--sc-popover))',
          foreground: 'hsl(var(--sc-popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--sc-card))',
          foreground: 'hsl(var(--sc-card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-family)'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'bubble-rise': {
          '0%': { transform: 'translateY(120px)', opacity: '0' },
          '10%': { opacity: '0.7' },
          '90%': { opacity: '0.4' },
          '100%': { transform: 'translateY(0px)', opacity: '0' },
        },
        'wave-shift': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-120px)' },
        },
        slosh: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'bubble-rise-1': 'bubble-rise 4.5s ease-in infinite',
        'bubble-rise-2': 'bubble-rise 4s ease-in 1.2s infinite',
        'bubble-rise-3': 'bubble-rise 5s ease-in 0.5s infinite',
        'wave-shift': 'wave-shift 4s linear infinite',
        slosh: 'slosh 2.5s ease-in-out infinite',
        'slide-up': 'slide-up 0.25s ease-out',
        'fade-in': 'fade-in 0.25s ease',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
