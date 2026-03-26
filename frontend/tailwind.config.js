module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f8ff',
          100: '#dceeff',
          200: '#b2dbff',
          300: '#7bc2ff',
          400: '#42a4ff',
          500: '#1491ff',
          600: '#0c73db',
          700: '#0d5daf',
        },
        surface: {
          950: '#050816',
          900: '#08101f',
          850: '#0d1628',
          800: '#101b2f',
          700: '#15233d',
          600: '#243553',
          500: '#41577a',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float-slow': 'floatSlow 12s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        floatSlow: {
          '0%, 100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(0,-16px,0)' },
        },
      }
    }
  },
  plugins: [],
}
