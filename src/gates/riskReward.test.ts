import { describe, expect, it } from 'vitest'
import type { Config } from '../types'
import { riskReward } from './riskReward'
import { defaultConfig } from '../config'

// defaultConfig.minRR = 1.5 (see config.ts). All cases below assume that threshold.
const config: Config = defaultConfig

describe('riskReward', () => {
  it('uses the risk-reward gate id', () => {
    // entry 2100, sl 2098 → risk 2; tp 2103 → reward 3 → R:R 1.5.
    expect(riskReward(2100, 2098, 2103, config).id).toBe('risk-reward')
  })

  describe('R:R below the threshold', () => {
    // entry 2100, sl 2098 → risk 2; tp 2102.8 → reward 2.8 → R:R 1.4.
    it('fails at R:R 1.4', () => {
      expect(riskReward(2100, 2098, 2102.8, config).status).toBe('fail')
    })
  })

  describe('R:R exactly at the threshold (boundary, >=)', () => {
    // entry 2100, sl 2098 → risk 2; tp 2103 → reward 3 → R:R 1.5.
    it('passes at R:R 1.5', () => {
      expect(riskReward(2100, 2098, 2103, config).status).toBe('pass')
    })
  })

  describe('R:R above the threshold', () => {
    // entry 2100, sl 2098 → risk 2; tp 2104 → reward 4 → R:R 2.0.
    it('passes at R:R 2.0', () => {
      expect(riskReward(2100, 2098, 2104, config).status).toBe('pass')
    })
  })

  describe('degenerate: risk <= 0 (sl not below entry)', () => {
    // sl == entry → risk 0. Must not pass and must not crash (no divide-by-zero pass).
    it('does not pass and does not crash when risk is zero', () => {
      const result = riskReward(2100, 2100, 2103, config)
      expect(result.status).not.toBe('pass')
    })
  })

  describe('degenerate: reward <= 0 (tp not above entry)', () => {
    // tp below entry → reward negative. Must not pass.
    it('does not pass when tp is below entry', () => {
      expect(riskReward(2100, 2098, 2099, config).status).not.toBe('pass')
    })
  })
})
