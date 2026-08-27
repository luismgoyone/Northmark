// src/ui/edge/ClaudeSignal.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClaudeSignal } from './ClaudeSignal'
import type { EdgeVerdict } from '../../scoring/evaluateSetupClaude'

const waiting: EdgeVerdict = {
  status: 'wait',
  direction: null,
  blockedBy: 'consolidation',
  session: { window: 'London–NY overlap', quality: 'prime' },
  news: null,
  score: null,
  setup: null,
  tradeable: false,
}

describe('ClaudeSignal', () => {
  it('shows NO-TRADE and the blocking reason when waiting', () => {
    render(<ClaudeSignal verdict={waiting} />)
    expect(screen.getByText(/no-trade/i)).toBeInTheDocument()
    expect(screen.getByText(/consolidation/i)).toBeInTheDocument()
  })

  it('shows the session window', () => {
    render(<ClaudeSignal verdict={waiting} />)
    expect(screen.getByText(/London–NY overlap/i)).toBeInTheDocument()
  })
})
