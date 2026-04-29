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
          DEFAULT: "#0d0f12",
          elev: "#0d0f12",
          card: "#161a20",
          hover: "#1c2129",
        },
        border: {
          DEFAULT: "#2a313c",
          subtle: "#1c2129",
          strong: "#2a313c",
        },
        fg: {
          DEFAULT: "#e6e9ef",
          muted: "#8b92a0",
          subtle: "#5b6578",
        },
        accent: {
          DEFAULT: "#3b82f6",
          hover: "#2563eb",
          chart: "#2563eb",
          orange: "#f97316",
        },
        success: "#22c55e",
        warning: "#eab308",
        danger: "#ef4444",
        info: "#38bdf8",
        polymarket: "#2d9cdb",
        kalshi: "#10b981",
        chart: {
          axisLeft: "#93c5fd",
          axisRight: "#fdba74",
          hoverStroke: "#ffffff",
        },
        signal: {
          high: "#f87171",
          medium: "#fbbf24",
          low: "#4ade80",
        },
        tag: {
          politics: "#7dd3fc",
          economy: "#fcd34d",
          entertainment: "#fca5a5",
          technology: "#c4b5fd",
          crypto: "#fdba74",
          climate: "#86efac",
          other: "#94a3b8",
        },
        hero: {
          tickerFrom: "#021f3c",
          tickerTo: "#051626",
          text: "#f9fafb",
          muted: "#e5e7eb",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        number: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      fontSize: {
        kpi: ["clamp(1.5rem, 3.5vw, 2.35rem)", { lineHeight: "1.1" }],
      },
      borderRadius: {
        tmb: "10px",
        pill: "999px",
      },
      boxShadow: {
        "tmb-chat": "0 20px 50px rgba(0, 0, 0, 0.4)",
        "tmb-chat-toggle": "0 4px 14px rgba(59, 130, 246, 0.4)",
        "tmb-tooltip": "0 8px 24px rgba(0, 0, 0, 0.35)",
        "tmb-cta": "0 4px 24px rgba(59, 130, 246, 0.35)",
        "tmb-hero":
          "0 28px 60px rgba(15, 23, 42, 0.9), inset 0 0 0 1px rgba(15, 23, 42, 0.9)",
      },
      maxWidth: {
        "tmb-header": "1400px",
      },
      height: {
        "tmb-sidebar": "calc(100vh - 7.75rem)",
      },
      minHeight: {
        "tmb-chart": "260px",
      },
      width: {
        "tmb-sidebar": "15rem",
        "tmb-sidebar-collapsed": "3.5rem",
      },
      spacing: {
        tmb1: "0.35rem",
        tmb2: "0.5rem",
        tmb3: "0.65rem",
        tmb4: "0.75rem",
        tmb5: "1rem",
        tmb6: "1.25rem",
        tmb7: "1.5rem",
        tmb8: "1.75rem",
        "tmb-nav": "7.75rem",
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
