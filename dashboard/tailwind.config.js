/** @type {import('tailwindcss').Config} */
const v = (name) => `var(--${name})`;

export default {
  darkMode: 'class',
  content: ['./index.html', './hr/index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — nilai didefinisikan di src/index.css (light & dark)
        canvas: v('bg'),
        surface: v('surface'),
        subtle: v('surface-2'),
        line: v('border'),
        'line-strong': v('border-strong'),
        fg: v('fg'),
        muted: v('fg-muted'),
        faint: v('fg-subtle'),
        accent: {
          DEFAULT: v('accent'),
          hover: v('accent-hover'),
          soft: v('accent-soft'),
          text: v('accent-text'),
        },
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft'), solid: v('danger-solid') },
        ring: v('ring'),
        brand: '#1E3A8A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
