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
        'fade-in-up': 'fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float-slow': 'floatSlow 12s ease-in-out infinite',
        'in': 'in 0.2s ease-out',
        'out': 'out 0.2s ease-in',
        'zoom-in-95': 'zoomIn95 0.2s ease-out',
        'zoom-out-95': 'zoomOut95 0.2s ease-in',
        'slide-in-from-top': 'slideInFromTop 0.2s ease-out',
        'slide-out-to-top': 'slideOutToTop 0.2s ease-in',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeInUp: { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        floatSlow: {
          '0%, 100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(0,-16px,0)' },
        },
        in: { from: { opacity: 0 }, to: { opacity: 1 } },
        out: { from: { opacity: 1 }, to: { opacity: 0 } },
        zoomIn95: { from: { opacity: 0, transform: 'scale(0.95)' }, to: { opacity: 1, transform: 'scale(1)' } },
        zoomOut95: { from: { opacity: 1, transform: 'scale(1)' }, to: { opacity: 0, transform: 'scale(0.95)' } },
        slideInFromTop: { from: { transform: 'translateY(-10px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        slideOutToTop: { from: { transform: 'translateY(0)', opacity: 1 }, to: { transform: 'translateY(-10px)', opacity: 0 } },
      }
    }
  },
  plugins: [],
}
