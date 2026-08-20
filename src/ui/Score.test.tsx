import { render, screen } from '@testing-library/react'
import type { GateResult } from '../types'
import { Score } from './Score'

function gatesWith(passed: number, total = 10): GateResult[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `g${i}`,
    status: i < passed ? 'pass' : 'wait',
    detail: '',
  }))
}

test('wait band renders the WAIT lozenge and the passed/total count', () => {
  render(
    <Score
      score={{ passed: 2, band: 'wait', authorized: false }}
      gates={gatesWith(2)}
      verdict="Holding."
      total={10}
    />,
  )
  expect(screen.getByText('WAIT')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText('10')).toBeInTheDocument()
  expect(screen.getByText('Holding.')).toBeInTheDocument()
})

test('building band renders the BUILDING lozenge', () => {
  render(
    <Score
      score={{ passed: 6, band: 'building', authorized: false }}
      gates={gatesWith(6)}
      verdict="Warming up."
    />,
  )
  expect(screen.getByText('BUILDING')).toBeInTheDocument()
})

test('strong band renders the STRONG lozenge', () => {
  render(
    <Score
      score={{ passed: 9, band: 'strong', authorized: true }}
      gates={gatesWith(9)}
      verdict="High confidence."
    />,
  )
  expect(screen.getByText('STRONG')).toBeInTheDocument()
})

test('renders no interactive buy/order/execute affordance', () => {
  render(
    <Score
      score={{ passed: 2, band: 'wait', authorized: false }}
      gates={gatesWith(2)}
      verdict="Holding."
    />,
  )
  expect(
    screen.queryByRole('button', { name: /buy|order|execute|place/i }),
  ).not.toBeInTheDocument()
})

test('renders supporting confirmations beside the band with pass/withheld glyphs', () => {
  render(
    <Score
      score={{ passed: 7, band: 'strong', authorized: true }}
      gates={gatesWith(7, 7)}
      verdict="Authorized."
      total={7}
      supporting={[
        { id: 'market-structure', status: 'pass', detail: 'M15 confirms long' },
        { id: 'ema9-alignment', status: 'wait', detail: 'EMA9 flat' },
      ]}
    />,
  )
  expect(screen.getByText('M15 structure')).toBeInTheDocument()
  expect(screen.getByText('EMA9 alignment')).toBeInTheDocument()
  expect(screen.getByText('Support')).toBeInTheDocument()
  // Status is text, never color/glyph alone: the pass chip reads "confirmed", the
  // withheld chip reads "withheld" (sr-only), so a screen reader can tell them apart.
  expect(screen.getByText('confirmed')).toBeInTheDocument()
  expect(screen.getByText('withheld')).toBeInTheDocument()
})
