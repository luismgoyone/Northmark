import type { ReactElement } from 'react'
import type { GateResult } from '../types'
import { gateName } from './labels'
import { StatusIcon, StatusLabel } from './status'

/**
 * The live checklist (docs/ui-spec.md §2/§3): one numbered row per gate, in
 * process order, showing icon + name + detail + label. Pure and prop-driven —
 * it consumes the SAME `GateResult[]` the Score confirmation meter reads, so the
 * meter and the list can never disagree. Row number `01..N` encodes the real
 * checklist sequence.
 */
export function Checklist({ gates }: { gates: GateResult[] }): ReactElement {
  return (
    <section
      className="mt-4 rounded-panel border border-border bg-surface shadow-panel"
      aria-label="Live checklist"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-[18px] py-[15px] pb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">
          Live Checklist
        </h2>
        <span className="font-mono text-[12px] text-ink-2">
          Bias → structure → break → retest → confirm → risk
        </span>
      </div>

      <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
        {gates.map((gate, i) => (
          <div
            key={gate.id}
            className="grid grid-cols-[26px_auto_1fr_auto] items-center gap-3 bg-surface px-4 py-[13px]"
          >
            <span className="font-mono text-[11px] tabular-nums text-ink-3">
              {String(i + 1).padStart(2, '0')}
            </span>
            <StatusIcon status={gate.status} />
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-ink">{gateName(gate.id)}</div>
              <div className="mt-0.5 text-[12px] text-ink-2">{gate.detail}</div>
            </div>
            <StatusLabel status={gate.status} />
          </div>
        ))}
      </div>
    </section>
  )
}
