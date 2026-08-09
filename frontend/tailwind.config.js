/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        // Surface tones — pulled from the image (paper-grey background,
        // pure white cards, near-black sidebar).
        canvas: "#f5f6f8",
        sidebar: "#0b0d11",
        sidebarHover: "#15181f",
        sidebarActive: "#1c2030",
        ink: {
          900: "#0b0d11",
          800: "#1c1f26",
          700: "#2d3139",
          600: "#4a4f5a",
          500: "#6b7280",
          400: "#9098a4",
          300: "#c0c5cd",
          200: "#e3e5ea",
          100: "#eef0f3",
          50: "#f7f8fa",
        },
        // Brand indigo used for charts, links, and the active sidebar item.
        brand: {
          50: "#eef0ff",
          100: "#dde2ff",
          200: "#b9c1ff",
          300: "#8e96ff",
          400: "#6970ff",
          500: "#5b6cff",
          600: "#4451e0",
          700: "#3138b0",
          800: "#1f237a",
          900: "#13174e",
        },
        // Severity tokens — used for text and background colour.
        // low → brand blue (was green); high → red (was orange);
        // medium → orange (was amber). Values are tuned to read at
        // small text sizes (~12px) and to match the Top Findings
        // stripe palette exactly so text and stripe always agree.
        sev: {
          critical: "#ef4444", // red-500   (same as the high stripe)
          high: "#ef4444",     // red-500   (same as the stripe)
          medium: "#f97316",   // orange-500 (brighter than #ea580c so
                               // it doesn't read as brown at 12px)
          low: "#5b6cff",      // brand-500 (blue, not green)
          info: "#5b6cff",     // brand-500
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(13, 17, 28, 0.04), 0 1px 3px rgba(13, 17, 28, 0.06)",
        cardHover:
          "0 4px 14px rgba(13, 17, 28, 0.06), 0 1px 3px rgba(13, 17, 28, 0.06)",
        soft: "0 1px 0 rgba(13, 17, 28, 0.04)",
        ring: "0 0 0 1px rgba(91, 108, 255, 0.18), 0 0 0 4px rgba(91, 108, 255, 0.08)",
        topbar:
          "0 1px 0 rgba(13, 17, 28, 0.05), 0 1px 16px rgba(13, 17, 28, 0.04)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      backgroundImage: {
        sidebarGlow:
          "radial-gradient(120% 60% at 70% 0%, rgba(91,108,255,0.18) 0%, rgba(91,108,255,0) 60%)",
        sparkBlue:
          "linear-gradient(180deg, rgba(91,108,255,0.20) 0%, rgba(91,108,255,0) 100%)",
      },
      transitionTimingFunction: {
        ease: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
