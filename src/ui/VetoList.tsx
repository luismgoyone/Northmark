import type { ReactElement } from 'react'
import type { GateResult } from '../types'
import { vetoName } from './labels'
import { StatusChip, StatusIcon } from './status'
import type { StatusKind } from './status-tokens'

/**
 * Map a veto `GateResult` to its presentation state. The engine convention
 * (scoring/vetoes.ts): a TRIGGERED no-trade block is `fail`; a cleared
 * (evaluated & not triggered) veto is `pass`; a not-yet-evaluable / not-yet-
 * reached veto is `wait`. Triggered → the one loud `danger` treatment; cleared
 * → the green `pass` treatment; monitoring → the calm, recessive `defer`.
 */
function vetoKind(status: GateResult['status']): StatusKind {
  if (status === 'fail') return 'danger'
  if (status === 'pass') return 'pass'
  return 'defer'
}

/**
 * The no-trade veto panel (docs/ui-spec.md §1/§3). Each veto is one of three
 * honest states: triggered (loud red, forces WAIT — that override lives in
 * score.ts, not here), cleared (green — its gate passed), or monitoring (calm
 * — not yet evaluable / not yet reached). The header states the 3-way count
 * in words (`N active · N clear · N monitoring`).
 */
export function VetoList({ vetoes }: { vetoes: GateResult[] }): ReactElement {
  const active = vetoes.filter((v) => v.status === 'fail').length
  const cleared = vetoes.filter((v) => v.status === 'pass').length
  const monitoring = vetoes.filter((v) => v.status === 'wait').length

  return (
    <section
      className="rounded-panel border border-border bg-surface shadow-panel"
      aria-label="No-trade vetoes"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-[18px] py-[15px] pb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">
          No-Trade Vetoes
        </h2>
        <span className="font-mono text-[12px] text-ink-2">
          {active} active · {cleared} clear · {monitoring} monitoring
        </span>
      </div>

      <div className="px-[14px] py-2 pb-[14px]">
        {vetoes.map((veto) => {
          const kind = vetoKind(veto.status)
          return (
            <div
              key={veto.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-1.5 py-[11px] last:border-b-0"
            >
              <StatusIcon status={kind} />
              <div className="min-w-0">
                <div className="text-[13.5px] text-ink">{vetoName(veto.id)}</div>
                <div className="mt-px text-[11.5px] text-ink-3">{veto.detail}</div>
              </div>
              <StatusChip status={kind} />
            </div>
          )
        })}

        <div className="mt-0.5 flex items-center gap-2.5 border-t border-border px-1.5 pb-1 pt-3 text-[11.5px] text-ink-3">
          <StatusIcon status="danger" size={18} />
          <span>
            When a veto <b className="text-danger-fg">triggers</b>, it fills red with a No-Trade
            chip and forces the signal to WAIT.
          </span>
        </div>
      </div>
    </section>
  )
}
