import type { Config } from "tailwindcss";

// Type & motion after eugeniagrab.com (Cormorant + Inter, ink #142022, rose-brown #936e6c, cream #faf5ee).
// Restraint after motorq.com (light-weight headings, hairline borders, no gradients/shadows, sparse accent).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "ui-serif", "Georgia"],
        mono: ["var(--font-sans)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: { DEFAULT: "#142022", 2: "#2B3638", 3: "#5E6766", 4: "#8C918E", 5: "#B9BBB6" },
        line: { DEFAULT: "#ECE6DD", 2: "#E0D8CC" },
        canvas: { DEFAULT: "#FFFFFF", 2: "#FCFAF6", 3: "#F5F0E8" },
        cream: "#FAF5EE",
        // accent: muted rose-brown, used sparingly
        brand: { 50: "#F8F2F0", 100: "#EFE4E1", 200: "#DFCBC6", 400: "#B08E8B", 500: "#936E6C", 600: "#7D5B59", 700: "#603D3B", 900: "#3B222B" },
        risk: {
          low: "#4F7A5D", lowbg: "#EEF3EE",
          med: "#B07D2E", medbg: "#F8F1E3",
          high: "#A3443B", highbg: "#F7E9E6",
        },
        // remap Tailwind hues used for status chips onto the muted palette
        emerald: { 50: "#EEF3EE", 100: "#DCE7DE", 500: "#4F7A5D", 600: "#436A50", 700: "#365842" },
        amber: { 50: "#F8F1E3", 100: "#F0E2C4", 500: "#B07D2E", 600: "#976A25", 700: "#7A551D" },
        rose: { 50: "#F7E9E6", 100: "#EED4CF", 500: "#A3443B", 600: "#8E3A32", 700: "#742F29" },
        cyan: { 50: "#EDF1F1", 100: "#D9E2E2", 200: "#C2D0D0", 500: "#4E6E70", 600: "#40605F", 700: "#33504F" },
      },
      borderRadius: { xl: "10px", "2xl": "12px", "3xl": "16px" },
      boxShadow: {
        card: "none",
        lift: "0 12px 32px -18px rgba(20,32,34,.22)",
        glow: "none",
      },
      letterSpacing: { tightest: "-0.04em" },
      transitionTimingFunction: {
        out: "cubic-bezier(.16,1,.3,1)",
        soft: "cubic-bezier(.22,1,.36,1)",
        ink: "cubic-bezier(.35,0,.15,1)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: "1" } },
        blurIn: { "0%": { filter: "blur(5px)", opacity: "0", transform: "translate3d(0,6px,0)" }, "100%": { filter: "blur(0)", opacity: "1", transform: "none" } },
      },
      animation: {
        shimmer: "shimmer 1.8s infinite",
        pulseDot: "pulseDot 2s infinite",
        blurIn: "blurIn .9s cubic-bezier(.22,1,.36,1) both",
      },
    },
  },
  plugins: [],
};
export default config;
