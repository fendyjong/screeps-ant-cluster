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

- A single room where creeps pick their own task (`supply` / `upgrade` / `build`) every
  tick from local room stimuli vs. their own per-creep threshold profile — zero central
  role assignment.
- Population is heterogeneous by construction (jittered thresholds per creep), not by
  hand-coded roles.
- Labor visibly reallocates when conditions change — specifically, when construction sites
  are placed by hand (see below), creeps should drift toward `build`; when those sites
  complete, they should drift back — with no code change.
- Runs on the private server against a freshly wiped world.

### How the colony gets perturbed (important)

M1 has no room planner, and a fresh world has zero construction sites — so the `build`
stimulus would sit at zero forever and `build` would be dead code. **Construction sites are
placed by hand in the game UI.** This is deliberate and philosophically consistent: it's an
external stimulus injected into the environment, exactly like dropping food near an ant
nest. It also makes reallocation testable on demand instead of something you wait around
for. Placing and cancelling sites is the primary way to exercise the milestone.

## Non-goals (deferred to later milestones)

- Threshold/quorum-driven **spawning** (M1 spawning is a dumb fixed-N respawner).
- Pheromone/stigmergic trail-weighted movement.
- Automated construction-site placement / room planning.
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
                           zero out the tick for everyone else); also prunes
                           Memory.creeps entries for creeps that no longer exist
  creep/
    stimuli.ts           — pure fn: room state → per-task stimulus values
    thresholds.ts        — per-creep threshold profile, generated once at spawn
                           with jitter; regenerated on the fly if missing/corrupt
    decide.ts            — pure fn: (stimuli, thresholds, currentTask) → chosen task
    tasks/
      supply.ts           — run(creep): gather energy, deliver to spawn/extensions
      upgrade.ts           — run(creep): gather energy, deliver to controller
      build.ts             — run(creep): gather energy, work active construction sites
  spawn/
    respawn.ts            — dumb fixed-N respawner; stamps a fresh jittered
                            threshold profile into memory at spawn time
  visuals.ts               — per-creep room.visual task label; shared color constants
  types.ts                 — Stimuli, ThresholdProfile, TaskName; augments the global
                             CreepMemory interface via declaration merging
```

No `Overseer`/`Colony`/`Overlord`/`Task`-class-hierarchy equivalents. No generic
role-registration system — 3 task modules is not enough surface area to justify one
(YAGNI; revisit if/when task count grows).

### All three tasks gather; only their sink differs

In Screeps a creep cannot `upgradeController` or `build` with an empty carry, so **every**
task is a two-phase loop: gather energy from a source, then deliver it somewhere. The
tasks differ only in the sink:

| Task | Sink | Stimulus driving it |
|---|---|---|
| `supply` | spawn / extensions | room energy deficit (saturating — see below) |
| `upgrade` | controller | controller progress needed |
| `build` | active construction sites | construction backlog |

`taskState.phase` (`'gathering' | 'delivering'`) carries which half of the loop the creep
is in; it flips when the creep fills up or empties out. This is why the task is named
`supply` and not `harvest` — all three tasks harvest, so `harvest` would be a misleading
name for the one whose sink happens to be the spawn.

## Decision mechanism

Room-level stimuli computed once per tick, shared across all creeps in the room (cheap),
each normalized to roughly 0..1.

**Supply stimulus saturates.** Rather than scaling linearly with the energy deficit, it
goes to its maximum (1.0) whenever the room cannot afford to replace a creep. This is the
guard against unrecoverable bootstrap death (see Failure modes below) and is *not* a
centralized override: every creep still decides alone, the stimulus is simply shaped the
way real hunger and alarm stimuli are — spiking rather than scaling smoothly.

Each creep carries its own threshold profile in `Memory.creeps[name].thresholds`,
generated at spawn as `baseThreshold ± jitter` per task — this is the actual mechanism
behind population heterogeneity; no hand-coded castes.

Each tick, for each task, compute `margin = stimulus − ownThreshold`. Then:

1. If no task has a positive margin: keep the current task; if there is no current task,
   default to `upgrade` (the controller always accepts energy, so it is never a wasted
   default).
2. If the current task's margin is negative and some other task's margin is positive:
   switch to the highest-margin task immediately (no buffer — the current task is below
   this creep's threshold and should be abandoned).
3. If the current task's margin is positive: switch only if the best candidate's margin
   exceeds it by a fixed buffer. The buffer exists to prevent flapping between two viable
   tasks, which wastes movement ticks; it applies only in this both-positive case.
4. Independently of the above, a small fixed probability of switching to a random task
   anyway — deliberate, not noise: per §1.2 of the design doc, exploration is intentional
   in young/small colonies and should not be engineered away.

Both the jitter and the exploration chance are pure-function-testable (stimuli in, task
out, no `Game`/`Memory` globals touched) even though this project has no test suite —
worth keeping the functions pure anyway since it costs nothing and makes the logic
easier to reason about by hand.

Exact constants (jitter magnitude, switch buffer, exploration probability, the
affordability point where the supply stimulus saturates) are implementation-time tuning
parameters, not architectural decisions — this spec fixes the *mechanism*, not the numbers.
Pick reasonable starting values during implementation and adjust by observation.

### What to expect when watching it

Stimuli are shared per-tick and M1 has **no congestion or crowding feedback** (design doc
§4.3's quorum control, where arriving ants slow each other down and some turn back). So
differentiation comes only from threshold jitter plus stimulus drift over time, and early
behavior will look fairly *synchronized* — creeps peeling off a task in clusters as the
falling stimulus crosses successive thresholds, rather than spreading smoothly. Source
depletion is the only natural brake in M1. This is expected, not a defect; congestion
feedback arrives with pheromones in M3.

## Spawning (Milestone 1 — intentionally dumb)

Fixed target count N = 4 for the one room (small enough not to overcrowd 1-2 sources at
RCL1). If alive count < N and spawn is idle: spawn a generalist. Min body
`[WORK, CARRY, MOVE]` (200e), scales toward `[WORK, WORK, CARRY, CARRY, MOVE, MOVE]`
(400e) as energy allows. Insufficient energy even for the min body → skip silently, retry
next tick (not an error).

At spawn time, the *only* centralized decision in the whole system happens: stamping a
jittered threshold profile into the new creep's memory. Everything after that is the
creep's own.

## Memory shape

```ts
Memory.creeps[name] = {
  task: 'supply' | 'upgrade' | 'build',
  thresholds: { supply: number, upgrade: number, build: number },
  taskState: { targetId?: Id<Source | ConstructionSite>, phase?: 'gathering' | 'delivering' }
}
```

Declared by augmenting the global `CreepMemory` interface in `types.ts`. Entries for dead
creeps are pruned each tick in `main.ts` (names present in `Memory.creeps` but absent from
`Game.creeps`) — otherwise memory grows without bound.

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
- Task's target (source/site) no longer exists → clear `taskState` and pick a new target
  on the next pass (`decide()` itself runs every tick regardless).
- Insufficient spawn energy → skip, retry next tick.
- Each creep's `run()` wrapped in try/catch at the main-loop level.

### Failure modes worth naming

**Bootstrap starvation.** On a fresh room the spawn holds 300e and there is no income. If
early creeps' jitter sends them to `upgrade`, energy drains into the controller, never
returns to the spawn, replacements cannot be spawned, and the colony dies unrecoverably.
The design doc's `MINIMUM_CIVILIAN_FLOOR` (§1.1) exists for exactly this. M1's equivalent
is the saturating supply stimulus described above — when the room cannot afford a
replacement creep, supply's stimulus pegs at maximum and clears essentially every creep's
threshold. If the colony dies anyway, that is a legitimate experimental result about
threshold tuning: log it at FATAL so it is visible rather than discovered hours later.

## Deploy plan

Private server is Steam-launched — confirmed (screeps.com/forum/topic/539/pushing-code/13,
docs.screeps.com/contributed/advanced_grunt.html) that Steam-authenticated private servers
only accept Steam client tickets; no email/password or API token push is possible against
them. The correct method is copying the compiled bundle directly into the Steam-synced
local folder (`127_0_0_1___21025/pserver/main.js`); the Steam client uploads it from there.

**The `DEST` trap.** `rollup.config.js` reads `process.env.DEST`: with no `DEST` it sets
`dryRun: true` and merely writes `dist/main.js` (what we want); with `DEST=pserver` it
attempts an HTTP push to `127.0.0.1:21025`, which **cannot work** under Steam auth. The
obvious-looking `rollup -c --environment DEST:pserver` is therefore exactly wrong. The
`pserver` block in `screeps.js` is marked unusable for this reason.

The existing `deploy` script pushes to all three targets at once (`screeps.com/default`,
`screeps.com/seasonal`, `127_0_0_1___21025/pserver`). This project must not touch the
official-server targets. Add a pserver-only script that compiles with **no** `DEST` and
copies to the pserver folder alone:

```json
"deploy:pserver": "npm run compile && cp dist/main.js 127_0_0_1___21025/pserver/main.js"
```

Use that exclusively during this build-out.

Steps:
1. Reset the private server world. **Open question, to resolve at execution time**: the
   Steam server ships a CLI (`system.resetAllData()` is the usual command) but CLI access
   on this particular install has not been verified, so the exact mechanism is confirmed
   with the user rather than assumed here.
2. `npm run build` (type-check) → `npm run deploy:pserver` → Steam client syncs
   automatically.

## Migration / prerequisite steps

Since Overmind is fully scrapped:

1. `git tag archive/overmind-fork` at current HEAD (cheap, reversible safety net).
2. Remove `src/` (the Overmind fork) from the working tree — the new bot starts on a clean
   slate instead of 32 unused legacy directories sitting alongside it.
3. Rewrite `rollup.config.js`. It is Overmind-specific in two ways that break or misattribute
   once `src/` is gone:
   - `commonjs({namedExports: ...})` references `src/Overmind_obfuscated`,
     `screeps-profiler`, and `columnify` — all deleted with `src/`.
   - `output.banner` bakes Overmind's ASCII logo and
     `// Overmind repository: github.com/bencbartlett/overmind` into every compiled
     bundle. A clean-room bot shipping that banner is both wrong and misattributing.
4. Update `package.json` identity and prune dead dependencies:
   - `name`, `description`, `author` still say Overmind / Ben Bartlett;
     `repository` / `homepage` / `bugs` still point at `bencbartlett/Overmind`. All need
     to reflect this project. The `license` field is a decision for the user — no Overmind
     code remains after the scrap, so their attribution no longer applies.
   - Runtime deps `@tensorflow/tfjs`, `onnxjs`, `columnify`, `source-map` are all
     Overmind's (the first two are its reinforcement-learning stack, and both are large)
     and unused by a clean-room bot.
   - The `obfuscate` script targets `tsc-out/Overmind.js`, which will no longer exist;
     `javascript-obfuscator` becomes an unused devDependency along with it.
5. Repo cleanup (tracked-but-shouldn't-be; separate from the rewrite but blocking a clean
   starting point): remove `tsc-out/`, `dist/`, `piolium/`, the old audit files in
   `specs/`, and `test/` (singular — a security-scan scaffold) from git. `tests/` (plural)
   goes too: its only file, `ExpansionCampaign.test.ts`, tests a module being deleted with
   `src/`. Untrack `graphify-out/` but keep it locally. Add all of the above to
   `.gitignore`.

## Future milestones (out of scope here, separate specs)

- **M2**: threshold/quorum-driven spawning (spawn decision itself becomes stimulus-driven
  instead of fixed N).
- **M3**: pheromone-weighted movement/hauling (stigmergic routing, per design doc §5.4/§11),
  which also brings the congestion/negative-feedback mechanism M1 deliberately lacks.
- **M4**: expansion (budding, per design doc §1.3/§7), military — kinetic (design doc §6)
  fused with economic denial (`peaceful-strategy-analysis.md`), self-improvement/evolution
  across generations.
