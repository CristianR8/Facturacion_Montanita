/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f7f5ee",
          100: "#ede6d6",
          200: "#dcccae",
          300: "#caaf82",
          400: "#ba9358",
          500: "#a87633",
          600: "#875d26",
          700: "#65451d",
          800: "#432d14",
          900: "#24170a"
        },
        ink: "#171717",
        pine: "#1f4336",
        clay: "#a24f34"
      },
      boxShadow: {
        soft: "0 24px 60px -24px rgba(23, 23, 23, 0.32)"
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["Segoe UI", "sans-serif"]
      },
      backgroundImage: {
        "paper-grid":
          "linear-gradient(rgba(23,23,23,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(23,23,23,0.04) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};
