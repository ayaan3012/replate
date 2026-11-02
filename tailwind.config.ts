import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // shared theme palette — matches the existing CSS variables
        brand: {
          white: "#ffffff",
          pink:  "#e6007a",
          blue:  "#0a5cff",
          ink:   "#14143a",
          muted: "#5b5f7a",
          line:  "#e4e6f2",
          pinkx: "#ffe6f3",
          bluex: "#e6f0ff",
        },
      },
      fontFamily: {
        sans: ["system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
