import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        felt: {
          900: "#0a1512",
          800: "#0f1f1a",
          700: "#12241d",
        },
        accent: {
          DEFAULT: "#c9a24b", // muted gold, not neon
          soft: "#e4c877",
        },
        ink: "#e8ede9",
        muted: "#8ba097",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 6px 18px -6px rgba(0,0,0,0.5)",
        lift: "0 12px 30px -8px rgba(0,0,0,0.55)",
      },
      keyframes: {
        flip: {
          "0%": { transform: "rotateY(90deg)", opacity: "0" },
          "100%": { transform: "rotateY(0)", opacity: "1" },
        },
        rise: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        flip: "flip 260ms ease-out",
        rise: "rise 220ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
