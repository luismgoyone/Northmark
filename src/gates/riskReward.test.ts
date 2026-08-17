import { describe, expect, it } from 'vitest'
import type { Config, Direction } from '../types'
import { riskReward } from './riskReward'
import { defaultConfig } from '../config'

// defaultConfig.minRR = 1.5 (see config.ts). All cases below assume that threshold.
const config: Config = defaultConfig

describe('riskReward', () => {
  it('uses the risk-reward gate id', () => {
    // entry 2100, sl 2098 → risk 2; tp 2103 → reward 3 → R:R 1.5.
    expect(riskReward(2100, 2098, 2103, 'long' as Direction, config).id).toBe('risk-reward')
  })

  describe('R:R below the threshold', () => {
    // entry 2100, sl 2098 → risk 2; tp 2102.8 → reward 2.8 → R:R 1.4.
    it('fails at R:R 1.4', () => {
      expect(riskReward(2100, 2098, 2102.8, 'long' as Direction, config).status).toBe('fail')
    })
  })

  describe('R:R exactly at the threshold (boundary, >=)', () => {
    // entry 2100, sl 2098 → risk 2; tp 2103 → reward 3 → R:R 1.5.
    it('passes at R:R 1.5', () => {
      expect(riskReward(2100, 2098, 2103, 'long' as Direction, config).status).toBe('pass')
    })
  })

  describe('R:R above the threshold', () => {
    // entry 2100, sl 2098 → risk 2; tp 2104 → reward 4 → R:R 2.0.
    it('passes at R:R 2.0', () => {
      expect(riskReward(2100, 2098, 2104, 'long' as Direction, config).status).toBe('pass')
    })
  })

  describe('degenerate: risk <= 0 (sl not below entry)', () => {
    // sl == entry → risk 0. Must not pass and must not crash (no divide-by-zero pass).
    it('does not pass and does not crash when risk is zero', () => {
      const result = riskReward(2100, 2100, 2103, 'long' as Direction, config)
      expect(result.status).not.toBe('pass')
    })
  })

  describe('degenerate: reward <= 0 (tp not above entry)', () => {
    // tp below entry → reward negative. Must not pass.
    it('does not pass when tp is below entry', () => {
      expect(riskReward(2100, 2098, 2099, 'long' as Direction, config).status).not.toBe('pass')
    })
  })

  it('short: passes when the downside reward clears minRR', () => {
    // entry 1000, sl 1002 (risk 2), tp 995 (reward 5) → 2.5 ≥ 1.5
    const r = riskReward(1000, 1002, 995, 'short' as Direction, defaultConfig)
    expect(r.status).toBe('pass')
  })

  it('short: fails a wrong-side stop (sl below entry)', () => {
    expect(riskReward(1000, 998, 995, 'short' as Direction, defaultConfig).status).toBe('fail')
  })
})
