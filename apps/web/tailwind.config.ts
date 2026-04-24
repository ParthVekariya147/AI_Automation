import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f4f7e9",
          100: "#e6edc7",
          200: "#d1de21",
          300: "#a0b61f",
          600: "#0f5046",
          700: "#0d4139",
          900: "#102a26"
        }
      },
      boxShadow: {
        panel: "0 18px 45px rgba(15, 80, 70, 0.12)"
      },
      backgroundImage: {
        glow:
          "radial-gradient(circle at top left, rgba(209, 222, 33, 0.22), transparent 40%), radial-gradient(circle at bottom right, rgba(15, 80, 70, 0.18), transparent 35%)"
      }
    }
  },
  plugins: []
} satisfies Config;
