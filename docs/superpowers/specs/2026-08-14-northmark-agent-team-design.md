# Northmark Agent Team — Design

**Date:** 2026-08-14
**Status:** Approved (design), pending implementation plan
**Owner:** Luis (client / product level)
**Related:** [Northmark MVP — Design](./2026-08-14-northmark-mvp-design.md)

---

## 1. Summary

A **repo-specific team of Claude Code subagents** that build the Northmark MVP the way a
real software team would — each agent has one narrow job, work flows through a defined
lifecycle, and the whole thing runs **autonomously via `/loop`**. Luis acts as
**client/product owner**: he asks for outcomes and signs off, but does not babysit the
build.

Three properties define this team:

- **Autonomous** — `/loop` drives wave after wave. Sub-agent questions are answered by a
  **`product-lead` proxy agent**, not by Luis, so the loop rarely pauses.
- **Interruptible & resumable** — all progress lives in a committed `NORTHMARK-STATUS.md`
  and per-task commits. Luis can hop off at any moment; the next session reads the status
  file and continues cold, with no re-explaining.
- **Safe-by-default** — Northmark is a trading engine where *a wrong gate = a wrong signal
  = real money*. Every decision made on Luis' behalf errs toward **WAIT** (per the
  product's own golden rule) and is logged for his phase-boundary review.

This design covers the **team, not the product** — the product is specified in the
[Northmark MVP design](./2026-08-14-northmark-mvp-design.md).

---

## 2. Who's who

### People / layers of authority

- **Luis — Client / Product Owner (human).** Sets direction, approves phases, resolves
  Tier-3 escalations. In the loop only at phase boundaries.
- **Main session (the orchestrator / EM).** The Claude Code main loop. Dispatches
  subagents, integrates their output, routes their questions to `product-lead`, and
  checkpoints. In Claude Code, subagents report **up** to this loop — they do **not**
  command each other peer-to-peer. This is where "the team lead who runs the team" lives.

### The 7 subagents (repo-scoped `.claude/agents/*.md`)

| Agent | Real-world role | Owns | Layers |
|---|---|---|---|
| **`product-lead`** | Product-owner proxy (Luis, delegated) | Prioritization ("what's next"), and **answering sub-agent questions in Luis' place** under the decision charter (§5). Absorbs the planner role. | cross-cutting |
| **`architect`** | Tech Lead / CTO | Codebase standards, `types.ts` + `config.ts`, import-direction discipline, architecture decisions, final PR-gate review. Advises; does not write feature code. | cross-cutting |
| **`designer`** | UI/UX Designer | Visual + interaction spec: status color semantics, layout/hierarchy of checklist + trade card, design tokens, accessibility. **Produces a spec + mockups; writes no product code.** | ui (spec) |
| **`engine-engineer`** | Senior Engine/Data Engineer | The pure TS engine — indicators, gates, scoring/risk — **and** the data-fetch layer (the only I/O). Test-first. | 1–4 |
| **`frontend-engineer`** | Senior Frontend Engineer | React/Vite/Tailwind UI + the `useMarketData()` hook. Implements the `designer` spec. | ui, hooks |
| **`qa`** | FE + BE QA | Unit/integration tests for the pure engine (Vitest) **and** browser E2E for the UI. Black-box behavioral verification. | all |
| **`quant-reviewer`** | Domain / trading expert | Fidelity to **Appendix A** — verifies each gate encodes Luis' checklist verbatim (breakout = *close* not wick, bias-toward-WAIT, SL-from-structure). Northmark's #1 risk lives here. | gates, scoring |

**Why `backend` became `engine-engineer`:** the MVP is a **local-only SPA with no server
until Phase 3** (per the product design §6–7). The substantial non-UI work is the pure TS
engine + the data-fetch layer — not a backend. Renaming keeps the role busy from day one
instead of idle.

**Why `quant-reviewer` and `designer` are separate agents:** "does this match the trading
checklist" and "is this legible/safe to read under pressure" are genuinely different
skills from "is the code well-architected." Separation is also good practice for the
agentic-coding skill Luis is building. Design legibility is a **safety property** here —
misreading a veto or SL costs money.

---

## 3. Tooling — least privilege per agent

Each agent gets only the tools its job needs. The two reviewers are **read-only for the
code they judge**, so they cannot "fix" what they review — this keeps the review honest.

| Agent | Key tools | Deliberately denied |
|---|---|---|
| `product-lead` | Read, Grep, Glob, Skill | Write/Edit to product code (decides & logs; doesn't implement) |
| `architect` | Read, Grep, Glob, Bash (lint/typecheck), Edit/Write (**types + config only**), Skill | browser |
| `designer` | Read/Write/Edit, Grep, Glob, **Artifact**, Skill (`impeccable`, `dataviz`, `artifact-design`) | Bash (mostly); **Chrome deferred** (mockups-via-Artifact for now) |
| `engine-engineer` | Read/Edit/Write, Grep, Glob, Bash (Vitest), Skill (TDD) | browser, UI files |
| `frontend-engineer` | Read/Edit/Write, Grep, Glob, Bash, Skill (`impeccable`), Chrome | data/engine internals |
| `qa` | Read/Write (**tests only**), Grep, Glob, Bash (Vitest), browser (E2E) | **no Write to product code** |
| `quant-reviewer` | Read, Grep, Glob, Bash (run gate tests) | **read-only — no Write at all** |

`designer`'s Artifact tool lets it render an actual HTML mockup of the trade card /
checklist that Luis can open and approve before any UI code is written. Claude-in-Chrome
for live UI iteration is **deferred** — added later only if mockups prove insufficient.

---

## 4. How work flows

### Task lifecycle

Every task runs this pipeline; the orchestrator routes between agents (agents report to
the orchestrator, not to each other). Stages that don't apply are skipped — a pure UI
tweak skips `quant-reviewer`; a type-only change may be just `architect`.

```
product-lead  ── decides/confirms what to build next (per priority + charter)
        │
   architect  ── sets the interface/standards for the task (types, boundaries)
        │
   designer   ── (UI tasks only) UX spec + tokens + mockup
        │
   engine-engineer  OR  frontend-engineer  ── implements, test-first
        │
   qa  ── writes/runs tests, reports pass/fail
        │
   quant-reviewer  ── (engine/gate tasks only) checks fidelity to Appendix A
        │
   architect  ── final gate: standards, scope, import direction
        │
   CHECKPOINT ── update NORTHMARK-STATUS.md + commit  (SILENT — not a question)
```

**Engine/gate work always passes through `quant-reviewer` before "done."** That is the
risk, so it is never skipped for gates or scoring.

### Wave order (dependency-driven, Phase 1 — deterministic core)

Import direction is one-way downward (`ui → hooks → data/scoring → gates → indicators →
types`), so the dependency graph *is* the schedule.

| Wave | What | Agents | Parallel? |
|---|---|---|---|
| **0** | `types.ts`, `config.ts`, test fixtures | architect | No — barrier |
| **1** | `ema`, `stochastic`, `swingPoints` | engine-engineer + qa | 3-wide |
| **2** | Deterministic gates (breakout-close, R:R, sizing) | engine + qa + quant-reviewer | fan out per gate |
| **3** | `score`, `vetoes`, `risk` | engine + qa + quant-reviewer | 3-wide |
| **4** | `twelveData.ts` data layer | engine + qa (live API) | independent track |
| **5** | `designer` spec → `useMarketData` hook + UI components | designer → frontend + qa (browser) | after 1–4 |

Phase 2 (heuristic gates) and Phase 3 (scanning/alerts, optional backend) reuse the same
lanes later. "Parallel" is a fan-out the orchestrator runs within a `/loop` iteration;
Luis never watches agents run.

---

## 5. Autonomy model

### `/loop`

Luis starts the build with `/loop`. Each iteration: read `NORTHMARK-STATUS.md` → pick the
next task/wave → dispatch agents → route their questions to `product-lead` → checkpoint →
continue. The loop runs wave after wave **without pinging Luis**, stopping only at a
**phase boundary** or a **Tier-3 escalation** (below).

A **silent checkpoint is not a question** — it updates the status file and commits, then
the loop continues. Questions (human-facing) are the rare exception, not the rhythm.

### `product-lead` decision charter (three tiers)

When any sub-agent hits a decision, the orchestrator routes it to `product-lead`, which
decides under this charter rather than pausing the loop:

| Tier | Examples | `product-lead` action |
|---|---|---|
| **1 — Decide freely** | naming, file layout, which fixture, a default the spec clearly implies | Just decides. Loop never pauses. |
| **2 — Conservative default + log** | a threshold the spec doesn't pin down, a heuristic tolerance, an "important level" call | Picks the **bias-toward-WAIT / safest** option, records it in `NORTHMARK-STATUS.md`, keeps going. Luis reviews the log at the phase boundary. |
| **3 — Escalate to human** | contract-size / broker spec, anything that **contradicts Appendix A**, a real money-mechanics unknown | Genuinely stops at the phase boundary and asks Luis. |

The proxy inherits the product's own risk philosophy — *"a missed trade costs $0, a bad
trade costs money"* — so even when it decides for Luis, it errs toward WAIT and logs it.

### Hard-stop list (loop stops even mid-phase)

The charter shrinks human interruptions to near-zero, but these always stop the loop:

1. **`quant-reviewer` flags a gate that cannot be reconciled with Appendix A** (genuinely
   ambiguous checklist, not merely unimplemented).
2. **A decision the spec does not cover** and that is money-relevant (Tier-3).
3. **Tests fail and cannot be resolved after a bounded number of attempts** (prevents
   infinite token-burning spin).

Everything else proceeds silently.

### Token cost — explicit trade-off

Autonomous `/loop` with 7 agents fanning out is the **most token-hungry mode**. Luis has
accepted this cost for the practice project (separate from his day-job budget). Two
softeners are available on request:

- **Loop one phase at a time** — `/loop` a single phase; it stops at the boundary so Luis
  decides whether to spend on the next phase.
- **Cap fan-out** — run waves sequentially instead of N-wide (slower wall-clock, fewer
  parallel contexts, cheaper).

---

## 6. Persistence — hop off & resume

State lives in the **repo**, not the conversation, so any session is disposable.

### `NORTHMARK-STATUS.md` (committed, source of truth)

A living checklist at the repo root containing:

- Current **phase** and **wave**.
- Every task with a state: `done` / `in-progress` / `blocked` / `next`.
- A one-line **resume pointer** ("next: Wave 2 — breakout-close gate").
- A **decision log** — every Tier-2 conservative default `product-lead` made, for Luis'
  phase-boundary review.

Git history and this file always agree because the team **commits per completed task**.

### Checkpoint / resume skill (repo-local)

A repo-specific skill with two modes:

- **Checkpoint** — Luis says he's hopping off (or interrupts); the orchestrator updates
  `NORTHMARK-STATUS.md`, commits, and prints where it stopped. Also runs automatically on
  interrupt.
- **Resume** — next session Luis says "continue Northmark"; the orchestrator reads the
  status file, states exactly where things are and what's next, and picks up cold — no
  re-explaining.

A hop-off/resume session can be **~5 minutes**: "continue Northmark" → status readout →
"go" → dispatch next wave → hop off.

---

## 7. Open items & non-goals

- **Chrome for `designer`** — deferred; mockups-via-Artifact for now. Add live in-browser
  iteration only if mockups prove insufficient.
- **No separate `planner` agent** — task decomposition is the orchestrator + `architect`;
  prioritization is `product-lead`.
- **Phase 2/3 agents** — the same 7 agents cover heuristic gates (Phase 2) and, if ever
  built, the scanning/execution backend (Phase 3). No new roles anticipated.
- **This design does not build the product** — it defines the team. Product scope is the
  [Northmark MVP design](./2026-08-14-northmark-mvp-design.md).

---

## Appendix — decisions locked during brainstorming

1. Backend role reframed to **`engine-engineer`** (no server until Phase 3).
2. Luis is **client/product level**; the main session is the EM/orchestrator.
3. **`quant-reviewer`** is a separate agent (Appendix A fidelity = the #1 risk).
4. **`designer`** is a separate agent (legibility is a safety property); uses `impeccable`,
   `dataviz`, `artifact-design` + Artifact mockups; Chrome deferred.
5. Reviewers (`quant-reviewer`, `qa`-on-product-code) are **read-only** for what they judge.
6. Build runs via **`/loop`**; **silent checkpoints**, human questions only at phase
   boundaries or Tier-3 escalations.
7. **`product-lead`** proxy answers sub-agent questions in Luis' place under a 3-tier
   charter; Tier-2 money-adjacent defaults are delegated to it (bias-toward-WAIT + logged).
8. Token cost of autonomous `/loop` explicitly accepted; softeners available.
