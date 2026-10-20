/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          light: '#DDD9FC',
          DEFAULT: '#E3E0F8',
          dark: '#0F1018',
        },
        surface: {
          card: '#FFFFFF',
          bubble: '#F8F9FA',
          hover: '#F3F4F6',
          darkCard: '#171824',
          darkBubble: '#1F2030',
        },
        charcoal: {
          DEFAULT: '#242730',
          hover: '#3B3F4E',
        },
        brand: {
          purple: '#7C3AED',
          light: '#F4F1FE',
          ring: '#DDD6FE',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      transitionTimingFunction: {
        'spring-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'spring-in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms cubic-bezier(0.23, 1, 0.32, 1) forwards',
        'slide-up': 'slideUp 250ms cubic-bezier(0.23, 1, 0.32, 1) forwards',
        'pulse-subtle': 'pulseSubtle 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
}
