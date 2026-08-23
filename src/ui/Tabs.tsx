import type { ReactElement } from 'react'

export type TabDef = { key: string; label: string }

/**
 * A segmented tab control (docs/ui-spec.md): full-width, equal columns, mobile-friendly.
 * Purely presentational — the parent owns the active key and the content it swaps. Buttons
 * carry `role="tab"` + `aria-selected` so the control is a real tablist, not styled links.
 */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[]
  active: string
  onChange: (key: string) => void
}): ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Sections"
      className="mb-4 grid grid-flow-col gap-1 rounded-panel border border-border bg-surface-sunken p-1"
    >
      {tabs.map((t) => {
        const selected = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.key)}
            className={`rounded-[8px] px-3 py-2 text-[12.5px] font-semibold transition-colors ${
              selected ? 'bg-surface text-ink shadow-panel' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
