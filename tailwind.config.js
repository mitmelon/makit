'use strict';

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./views/**/*.ejs', './public/**/*.html', './public/**/*.js'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0a0a0f', soft: '#6e6e7a', faint: '#a3a3ad' },
        surface: { DEFAULT: '#ffffff', alt: '#fafafa', sunken: '#f4f4f7' },
        line: { DEFAULT: '#e8e8ee', strong: '#d4d4dc' },
        // Stripe's own "blurple" plus the gradient family they use
        // across marketing surfaces — never blasted at full strength,
        // used as gradient stops and small accents.
        accent: { DEFAULT: '#635bff', hover: '#4f47e0', soft: '#efeeff' },
        violet: '#8b5cf6',
        rose: '#f472b6',
        sky: '#38bdf8',
        teal: '#2dd4bf',
        signal: {
          good: '#16a34a',
          caution: '#d97706',
          slow: '#dc2626',
          // Market-strength states for the digest itself — distinct
          // from the good/caution/slow run-execution status above.
          buy: '#16a34a',
          rest: '#2563eb',
          danger: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"SF Mono"', '"Roboto Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        'display-lg': ['4.25rem', { lineHeight: '1.02', letterSpacing: '-0.03em', fontWeight: '650' }],
        'display': ['3.25rem', { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '650' }],
        'display-sm': ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '650' }],
        'stat': ['2.75rem', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '650' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(10,10,15,0.04), 0 1px 1px rgba(10,10,15,0.03)',
        raised: '0 4px 16px rgba(10,10,15,0.07), 0 1px 3px rgba(10,10,15,0.05)',
        modal: '0 24px 60px rgba(10,10,15,0.20)',
        glow: '0 8px 30px rgba(99,91,255,0.25)',
      },
      borderRadius: { card: '16px', xl2: '20px' },
      backgroundImage: {
        'mesh-1': 'radial-gradient(60% 60% at 15% 10%, rgba(99,91,255,0.18) 0%, rgba(99,91,255,0) 60%), radial-gradient(50% 50% at 85% 20%, rgba(56,189,248,0.16) 0%, rgba(56,189,248,0) 60%), radial-gradient(55% 55% at 50% 90%, rgba(244,114,182,0.14) 0%, rgba(244,114,182,0) 60%)',
        'grad-accent': 'linear-gradient(135deg, #635bff 0%, #8b5cf6 50%, #38bdf8 100%)',
        'grad-card': 'linear-gradient(160deg, #635bff 0%, #4338ca 100%)',
      },
    },
  },
  plugins: [],
};
