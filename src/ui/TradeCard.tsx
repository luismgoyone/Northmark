import type { ReactElement } from 'react'
import { StatusIcon } from './status'

/**
 * A fully-assembled candidate setup. Every value is REAL — derived from
 * risk.ts (`positionSize`, `takeProfits`) and the riskReward gate. The card is a
 * read-only readout; there is no button, ever.
 */
export type TradeSetup = {
  direction: 'long' | 'short'
  entry: number
  sl: number
  tp1: number
  tp2: number
  lot: number
  riskDollars: number
  riskPct: number
  rr1: number
  rr2: number
  minRR: number
  /** Provisional when the setup is still building; defaults to `rr1 < minRR`. */
  provisional?: boolean
}

/** Price/number formatting — ledger convention: fixed 2dp, grouped thousands. */
function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function rr(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function CardShell({
  aside,
  children,
}: {
  aside: ReactElement
  children: ReactElement
}): ReactElement {
  return (
    <section
      className="rounded-panel border border-border bg-surface shadow-panel"
      aria-label="Trade card"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-[18px] py-[15px] pb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">Trade Card</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/**
 * The read-only trade card (docs/ui-spec.md §2/§3): an R:R ladder hero + a
 * 7-field metric grid. Two honest states:
 *   - `setup: null`  → pending "awaiting setup" until every required gate
 *                      passes. NEVER fabricated numbers.
 *   - populated      → real Entry/SL/TP1/TP2/Lot/Risk$/R:R, marked Provisional
 *                      while still building or when R:R is below the minimum.
 */
export function TradeCard({ setup }: { setup: TradeSetup | null }): ReactElement {
  if (!setup) {
    return (
      <CardShell
        aside={<span className="font-mono text-[12px] text-ink-2">No candidate setup</span>}
      >
        <div className="flex flex-col items-center gap-3 px-[18px] py-12 text-center">
          <StatusIcon status="wait" size={44} />
          <div className="text-[14px] font-semibold text-ink">Awaiting setup</div>
          <p className="m-0 max-w-[42ch] text-[12.5px] text-ink-2">
            No entry, stop, or targets are shown until every required gate passes. The card fills
            automatically when a real candidate setup forms.
          </p>
        </div>
      </CardShell>
    )
  }

  const provisional = setup.provisional ?? setup.rr1 < setup.minRR
  const rrBelowMin = setup.rr1 < setup.minRR
  const isLong = setup.direction === 'long'
  const slDelta = setup.sl - setup.entry

  // Ladder geometry (long: SL at 0%, TP2 at 100%). Clamped so out-of-order
  // provisional levels can't overflow the track.
  const span = setup.tp2 - setup.sl
  const pct = (v: number): number =>
    span > 0 ? Math.min(100, Math.max(0, ((v - setup.sl) / span) * 100)) : 0
  const entryPct = pct(setup.entry)
  const tp1Pct = pct(setup.tp1)

  return (
    <CardShell
      aside={
        <span className={`text-[12px] font-semibold tracking-[0.04em] ${isLong ? 'text-pass-fg' : 'text-fail-fg'}`}>
          {isLong ? '▲ LONG' : '▼ SHORT'} · XAU/USD
        </span>
      }
    >
      <div className="px-[18px] pb-5 pt-4">
        {provisional && (
          <span className="mb-[15px] inline-flex items-center gap-1.5 rounded-lg border border-build-bd bg-build-bg px-2.5 py-1.5 text-[12px] font-semibold text-build-fg">
            <svg aria-hidden="true" width={13} height={13} viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2} />
              <path
                d="M12 8v4l2.5 2.5"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </svg>
            Provisional levels — setup still building, not confirmed
          </span>
        )}

        {/* R:R ladder */}
        <div
          className="relative mx-0 mb-[34px] mt-8 h-3 rounded-chip border border-border bg-surface-sunken"
          role="img"
          aria-label={`Risk to reward ladder: stop ${fmt(setup.sl)}, entry ${fmt(
            setup.entry,
          )}, TP1 ${fmt(setup.tp1)}, TP2 ${fmt(setup.tp2)}`}
        >
          <div
            className="absolute bottom-0 top-0 rounded-l-chip border border-fail-bd bg-fail-bg"
            style={{ left: 0, width: `${entryPct}%` }}
          />
          <div
            className="absolute bottom-0 top-0 rounded-r-chip border border-pass-bd bg-pass-bg"
            style={{ left: `${entryPct}%`, width: `${100 - entryPct}%` }}
          />
          <Marker pct={0} kind="sl" label="SL" value={fmt(setup.sl)} place="bot" />
          <Marker pct={entryPct} kind="entry" label="Entry" value={fmt(setup.entry)} place="top" />
          <Marker pct={tp1Pct} kind="tp" label="TP1" value={fmt(setup.tp1)} place="top" />
          <Marker pct={100} kind="tp" label="TP2" value={fmt(setup.tp2)} place="bot" />
        </div>

        {/* Metric grid */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-border bg-border sm:grid-cols-3">
          <Field k="Entry" v={fmt(setup.entry)} />
          <Field k="Stop Loss" v={fmt(setup.sl)} sub={`${slDelta >= 0 ? '+' : ''}${fmt(slDelta)}`} tone="risk" />
          <Field k="Lot Size" v={setup.lot.toFixed(2)} />
          <Field k={`TP1 · ${rr(setup.rr1)}R`} v={fmt(setup.tp1)} />
          <Field k={`TP2 · ${rr(setup.rr2)}R`} v={fmt(setup.tp2)} />
          <Field
            k="Risk $"
            v={`$${fmt(setup.riskDollars)}`}
            sub={`${(setup.riskPct * 100).toFixed(0)}%`}
            tone="risk"
          />
          <div className="col-span-2 bg-surface-raised px-[13px] py-3 sm:col-span-3">
            <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-ink-3">
              Reward : Risk
            </div>
            <div className="font-mono text-[17px] font-semibold tabular-nums text-ink">
              {rr(setup.rr1)} <small className="text-[11px] font-medium text-ink-3">to TP1</small>{' '}
              · {rr(setup.rr2)} <small className="text-[11px] font-medium text-ink-3">to TP2</small>
            </div>
            {rrBelowMin && (
              <span className="mt-[3px] inline-flex items-center gap-1.5 text-[11px] text-fail-fg">
                <svg aria-hidden="true" width={13} height={13} viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3 2 21h20L12 3Z"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                  <path d="M12 10v4M12 17.5v.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
                TP1 R:R below {rr(setup.minRR)} minimum
              </span>
            )}
          </div>
        </div>
      </div>
    </CardShell>
  )
}

function Marker({
  pct,
  kind,
  label,
  value,
  place,
}: {
  pct: number
  kind: 'sl' | 'entry' | 'tp'
  label: string
  value: string
  place: 'top' | 'bot'
}): ReactElement {
  const stopColor =
    kind === 'entry' ? 'bg-ink' : kind === 'sl' ? 'bg-fail-fg' : 'bg-pass-fg'
  const valueColor = kind === 'sl' ? 'text-fail-fg' : kind === 'tp' ? 'text-pass-fg' : 'text-ink'
  return (
    <>
      <span
        aria-hidden="true"
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${stopColor} ${
          kind === 'entry' ? 'h-[26px] w-[2.5px]' : 'h-[22px] w-[2px]'
        }`}
        style={{ left: `${pct}%` }}
      />
      <span
        aria-hidden="true"
        className={`absolute -translate-x-1/2 whitespace-nowrap text-center font-mono text-[10.5px] ${
          place === 'top' ? '-top-7' : '-bottom-[30px]'
        }`}
        style={{ left: `${pct}%` }}
      >
        <span className="block text-[9px] uppercase tracking-[0.08em] text-ink-3">{label}</span>
        <span className={`font-semibold tabular-nums ${valueColor}`}>{value}</span>
      </span>
    </>
  )
}

function Field({
  k,
  v,
  sub,
  tone,
}: {
  k: string
  v: string
  sub?: string
  tone?: 'risk'
}): ReactElement {
  return (
    <div className="bg-surface-raised px-[13px] py-3">
      <div className="mb-[5px] text-[10.5px] uppercase tracking-[0.07em] text-ink-3">{k}</div>
      <div
        className={`font-mono text-[17px] font-semibold tabular-nums ${
          tone === 'risk' ? 'text-fail-fg' : 'text-ink'
        }`}
      >
        {v}
        {sub && <small className="ml-1 text-[11px] font-medium text-ink-3">{sub}</small>}
      </div>
    </div>
  )
}
