import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta: '#16202e',
        marca: { DEFAULT: '#0e6b64', oscuro: '#0a4f4a', claro: '#e3f1ef' },
        papel: '#f6f5f1',
      },
    },
  },
  plugins: [],
} satisfies Config
