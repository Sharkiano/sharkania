// tailwind.config.mjs
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Fondos
        'bg-primary':   '#0a0a0f',
        'bg-secondary': '#12121a',
        'bg-tertiary':  '#1a1a2e',
        'bg-hover':     '#252540',
        // Texto
        'text-primary':   '#e4e4ef',
        'text-secondary': '#8888a4',
        'text-muted':     '#55556a',
        // Acentos
        'accent-primary':   '#6c5ce7',
        'accent-hover':     '#7d6ff0',
        'accent-secondary': '#00cec9',
        // Estados
        'success': '#00e676',
        'danger':  '#ff5252',
        'warning': '#ffd740',
        'info':    '#448aff',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontVariantNumeric: {
        tabular: 'tabular-nums',
      },
      backgroundImage: {
        'gradient-gold':   'linear-gradient(135deg, #f5af19, #f12711)',
        'gradient-purple': 'linear-gradient(135deg, #6c5ce7, #a855f7)',
        'gradient-cyan':   'linear-gradient(135deg, #00cec9, #6c5ce7)',
        'gradient-dark':   'linear-gradient(180deg, #12121a, #0a0a0f)',
      },
      borderRadius: {
        xl: '16px',
      },
      boxShadow: {
        'glow-purple': '0 0 20px rgba(108, 92, 231, 0.3)',
        'glow-cyan':   '0 0 20px rgba(0, 206, 201, 0.3)',
        'elevated':    '0 4px 6px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.4)',
        'elevated-high': '0 20px 60px rgba(0,0,0,0.5), 0 8px 20px rgba(0,0,0,0.3)',
      },
      screens: {
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
      },
    },
  },
  plugins: [],
};