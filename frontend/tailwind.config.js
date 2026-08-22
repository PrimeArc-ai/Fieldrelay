/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111315",
        ember: "#D8643E",
        paper: "#F1EFE9",
        mute: "#6B6B68",
      },
    },
  },
  plugins: [],
};
