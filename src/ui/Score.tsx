import type { ReactElement } from 'react'
import type { GateResult } from '../types'
import type { Score as ScoreValue } from '../scoring/score'
import { STATUS_LABEL, STATUS_TONE } from './status-tokens'

/** Band → glyph. Kept local so the lozenge reads WAIT/BUILDING/STRONG at scale. */
function bandGlyph(band: ScoreValue['band']): ReactElement {
  const s = { strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (band === 'strong') return <path d="M5 12.5 10 17.5 19 7" {...s} strokeWidth={2.4} />
  if (band === 'building')
    return (
      <path
        d="M12 3v4m0 10v4m9-9h-4M7 12H3m14.5-6.5-2.8 2.8M9.3 14.7l-2.8 2.8m0-11.3 2.8 2.8m5.4 5.4 2.8 2.8"
        {...s}
      />
    )
  return (
    <>
      <circle cx="12" cy="12" r="9" {...s} />
      <path d="M12 7.5v5l3 2" {...s} />
    </>
  )
}

/** One confirmation-meter cell. Fill STYLE (not just hue) encodes status so the
 * meter stays legible in grayscale: pass = solid, wait = hollow outline, fail =
 * solid with a diagonal notch. */
function meterCellClass(status: GateResult['status']): string {
  if (status === 'pass') return 'bg-pass-fg border-pass-fg'
  if (status === 'fail') return 'bg-fail-fg border-fail-fg'
  return 'bg-transparent border-wait-fg'
}

/**
 * Signal band (docs/ui-spec.md §2/§3): the one-glance verdict — band lozenge +
 * `passed / total` + a confirmation meter + a plain-language sentence.
 *
 * The band already reflects the veto override (score.ts forces `wait` when any
 * veto is triggered) — the view does NOT re-implement that rule. The meter reads
 * the same `GateResult[]` the checklist does.
 */
export function Score({
  score,
  gates,
  verdict,
  total = 8,
}: {
  score: ScoreValue
  gates: GateResult[]
  verdict: string
  total?: number
}): ReactElement {
  const tone = STATUS_TONE[score.band]
  return (
    <section
      className="mb-4 grid grid-cols-1 items-center gap-4 rounded-panel border border-border bg-surface px-5 py-[18px] shadow-panel md:grid-cols-[auto_1fr_auto] md:gap-8"
      aria-label="Confidence signal"
    >
      {/* Band verdict */}
      <div className="flex min-w-[132px] flex-col gap-2">
        <span
          className={`inline-flex items-center gap-2 self-start rounded-[10px] px-[15px] py-2 text-[20px] font-bold tracking-[0.01em] ${tone.chip}`}
        >
          <svg aria-hidden="true" width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            {bandGlyph(score.band)}
          </svg>
          {STATUS_LABEL[score.band].toUpperCase()}
        </span>
        <span className="text-[12.5px] text-ink-2">
          <b className="font-mono text-ink tabular-nums">{score.passed}</b> of{' '}
          <b className="font-mono text-ink tabular-nums">{total}</b> confirmations
        </span>
      </div>

      {/* Plain-language sentence */}
      <div className="min-w-0">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-3">
          Verdict
        </div>
        <p className="m-0 max-w-[62ch] text-[14.5px] text-ink">{verdict}</p>
      </div>

      {/* Confirmation meter — decorative; count + checklist carry the accessible signal */}
      <div className="flex flex-col items-start gap-2 md:items-end" aria-hidden="true">
        <div className="flex gap-[5px]">
          {gates.map((g) => (
            <span
              key={g.id}
              className={`relative h-[26px] w-[15px] overflow-hidden rounded border-[1.5px] ${meterCellClass(
                g.status,
              )}`}
            >
              {g.status === 'fail' && (
                <span className="absolute left-1/2 top-1/2 h-[130%] w-[2px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-surface" />
              )}
            </span>
          ))}
        </div>
        <div className="flex gap-3 font-mono text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-[9px] w-[9px] rounded-[2px] bg-pass-fg" />
            pass
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-[9px] w-[9px] rounded-[2px] border-[1.5px] border-wait-fg" />
            wait
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-[9px] w-[9px] rounded-[2px] bg-fail-fg" />
            fail
          </span>
        </div>
      </div>
    </section>
  )
}
