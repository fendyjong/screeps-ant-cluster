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
- Colony behavior is observable after the fact, not just live: structured logs reach
  SigNoz so task distribution over time can be inspected and debugged (see Observability).

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
- SigNoz dashboards, alerting, traces, or metrics-proper. M1 ships **logs only**; building
  saved views on top of them is a follow-up once there is data worth charting.

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
  telemetry.ts             — emits structured JSON lines via console.log (snapshot on a
                             tick cadence, events immediately); see Observability
  types.ts                 — Stimuli, ThresholdProfile, TaskName; augments the global
                             CreepMemory interface via declaration merging

tools/
  log-shipper/            — NOT game code and NOT part of the bundle. Plain Node 20
                             script: tails the private server's log files, parses the
                             bot's JSON lines, POSTs them to SigNoz over OTLP/HTTP.
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
- Log severity — four levels only: `DEBUG` gray, `INFO` green, `WARN` orange, `ERROR` red.
  (Overmind's palette also had ALERT and FATAL; both are dropped. Four is enough for M1
  and maps 1:1 onto OpenTelemetry's standard severity numbers — see Observability.)

M1 HUD: a `room.visual.text()` label over each creep showing its current task, colored
by the scheme above. This is not decoration — it's the actual instrument for validating
the milestone's success criterion (watching labor reallocate live). The HUD covers the
live view; SigNoz (below) covers everything after the fact.

## Observability — SigNoz

**In scope for M1.** The HUD shows what is happening right now; it cannot answer "why did
every creep pile onto `build` around tick 4000." That needs a time series.

### The constraint

Screeps user code runs in an isolated VM with **no network access** — no `fetch`, no
`http`, no sockets. The bot cannot talk to SigNoz directly. Telemetry has to leave through
the server's own I/O, and since this server is Steam-authenticated, the usual API-polling
route is closed too (see Deploy plan).

### Pipeline

```
bot console.log(JSON)  →  server writes to its log files  →  tools/log-shipper
                          [.screepsrc: log_console = true]     (tails, parses)
                                                            →  OTLP/HTTP → SigNoz
                                                               service.name = screeps
```

- `.screepsrc` currently has `log_console = false`; setting it to `true` makes the server
  forward console output into its rotating logs under `logdir` (`logs/`). This is a server
  config change and needs a server restart — which the world reset requires anyway, so
  they happen together.
- `tools/log-shipper` is a plain Node 20 script (`fetch` is built in, so no dependencies):
  tail → filter to this bot's JSON lines → POST OTLP-JSON to `/v1/logs`. It must handle
  the server's log rotation (`log_rotate_keep = 5`).
- SigNoz is already running on this machine and its OTLP endpoints are live: gRPC on
  `4317` and HTTP on `4318`, published on portctl-managed host ports (`17817` / `17818`
  at time of writing; UI on `17800`, `signoz.local.zeven.day`). Per the portctl rule, the
  shipper **resolves these from the registry rather than hardcoding them**.

### Resource attributes

This SigNoz instance is **shared** — the container is `personal-signoz` and it already
ingests roughly thirty other services on this machine (supabase stacks, `kolva-ops`,
`ai-*`, `cog-os-*`, `hermes`). M1 adds one more service to it rather than standing up a
dedicated instance.

- `service.name = screeps` — unique here (nothing by that name exists today) and
  consistent with the instance's existing lowercase container-style naming.
- `deployment.environment = pserver` — the collector treats this as a first-class
  dimension (it otherwise defaults to `default`). Tagging it makes the private-server-only
  constraint visible in the data itself: queries can filter on it, and official-server
  data showing up would be immediately obvious rather than silently blending in.

### Severity levels

Four levels, no more: `DEBUG`, `INFO`, `WARN`, `ERROR`. Each JSON line carries its level,
and the shipper maps it onto OpenTelemetry's standard `SeverityNumber` so SigNoz's native
severity filtering works rather than requiring string matching on the body:

| Level | OTel `SeverityNumber` | Console color | Used for |
|---|---|---|---|
| `DEBUG` | 5 | gray | Per-creep decision detail; off or sampled by default (chatty) |
| `INFO` | 9 | green | Snapshots, spawns, task switches — the normal signal |
| `WARN` | 13 | orange | Recoverable trouble: corrupt threshold profile regenerated, task target vanished, spawn starved of energy |
| `ERROR` | 17 | red | Colony starvation, and anything caught by the main-loop try/catch |

`SeverityText` is the level string itself.

### What gets emitted

- **Snapshot** (`INFO`), every N ticks (throttled — `JSON.stringify` costs CPU in Screeps):
  tick, room, creep count, energy available/capacity, all three stimulus values, and **task
  distribution** (count of creeps per task). The distribution series is the single most
  important signal in the whole milestone — it is literally the shape of labor
  reallocating over time.
- **Events**, immediately: spawn and death (`INFO`), task switch with from/to and the
  margins that caused it (`INFO`), recoverable faults (`WARN`), colony starvation and
  uncaught creep exceptions (`ERROR`).

### Private-server only

This is structural rather than a setting: the shipper reads the local private server's log
directory, and official-server play never writes there. No filtering or environment flag
is needed to keep official-server activity out of SigNoz.

### One thing to verify, not assume

`log_console = true` forwards console output, but **which** file it lands in
(`engine_runner1.log`, `engine_main.log`, or process stdout) has not been confirmed — user
scripts execute in the runner process, and the engine log currently carries only
`Game time set to N` lines. Confirm empirically once the flag is flipped. If that path
proves unusable, the fallback is polling the server's CLI socket (`localhost:21026`, see
Deploy plan) and reading `Memory.stats` directly instead of parsing logs.

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
threshold tuning: log it at `ERROR` so it is visible rather than discovered hours later.

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

### Server-side changes (world reset + console forwarding)

The server exposes a CLI on a plain TCP socket — `.screepsrc` has `cli_port = 21026`,
`cli_host = localhost`. This is not affected by Steam authentication, so it is the route
for administrative commands including the world reset (`system.resetAllData()`).

Two server-side changes are needed and should be done in one pass, since both require a
restart:
1. `.screepsrc`: set `log_console = true` (enables the telemetry pipeline above).
2. Reset the world via the CLI socket.

Exact CLI invocation is confirmed interactively at execution time rather than scripted
blind — it destroys the existing world, so it gets a look before it runs.

### Deploy steps

1. Server-side changes above (config edit, restart, world reset).
2. `npm run build` (type-check) → `npm run deploy:pserver` → Steam client syncs
   automatically.
3. Start `tools/log-shipper` and confirm lines are arriving in SigNoz.

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
