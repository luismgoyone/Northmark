import { describe, expect, it } from 'vitest'
import { CLAUDE_CHECKLIST } from './checklist'

describe('CLAUDE_CHECKLIST', () => {
  it('has the five weighted sections plus vetoes and no empty labels', () => {
    const keys = CLAUDE_CHECKLIST.map((s) => s.key)
    for (const k of ['vetoes', 'bias', 'structure', 'confluence', 'timing', 'risk']) {
      expect(keys).toContain(k)
    }
    for (const s of CLAUDE_CHECKLIST) {
      expect(s.items.length).toBeGreaterThan(0)
      for (const i of s.items) expect(i.text.length).toBeGreaterThan(0)
    }
  })
})
