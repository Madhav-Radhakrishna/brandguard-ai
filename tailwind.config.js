/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // BrandGuard design tokens
        bg:       '#0A0A0A',
        surface:  '#111111',
        border:   '#262626',
        fg:       '#F5F5F5',
        muted:    '#A3A3A3',
        accent:   '#E5262B',
        'accent-hover': '#C41E23',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      fontSize: {
        'page-title': ['30px', { lineHeight: '1.1', fontWeight: '600', letterSpacing: '-0.02em' }],
        'label':      ['11px', { lineHeight: '1.4', fontWeight: '500', letterSpacing: '0.08em' }],
      },
    },
  },
  plugins: [],
}
