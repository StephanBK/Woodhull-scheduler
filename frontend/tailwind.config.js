/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper:   '#f4f1ea',  // engineering vellum
        ink:     '#0d3b66',  // deep blueprint navy
        ink2:    '#1d4e89',  // lighter navy
        rule:    '#dcd5c4',  // muted divider on paper
        warn:    '#f95738',  // safety orange — primary accent
        ok:      '#3a7d44',  // muted green
        flag:    '#fac748',  // amber for "today"
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Impact', 'sans-serif'],
        sans:    ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 #dcd5c4, 0 2px 8px -3px rgba(13, 59, 102, 0.15)',
        sticker: '0 2px 0 0 #0d3b66',
      },
    },
  },
  plugins: [],
}
