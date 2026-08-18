import { describe, expect, it } from 'vitest'
import { defaultConfig } from './config'

describe('defaultConfig', () => {
  it('keeps the structure-driven tolerance bounds', () => {
    expect(defaultConfig.tolerances.retestBand).toBe(0.0005)
    expect(defaultConfig.tolerances.breakoutBufferPips).toBe(20)
    expect(defaultConfig.tolerances.consolidationLookback).toBe(20)
  })
})
