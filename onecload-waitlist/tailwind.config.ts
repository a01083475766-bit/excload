import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#171717",
          850: "#2a2a2a",
          700: "#44403c",
          500: "#78716c",
        },
        brand: {
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
        line: "#dedbd4",
        paper: "#fbfaf7",
      },
      boxShadow: {
        table: "0 18px 45px rgba(23, 23, 23, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
