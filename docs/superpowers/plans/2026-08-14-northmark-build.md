# Northmark Build — Implementation Plan

> **For agentic workers:** This plan is executed by a repo-specific 7-agent team driven
> by `/loop`. The canonical task backlog and live status is `NORTHMARK-STATUS.md` at the
> repo root — created in Task 0.3 and updated (silently, then committed) after every task.
> Steps use checkbox (`- [ ]`) syntax. Task contracts (Files / Interfaces / Acceptance)
> are authoritative; each task's implementation is produced by the assigned agent via TDD,
> not pre-written here.

**Goal:** Stand up the Northmark agent team and infrastructure, then build the Phase-1
deterministic trade-setup engine and its read-only UI, as a `/loop`-driven backlog.

**Architecture:** Local-only React 18 + Vite SPA. A pure, no-I/O TypeScript engine
(`indicators → gates → scoring`) sits under a single data-fetch layer and a thin UI.
Import direction is strictly one-way downward: `ui → hooks → data/scoring → gates →
indicators → types`. Layers 2–4 are test-first (Vitest). See the two design docs.

**Tech Stack:** TypeScript (strict + `noUncheckedIndexedAccess`), React 18, Vite, Vitest,
Tailwind CSS, ESLint + Prettier. Market data: Twelve Data (free tier), REST poll aligned
to M5 close.

**Design docs:**
- Product: `docs/superpowers/specs/2026-08-14-northmark-mvp-design.md`
- Team: `docs/superpowers/specs/2026-08-14-northmark-agent-team-design.md`

## Global Constraints

- **TypeScript strict** + `noUncheckedIndexedAccess` — candle arrays are indexed everywhere.
- **Import direction one-way downward** — nothing lower imports anything higher. Enforced
  by convention (ESLint boundary rule optional later).
- **Layers 2–4 are pure, no I/O** — the only I/O is `src/data/`.
- **Canonical `Candle` shape:** `{ time: number; open: number; high: number; low: number; close: number; volume?: number }`.
- **Engine correctness is the priority** — a wrong gate = a wrong signal = real money.
  Bias toward **WAIT** whenever uncertain. Gates map **1:1** to the source checklist.
- **Every engine/gate task passes `quant-reviewer`** (Appendix A fidelity) before "done".
- **Commit per completed task.** Checkpoint (`NORTHMARK-STATUS.md` update + commit) is
  silent — never a question.
- **API key** lives in gitignored `.env.local` as `VITE_TWELVEDATA_KEY` — never committed.

---

## File Structure (locked before tasks)

```
northmark/
├─ .claude/
│  ├─ agents/            # Phase 0: the 7 team agents (one .md each)
│  └─ skills/northmark-checkpoint/   # Phase 0: checkpoint/resume skill
├─ NORTHMARK-STATUS.md   # Phase 0: the /loop backlog + live status + decision log
├─ docs/checklist.md     # Phase 0 (T0.5): verbatim Appendix A — quant-reviewer's source of truth
├─ src/
│  ├─ types.ts           # Candle, MarketContext, Gate, GateResult, Config
│  ├─ config.ts          # default Config
│  ├─ indicators/        # ema.ts, stochastic.ts, swingPoints.ts (+ *.test.ts)
│  ├─ gates/             # one file per gate (+ *.test.ts)
│  ├─ scoring/           # score.ts, vetoes.ts, risk.ts (+ *.test.ts)
│  ├─ data/              # twelveData.ts (ONLY I/O)
│  ├─ hooks/             # useMarketData.ts
│  └─ ui/                # Checklist, TradeCard, VetoList, Score (+ App)
├─ tests/fixtures/       # known candle series (JSON)
├─ .env.local           # VITE_TWELVEDATA_KEY (gitignored)
└─ vite.config.ts
```

Ownership: `engine-engineer` → `src/{types,config,indicators,gates,scoring,data}`;
`frontend-engineer` → `src/{hooks,ui}`; `designer` → UI spec + tokens; `qa` → all
`*.test.ts` + browser E2E; `architect` → `types.ts`/`config.ts` sign-off + import
direction; `quant-reviewer` → `gates/` + `scoring/` fidelity; `product-lead` →
prioritization + Tier-1/2 decisions.

---

# PHASE 0 — Bootstrap (team + infrastructure)

Owner: mostly `architect` + orchestrator. Must complete before `/loop` builds product
code. Each task ends in a commit.

### Task 0.1: Scaffold the SPA

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`,
`postcss.config.js`, `.eslintrc.cjs`, `.prettierrc`, `index.html`, `src/main.tsx`,
`src/App.tsx` (placeholder), `.gitignore` (includes `.env.local`), `.env.example`.

- [ ] **Step 1:** `npm create vite@latest . -- --template react-ts` (into existing dir).
- [ ] **Step 2:** Add Tailwind (`tailwind`, `postcss`, `autoprefixer`), Vitest
      (`vitest`, `@testing-library/react`, `jsdom`), ESLint + Prettier.
- [ ] **Step 3:** Set `tsconfig.json` `"strict": true`, `"noUncheckedIndexedAccess": true`.
- [ ] **Step 4:** Add scripts: `dev`, `build`, `test`, `test:run`, `lint`, `format`, `typecheck`.
- [ ] **Step 5:** Verify: `npm run typecheck` and `npm run test:run` both pass on the empty scaffold.
- [ ] **Step 6:** Commit — `chore: scaffold Vite + React + TS strict + Tailwind + Vitest`.

**Acceptance:** `npm run dev` serves a blank page; `npm run test:run` exits 0; strict flags on.

### Task 0.2: Create the 7 team agents

**Files:** Create `.claude/agents/{product-lead,architect,designer,engine-engineer,frontend-engineer,qa,quant-reviewer}.md`.

Each file has frontmatter (`name`, `description`, `tools`, optional `model`) + a system
prompt encoding its role, layer ownership, and the tool grants from the team design §3.
Key rules to encode:
- `quant-reviewer` and `qa` (for product code): **read-only** — no Write to what they judge.
- `product-lead`: the 3-tier decision charter (team design §5); logs Tier-2 defaults to
  `NORTHMARK-STATUS.md`; escalates Tier-3 only at phase boundary.
- `architect`: owns `types.ts`/`config.ts` + import direction; final gate.
- `designer`: `impeccable` + `dataviz` + `artifact-design` skills + Artifact tool; no Chrome.

- [ ] **Step 1:** Write all 7 agent files with frontmatter + role prompt + tool grants.
- [ ] **Step 2:** Sanity-check each `description` triggers the right dispatch scenario.
- [ ] **Step 3:** Commit — `chore: add Northmark repo-specific agent team`.

**Acceptance:** 7 files exist; tool grants match team design §3; reviewers are read-only.

### Task 0.3: Create `NORTHMARK-STATUS.md`

**Files:** Create `NORTHMARK-STATUS.md` (repo root).

Sections: **Current** (phase, wave, resume pointer), **Backlog** (every task from this
plan as `- [ ] Task N.M — title [state]`), **Decision log** (Tier-2 defaults, empty to
start), **Blocked/Tier-3** (empty to start).

- [ ] **Step 1:** Generate the backlog section from this plan's task list.
- [ ] **Step 2:** Set Current → "Phase 0, Task 0.4 next".
- [ ] **Step 3:** Commit — `chore: add NORTHMARK-STATUS backlog`.

**Acceptance:** File lists every task in this plan with a state; resume pointer present.

### Task 0.4: Create the checkpoint/resume skill

**Files:** Create `.claude/skills/northmark-checkpoint/SKILL.md`.

Two modes:
- **Checkpoint** — read working state, update `NORTHMARK-STATUS.md` (mark task states,
  advance resume pointer, append any Tier-2 decisions), `git add -A && git commit`, print
  a one-line "stopped at …". Also the instruction the orchestrator runs on interrupt.
- **Resume** — read `NORTHMARK-STATUS.md`, print Current + next task + any open Tier-3,
  then continue.

- [ ] **Step 1:** Write `SKILL.md` with the two-mode procedure and exact status-file edits.
- [ ] **Step 2:** Dry-run: invoke Resume, confirm it reads and reports the status file.
- [ ] **Step 3:** Commit — `chore: add northmark-checkpoint skill`.

**Acceptance:** Resume prints the current pointer; Checkpoint updates + commits the status file.

### Task 0.5: Capture the verbatim Appendix A checklist  ⚠️ Tier-3 (needs Luis)

**Files:** Create `docs/checklist.md`.

The verbatim XAUUSD M5 checklist (13 steps + NO-TRADE vetoes + golden rules) is
`quant-reviewer`'s source of truth and is required before **Phase 2** heuristic gates.
Phase 1 deterministic gates do **not** block on it (their rules are in the MVP design).

- [ ] **Step 1:** `product-lead` escalates to Luis: paste the verbatim checklist.
- [ ] **Step 2:** Save verbatim to `docs/checklist.md`; `quant-reviewer` confirms it maps to the gate catalogue.
- [ ] **Step 3:** Commit — `docs: add verbatim XAUUSD M5 checklist`.

**Acceptance:** `docs/checklist.md` exists verbatim; gate catalogue (MVP §4) cross-references it.

---

# PHASE 1 — Deterministic core

Correct-by-math half of the checklist. Waves follow the dependency graph. Every task:
write failing test → verify fail → minimal impl → verify pass → (engine → `quant-reviewer`)
→ `architect` gate → commit.

## Wave 0 — foundation (barrier)

### Task 1.0: `types.ts`

**Files:** Create `src/types.ts`. Owner: `architect`.

**Produces:**
```ts
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number }
export type GateStatus = 'pass' | 'fail' | 'wait'
export type GateResult = { id: string; status: GateStatus; detail: string }
export type MarketContext = { m5: Candle[]; m15: Candle[]; h1: Candle[] }
export type Config = {
  instrument: 'XAUUSD'; accountSize: number; riskPct: number; contractSize: number
  ema: { period: number }
  stoch: { k: number; d: number; smooth: number; overbought: number; oversold: number }
  tolerances: { retestBand: number; breakoutBufferPips: number; consolidationLookback: number }
  minRR: number
}
export type Gate = (ctx: MarketContext, config: Config) => GateResult
```

- [ ] **Step 1:** Write `src/types.ts` exactly as above.
- [ ] **Step 2:** `npm run typecheck` passes.
- [ ] **Step 3:** `architect` confirms shapes match MVP design §3/§5.
- [ ] **Step 4:** Commit — `feat: add core engine types`.

### Task 1.1: `config.ts`

**Files:** Create `src/config.ts`. **Consumes:** `Config`. Owner: `architect`.

**Produces:** `export const defaultConfig: Config` with MVP §5 defaults (`accountSize: 200`,
`riskPct: 0.01`, `contractSize: 100`, `ema.period: 9`, `minRR: 1.5`, stoch/tolerances TBD
→ **Tier-2**: `product-lead` picks conservative defaults and logs them).

- [ ] **Step 1:** Write `defaultConfig`; `product-lead` sets + logs stoch/tolerance defaults.
- [ ] **Step 2:** `npm run typecheck` passes.
- [ ] **Step 3:** Commit — `feat: add default config`.

### Task 1.2: Test fixtures

**Files:** Create `tests/fixtures/*.json`. Owner: `qa`.

Known candle series with hand-verified expected indicator values: a rising series, a
falling series, a flat/consolidating series, and a breakout-then-retest series.

- [ ] **Step 1:** Author 4 fixtures with documented expected EMA9/stoch values.
- [ ] **Step 2:** Commit — `test: add candle fixtures`.

## Wave 1 — indicators (3-wide parallel)

### Task 1.3: `ema(candles, period)`

**Files:** Create `src/indicators/ema.ts` + `src/indicators/ema.test.ts`.
**Produces:** `ema(candles: Candle[], period: number): { value: number; slope: 'rising'|'flat'|'falling' }`

- [ ] **Step 1:** Failing test: EMA9 of the rising fixture equals the documented value (±1e-6) and slope `rising`.
- [ ] **Step 2:** Run → fail (`ema` not defined).
- [ ] **Step 3:** Implement standard EMA (seed = SMA of first `period`); slope from last-vs-prev EMA.
- [ ] **Step 4:** Run → pass; add flat + falling cases.
- [ ] **Step 5:** `quant-reviewer` + `architect` gate. Commit — `feat: add EMA indicator`.

### Task 1.4: `stochastic(candles, k, d, smooth)`

**Files:** Create `src/indicators/stochastic.ts` + test.
**Produces:** `stochastic(...): { k: number; d: number; zone: 'overbought'|'oversold'|'mid'; slope: 'up'|'down'|'flat' }`

- [ ] **Step 1:** Failing test vs documented %K/%D on a fixture; assert zone + slope.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implement %K = (close−lowN)/(highN−lowN)·100, smooth, %D = SMA(%K, d); zone from thresholds.
- [ ] **Step 4:** Run → pass; add "turning up during pullback" (oversold + slope up) case.
- [ ] **Step 5:** `quant-reviewer` + `architect` gate. Commit — `feat: add stochastic indicator`.

### Task 1.5: `swingPoints(candles)`

**Files:** Create `src/indicators/swingPoints.ts` + test.
**Produces:** `swingPoints(candles: Candle[]): { highs: number[]; lows: number[] }` (indices).

*Note: MVP §4 classes structure as Heuristic. Here provide the raw fractal detector only;
HH/HL classification is a Phase-2 gate.*

- [ ] **Step 1:** Failing test: a 5-bar fractal fixture yields the expected swing high/low indices.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement N-bar fractal detection.
- [ ] **Step 4:** Run → pass. **Step 5:** gates. Commit — `feat: add swing-point detector`.

## Wave 2 — deterministic gates (fan out per gate; each → quant-reviewer)

### Task 1.6: Breakout-close gate

**Files:** Create `src/gates/breakoutClose.ts` + test. **Consumes:** `Candle`, `GateResult`.
**Produces:** `breakoutClose(ctx, config): GateResult` — `pass` only if last **M5 close** >
level + `breakoutBufferPips`; a wick above (high > level, close ≤ level) is **`fail`**.

- [ ] **Step 1:** Failing tests: (a) close above → pass; (b) wick-only above → fail; (c) below → wait.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement close-vs-level (not high-vs-level).
- [ ] **Step 4:** Run → pass. **Step 5:** `quant-reviewer` confirms "close not wick" per MVP §4. Commit.

### Task 1.7: R:R gate

**Files:** Create `src/gates/riskReward.ts` + test.
**Produces:** `riskReward(entry, sl, tp, config): GateResult` — `pass` iff `(tp−entry)/(entry−sl) ≥ config.minRR`.

- [ ] **Step 1:** Failing tests around `minRR=1.5` (1.4→fail, 1.5→pass, 2.0→pass).
- [ ] **Step 2:** fail → **Step 3:** implement arithmetic → **Step 4:** pass.
- [ ] **Step 5:** `quant-reviewer` + `architect`. Commit — `feat: add R:R gate`.

## Wave 3 — scoring + risk (3-wide; each → quant-reviewer)

### Task 1.8: `risk.ts` — SL / lot / TP

**Files:** Create `src/scoring/risk.ts` + test.
**Produces:**
```ts
positionSize(accountSize, riskPct, slDistance, contractSize): number   // lot = (accountSize*riskPct)/(slDistance*contractSize)
takeProfits(entry, slDistance, nextSR): { tp1: number; tp2: number }   // tp1=1–1.5R, tp2=2R, capped by nextSR
```
SL is derived from structure (retest/swing low), never from a desired $ loss.

- [ ] **Step 1:** Failing test: `positionSize(200, 0.01, 2.0, 100)` = documented lot; TP capping by S/R.
- [ ] **Step 2:** fail → **Step 3:** implement exact formulas → **Step 4:** pass.
- [ ] **Step 5:** `quant-reviewer` confirms risk-first SL + no-revenge sizing (MVP steps 10 & 12). Commit.

### Task 1.9: `vetoes.ts`

**Files:** Create `src/scoring/vetoes.ts` + test.
**Produces:** `vetoes(ctx, config): GateResult[]` — any triggered NO-TRADE condition (MVP
Appendix A step 13) forces a hard block. *Depends on `docs/checklist.md` (Task 0.5) for
the exact veto list — **Tier-3** if not yet captured.*

- [ ] **Step 1:** Failing test per veto condition. **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** `quant-reviewer` gate. Commit — `feat: add veto rules`.

### Task 1.10: `score.ts`

**Files:** Create `src/scoring/score.ts` + test.
**Produces:** `score(gateResults: GateResult[]): { passed: number; band: 'wait'|'building'|'strong' }`
— tally passing gates → band (3–4 = WAIT, 8–10 = strong, per MVP §4). Any veto overrides to WAIT.

- [ ] **Step 1:** Failing tests at band boundaries + veto override. **Step 2–4:** TDD.
- [ ] **Step 5:** `quant-reviewer` + `architect`. Commit — `feat: add scoring`.

## Wave 4 — data layer (independent track)

### Task 1.11: `twelveData.ts`

**Files:** Create `src/data/twelveData.ts` + test (mocked fetch). Owner: `engine-engineer` + `qa` (live).
**Produces:** `fetchCandles(tf: 'M5'|'M15'|'H1'): Promise<Candle[]>` — fetch XAU/USD, normalize
provider JSON → `Candle[]` (ascending time), read key from `import.meta.env.VITE_TWELVEDATA_KEY`.

- [ ] **Step 1:** Failing unit test with a mocked Twelve Data response → normalized `Candle[]`.
- [ ] **Step 2:** fail → **Step 3:** implement fetch + normalize → **Step 4:** unit pass.
- [ ] **Step 5:** `qa` live-API check: XAU/USD M5 freshness + rate-limit behavior (MVP §8 risk).
- [ ] **Step 6:** `architect` confirms this is the ONLY I/O. Commit — `feat: add Twelve Data layer`.

## Wave 5 — UI (designer → frontend → qa browser)

### Task 1.12: Designer spec + mockup

**Files:** Create `docs/ui-spec.md` + Tailwind tokens; an Artifact mockup. Owner: `designer`.

Status color semantics (pass/fail/wait/veto = danger, colorblind-safe), hierarchy of
checklist + trade card, the read-only trade card layout (Entry/SL/TP1/TP2/Lot/Risk$/R:R).
Uses `impeccable` + `dataviz`.

- [ ] **Step 1:** Produce tokens + an Artifact mockup; `product-lead` approves (or Tier-3 to Luis if a product-look call).
- [ ] **Step 2:** Commit — `docs: add UI spec + design tokens`.

### Task 1.13: `useMarketData()` hook

**Files:** Create `src/hooks/useMarketData.ts` + test. Owner: `frontend-engineer`.
**Consumes:** `fetchCandles`. **Produces:** `useMarketData(): { ctx: MarketContext | null; loading; error }`
— polls aligned to M5 close, keeps a rolling window.

- [ ] **Step 1:** Failing test (mocked fetch) for initial load + refresh. **Step 2–4:** TDD.
- [ ] **Step 5:** `architect` gate (only impure bridge to React). Commit — `feat: add useMarketData hook`.

### Task 1.14: UI components

**Files:** Create `src/ui/{Checklist,TradeCard,VetoList,Score}.tsx` + tests; wire `App.tsx`.
Owner: `frontend-engineer`, implementing Task 1.12 spec.

Read-only screen — **no BUY button.** Checklist rows show per-gate status + detail; Score
shows band; VetoList shows active blocks; TradeCard shows Entry/SL/TP1/TP2/Lot/Risk$/R:R.

- [ ] **Step 1:** Component tests (render states: pass/fail/wait, active veto, populated trade card).
- [ ] **Step 2–4:** TDD each component against the spec tokens.
- [ ] **Step 5:** `qa` browser E2E: live screen renders, states correct, **no BUY button** present.
- [ ] **Step 6:** `architect` gate. Commit — `feat: add read-only trade dashboard`.

**Phase 1 boundary → STOP.** `product-lead` compiles the decision log; Luis reviews and
approves before Phase 2.

---

# PHASE 2 — Heuristic gates (outline; needs `docs/checklist.md`)

Each is a task with the same TDD + `quant-reviewer` lifecycle; thresholds calibrated
against past charts (Tier-2 defaults logged). Tasks: **2.1** HH/HL / LH/LL structure
(from `swingPoints`); **2.2** consolidation detection (flat EMA9 + overlapping range);
**2.3** retest "interacted with" level/FVG/EMA (proximity band); **2.4** confirmation
candle (engulfing/rejection); **2.5** multi-timeframe H1/M15 bias combine; **2.6** wire
heuristic gates into `score`. Boundary → STOP for Luis.

# PHASE 3 — Later, optional (outline)

**3.1** continuous scanning + alerts (requires a process running with the tab closed —
first real backend); **3.2** optional auto-execution via broker API (re-introduces
execution risk — explicitly deferred). Both gated on Luis explicitly opting in.

---

## Self-Review

**Spec coverage:** Team-design roles → Task 0.2 (7 agents); autonomy/checkpoint → 0.3/0.4;
Appendix-A fidelity → 0.5 + `quant-reviewer` on every gate. Product-design layers 1–4 →
Waves 0–4; UI → Wave 5; phasing → Phase 1/2/3 headers. Gate catalogue deterministic rows →
Tasks 1.6–1.10; heuristic/judgment rows → Phase 2. **Gap found + closed:** verbatim
checklist wasn't in-repo → added Task 0.5 (Tier-3) and flagged Phase-2 dependency.

**Placeholder scan:** Remaining "TBD" is intentional and assigned — stoch/tolerance config
values are a logged **Tier-2** decision (Task 1.1), not an unowned blank.

**Type consistency:** `Candle`, `GateResult`, `MarketContext`, `Config`, `Gate` defined
once in Task 1.0 and consumed by name everywhere after. `fetchCandles` (1.11) →
`useMarketData` (1.13) → components (1.14) chain is consistent.
