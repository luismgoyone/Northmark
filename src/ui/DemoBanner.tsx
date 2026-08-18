import type { ReactElement } from 'react'

export function DemoBanner({ onExit }: { onExit: () => void }): ReactElement {
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-panel border border-build-bd bg-build-bg px-4 py-2.5 text-[12.5px] font-semibold text-build-fg"
    >
      <svg aria-hidden="true" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M12 3 2 21h20L12 3Z" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
        <path d="M12 10v4M12 17.5v.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
      DEMO DATA — illustrative only, not a live signal.
      <button type="button" onClick={onExit} className="underline underline-offset-2 hover:no-underline">
        Switch to Live
      </button>
    </div>
  )
}
