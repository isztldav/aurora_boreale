/** @type {import('tailwindcss').Config} */
const forms = require('@tailwindcss/forms');

module.exports = {
  content: [
    "../dashboard_api/templates/**/*.html",
  ],
  darkMode: 'class',
  theme: {
    extend: {}
  },
  plugins: [forms],
}
