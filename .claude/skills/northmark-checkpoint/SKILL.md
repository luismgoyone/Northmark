---
name: northmark-checkpoint
description: Resume or checkpoint the Northmark /loop build. Use in Resume mode when Luis says "continue Northmark" or starts a session and you need to know where the build stands. Use in Checkpoint mode when Luis hops off, interrupts, or a task completes — to persist progress to NORTHMARK-STATUS.md and commit. Keeps sessions disposable: all state lives in the repo, not the conversation.
---

# Northmark Checkpoint / Resume

State lives in the **repo**, not the conversation, so any session can be picked up cold.
Two modes.

## Resume mode

Trigger: "continue Northmark", session start, or after any interruption.

1. Read `NORTHMARK-STATUS.md`.
2. Read the **Current** block (phase, wave, resume pointer, loop mode).
3. Report to Luis, concisely:
   - Current phase/wave and the one-line resume pointer.
   - The next runnable task (skip any `[!]` blocked task; note it separately).
   - Any open **Tier-3** items awaiting his answer.
   - Any **Tier-2** decisions logged since he was last here (from the decision log).
4. Read the relevant task in `docs/superpowers/plans/2026-08-14-northmark-build.md`.
5. Wait for "go" (or proceed if running under `/loop`).

Do **not** re-derive the plan from scratch or re-ask settled questions — the status file
plus the two design docs are the whole context.

## Checkpoint mode

Trigger: Luis hops off / interrupts, or a task finishes. **This is silent — never a
question.** Also run this automatically when an interrupt lands mid-work.

1. Determine what changed since the last checkpoint (completed steps/tasks).
2. Edit `NORTHMARK-STATUS.md`:
   - Update task state markers (`[ ]`→`[~]`→`[x]`, or `[!]` if blocked Tier-3).
   - Advance the **Current** block (phase, wave, resume pointer).
   - Append any **Tier-2** decisions `product-lead` made to the decision log
     (what + why), and any new **Tier-3** item to the Blocked list.
3. Stage and commit everything:
   ```bash
   git add -A
   git commit -m "chore(status): checkpoint — <next task>"
   ```
4. Print one line: `Checkpointed at <phase/wave/task>. Resume with "continue Northmark".`

## Phase boundaries

At the end of a phase, do **not** roll into the next phase. Checkpoint, then surface the
Tier-2 decision log and any Tier-3 items and **stop for Luis' approval**.
