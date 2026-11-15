import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

/*
 * Design tokens follow DESIGN.md (Notion-inspired system).
 * The default Tailwind palettes used across the app are remapped so that
 * existing utility classes automatically pick up the new look:
 *   slate   -> warm Notion neutrals (surface / hairline / steel / charcoal / ink)
 *   indigo  -> Notion purple primary scale (#5645d4)
 *   rose    -> semantic error, emerald -> success, amber -> warning
 *   sky     -> link blue
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#5645d4",
          pressed: "#4534b3",
          deep: "#3a2a99",
        },
        navy: {
          DEFAULT: "#0a1530",
          deep: "#070f24",
          mid: "#1a2a52",
        },
        link: { DEFAULT: "#0075de", pressed: "#005bab" },
        brand: {
          orange: "#dd5b00",
          "orange-deep": "#793400",
          pink: "#ff64c8",
          "pink-deep": "#a02e6d",
          purple: "#7b3ff2",
          "purple-300": "#d6b6f6",
          "purple-800": "#391c57",
          teal: "#2a9d99",
          green: "#1aae39",
          yellow: "#f5d75e",
          brown: "#523410",
        },
        tint: {
          peach: "#ffe8d4",
          rose: "#fde0ec",
          mint: "#d9f3e1",
          lavender: "#e6e0f5",
          sky: "#dcecfa",
          yellow: "#fef7d6",
          "yellow-bold": "#f9e79f",
          cream: "#f8f5e8",
          gray: "#f0eeec",
        },
        canvas: "#ffffff",
        surface: { DEFAULT: "#f6f5f4", soft: "#fafaf9" },
        hairline: {
          DEFAULT: "#e5e3df",
          soft: "#ede9e4",
          strong: "#c8c4be",
        },
        ink: { DEFAULT: "#1a1a1a", deep: "#000000" },
        charcoal: "#37352f",
        steel: "#787671",
        stone: "#a4a097",
        muted: "#bbb8b1",
        slate: {
          50: "#fafaf9",
          100: "#f6f5f4",
          200: "#e5e3df",
          300: "#c8c4be",
          400: "#a4a097",
          500: "#787671",
          600: "#5d5b54",
          700: "#37352f",
          800: "#262521",
          900: "#1a1a1a",
          950: "#0f0f0e",
        },
        indigo: {
          50: "#f3f1fc",
          100: "#e6e0f5",
          200: "#d3cbf2",
          300: "#b3a8ea",
          400: "#8e80e0",
          500: "#6d5dd9",
          600: "#5645d4",
          700: "#4534b3",
          800: "#3a2a99",
          900: "#2c2075",
          950: "#1c1450",
        },
        violet: {
          50: "#f4effe",
          100: "#e6e0f5",
          500: "#7b3ff2",
          600: "#5645d4",
          700: "#3a2a99",
        },
        rose: {
          50: "#fdeeee",
          100: "#fbdcdc",
          200: "#f6bcbc",
          300: "#ee9393",
          400: "#e65f5f",
          500: "#e03131",
          600: "#c92a2a",
          700: "#a61e1e",
          800: "#861818",
          900: "#5f1111",
        },
        emerald: {
          50: "#eaf8ee",
          100: "#d9f3e1",
          200: "#b4e6c2",
          500: "#1aae39",
          600: "#15922f",
          700: "#117a27",
          800: "#0d5f1e",
        },
        amber: {
          50: "#fff4ea",
          100: "#ffe8d4",
          200: "#ffd1aa",
          500: "#dd5b00",
          600: "#b94c00",
          700: "#9a3f00",
          800: "#793400",
        },
        sky: {
          50: "#ecf5fd",
          100: "#dcecfa",
          200: "#b8d8f5",
          500: "#0075de",
          600: "#0075de",
          700: "#005bab",
        },
      },
      fontFamily: {
        sans: [
          "Notion Sans",
          "Inter",
          "-apple-system",
          "system-ui",
          "Segoe UI",
          "Helvetica",
          "PingFang SC",
          "Microsoft YaHei",
          "Noto Sans CJK SC",
          "sans-serif",
        ],
      },
      fontSize: {
        "hero-display": ["80px", { lineHeight: "1.05", letterSpacing: "-2px", fontWeight: "600" }],
        "display-lg": ["56px", { lineHeight: "1.10", letterSpacing: "-1px", fontWeight: "600" }],
        "heading-1": ["48px", { lineHeight: "1.15", letterSpacing: "-0.5px", fontWeight: "600" }],
        "heading-2": ["36px", { lineHeight: "1.20", letterSpacing: "-0.5px", fontWeight: "600" }],
        "heading-3": ["28px", { lineHeight: "1.25", fontWeight: "600" }],
        "heading-4": ["22px", { lineHeight: "1.30", fontWeight: "600" }],
        "heading-5": ["18px", { lineHeight: "1.40", fontWeight: "600" }],
        subtitle: ["18px", { lineHeight: "1.50" }],
        caption: ["13px", { lineHeight: "1.40" }],
        micro: ["12px", { lineHeight: "1.40" }],
      },
      borderRadius: {
        // Cards use 12px consistently; larger feature panels top out at 16px.
        "2xl": "12px",
        "3xl": "16px",
      },
      spacing: {
        "section-sm": "48px",
        section: "64px",
        "section-lg": "96px",
        hero: "120px",
      },
      maxWidth: {
        container: "1280px",
      },
      boxShadow: {
        sm: "rgba(15, 15, 15, 0.04) 0px 1px 2px 0px",
        DEFAULT: "rgba(15, 15, 15, 0.06) 0px 2px 6px 0px",
        md: "rgba(15, 15, 15, 0.08) 0px 4px 12px 0px",
        lg: "rgba(15, 15, 15, 0.08) 0px 4px 12px 0px",
        xl: "rgba(15, 15, 15, 0.16) 0px 16px 48px -8px",
        soft: "rgba(15, 15, 15, 0.04) 0px 1px 2px 0px",
        card: "rgba(15, 15, 15, 0.08) 0px 4px 12px 0px",
        mockup: "rgba(15, 15, 15, 0.20) 0px 24px 48px -8px",
        modal: "rgba(15, 15, 15, 0.16) 0px 16px 48px -8px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 80%, 100%": { opacity: "0.35", transform: "scale(0.75)" },
          "40%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 240ms ease-out both",
        "pulse-dot": "pulse-dot 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
