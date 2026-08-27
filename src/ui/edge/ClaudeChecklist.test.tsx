// src/ui/edge/ClaudeChecklist.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClaudeChecklist } from './ClaudeChecklist'

describe('ClaudeChecklist', () => {
  it('renders the veto section and a folklore honesty label', () => {
    render(<ClaudeChecklist />)
    expect(screen.getByText(/Hard vetoes/i)).toBeInTheDocument()
    expect(screen.getAllByText(/folklore/i).length).toBeGreaterThan(0)
  })
})
