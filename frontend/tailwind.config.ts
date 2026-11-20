import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--canvas-rgb) / <alpha-value>)",
        shell: "rgb(var(--shell-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        raised: "rgb(var(--raised-rgb) / <alpha-value>)",
        line: "rgb(var(--line-rgb) / <alpha-value>)",
        "line-strong": "rgb(var(--line-strong-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        faint: "rgb(var(--faint-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg-rgb) / <alpha-value>)",
        success: "rgb(var(--success-rgb) / <alpha-value>)",
        warning: "rgb(var(--warning-rgb) / <alpha-value>)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-sora)", "Sora", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-manrope)", "Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      // One deliberate scale, tuned for readability first.
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
        xs: ["0.875rem", { lineHeight: "1.45rem" }],
        sm: ["0.9375rem", { lineHeight: "1.55rem" }],
        base: ["1.0625rem", { lineHeight: "1.7rem" }],
        lg: ["1.1875rem", { lineHeight: "1.8rem" }],
        xl: ["1.375rem", { lineHeight: "1.9rem" }],
        "2xl": ["1.625rem", { lineHeight: "2.1rem" }],
        "3xl": ["2rem", { lineHeight: "2.35rem" }],
        "4xl": ["2.5rem", { lineHeight: "2.8rem" }],
        "5xl": ["3.25rem", { lineHeight: "3.4rem" }],
        "6xl": ["4rem", { lineHeight: "4.1rem" }],
        "7xl": ["4.75rem", { lineHeight: "4.8rem" }],
      },
      borderRadius: {
        card: "0.875rem",
      },
      boxShadow: {
        panel: "0 1px 0 0 var(--line)",
        card: "var(--shadow-card)",
        lift: "var(--shadow-lift)",
        pop: "var(--shadow-pop)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
        snap: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "dash-draw": {
          "0%": { strokeDashoffset: "240" },
          "100%": { strokeDashoffset: "0" },
        },
        "node-pulse": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "dash-draw": "dash-draw 2.4s ease-out forwards",
        "node-pulse": "node-pulse 4s ease-in-out infinite",
        "fade-up": "fade-up 0.45s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        "scale-in": "scale-in 0.3s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.8s linear infinite",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
