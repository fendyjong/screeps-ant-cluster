# Decentralized Colony MVP — Design Spec

**Status**: approved, ready for implementation planning
**Parent doc**: [`docs/progressive-ant-supercolony.md`](../../progressive-ant-supercolony.md)

## Context

The bot currently vendors real `bencbartlett/Overmind` (centralized `Overmind → Overseer → Colony/Overlord`
orchestration). The project's actual goal is not "a strong Screeps bot" — it's the
decentralization experiment itself: can a colony run well when individual creeps make
their own decisions from local stimuli and per-agent thresholds (quorum sensing / response
threshold task allocation, per `docs/progressive-ant-supercolony.md` §2.3/§4.2), instead
of a central planner computing role demand and assigning tasks top-down.

Retrofitting that onto Overmind's Overseer-driven model fights the framework more than it
helps. Decision: **full clean-room rewrite** — nothing carried over from Overmind, including
low-level plumbing (pathfinding, task persistence, spawning). The only thing intentionally
carried over is visual/theme language (HUD colors, console log severity colors) — inspiration
only, no code reuse.

This spec covers **Milestone 1 only**: the smallest slice that tests the core hypothesis.
Later milestones (listed at the bottom) are explicitly out of scope here and will get their
own specs.

## Goals (Milestone 1)

- A single room where creeps pick their own task (`harvest` / `upgrade` / `build`) every
  tick from local room stimuli vs. their own per-creep threshold profile — zero central
  role assignment.
- Population is heterogeneous by construction (jittered thresholds per creep), not by
  hand-coded roles.
- Labor visibly reallocates when conditions change (e.g. construction finishes → creeps
  drift to upgrading) without any code change.
- Runs on the private server against a freshly wiped world.

## Non-goals (deferred to later milestones)

- Threshold/quorum-driven **spawning** (M1 spawning is a dumb fixed-N respawner).
- Pheromone/stigmergic trail-weighted movement.
- Expansion, multi-room, military (kinetic or economic-denial).
- Self-improvement/evolution across generations.
- Any code reuse from Overmind beyond color/theme inspiration.
- Automated tests — **this project uses none**; verification is by watching the bot run
  against the real private server (matches how emergent/tick-based behavior actually gets
  validated in this domain; matches prior project convention of no test framework).

## Architecture

```
src/
  main.ts               — entry point, loop() iterates rooms/creeps, wraps each
                           creep's run() in try/catch (one throwing creep must not
                           zero out the tick for everyone else)
  creep/
    stimuli.ts           — pure fn: room state → per-task stimulus values
    thresholds.ts        — per-creep threshold profile, generated once at spawn
                           with jitter; regenerated on the fly if missing/corrupt
    decide.ts            — pure fn: (stimuli, thresholds, currentTask) → chosen task
    tasks/
      harvest.ts          — run(creep): gather + self-deliver (no separate hauler
                            role at this scale — RCL1, no storage/containers yet)
      upgrade.ts           — run(creep): deliver energy to controller
      build.ts             — run(creep): work active construction sites
  spawn/
    respawn.ts            — dumb fixed-N respawner; stamps a fresh jittered
                            threshold profile into memory at spawn time
  visuals.ts               — per-creep room.visual task label; shared color constants
  types.ts                 — Stimuli, ThresholdProfile, TaskName, CreepMemory shape
```

No `Overseer`/`Colony`/`Overlord`/`Task`-class-hierarchy equivalents. No generic
role-registration system — 3 task modules is not enough surface area to justify one
(YAGNI; revisit if/when task count grows).

## Decision mechanism

Room-level stimuli computed once per tick, shared across all creeps in the room (cheap):
energy deficit (for `harvest`), controller progress needed (for `upgrade`), construction
backlog (for `build`).

Each creep carries its own threshold profile in `Memory.creeps[name].thresholds`,
generated at spawn as `baseThreshold ± jitter` per task — this is the actual mechanism
behind population heterogeneity; no hand-coded castes.

Every tick: pick the task with the highest positive `(stimulus − ownThreshold)` margin.
If none is positive, keep the current task (or default to `upgrade` if there is no
current task yet — controller always accepts energy, so it's never a wasted default).

**Anti-thrash + exploration**: a task switch only fires if the candidate task's margin
beats the current task's margin by a fixed buffer (avoids flapping mid-path, which wastes
a movement tick in Screeps). On top of that, a small fixed probability of switching anyway
even without a clear margin win — deliberate, not noise: per §1.2 of the design doc,
exploration is intentional in young/small colonies, not something to engineer away.

Both the jitter and the exploration chance are pure-function-testable (stimuli in, task
out, no `Game`/`Memory` globals touched) even though this project has no test suite —
worth keeping the functions pure anyway since it costs nothing and makes the logic
easier to reason about by hand.

Exact constants (jitter magnitude, switch buffer, exploration probability) are
implementation-time tuning parameters, not architectural decisions — this spec fixes the
*mechanism*, not the numbers. Pick reasonable starting values during implementation and
adjust by observation.

## Spawning (Milestone 1 — intentionally dumb)

Fixed target count N = 4 for the one room (small enough not to overcrowd 1-2 sources at
RCL1). If alive count < N and spawn is idle: spawn a generalist. Min body `[WORK, CARRY, MOVE]` (200e), scales toward
`[WORK, WORK, CARRY, CARRY, MOVE, MOVE]` (400e) as energy allows. Insufficient energy
even for the min body → skip silently, retry next tick (not an error).

At spawn time, the *only* centralized decision in the whole system happens: stamping a
jittered threshold profile into the new creep's memory. Everything after that is the
creep's own.

## Memory shape

```ts
Memory.creeps[name] = {
  task: 'harvest' | 'upgrade' | 'build',
  thresholds: { harvest: number, upgrade: number, build: number },
  taskState: { targetId?: Id<Source | ConstructionSite>, phase?: 'gathering' | 'delivering' }
}
```

No versioned/flat empire-wide schema needed yet — that's a later-milestone concern once
there's more than one room and more than one mechanism.

## Visuals / theme

Reusing Overmind's color language (inspiration only, no code):
- HUD text: `#c9c9c9`
- Log severity: ERROR red, WARNING orange, ALERT yellow, INFO green, DEBUG gray, FATAL `#d65156`

M1 HUD: a `room.visual.text()` label over each creep showing its current task, colored
by the scheme above. This is not decoration — it's the actual instrument for validating
the milestone's success criterion (watching labor reallocate live). No external dashboard
for M1; SigNoz integration (log shipping, private-server-only) is a separate follow-up
once there's something worth shipping logs about.

## Error handling

- No task clears threshold + no current task → default to `upgrade`.
- Missing/corrupt threshold profile → regenerate fresh (jittered) on the fly.
- Task's target (source/site) no longer exists → clear `taskState`, let `decide()`
  re-run next tick.
- Insufficient spawn energy → skip, retry next tick.
- Each creep's `run()` wrapped in try/catch at the main-loop level.

## Deploy plan

Private server is Steam-launched — confirmed (screeps.com/forum/topic/539/pushing-code/13,
docs.screeps.com/contributed/advanced_grunt.html) that Steam-authenticated private servers
only accept Steam client tickets; no email/password or API token push is possible against
them. `push-pserver` (rollup-plugin-screeps HTTP push) cannot work here and is marked as
such in `screeps.js`. The correct method — already how `npm run deploy` behaves for the
pserver target — is copying the compiled bundle directly into the Steam-synced local
folder (`127_0_0_1___21025/pserver/main.js`); the Steam client uploads it from there.

The existing `deploy` script pushes to all three targets at once (`screeps.com/default`,
`screeps.com/seasonal`, `127_0_0_1___21025/pserver`). This project must not touch the
official-server targets. Add a `deploy:pserver` script (compile + copy to the pserver
folder only) and use that exclusively during this build-out.

Steps:
1. Reset the private server world — mechanism TBD with the user at execution time (their
   server, their admin tooling; not assumed here).
2. `npm run build` (type-check) → `npm run deploy:pserver` → Steam client syncs
   automatically.

## Migration / prerequisite steps

Since Overmind is fully scrapped:
1. `git tag archive/overmind-fork` at current HEAD (cheap, reversible safety net).
2. Remove `src/` (current Overmind fork) from the working tree — new bot starts on a
   clean slate instead of 32 unused legacy directories sitting alongside it.
3. Repo cleanup (tracked-but-shouldn't-be dirs — separate from this rewrite but blocking
   a clean starting point): `tsc-out/`, `dist/`, `piolium/`, `specs/`-old-audit-files,
   `test/` (singular, security-scan scaffold) removed from git; `graphify-out/` untracked
   but kept locally; all six added to `.gitignore`.

## Future milestones (out of scope here, separate specs)

- **M2**: threshold/quorum-driven spawning (spawn decision itself becomes stimulus-driven
  instead of fixed N).
- **M3**: pheromone-weighted movement/hauling (stigmergic routing, per design doc §5.4/§11).
- **M4**: expansion (budding, per design doc §1.3/§7), military — kinetic (design doc §6)
  fused with economic denial (`peaceful-strategy-analysis.md`), self-improvement/evolution
  across generations.
