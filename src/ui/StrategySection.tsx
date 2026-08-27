// src/ui/StrategySection.tsx
import type { ReactElement, ReactNode } from 'react'

const LABELS = { dad: 'Dad + ChatGPT', claude: 'Claude' } as const

/**
 * A labeled panel that brackets one engine's content, so the two strategies are
 * differentiable at a glance. Claude carries the brand accent; Dad stays neutral.
 * Accent is token-based so light/dark both work.
 */
export function StrategySection({
  engine,
  subtitle,
  children,
}: {
  engine: 'dad' | 'claude'
  subtitle?: string
  children: ReactNode
}): ReactElement {
  const claude = engine === 'claude'
  const accent = claude ? 'border-brand/60' : 'border-border'
  const chip = claude
    ? 'border-brand/50 bg-brand/10 text-brand'
    : 'border-border bg-surface-sunken text-ink-2'
  return (
    <section
      className={`rounded-panel border ${accent} bg-surface p-4 shadow-panel`}
      aria-label={`${LABELS[engine]} strategy`}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-chip border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${chip}`}
        >
          <h3 className="m-0">{LABELS[engine]}</h3>
        </span>
        {subtitle && <span className="text-[12px] text-ink-3">{subtitle}</span>}
      </div>
      {children}
    </section>
  )
}
