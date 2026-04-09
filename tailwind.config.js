/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bench: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#b8dbff',
          300: '#7abfff',
          400: '#3a9fff',
          500: '#0f7fff',
          600: '#0062d6',
          700: '#004dab',
          800: '#00418d',
          900: '#003874',
          950: '#00234d',
        },
      },
    },
  },
  plugins: [],
}
