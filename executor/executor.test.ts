// executor/executor.test.ts
import { describe, expect, it } from 'vitest'
import { StubExecutor } from './executor'

describe('StubExecutor', () => {
  it('records would-open without any network', async () => {
    const r = await new StubExecutor().openPosition({ symbol: 'XAUUSDm', direction: 'long', entry: 100, sl: 99, tp: 101, lot: 0.01 }, 'e1')
    expect(r.status).toBe('stub')
    expect(r.detail).toMatch(/would open/i)
  })
})
