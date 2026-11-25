import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/canvas/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        base: {
          950: '#110e16',
          900: '#15121c',
          850: '#1a1623',
          800: '#211c2c',
        },
        accent: {
          violet: '#7c5cff',
          indigo: '#5e6ad2',
          cyan: '#38bdf8',
          lime: '#d9f99d',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
