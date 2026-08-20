import type { ReactElement } from 'react'
import type { GateResult } from '../types'
import { CHECKLIST_LAYERS, gateName } from './labels'
import { StatusIcon, StatusLabel } from './status'

/**
 * The live checklist (docs/ui-spec.md §2/§3), grouped into the review's three layers —
 * Market Filter / Setup / Trigger. One numbered row per hard-filter gate, in process
 * order, showing icon + name + detail + label. Pure and prop-driven — it consumes the
 * SAME hard-filter `GateResult[]` the Score meter reads. Supporting confirmations are
 * shown beside the band (in Score), not here — they never block.
 */
export function Checklist({ gates }: { gates: GateResult[] }): ReactElement {
  const byId = new Map(gates.map((g) => [g.id, g]))
  let row = 0
  return (
    <section
      className="mt-4 rounded-panel border border-border bg-surface shadow-panel"
      aria-label="Live checklist"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-[18px] py-[15px] pb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">Live Checklist</h2>
        <span className="font-mono text-[12px] text-ink-2">Market filter → Setup → Trigger</span>
      </div>

      {CHECKLIST_LAYERS.map((layer) => {
        const layerGates = layer.ids
          .map((id) => byId.get(id))
          .filter((g): g is GateResult => g !== undefined)
        if (layerGates.length === 0) return null
        return (
          <div key={layer.title}>
            <div className="border-b border-border bg-surface-sunken px-[18px] py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
              {layer.title}
            </div>
            <div className="grid grid-cols-1 gap-px bg-border">
              {layerGates.map((gate) => {
                row += 1
                return (
                  <div
                    key={gate.id}
                    className="grid grid-cols-[26px_auto_1fr_auto] items-center gap-3 bg-surface px-4 py-[13px]"
                  >
                    <span className="font-mono text-[11px] tabular-nums text-ink-3">
                      {String(row).padStart(2, '0')}
                    </span>
                    <StatusIcon status={gate.status} />
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium text-ink">{gateName(gate.id)}</div>
                      <div className="mt-0.5 text-[12px] text-ink-2">{gate.detail}</div>
                    </div>
                    <StatusLabel status={gate.status} />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
}
