/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-sunken': 'var(--surface-sunken)',
        'surface-raised': 'var(--surface-raised)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        // Gold — mark + a single hairline only. NEVER a status color.
        brand: 'var(--brand)',
        // Semantic status: each carries fg (icon/text) / bg (tint) / bd (border).
        pass: { fg: 'var(--pass-fg)', bg: 'var(--pass-bg)', bd: 'var(--pass-bd)' },
        fail: { fg: 'var(--fail-fg)', bg: 'var(--fail-bg)', bd: 'var(--fail-bd)' },
        wait: { fg: 'var(--wait-fg)', bg: 'var(--wait-bg)', bd: 'var(--wait-bd)' },
        build: { fg: 'var(--build-fg)', bg: 'var(--build-bg)', bd: 'var(--build-bd)' },
        strong: { fg: 'var(--strong-fg)', bg: 'var(--strong-bg)', bd: 'var(--strong-bd)' },
        danger: {
          fg: 'var(--danger-fg)',
          bg: 'var(--danger-bg)',
          bd: 'var(--danger-bd)',
          solid: 'var(--danger-solid)',
        },
        defer: { fg: 'var(--defer-fg)', bg: 'var(--defer-bg)', bd: 'var(--defer-bd)' },
      },
      borderRadius: { panel: '12px', chip: '999px' },
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', '"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(20,28,40,.06), 0 8px 24px -12px rgba(20,28,40,.16)',
      },
      keyframes: {
        // Slow, calm halo on the live dot — the only motion on the screen.
        'live-dot': {
          '0%': { boxShadow: '0 0 0 0 color-mix(in srgb, var(--pass-fg) 55%, transparent)' },
          '70%': { boxShadow: '0 0 0 6px transparent' },
          '100%': { boxShadow: '0 0 0 0 transparent' },
        },
      },
      animation: { 'live-dot': 'live-dot 2.4s ease-out infinite' },
    },
  },
  plugins: [],
}
