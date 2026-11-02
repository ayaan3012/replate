import type { Config } from "tailwindcss";

/**
 * All colour values reference CSS variables defined in src/index.css.
 * This means:
 *   - Tailwind classes like `bg-pink`, `text-ink`, `border-border` work everywhere.
 *   - Changing a variable in index.css changes the whole app automatically.
 *   - No raw hex is ever written in component files.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Override (not extend) colours so Tailwind's default palette doesn't
    // pollute autocomplete with hundreds of unused names.
    colors: {
      transparent: "transparent",
      current:     "currentColor",
      white:       "var(--color-bg)",
      pink:        "var(--color-pink)",
      blue:        "var(--color-blue)",
      ink:         "var(--color-ink)",
      muted:       "var(--color-muted)",
      border:      "var(--color-border)",
      error:       "var(--color-error)",
      success:     "var(--color-success)",
      "pink-tint":    "var(--color-pink-tint)",
      "blue-tint":    "var(--color-blue-tint)",
      "error-tint":   "var(--color-error-tint)",
      "success-tint": "var(--color-success-tint)",
    },
    borderRadius: {
      none: "0",
      sm:   "var(--radius-sm)",
      DEFAULT: "var(--radius-md)",
      md:   "var(--radius-md)",
      lg:   "var(--radius-lg)",
      xl:   "var(--radius-xl)",
      full: "var(--radius-full)",
    },
    boxShadow: {
      none: "none",
      sm:   "var(--shadow-sm)",
      DEFAULT: "var(--shadow-md)",
      md:   "var(--shadow-md)",
      lg:   "var(--shadow-lg)",
      "glow-pink": "var(--glow-pink)",
      "glow-blue": "var(--glow-blue)",
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
      keyframes: {
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        slideUp: "slideUp 0.2s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
