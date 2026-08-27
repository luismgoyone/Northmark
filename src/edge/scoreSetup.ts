import type { SessionQuality } from './session.js'

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'
export type Honesty = 'proven' | 'directional' | 'folklore'
export type SectionKey = 'bias' | 'structure' | 'confluence' | 'timing' | 'risk'
export type ScoreItem = { label: string; earned: number; weight: number; honesty: Honesty }
export type SectionScore = { key: SectionKey; label: string; earned: number; weight: number; items: ScoreItem[] }
export type EdgeScore = { total: number; grade: Grade; sections: SectionScore[]; structureFloorApplied: boolean }

export type EdgeInputs = {
  biasStructureAgrees: boolean
  priceCorrectSideEma: boolean
  noOpposingLevelWithinAtr: boolean
  retestHeld: boolean
  entryNotExtended: boolean
  stochNotExhausted: boolean
  atrHealthy: boolean
  confluenceCount: number
  sessionQuality: SessionQuality
  rr: number
  targetBeforeOpposing: boolean
}

const TIMING_POINTS: Record<SessionQuality, number> = { prime: 16, good: 12, selective: 5, low: 0, avoid: 0 }

/** R:R points: 1.5 floor is already required elsewhere; scale 1.5→3.0 across 0→11 points. */
function rrPoints(rr: number): number {
  const t = (Math.min(Math.max(rr, 1.5), 3) - 1.5) / (3 - 1.5)
  return Math.round(t * 11)
}

function gradeFor(total: number): Grade {
  if (total >= 90) return 'A'
  if (total >= 78) return 'B'
  if (total >= 65) return 'C'
  if (total >= 50) return 'D'
  return 'F'
}

const pt = (label: string, on: boolean, weight: number, honesty: Honesty): ScoreItem => ({
  label,
  earned: on ? weight : 0,
  weight,
  honesty,
})

export function scoreSetup(inp: EdgeInputs): EdgeScore {
  const confluenceCount = Math.min(inp.confluenceCount, 3)

  const sections: SectionScore[] = [
    {
      key: 'bias',
      label: 'Bias & Context',
      weight: 22,
      earned: 0,
      items: [
        pt('M15/H1 structure agrees', inp.biasStructureAgrees, 10, 'proven'),
        pt('Price on correct side of EMA', inp.priceCorrectSideEma, 6, 'directional'),
        pt('No opposing H1 level within 1×ATR', inp.noOpposingLevelWithinAtr, 6, 'directional'),
      ],
    },
    {
      key: 'structure',
      label: 'Structure & Setup',
      weight: 28,
      earned: 0,
      items: [
        pt('Retest held', inp.retestHeld, 16, 'directional'),
        pt('Entry not extended', inp.entryNotExtended, 12, 'directional'),
      ],
    },
    {
      key: 'confluence',
      label: 'Confluence',
      weight: 17,
      earned: 0,
      items: [
        pt('Stochastic not exhausted', inp.stochNotExhausted, 6, 'folklore'),
        pt('ATR in a healthy band', inp.atrHealthy, 5, 'proven'),
        { label: `Confluence count (${confluenceCount}/3)`, earned: confluenceCount * 2, weight: 6, honesty: 'directional' },
      ],
    },
    {
      key: 'timing',
      label: 'Timing',
      weight: 16,
      earned: 0,
      items: [
        { label: `Session window (${inp.sessionQuality})`, earned: TIMING_POINTS[inp.sessionQuality], weight: 16, honesty: 'proven' },
      ],
    },
    {
      key: 'risk',
      label: 'Risk & Targets',
      weight: 17,
      earned: 0,
      items: [
        { label: `R:R quality (${inp.rr.toFixed(2)})`, earned: rrPoints(inp.rr), weight: 11, honesty: 'proven' },
        pt('Target before opposing level', inp.targetBeforeOpposing, 6, 'directional'),
      ],
    },
  ]

  for (const s of sections) s.earned = s.items.reduce((a, i) => a + i.earned, 0)
  const total = sections.reduce((a, s) => a + s.earned, 0)

  let grade = gradeFor(total)
  const structure = sections.find((s) => s.key === 'structure')!
  const structureFloorApplied = structure.earned < 0.6 * structure.weight && (grade === 'A' || grade === 'B')
  if (structureFloorApplied) grade = 'C'

  return { total, grade, sections, structureFloorApplied }
}
