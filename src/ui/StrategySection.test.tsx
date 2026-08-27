// src/ui/StrategySection.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StrategySection } from './StrategySection'

describe('StrategySection', () => {
  it('labels the Claude engine and renders children', () => {
    render(
      <StrategySection engine="claude" subtitle="my criteria">
        <p>inner</p>
      </StrategySection>,
    )
    expect(screen.getByRole('heading', { name: /claude/i })).toBeInTheDocument()
    expect(screen.getByText('inner')).toBeInTheDocument()
  })

  it('labels the Dad + ChatGPT engine', () => {
    render(
      <StrategySection engine="dad">
        <p>x</p>
      </StrategySection>,
    )
    expect(screen.getByRole('heading', { name: /dad \+ chatgpt/i })).toBeInTheDocument()
  })
})
