/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ops: {
          bg: '#0a0a0f',
          card: '#12121a',
          line: 'rgba(255,255,255,0.05)',
          ink: '#ffffff',
          mute: 'rgba(255,255,255,0.6)',
          blue: '#6366f1',
          purple: '#8b5cf6',
          green: '#22c55e',
          yellow: '#f59e0b',
          red: '#ef4444',
          info: '#38bdf8'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      boxShadow: {
        glass: '0 24px 80px rgba(0, 0, 0, 0.45)',
        glow: '0 0 0 1px rgba(139, 92, 246, 0.1), 0 0 40px rgba(99, 102, 241, 0.18)'
      },
      keyframes: {
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.45)' },
          '70%': { boxShadow: '0 0 0 12px rgba(34, 197, 94, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)' }
        },
        scan: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 40px' }
        }
      },
      animation: {
        'pulse-ring': 'pulseRing 2s ease-in-out infinite',
        scan: 'scan 18s linear infinite'
      }
    },
  },
  plugins: [],
}
