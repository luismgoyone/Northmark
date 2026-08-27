// src/ui/edge/ClaudeSignal.tsx
import type { ReactElement } from 'react'
import type { EdgeVerdict } from '../../scoring/evaluateSetupClaude.js'
import { breakevenWinRate, expectancyR } from '../../edge/expectancy.js'

type Verdict = { label: string; tone: 'go' | 'caution' | 'no' }

function toVerdict(v: EdgeVerdict): Verdict {
  if (v.status === 'graded' && v.tradeable) return { label: 'GO', tone: 'go' }
  if (v.status === 'graded') return { label: 'CAUTION', tone: 'caution' }
  return { label: 'NO-TRADE', tone: 'no' }
}

// The theme has no `warn-*` tokens; `build-*` is the codebase's amber/attention token
// (used for demo + caution states), so 'caution' maps to it. GO uses pass; NO-TRADE fail.
const TONE: Record<Verdict['tone'], string> = {
  go: 'border-pass-bd bg-pass-bg text-pass-fg',
  caution: 'border-build-bd bg-build-bg text-build-fg',
  no: 'border-fail-bd bg-fail-bg text-fail-fg',
}

function reason(v: EdgeVerdict): string {
  if (v.status === 'wait') return `First unmet gate: ${v.blockedBy}`
  if (v.status === 'blocked')
    return v.blockedBy === 'news'
      ? 'Blocked: red-folder news within 30 min'
      : 'Blocked: low-liquidity session'
  return v.tradeable
    ? 'All criteria met — A/B setup'
    : 'Below the A/B threshold — the data says pass'
}

/** The Claude engine's signal panel: verdict badge + session + section bars + expectancy. */
export function ClaudeSignal({ verdict }: { verdict: EdgeVerdict }): ReactElement {
  const vd = toVerdict(verdict)
  const grade = verdict.score?.grade ?? 'F'
  const total = verdict.score?.total ?? 0
  const blocked = verdict.status === 'blocked'
  const rr = verdict.setup
    ? Math.abs(verdict.setup.tp2 - verdict.setup.entry) /
      Math.abs(verdict.setup.entry - verdict.setup.sl)
    : 0

  return (
    <div className="space-y-3">
      <div
        className={`flex items-center justify-between rounded-panel border px-4 py-3 ${TONE[vd.tone]}`}
      >
        <div className="text-[20px] font-bold tracking-[-0.01em]">{vd.label}</div>
        {verdict.score && (
          <div className="text-right">
            <div className="font-mono text-[22px] font-semibold tabular-nums">{grade}</div>
            <div className="text-[11px] opacity-80">
              {blocked ? 'would-be ' : ''}
              {total}/100
            </div>
          </div>
        )}
      </div>

      <p className="text-[12.5px] text-ink-2">{reason(verdict)}</p>

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
        <span className="font-semibold text-ink">Session:</span>
        <span>{verdict.session.window}</span>
        <span className="rounded-chip border border-border bg-surface-sunken px-2 py-0.5 text-[10.5px] uppercase tracking-[0.05em]">
          {verdict.session.quality}
        </span>
        {verdict.news && <span className="text-fail-fg">· news: {verdict.news.title}</span>}
      </div>

      {verdict.score && (
        <ul className="space-y-1.5" aria-label="Section scores">
          {verdict.score.sections.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="w-[130px] shrink-0 text-[11.5px] text-ink-2">{s.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${Math.round((s.earned / s.weight) * 100)}%` }}
                />
              </span>
              <span className="w-[52px] shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-3">
                {s.earned}/{s.weight}
              </span>
            </li>
          ))}
        </ul>
      )}

      {verdict.setup && (
        <div className="rounded-panel border border-border bg-surface-sunken px-3 py-2 text-[12px] text-ink-2">
          R:R <span className="font-mono text-ink">{rr.toFixed(2)}</span> · breakeven win-rate{' '}
          <span className="font-mono text-ink">{Math.round(breakevenWinRate(rr) * 100)}%</span> · at
          45% WR you are{' '}
          <span className="font-mono text-ink">{expectancyR(0.45, rr).toFixed(3)}R</span>/trade
        </div>
      )}
    </div>
  )
}
