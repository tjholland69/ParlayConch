/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Mirror the web app dark theme palette
        background: "#09090b",
        card: "#18181b",
        border: "rgba(255,255,255,0.08)",
        primary: {
          DEFAULT: "#22c55e",
          foreground: "#09090b",
        },
        accent: {
          DEFAULT: "#f59e0b",
        },
        muted: {
          DEFAULT: "#3f3f46",
          foreground: "#a1a1aa",
        },
        destructive: "#ef4444",
        foreground: "#fafafa",
      },
    },
  },
  plugins: [],
};
