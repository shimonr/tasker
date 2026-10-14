export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Fredoka Variable"', '"Comic Neue"', 'ui-rounded', 'system-ui', 'sans-serif'],
      },
      colors: {
        grape: { 50: '#f5f0ff', 100: '#ede4ff', 200: '#d9c7ff', 300: '#c1a3ff', 400: '#a67cff', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6425d0', 900: '#3b0a7a' },
        bubble: { 50: '#fff0f7', 100: '#ffe0ef', 200: '#ffc2df', 400: '#ff7ab8', 500: '#ff4fa0', 600: '#e8308a' },
        sunny: { 50: '#fffbea', 100: '#fff3bf', 200: '#ffe680', 300: '#ffd43b', 400: '#fcc419', 500: '#f59f00' },
        ocean: { 50: '#ebf8ff', 100: '#d0efff', 200: '#a5e0ff', 400: '#4dc0ff', 500: '#1ea7fd', 600: '#0b87d6' },
        leaf: { 50: '#effde8', 100: '#dcfbcf', 200: '#b7f39b', 400: '#6fdc3b', 500: '#4cc417', 600: '#3a9d0f' },
        tangy: { 100: '#ffe8cc', 400: '#ffa94d', 500: '#ff922b', 600: '#f76707' },
      },
      boxShadow: {
        chunky: '0 6px 0 0 rgba(59, 10, 122, 0.12)',
        pop: '0 10px 30px -10px rgba(124, 58, 237, 0.45)',
      },
      keyframes: {
        wiggle: { '0%,100%': { transform: 'rotate(-4deg)' }, '50%': { transform: 'rotate(4deg)' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
        confetti: {
          '0%': { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translate3d(var(--dx), 70vh, 0) rotate(720deg)', opacity: '0' },
        },
        pop: { '0%': { transform: 'scale(0.6)', opacity: '0' }, '80%': { transform: 'scale(1.05)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      },
      animation: {
        wiggle: 'wiggle 1.2s ease-in-out infinite',
        floaty: 'floaty 6s ease-in-out infinite',
        confetti: 'confetti 1.6s ease-out forwards',
        pop: 'pop 0.35s ease-out',
      },
    },
  },
  plugins: [],
}
