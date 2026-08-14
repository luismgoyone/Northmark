# Northmark UI Spec — read-only XAUUSD M5 dashboard

**Owner:** designer · **Implements against:** `frontend-engineer` (Task 1.14) ·
**Mockup:** `docs/ui-mockup.html`

This is a **trading dashboard where misreading a veto or an SL costs real money.**
Legibility is a **safety property**, not decoration. Two rules override every other
choice on this screen:

1. **Read-only. There is NO BUY button.** Nothing on the screen may imply order
   placement, execution, or "one-click" anything. The only actions are passive
   (theme toggle). A persistent footer states that Northmark never places orders.
2. **Status is never color-alone.** Every state carries an **icon + a text label**,
   so a red/green colorblind user reads the screen from shape and words, not hue.

The system **biases toward WAIT.** WAIT is the normal, expected state — it must read
as *calm and in-progress*, never as an error or an alarm.

---

## 1. Status color semantics (the safety core)

Six semantic states. Each is a triple — foreground (icon/text), tint fill,
border — defined per theme. **The hue is the secondary signal; the icon + label is
the primary one.**

| State | Meaning | Icon (SVG) | Label | Hue lane | Feel |
|---|---|---|---|---|---|
| **pass** | Gate condition met | check `✓` | `Pass` | green ~155° | positive |
| **fail** | Gate condition not met | cross `✕` | `Fail` | red ~25° | negative, quiet |
| **wait** | Not yet evaluable / awaiting price | clock `◷` | `Wait` | steel-blue ~230° | **calm, default** |
| **building** | Score band: setup warming up | radiate | `Building` | amber-gold ~80° | in-progress |
| **strong** | Score band: high confidence | check-shield | `Strong` | deep emerald ~160° | confident |
| **veto — deferred** | NO-TRADE rule not yet evaluable (Phase 1) | pause `❚❚` (dashed) | `Monitoring` | neutral slate | calm, recessive |
| **veto — triggered** | NO-TRADE rule active → hard block | octagon-slash (filled) | `No-Trade` | danger red ~20°, **filled** | loud, alarming |

### Why these hues (colorblind reasoning)

The dangerous confusion is **pass-green vs fail/veto-red** under deuteranopia /
protanopia. Three defenses, all always on:

- **Icon + text label on every instance** — the primary channel. Color removed, the
  screen still reads.
- **Luminance separation** — green sits mid-luminance, danger-red darker/saturated,
  wait-blue distinct from both; the confirmation meter also separates by **fill
  style** (pass = solid, wait = hollow outline, fail = solid with a notch), so the
  meter is legible in grayscale.
- **Hue lanes kept apart** — wait is blue (not green), building is gold (not green),
  so "in progress" never blurs into "pass."

> No Bash/validator was available in this session, so the palette was tuned by
> luminance + mandatory secondary encoding rather than a computed ΔE/CVD score. If
> `frontend-engineer` or `qa` can run `dataviz/scripts/validate_palette.js` on the
> status hexes, do so and snap any FAIL to the nearest passing step — but the
> icon+label rule stands regardless of the score.

### fail vs veto (do not merge)

Both are "bad" and both are red-family, but they are **different severities** and must
look different:

- **fail** = a checklist gate is not met. Quiet: tint fill + outlined icon. It is
  information, not an alarm. A setup can be *building* with a fail present.
- **veto (triggered)** = a hard NO-TRADE block. Loud: **solid red fill, white icon**,
  `No-Trade` chip, and it **forces the signal band to WAIT** regardless of score. This
  is the single loudest thing the UI can show.

### WAIT / deferred must stay calm

- WAIT uses steel-blue, not red, not gold. No pulsing, no motion, no exclamation.
- Deferred vetoes (all of them, in Phase 1) use **neutral slate + a dashed border +
  a pause icon + `Monitoring` label** — visibly distinct from a triggered veto and
  visibly "nothing to worry about here." The panel header reads `0 active · N
  monitoring` so the zero-alarm state is stated in words.

---

## 2. Layout hierarchy

Scannability order (most → least), because the eye must land on the decision first:

1. **Signal band** (full-width, top) — the one-glance verdict: band lozenge
   (`WAIT` / `BUILDING` / `STRONG`) + `passed / 10` count + a 10-cell confirmation
   meter + one plain-language sentence.
2. **Trade card** + **Veto list** (side-by-side row, prominent) — the two elements
   the brief names as *most scannable*. Trade card left (wider), veto list right.
3. **Live checklist** (full-width, below) — the substance/detail: 10 gate rows in a
   2-column grid, in checklist sequence order (numbered `01`–`10`, because the order
   is a real process and the number encodes it).
4. **Disclaimer footer** — the read-only / no-orders reassurance.

Desktop grid: `max-width: 1180px`, centered. Trade-card row is `1.35fr / 1fr`.
Everything collapses to a single column ≤ 900px; the trade-card metric grid drops to
2-up ≤ 520px. **No horizontal page scroll** at any width — wide content lives in its
own panel, never the body.

### The R:R ladder (trade card hero)

The trade card leads with a horizontal **risk→reward ladder**: a track with the
**risk segment** (Entry→SL) tinted red on the left and the **reward segment**
(Entry→TP2) tinted green on the right, with Entry / SL / TP1 / TP2 marked to scale.
It makes "how much I risk vs how much I stand to make" a shape, not arithmetic. Raw
numbers sit in a 7-field grid below it (Entry / SL / Lot / TP1 / TP2 / Risk$ / R:R).
When R:R is below `minRR`, the R:R field shows a warning flag and the card is marked
**Provisional** — the levels are shown but visibly not-yet-confirmed. There is no
button; the card is a readout.

---

## 3. Component breakdown → source modules

| Component | Renders | Consumes | Key states |
|---|---|---|---|
| **`Score`** (signal band) | band lozenge + `passed / total` + confirmation meter + verdict sentence | `score(gateResults)` → `{ passed, band }` | `wait` / `building` / `strong`; veto-override → forced `wait` |
| **`TradeCard`** | R:R ladder + Entry / SL / TP1 / TP2 / Lot / Risk$ / R:R | `risk.ts` (`positionSize`, `takeProfits`), `riskReward` gate | `provisional` (setup building / R:R < min) vs `ready`; long/short direction |
| **`VetoList`** | one row per NO-TRADE rule + status chip + header count | `vetoes(ctx, config)` → `GateResult[]` | `deferred` (calm, dashed, `Monitoring`) vs `triggered` (solid danger, `No-Trade`) |
| **`Checklist`** | numbered row per gate: icon + name + detail + label | `GateResult[]` (gates layer) | per-row `pass` / `fail` / `wait` |

Notes for `frontend-engineer`:
- **Never render color without the matching icon + label component.** Build one
  `<StatusIcon status>` + `<StatusLabel status>` pair and reuse it in `Checklist`,
  `VetoList`, and `TradeCard`; do not hand-roll per-color spans.
- The signal band's **veto override** is a hard rule: if any veto is `triggered`,
  the band shows `WAIT` even if the count is high. Wire this from `score.ts`, not the
  view.
- The confirmation meter cell state must come from the same `GateResult[]` the
  checklist uses — one source of truth, so the meter and the list can never disagree.
- **No `<button>` that submits, buys, or executes.** The only interactive control is
  the theme toggle.

---

## 4. Tailwind design tokens

Add to `tailwind.config.js` under `theme.extend`. Semantic colors are exposed as
CSS variables so light/dark switch at the `:root` level (media query +
`[data-theme]` override, both directions) and the same class names work in both
themes. The mockup (`docs/ui-mockup.html`) is the reference implementation of these
variables.

```js
// tailwind.config.js — theme.extend
colors: {
  bg:            'var(--bg)',
  surface:       'var(--surface)',
  'surface-sunken': 'var(--surface-sunken)',
  'surface-raised': 'var(--surface-raised)',
  border:        'var(--border)',
  'border-strong': 'var(--border-strong)',
  ink:   'var(--ink)',
  'ink-2': 'var(--ink-2)',
  'ink-3': 'var(--ink-3)',
  brand: 'var(--brand)',           // gold — mark + hairline only, NOT a status
  // semantic status (each: fg / bg / bd)
  pass:   { fg: 'var(--pass-fg)',   bg: 'var(--pass-bg)',   bd: 'var(--pass-bd)' },
  fail:   { fg: 'var(--fail-fg)',   bg: 'var(--fail-bg)',   bd: 'var(--fail-bd)' },
  wait:   { fg: 'var(--wait-fg)',   bg: 'var(--wait-bg)',   bd: 'var(--wait-bd)' },
  build:  { fg: 'var(--build-fg)',  bg: 'var(--build-bg)',  bd: 'var(--build-bd)' },
  strong: { fg: 'var(--strong-fg)', bg: 'var(--strong-bg)', bd: 'var(--strong-bd)' },
  danger: { fg: 'var(--danger-fg)', bg: 'var(--danger-bg)', bd: 'var(--danger-bd)', solid: 'var(--danger-solid)' },
  defer:  { fg: 'var(--defer-fg)',  bg: 'var(--defer-bg)',  bd: 'var(--defer-bd)' },
},
borderRadius: { panel: '12px', chip: '999px' },
fontFamily: {
  sans: ['system-ui','-apple-system','"Segoe UI"','Roboto','sans-serif'],
  mono: ['ui-monospace','"SF Mono"','"JetBrains Mono"','Menlo','monospace'],
},
boxShadow: { panel: '0 1px 2px rgba(20,28,40,.06), 0 8px 24px -12px rgba(20,28,40,.16)' },
```

### CSS variable values (drop into `src/index.css`)

**Light** (`:root` default + `:root[data-theme="light"]`):

```
--bg:#eef1f5; --surface:#fbfcfe; --surface-sunken:#e6eaf0; --surface-raised:#ffffff;
--border:#d7dee7; --border-strong:#c1cad6;
--ink:#1b2028; --ink-2:#545f6d; --ink-3:#838d9c;
--pass-fg:#0b7a4a;  --pass-bg:#e4f4ec;  --pass-bd:#b4dfcb;
--fail-fg:#c0392b;  --fail-bg:#fbe8e5;  --fail-bd:#f0c1b9;
--wait-fg:#2f6b9a;  --wait-bg:#e5eef6;  --wait-bd:#bad4e8;
--build-fg:#a06410; --build-bg:#fbf0da; --build-bd:#eed9a4;
--strong-fg:#0a6b52; --strong-bg:#d8f0e6; --strong-bd:#a4d9c6;
--danger-fg:#b21c1c; --danger-bg:#fbe3e3; --danger-bd:#f0b4b4; --danger-solid:#d11f1f;
--defer-fg:#606b7a; --defer-bg:#edf0f4; --defer-bd:#d3dae2;
--brand:#c48a1a; --focus:#2f6b9a;
```

**Dark** (`@media (prefers-color-scheme: dark)` + `:root[data-theme="dark"]`):

```
--bg:#0d1015; --surface:#151a21; --surface-sunken:#0f131a; --surface-raised:#1b212a;
--border:#28303b; --border-strong:#394351;
--ink:#e9edf3; --ink-2:#9aa6b3; --ink-3:#66717f;
--pass-fg:#48cd8d;  --pass-bg:rgba(72,205,141,.13);  --pass-bd:rgba(72,205,141,.32);
--fail-fg:#f2725c;  --fail-bg:rgba(242,114,92,.13);  --fail-bd:rgba(242,114,92,.32);
--wait-fg:#71a9d7;  --wait-bg:rgba(113,169,215,.12); --wait-bd:rgba(113,169,215,.30);
--build-fg:#e6b84c; --build-bg:rgba(230,184,76,.13); --build-bd:rgba(230,184,76,.33);
--strong-fg:#38d892; --strong-bg:rgba(56,216,146,.16); --strong-bd:rgba(56,216,146,.38);
--danger-fg:#ff6f62; --danger-bg:rgba(226,59,59,.15); --danger-bd:rgba(226,59,59,.42); --danger-solid:#e23b3b;
--defer-fg:#7d8896; --defer-bg:rgba(125,136,150,.11); --defer-bd:rgba(125,136,150,.28);
--brand:#e5b74a; --focus:#71a9d7;
```

---

## 5. Type, theme, motion, a11y

- **Type.** Labels/body in a **system sans**; every number (prices, lot, R:N, R:R) in
  a **monospace with `tabular-nums`** — a ledger/instrument convention, and it keeps
  price columns aligned. No webfont CDN (Artifact CSP + reliability); the system
  stacks are the tokens above. Micro-labels are uppercase with `.07em` tracking.
- **Theme.** Dark is the primary feel (a solo trader glancing at a screen for long
  sessions, often in a dim room), but **both themes are first-class** — tokens are
  redefined, not naively inverted. Toggle stamps `data-theme` and wins over the OS
  media query in both directions.
- **Motion.** Almost none — the ethos is calm. The only animation is a slow 2.4s
  pulse on the "live/updated" dot, disabled under `prefers-reduced-motion`. Status
  chips never animate.
- **A11y.** Visible `:focus-visible` ring on the one control; the R:R ladder carries
  an `aria-label` describing all four levels; every status icon is decorative
  (`aria-hidden`) because the adjacent text label is the accessible name. Body never
  scrolls sideways at any width.

---

## 6. Deliberate non-choices (avoided AI/category reflexes)

- **Not** the trading-dashboard cliché: no neon-green-on-black terminal, no blinking
  tickers, no navy+gold "finance" palette. Chrome is neutral tinted slate; color
  appears **only where it carries meaning.** Gold is used once, meaningfully — the
  `building` band ("warming up") and the logo mark — never as a drench.
- **No side-stripe accent borders, no gradient text, no glass, no hero-metric
  template.** Status is a full-bordered tinted chip with a leading icon.
- The screen reads as a **calm precision instrument**, matching the product's own
  rule: *"A missed trade costs $0. A bad trade costs money."*
