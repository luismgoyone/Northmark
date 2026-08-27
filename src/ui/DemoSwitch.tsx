import type { ReactElement } from 'react'
import { DEMO_PRESETS, type Mode } from '../demo/presets'

export function DemoSwitch({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }): ReactElement {
  const isDemo = value !== 'live'
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]">
      <span className="text-ink-3">Data</span>
      <select
        aria-label="Data source"
        value={value}
        onChange={(e) => onChange(e.target.value as Mode)}
        className={`rounded-chip border pl-2.5 pr-1.5 py-1 text-[11px] transition-colors focus-visible:outline-none ${
          isDemo
            ? 'border-build-bd bg-build-bg text-build-fg focus-visible:border-build-fg'
            : 'border-border bg-surface text-ink-2 focus-visible:border-ink-2 focus-visible:text-ink'
        }`}
      >
        <option value="live">Live</option>
        {DEMO_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>{`Demo · ${p.label}`}</option>
        ))}
      </select>
    </label>
  )
}
