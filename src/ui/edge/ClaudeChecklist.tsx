// src/ui/edge/ClaudeChecklist.tsx
import type { ReactElement } from 'react'
import { CLAUDE_CHECKLIST } from '../../edge/checklist.js'

/** Renders the Claude engine's criteria as a reference checklist, honesty-labeled. */
export function ClaudeChecklist(): ReactElement {
  return (
    <div className="space-y-4">
      {CLAUDE_CHECKLIST.map((section) => (
        <div key={section.key}>
          <h4 className="mb-2 text-[12.5px] font-semibold text-ink">{section.label}</h4>
          <ul className="space-y-1.5">
            {section.items.map((item) => (
              <li key={item.text} className="flex items-start gap-2 text-[12.5px] text-ink-2">
                <span
                  className={`mt-0.5 inline-flex shrink-0 items-center rounded-chip border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ${
                    item.kind === 'veto'
                      ? 'border-fail-bd bg-fail-bg text-fail-fg'
                      : 'border-border bg-surface-sunken text-ink-3'
                  }`}
                >
                  {item.kind}
                </span>
                <span>
                  {item.text}
                  <span className="ml-1.5 text-[10.5px] text-ink-3">· {item.honesty}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
