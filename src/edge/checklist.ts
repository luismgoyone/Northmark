export type ChecklistKind = 'veto' | 'weight'
export type ChecklistItem = {
  text: string
  kind: ChecklistKind
  honesty: 'proven' | 'directional' | 'folklore'
  dataSource: 'computed' | 'feed'
}
export type ChecklistSection = { key: string; label: string; items: ChecklistItem[] }

const veto = (text: string, dataSource: ChecklistItem['dataSource'] = 'computed'): ChecklistItem => ({
  text,
  kind: 'veto',
  honesty: 'proven',
  dataSource,
})
const weight = (text: string, honesty: ChecklistItem['honesty']): ChecklistItem => ({
  text,
  kind: 'weight',
  honesty,
  dataSource: 'computed',
})

/** The Claude engine's criteria, as display data for the Checklist tab. */
export const CLAUDE_CHECKLIST: ChecklistSection[] = [
  {
    key: 'vetoes',
    label: 'Hard vetoes → NO-TRADE',
    items: [
      veto('Trade aligns with H1 bias'),
      veto('Not in consolidation / chop'),
      veto('A tested level defines the trade'),
      veto('Breakout closed beyond the level (no wick-only)'),
      veto('Confirmation candle after the retest'),
      veto('R:R to target ≥ 1.5'),
      veto('Stop-loss at the structural invalidation point'),
      veto('No red-folder USD/gold news within ±30 min', 'feed'),
      veto('Not in the rollover dead-zone or late Friday'),
    ],
  },
  {
    key: 'bias',
    label: 'Bias & Context — weight 22',
    items: [
      weight('M15/H1 structure agrees with direction', 'proven'),
      weight('Price on the correct side of the EMA', 'directional'),
      weight('No opposing level within 1×ATR of entry', 'directional'),
    ],
  },
  {
    key: 'structure',
    label: 'Structure & Setup — weight 28',
    items: [
      weight('Retest held the broken level', 'directional'),
      weight('Entry not extended (not chasing far from the level)', 'directional'),
    ],
  },
  {
    key: 'confluence',
    label: 'Confluence — weight 17',
    items: [
      weight('Stochastic not exhausted (supporting, not proven)', 'folklore'),
      weight('ATR in a healthy band (not dead, not spiked)', 'proven'),
      weight('Confluence count (level + EMA + round number), capped at 3', 'directional'),
    ],
  },
  {
    key: 'timing',
    label: 'Timing — weight 16',
    items: [weight('Inside a high-expectancy session window (London / overlap)', 'proven')],
  },
  {
    key: 'risk',
    label: 'Risk & Targets — weight 17',
    items: [
      weight('R:R quality beyond the 1.5 floor', 'proven'),
      weight('Target sits before the next opposing level', 'directional'),
    ],
  },
]
