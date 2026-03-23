import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        background: "var(--color-bg)",
        "bg-secondary": "var(--color-bg-secondary)",
        "bg-hover": "var(--color-bg-hover)",
        foreground: "var(--color-text)",
        "text-secondary": "var(--color-text-secondary)",
        "text-tertiary": "var(--color-text-tertiary)",
        border: "var(--color-border)",
        "border-hover": "var(--color-border-hover)",
        accent: "var(--color-accent)",
        "accent-bg": "var(--color-accent-bg)",
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans SC", "system-ui", "sans-serif"],
      },
      maxWidth: {
        content: "48rem",
      },
    },
  },
  plugins: [],
};

export default config;
