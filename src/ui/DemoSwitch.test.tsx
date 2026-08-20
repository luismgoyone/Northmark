import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { DemoSwitch } from './DemoSwitch'

test('live mode lists Live plus every demo preset, and renders neutral (not amber)', () => {
  render(<DemoSwitch value="live" onChange={vi.fn()} />)
  const select = screen.getByLabelText('Data source') as HTMLSelectElement
  expect(select.value).toBe('live')
  expect(screen.getByRole('option', { name: 'Live' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Demo · Authorized LONG — STRONG' })).toBeInTheDocument()
  expect(
    screen.getByRole('option', { name: 'Demo · Authorized LONG — BUILDING (M15 unconfirmed)' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Demo · WAIT — H1 bias unclear' })).toBeInTheDocument()
  expect(select.className).not.toMatch(/build-bg/)
})

test('a demo preset selected renders the amber build styling', () => {
  render(<DemoSwitch value="demo-setup" onChange={vi.fn()} />)
  const select = screen.getByLabelText('Data source') as HTMLSelectElement
  expect(select.value).toBe('demo-setup')
  expect(select.className).toMatch(/build-bg/)
})

test('selecting a new option calls onChange with the selected mode', () => {
  const onChange = vi.fn()
  render(<DemoSwitch value="live" onChange={onChange} />)
  fireEvent.change(screen.getByLabelText('Data source'), { target: { value: 'demo-wait' } })
  expect(onChange).toHaveBeenCalledWith('demo-wait')
})
