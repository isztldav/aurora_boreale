/** @type {import('tailwindcss').Config} */
const forms = require('@tailwindcss/forms');

module.exports = {
  content: [
    "../src/dashboard/templates/**/*.html",
  ],
  darkMode: 'class',
  theme: {
    extend: {}
  },
  plugins: [forms],
}
