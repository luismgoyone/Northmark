import type { ReactElement } from 'react'
import type { SimState } from '../../sim/types.js'
import { gradeStats } from '../../sim/gradeStats.js'

/** Realized win-rate / avg-R / P&L per pre-trade grade for the Claude account. */
export function GradeAnalytics({ state }: { state: SimState }): ReactElement {
  const rows = gradeStats(state)
  return (
    <div className="mt-4 rounded-panel border border-border bg-surface p-4 shadow-panel">
      <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[0.05em] text-ink">Win rate by grade</h3>
      {rows.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-3">No graded trades yet — analytics fill in as the Claude engine trades.</p>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
              <th className="pb-1.5 font-semibold">Grade</th>
              <th className="pb-1.5 text-right font-semibold">Trades</th>
              <th className="pb-1.5 text-right font-semibold">Win rate</th>
              <th className="pb-1.5 text-right font-semibold">Avg R</th>
              <th className="pb-1.5 text-right font-semibold">P&L</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {rows.map((r) => (
              <tr key={r.grade} className="border-t border-border">
                <td className="py-1.5 font-sans font-bold text-brand">{r.grade}</td>
                <td className="py-1.5 text-right text-ink-2">{r.trades}</td>
                <td className="py-1.5 text-right text-ink">{Math.round(r.winRate * 100)}%</td>
                <td className={`py-1.5 text-right ${r.avgR >= 0 ? 'text-pass-fg' : 'text-fail-fg'}`}>
                  {r.avgR >= 0 ? '+' : '−'}
                  {Math.abs(r.avgR).toFixed(2)}R
                </td>
                <td className={`py-1.5 text-right ${r.pnlCredits >= 0 ? 'text-pass-fg' : 'text-fail-fg'}`}>
                  {r.pnlCredits >= 0 ? '+' : '−'}${Math.abs(r.pnlCredits).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
