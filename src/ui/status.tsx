import type { ReactElement } from 'react'
import { STATUS_LABEL, STATUS_TONE, type StatusKind } from './status-tokens'

/**
 * The single source of truth for status PRESENTATION (docs/ui-spec.md §1).
 *
 * Status is NEVER color-alone: every state is an icon + a text label. Color is
 * the secondary channel. Build these primitives once and reuse them in
 * Checklist / VetoList / TradeCard / Score — never hand-roll a per-color span.
 * Tone/label tokens live in ./status-tokens (pure data).
 */

/** Bare SVG glyph per state (currentColor). Decorative — the label is the name. */
function glyph(status: StatusKind): ReactElement {
  const stroke = { strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (status) {
    case 'pass':
    case 'strong':
      return <path d="M5 12.5 10 17.5 19 7" {...stroke} strokeWidth={2.4} />
    case 'fail':
      return <path d="M6 6 18 18M18 6 6 18" {...stroke} strokeWidth={2.4} />
    case 'wait':
      return (
        <>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M12 7.5v5l3 2" {...stroke} />
        </>
      )
    case 'building':
      return (
        <path
          d="M12 3v4m0 10v4m9-9h-4M7 12H3m14.5-6.5-2.8 2.8M9.3 14.7l-2.8 2.8m0-11.3 2.8 2.8m5.4 5.4 2.8 2.8"
          {...stroke}
        />
      )
    case 'defer':
      return (
        <>
          <rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
          <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
        </>
      )
    case 'danger':
      return (
        <>
          <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Z" {...stroke} />
          <path d="M12 8v5M12 16v.5" {...stroke} />
        </>
      )
  }
}

/**
 * The tinted icon box for a status. Decorative (`aria-hidden`) — the adjacent
 * StatusLabel carries the accessible name. Size defaults to the 26px row box.
 */
export function StatusIcon({
  status,
  size = 26,
  className = '',
}: {
  status: StatusKind
  size?: number
  className?: string
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center rounded-[7px] ${STATUS_TONE[status].chip} ${className}`}
      style={{ width: size, height: size, flex: 'none' }}
    >
      <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none" stroke="currentColor">
        {glyph(status)}
      </svg>
    </span>
  )
}

/** The uppercase text label for a status — the primary, color-independent channel. */
export function StatusLabel({
  status,
  className = '',
}: {
  status: StatusKind
  className?: string
}): ReactElement {
  return (
    <span
      className={`text-[10.5px] font-bold uppercase tracking-[0.07em] ${STATUS_TONE[status].text} ${className}`}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

/** A pill composing the icon glyph + label — used for the veto row status chip. */
export function StatusChip({
  status,
  className = '',
}: {
  status: StatusKind
  className?: string
}): ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] ${STATUS_TONE[status].chip} ${className}`}
    >
      <svg aria-hidden="true" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor">
        {glyph(status)}
      </svg>
      {STATUS_LABEL[status]}
    </span>
  )
}
