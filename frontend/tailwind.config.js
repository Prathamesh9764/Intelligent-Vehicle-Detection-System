/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        asphalt: {
          950: "rgb(var(--color-asphalt-950) / <alpha-value>)",
          900: "rgb(var(--color-asphalt-900) / <alpha-value>)",
          800: "rgb(var(--color-asphalt-800) / <alpha-value>)",
          700: "rgb(var(--color-asphalt-700) / <alpha-value>)",
          600: "rgb(var(--color-asphalt-600) / <alpha-value>)",
        },
        lane: {
          DEFAULT: "var(--color-lane)",
          dim: "var(--color-lane-dim)",
        },
        alert: "var(--color-alert)",
        live: "var(--color-live)",
        amber: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          950: "#451a03",
        },
      },
      fontFamily: {
        display: ["'Cinzel'", "'Rozha One'", "Georgia", "serif"],
        serif: ["'Cinzel'", "'Rozha One'", "Georgia", "serif"],
        body: ["'Sora'", "'Outfit'", "system-ui", "-apple-system", "sans-serif"],
        sans: ["'Sora'", "'Outfit'", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        glow: "var(--shadow-glow)",
        glowLive: "var(--shadow-glow-live)",
        glowAlert: "var(--shadow-glow-alert)",
      },
    },
  },
  plugins: [],
};
