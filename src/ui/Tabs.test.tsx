import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { Tabs } from './Tabs'

const tabs = [
  { key: 'a', label: 'Alpha' },
  { key: 'b', label: 'Beta' },
]

test('renders each tab and marks the active one selected', () => {
  render(<Tabs tabs={tabs} active="a" onChange={vi.fn()} />)
  expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'false')
})

test('calls onChange with the tab key when clicked', () => {
  const onChange = vi.fn()
  render(<Tabs tabs={tabs} active="a" onChange={onChange} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Beta' }))
  expect(onChange).toHaveBeenCalledWith('b')
})
