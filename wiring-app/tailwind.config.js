module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        slateLight: '#F0F4F8',   // soft background
        accent: '#4A90E2',       // button / highlight
        darkText: '#1F2937',     // readable text
      },
    },
  },
  plugins: [],
};
