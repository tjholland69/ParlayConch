/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#141926",
        card: "#1c2538",
        border: "#2a3447",
        primary: {
          DEFAULT: "#2563eb",
          foreground: "#ffffff",
        },
        accent: {
          DEFAULT: "#0ea5e9",
          foreground: "#0c1a2e",
        },
        muted: {
          DEFAULT: "#1e2a3b",
          foreground: "#94a3b8",
        },
        destructive: "#ef4444",
        foreground: "#f1f5f9",
        success: "#22c55e",
        warning: "#f59e0b",
      },
    },
  },
  plugins: [],
};
