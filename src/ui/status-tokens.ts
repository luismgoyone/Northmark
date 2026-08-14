/**
 * Status presentation tokens — pure data (no components), so the .tsx primitives
 * stay Fast-Refresh clean. See docs/ui-spec.md §1.
 *
 * `StatusKind` spans every semantic state the screen can show:
 *   - gate rows:  pass | fail | wait
 *   - score band: wait | building | strong
 *   - veto rows:  defer (deferred / "Monitoring") | danger (triggered / "No-Trade")
 */
export type StatusKind = 'pass' | 'fail' | 'wait' | 'building' | 'strong' | 'defer' | 'danger'

/** Accessible name for each state — the primary channel, always rendered as text. */
export const STATUS_LABEL: Record<StatusKind, string> = {
  pass: 'Pass',
  fail: 'Fail',
  wait: 'Wait',
  building: 'Building',
  strong: 'Strong',
  defer: 'Monitoring',
  danger: 'No-Trade',
}

/**
 * Tone classes per state. `chip` tints the icon box / pill; `text` colors the
 * label. `defer` adds a dashed border (calm, recessive); `danger` is the one
 * loud, solid-red treatment (triggered veto). fail stays a QUIET outline tint —
 * a different severity from danger, and the two must never look alike (§1).
 */
export const STATUS_TONE: Record<StatusKind, { chip: string; text: string }> = {
  pass: { chip: 'bg-pass-bg text-pass-fg border border-pass-bd', text: 'text-pass-fg' },
  fail: { chip: 'bg-fail-bg text-fail-fg border border-fail-bd', text: 'text-fail-fg' },
  wait: { chip: 'bg-wait-bg text-wait-fg border border-wait-bd', text: 'text-wait-fg' },
  building: { chip: 'bg-build-bg text-build-fg border border-build-bd', text: 'text-build-fg' },
  strong: { chip: 'bg-strong-bg text-strong-fg border border-strong-bd', text: 'text-strong-fg' },
  defer: {
    chip: 'bg-defer-bg text-defer-fg border border-dashed border-defer-bd',
    text: 'text-defer-fg',
  },
  danger: {
    chip: 'bg-danger-solid text-white border border-danger-solid',
    text: 'text-danger-fg',
  },
}
