/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#a46a57",
        accent: "#ad816d",
        tertiary: "#beac95",
      },
      fontFamily: {
        sans: ["Montserrat_400Regular"],
        "sans-medium": ["Montserrat_500Medium"],
        "sans-semibold": ["Montserrat_600SemiBold"],
        "sans-bold": ["Montserrat_700Bold"],
        display: ["ProtestStrike_400Regular"],
      },
    },
  },
  plugins: [],
};
