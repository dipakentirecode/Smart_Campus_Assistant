/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#182a33",
        muted: "#71818a",
        canvas: "#f5f7f8",
        brand: "#1b6d68",
        accent: "#d8eee9",
        line: "#e4e9eb"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 12px 36px rgba(24, 42, 51, 0.07)"
      }
    }
  },
  plugins: []
};
