import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Syne'", "sans-serif"],
        body: ["'DM Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        ink: "#0D0D0D",
        paper: "#F5F2ED",
        cream: "#EAE6DF",
        accent: "#E8613A",
        "accent-light": "#F2956F",
        "accent-dim": "#3D2218",
        teal: "#2DBFAD",
        "teal-dim": "#1A7A72",
        muted: "#8C8680",
        border: "#D4CFC7",
      },
    },
  },
  plugins: [],
};
export default config;
