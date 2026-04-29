import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#07080a",
          elev: "#0c0e12",
          card: "#111318",
          hover: "#161922",
        },
        border: {
          DEFAULT: "#1f2330",
          subtle: "#161922",
          strong: "#2a2f3d",
        },
        fg: {
          DEFAULT: "#e6e8ee",
          muted: "#8b91a1",
          subtle: "#5a6174",
        },
        accent: {
          DEFAULT: "#6366f1",
          hover: "#7c7ff5",
        },
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#06b6d4",
        polymarket: "#2d9cdb",
        kalshi: "#10b981",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 200ms ease-out",
        "slide-in-right": "slideInRight 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "count-up": "countUp 500ms ease-out",
        shimmer: "shimmer 1.5s infinite linear",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        countUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
