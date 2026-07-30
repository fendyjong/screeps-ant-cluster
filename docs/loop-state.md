# Loop State

## Iteration ledger

One row per iteration. Newest at the bottom. `metric` is GCL rate in energy/tick
with headcount, because a rate without a headcount measures population, not
efficiency.

| # | changed | metric before → after | verdict |
|---|---|---|---|
| 22 | body reshape (WORK-lean, MOVE-balanced) | 2.91@24 → 1.25@11 | **falsified**; replacement cost and roads did improve |
| 23 | cohort-death hypothesis tested | — | rejected; ages evenly spread |
| 24 | `REMOTE_CRISIS_WEIGHT` — shortage pulls foraging outward | remote 0 → 9.5 creeps at low energy | worked; population 26→2 oscillation stopped |
| 25 | granary: storage placement + sink + withdraw path | 1.70@27 → 1.97@26 | over-read; single sample |
| 25b | route deliveries by need (`NEST_PRIORITY_FILL`) | 1.76@24-27 | fixed my own collapse; no gain |
| 25c | `NEST_SPAWN_RESERVE` replaces capacity fraction | 1.70 → 1.85@25-26 | population and body size fixed; output marginal |
| 26 | reserve only rooms actually harvested (`lastHarvest`) | reserver spawns 4.25/min → 0.75/min | worked (−82% waste); did NOT stop collapses |
| 26b | instrument spawn-block reasons (telemetry only) | — | **decisive**: energy never blocks reproduction |
| 27 | **fitness = energy delivered**, not stimulus-while-busy | 1.85@25-26 → **2.29@25** | **worked** (+24%); best fitness unfroze after ~7500 gens |
| 28 | stagger scales with deficit (`base / deficit`) | stagG during decline 24-48 → **0** | worked as designed; did NOT stop collapses |
| 29a | *(settled)* confirm iteration 27's fitness change | 1.85@25-26 → **4.57@25-26** | **worked**; 2.29 was an understatement taken mid-reset |
| 29 | pre-spawn: "alive" = outlives spawn+travel lead time | 4.57@25-26 → 3.91 & 5.02@26-27 | **no-gain** in steady state (by design); pop floor 24 → 25 |
| 30 | growth reserve scales with deficit | at 17-19 creeps: blocked 9-45 ticks/100 → **0** | **worked** (verified on a later collapse) |
| 31 | per-creep jitter on replacement lead time | birth gaps locked at 36 (spawn-limited) | unverified until next cohort cycle |

# Loop state — progressive ant supercolony

Append-only log of what each loop iteration did. **Read this first, every iteration.**
It is the only thing preventing the loop from redoing work it already finished.

## Where things stand

- **Milestone 1 code is complete and committed** on branch `feat/decentralized-colony-mvp`.
  12 TypeScript modules under `src/` plus `tools/log-shipper/`. `npx tsc --noEmit -p .`
  passes. Bundle is ~14 KB.
- **Design spec:** `docs/superpowers/specs/2026-07-30-decentralized-colony-mvp-design.md`
- **Research doc (the thing to keep progressing):** `docs/progressive-ant-supercolony.md`
- **Plan already executed:** `docs/superpowers/plans/2026-07-30-decentralized-colony-mvp.md`

## Milestone ladder (from the design spec)

- **M1 — done, not yet observed:** per-creep threshold task allocation (`supply`/`upgrade`/
  `build`), fixed-N=4 respawn, HUD labels, `[ANT]` telemetry → SigNoz.
- **M2:** threshold/quorum-driven *spawning* (spawn decision itself becomes stimulus-driven
  instead of fixed N).
- **M3:** pheromone-weighted movement and hauling (stigmergic routing, design doc §5.4/§11);
  also brings the congestion/negative-feedback mechanism M1 deliberately lacks.
- **M4:** expansion by budding (§1.3/§7); military — kinetic (§6) fused with economic denial
  (`peaceful-strategy-analysis.md`); self-improvement across generations.

## Known open items

- **§9 of the research doc is mislabeled.** It audits a flat-JS bot that never existed in
  this repo, not the real code. Needs re-auditing against the current `src/`, or deleting.
- **Kinetic and economic military doctrine are still two unreconciled documents.** §6 of the
  research doc covers combat; `peaceful-strategy-analysis.md` covers market denial and is
  itself truncated (ends mid-function, Pillar 5 never written).
- **M1 has no congestion feedback.** Expect synchronized task switching rather than smooth
  differentiation. This is by design and documented; M3 addresses it.
- **Deferred minors** from the build, worth folding into a future iteration: a creep holding
  partial energy when the last construction site completes can idle (`build.ts` +
  `gather.ts`); `package-lock.json` still names Overmind; `tsconfig.json` `typedocOptions`
  points at a dead path.

## Deployment — the path that actually works

**The branch folder matters.** The Screeps client syncs `<server-dir>/<branch>/main.js`,
and this account's code branch is `default`. An earlier `deploy:pserver` copied into
`127_0_0_1___21025/pserver/` — a leftover branch folder from Overmind's `screeps.js` — so
nothing ever reached the server and the user's `main` module sat at 0 bytes. Fixed in
`c2174ee`; the correct target is `127_0_0_1___21025/default/main.js`.

```bash
npm run deploy:pserver     # compile (never with DEST) + copy into default/
```

Then confirm the server actually took it — the copy landing on disk is not proof:

```bash
node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.env.HOME+"/.steam/debian-installation/steamapps/common/Screeps/server/db.json","utf8"));const col=n=>(d.collections.find(c=>c.name===n)||{}).data||[];const u=col("users").find(x=>x.username==="Jin");const c=col("users.code").find(x=>x.user===u._id);const m=(c&&c.modules&&c.modules.main)||"";console.log("branch:",c&&c.branch,"| main bytes:",m.length);const mine=col("rooms.objects").filter(o=>o.user===u._id);const t={};for(const o of mine)t[o.type]=(t[o.type]||0)+1;console.log("objects:",JSON.stringify(t))'
```

Expect ~13950 bytes on branch `default` and roughly `COLONY_SIZE` creeps. Zero bytes means
the client has not synced — deploy did not take effect no matter what the shell said.

**Confirmed working 2026-07-30 18:44:** bundle in DB, 4 creeps (`ant_43999`…`ant_44249`,
body `wcm` = the 200e min body, correct for RCL1) alive in W7N6, memory carrying threshold
state. M1 is live.

## BLOCKED — needs the human, cannot be done from a shell

1. **`log_console` is set but not live.** `.screepsrc` has `log_console = true`, but the
   engine processes were started at 14:25, before the 18:07 edit. Until the server is
   restarted through the Steam client, no console output reaches disk, so no `[ANT]` line
   can ever reach SigNoz. (Backup of the original config: `.screepsrc.bak`.)

```bash
# console forwarding live? expect at least one file listed
grep -l "ANT" ~/.steam/debian-installation/steamapps/common/Screeps/server/logs/*.log
```

## SigNoz — how to read the colony

Service is `screeps`, environment `pserver`. UI at `https://signoz.local.zeven.day`.
Resolve the OTLP port rather than hardcoding: `docker port personal-signoz-otel-collector 4318`.

Start the shipper against whichever log file carries console output (try
`engine_runner1.log` first — user scripts run in the runner process):

```bash
SIGNOZ_OTLP_URL=http://localhost:$(docker port personal-signoz-otel-collector 4318 | head -1 | sed 's/.*://')/v1/logs \
  node tools/log-shipper/index.js \
  ~/.steam/debian-installation/steamapps/common/Screeps/server/logs/engine_runner1.log
```

Query the data directly for analysis:

```bash
docker exec personal-signoz-clickhouse clickhouse-client -q "
SELECT timestamp, severity_text, body FROM signoz_logs.distributed_logs_v2
WHERE resources_string['service.name'] = 'screeps'
ORDER BY timestamp DESC LIMIT 50 FORMAT Vertical"
```

The `snapshot` event's `distribution` field (creeps per task, every `SNAPSHOT_INTERVAL`
ticks) is the primary signal — it is the shape of labor reallocating. `task-switch` events
carry the margins that caused each switch. `ERROR` severity means a caught creep exception
or colony starvation.

## Iteration log

_(append one entry per iteration: date, what was researched, what changed, what was observed,
what the next iteration should pick up)_

### 2026-07-30 — iteration 0 (setup, not a loop iteration)

M1 built and committed. World reset, spawn placed by the human.

Telemetry pipeline verified end-to-end against live SigNoz with a synthetic record
(`service.name=screeps`, `deployment.environment=pserver`, severity mapped to OTel 9).

Found and fixed a real deployment bug: the deploy target was the wrong branch folder
(`pserver/` instead of `default/`), so the server never received any code and the user's
`main` module was 0 bytes — the bot was not running at all despite a successful-looking
`npm run deploy`. After the fix the bundle is in the DB and **M1 is live: 4 creeps in
W7N6**.

Still **zero real colony telemetry**, because `log_console` needs a server restart.

Next iteration: get the server restarted, start the shipper, and observe M1's actual task
distribution for a few thousand ticks BEFORE changing any behavior. Specifically worth
checking: whether the synchronized-switching prediction holds, and whether the supply
stimulus saturation keeps the colony out of starvation.

### 2026-07-30 — iteration 1

**Observed.** No telemetry existed, so per the loop rules this iteration diagnosed instead
of adding features. Server had been restarted, `log_console = true` was live, yet
`engine_runner1.log` held only boot messages and `users.console` was empty.

**Root cause of the telemetry blackout:** on a Steam-launched server, `log_console`
forwards console output to the *launcher process's stdout*, which the GUI swallows. Nothing
tailable is ever written. `tools/log-shipper` cannot work on this setup. This was the exact
risk the design spec flagged as "verify, don't assume."

**Fix shipped:** telemetry now also goes into a bounded `Memory.telemetry` ring buffer
(`TELEMETRY_BUFFER_MAX = 60`), because Memory *does* reach disk — the server flushes it into
`db.json` roughly every 10s (measured). New `tools/memory-shipper/` polls `db.json`, extracts
`memory:<userId>`, and ships new records to SigNoz over OTLP.
**SigNoz is now live** — snapshots and task-switch events streaming under
`service.name=screeps`.

**Research (folded into the research doc):** the "parked" creep observed with every
threshold above every stimulus is not a defect — roughly 40% of real ant workers are
persistently inactive, and colonies with *variable* thresholds outlast uniform-threshold
ones because inactive workers form a reserve that replaces fatigued active workers. Our
jitter reproduces that reserve caste for free. One divergence worth acting on: real inactive
ants *rest*, whereas ours keeps running a task at negative margin — burning CPU and
occupying tiles.

**Second bug the telemetry immediately exposed (fixed):** `room.energyAvailable` and
`room.energyCapacityAvailable` both arrive `undefined` on this server. Two consumers were
silently degraded by it:
- `computeStimuli` fell through to `else supply = 0`, pinning the supply stimulus at zero —
  so no creep ever refilled the spawn and the saturating starvation guard could never fire.
- `main.ts`'s starvation check compared `undefined < MIN_BODY_COST`, which is `false`, so
  the `colony-starvation` ERROR **never fired even though the colony was dying**.
Both now use a new `readEnergy(room)` that sums spawn/extension stores directly. Verified:
`energyAvailable` reports real numbers and ERROR events now fire (75 of them).

**Colony died during this iteration.** Zero creeps, spawn empty. The human raised tick speed
to 50ms, so a 1500-tick creep lifetime is ~75 real seconds — a full generation elapsed inside
a single 45s verification wait. Confirmed the engine does **not** auto-refill an empty spawn
for a creepless player (watched 200 ticks; `store` stayed `{}`), so this state is
unrecoverable without a human respawn.

**Top suspect for the death, for the next iteration to verify first:**
`readEnergy` reports `energyCapacity: 0`, but a spawn should report 300. That implies
`room.find(FIND_MY_STRUCTURES)` is returning empty on this server — and **`supply.ts` uses
exactly that call to find its delivery targets**. If it returns nothing, the supply task can
never deliver energy to the spawn, which would explain the death spiral directly.
`runSpawning` uses `FIND_MY_SPAWNS` and demonstrably works, so switching `supply.ts` and
`readEnergy` to `FIND_MY_SPAWNS` + an explicit extension lookup is the probable fix.

**Next iteration:** (1) confirm the `FIND_MY_STRUCTURES` hypothesis and fix `supply.ts`;
(2) after a respawn, verify a creep actually refills the spawn and the colony sustains
itself across a generation; (3) then consider letting all-negative-margin creeps genuinely
idle rather than working at a loss.

**Late in iteration 1**, two more changes shipped:
- `SNAPSHOT_INTERVAL` 10 → 100. The human set tick duration to ~20ms (~50 ticks/sec), so the
  old value emitted five snapshots per second and swamped SigNoz. At 100 it is roughly one
  every two seconds, still ~15 samples per 1500-tick creep generation (~30s of wall clock).
- **Removed both uses of `FIND_MY_STRUCTURES`** (`stimuli.ts:readEnergy`,
  `tasks/supply.ts`), replaced with `FIND_STRUCTURES` + an explicit `my` check. The
  hypothesis logged above was confirmed by evidence: `readEnergy` reported a capacity of 0
  for a room containing a spawn, which must report 300. Since `supply.ts` used the same call
  to find delivery targets, no creep could ever deliver energy to the spawn — the direct
  mechanical cause of the starvation. `runSpawning` was unaffected because it uses
  `FIND_MY_SPAWNS`, which works.

**State at end of iteration 1:** colony still dead (controller + empty spawn, zero creeps),
awaiting a human respawn. All fixes are deployed, so the next generation starts on corrected
code. SigNoz is live and streaming under `service.name=screeps`.

**First thing next iteration must check:** after respawn, whether a creep actually delivers
energy into the spawn (`supply` appears in `distribution`, and snapshot `energyAvailable`
climbs above 0). That single observation confirms or refutes the whole `FIND_MY_STRUCTURES`
diagnosis. If `energyCapacity` still reports 0 with a spawn present, the diagnosis was wrong
and the next suspect is the `store` API shape on this server version.

### 2026-07-30 — iteration 2

**Observed (SigNoz, live).** The human respawned into W5N8 and the previous iteration's
fixes were confirmed by data:
- `energyCapacity` now reports **300**, not 0 — the `FIND_MY_STRUCTURES` diagnosis was
  correct and the fix works.
- The core M1 hypothesis demonstrated itself: energy fell to 148/300 → supply stimulus
  saturated to 1.0 → **all three creeps self-selected `supply`** → spawn refilled to 298 →
  stimulus collapsed to 0.007 → creeps drifted back to `upgrade`. Decentralized labor
  reallocation, no central assignment. **M1 is validated.**
- `colony-starvation` ERRORs stopped entirely once the colony was self-sustaining.

**Next bottleneck, straight from the data:** energy sat pinned at **300/300 indefinitely**
under fixed `COLONY_SIZE = 4`. Real surplus the colony structurally could not use.

**Researched:** colony growth regulation. Colonies hold no target headcount; production runs
on closed-loop satiation feedback — full reserves suppress recruitment, met needs reduce
signal, negative feedback prevents overinvestment. Mediated individually by crop load.
Folded into research doc §4.2.2 with sources. Also folded in §4.2.1, the inactive-worker
reserve research from iteration 1 that had only been noted here.

**Improved — M2 shipped: satiation-driven spawning.** `COLONY_SIZE` is gone. Replaced with
`COLONY_MIN = 2` (survival floor, always replace below it), `COLONY_MAX = 10` (safety
ceiling against runaway feedback), and `GROWTH_SURPLUS_RATIO = 0.95` (only invest in growth
while reserves are satiated). `runSpawning` now returns `'survival' | 'growth' | null` so
telemetry records *why* each creep was born. The loop is self-closing: spawning drops the
reserve below the ratio, pausing growth until foragers refill it.

**Result:** colony grew **4 → 10** while still holding 300/300 energy — the surplus was
real, and ten workers remain within carrying capacity. Division of labor is now genuinely
mixed: supply 1–4, upgrade 3–7, build 0–3, all three tasks active simultaneously.

**Next iteration should consider:**
1. **The ceiling is what's binding, not the stimulus.** At 10 creeps energy is still
   pinned at 300/300, so `COLONY_MAX` is the limiter. Either raise it and find where the
   satiation feedback *actually* levels off, or accept 10 as a CPU-driven cap and say so.
2. **`energyCapacity` is stuck at 300** — no extensions are ever built, so bodies are capped
   at the 200e minimum forever. This is the real growth ceiling. M1 deliberately excluded
   room planning and sites are placed by hand, so this needs a decision: hand-place extension
   sites, or let the colony propose them (a scoped step toward M3/M4).
3. **Give all-negative-margin creeps a genuine idle state** rather than working at a loss
   (research doc §4.2.1).

### 2026-07-30 — iteration 3

**Experiment: is satiation feedback actually self-limiting?** Raised `COLONY_MAX` 10 → 25 to
find where growth would level off on its own.

**Hypothesis FALSIFIED.** The colony grew straight to 25 and pinned there, still holding
300/300 energy. Growth is bound by the ceiling, not by the stimulus.

**Root cause:** the surplus signal is measured against a fixed 300-energy reserve, which
says nothing about whether the colony can support more workers. A full spawn reads as
"satiated" whether the colony has 4 creeps or 25, so the gate never closes. The metric does
not scale with colony size — an honest design flaw in M2, not a tuning problem.

**Second finding, more severe.** At tick 131800 the snapshot read
`creeps 24, energy 102, {supply:23, upgrade:1, build:0}` — **23 of 24 creeps on one task**
needing about two, while build and upgrade starved. The saturating supply stimulus recruits
the entire colony. Harmless at N=4; ruinous at N=25. This is exactly the missing quorum
control the design spec predicted M1 would lack (§4.3).

**Improved: congestion-based quorum control.** Each stimulus is now damped by how many
creeps already hold that task — `stimulus / (1 + occupancy × CONGESTION_FACTOR)`, factor
0.35. Occupancy is sampled from the previous tick's committed tasks *before* any creep
decides, so damping cannot depend on iteration order.

**Result (before → after):** an energy dip that previously drew 23/24 creeps now draws 7.
Labor stays spread across all three tasks under load — at energy 167: supply 7, upgrade 12,
build 6. Peak supply observed since: 12 of 25. Folded into research doc §4.3 with the
before/after numbers.

**Next iteration — the growth metric is the open problem:**
1. `GROWTH_SURPLUS_RATIO` against a fixed 300 reserve cannot regulate colony size. It needs
   a signal reflecting *marginal* return — e.g. whether reserves are still rising with the
   current population, or per-creep income over a window — so growth halts when added
   workers stop paying for themselves. Until then `COLONY_MAX` is doing the regulating and
   should be treated as a real cap, not a safety net.
2. `energyCapacity` remains 300 (no extensions), so bodies stay at the 200e minimum. This is
   the hard growth ceiling and still needs a human decision: hand-place extension sites, or
   let the colony propose them.
3. Idle state for all-negative-margin creeps (research doc §4.2.1) — still unaddressed.

### 2026-07-30 — iteration 4

**Observed.** Colony healthy and advancing: **RCL 3**, 25 creeps, zero ERROR events. But two
things were wrong, both caused by iteration 3's congestion fix:
- `sites: 0`, yet **5–12 creeps sat on `build`** — a task with no work at all.
- At energy 89 (emergency) supply drew only 12, when it should have recruited hard.

**Root cause:** damping by *raw* occupancy divided stimuli by up to ~9× at N=25, pushing
every stimulus below every threshold. With no positive margins anywhere, rule 1 ("keep
current task") applied universally and the colony froze on historical assignments rather
than responding to stimuli. Confirmed in telemetry: `upgrade` stimulus read 0.145 instead of
its true 0.5.

**Improved: congestion now applies only beyond a task's capacity** —
`stimulus / (1 + max(0, occupancy − capacity) × factor)`. Capacity is per-task and models
the real sink: `CAPACITY_SUPPLY = 3` (one spawn saturates fast), `CAPACITY_UPGRADE = 999`
(a controller absorbs everyone), `CAPACITY_BUILD_PER_SITE = 2` (no sites ⇒ zero capacity, so
the task repels workers). Arriving at an uncrowded site now costs nothing, which is how
congestion actually behaves.

**Result:** `upgrade` stimulus recovered 0.145 → 0.5. Stranded builders fell 7–9 → 2–5;
upgraders rose 8 → 14–18. Supply still tracks energy dips proportionally. The residual 2–5
on build is the inactive-reserve caste (§4.2.1), which is expected rather than a defect.

**Researched:** nest construction triggers. Population size controls nest area, not the
reverse — colonies expand as workers are born, driven by local density perception and
stigmergic cues. Folded into research doc §7.4.

**Verified against `@screeps/common/lib/constants.js` on disk:** `CONTROLLER_STRUCTURES`
allows 5 extensions at RCL 2 and **10 at RCL 3**. The colony has built **zero**.

**THE BLOCKING QUESTION for the next iteration — needs a human decision, not a technical
one.** `energyCapacity` is stuck at 300 (one spawn), so `bodyFor()` can never exceed the
200-energy minimum body. Every creep is and will remain the weakest possible worker. This is
now the binding ceiling on everything: colony throughput, RCL progress, and any future
milestone. Population has outgrown the nest exactly as §7.4 describes.

Two ways forward, and the choice is a scope decision the loop should not make unilaterally:
- **(a)** The human hand-places extension construction sites, consistent with M1's design
  where all sites are placed by hand.
- **(b)** The colony proposes its own extension sites when population outgrows capacity —
  biologically the correct model per §7.4, but it crosses M1's explicit non-goal
  ("Automated construction-site placement / room planning") and effectively starts M4.

Until one is chosen, further tuning is polishing a colony that cannot grow.

### 2026-07-30 — iteration 5 — option (b) chosen: colony sizes its own nest

The human chose **(b)**: the colony proposes its own extension sites. This deliberately
overturns M1's non-goal ("Automated construction-site placement / room planning"), on the
grounds that capacity was the binding ceiling on everything.

**Shipped: `src/spawn/nest.ts`.** Implements research doc §7.4 directly — population size
controls nest area, so `desiredExtensions = min(RCL allowance, ceil(creeps / 3))`. Placement
walks expanding rings around the spawn on a checkerboard (`(x+y) % 2 === 0`) so half the
tiles stay permanently walkable; packing extensions solid would wall the spawn in and strand
every deliverer. Proposes at most one site per 50-tick pass. Crucially it does **not** direct
labor: whether a site gets built remains an emergent outcome of the build stimulus competing
against supply and upgrade.

**It worked — and immediately caused a near-fatal regression.** Capacity grew 300 → 550, and
the colony collapsed **25 → 2 creeps** inside one generation.

**Root cause:** `GROWTH_SURPLUS_RATIO = 0.95` was a share *of capacity*. When the colony
could expand its own nest, the gate silently rose from 285 energy to 522. Fewer workers
refill more slowly, so the gate opened less often, so fewer workers were born — a textbook
death spiral, arrested only by the `COLONY_MIN` survival floor. This is precisely the flaw
logged in iteration 3 ("the surplus metric does not scale with colony size"), which stayed
harmless only while capacity was fixed.

**Fix:** replaced with `GROWTH_MIN_RESERVE = 400`, an absolute threshold. It does not move
when the nest grows, so a larger nest now means *more* headroom above the gate rather than
less. At `IDEAL_BODY_COST` the colony can afford a full-size worker and still hold a minimum
body in reserve.

**Result after the fix:** creeps 2 → **25**, extensions → **9 of 10**, energyCapacity
300 → **750**. Energy reaches full 750. Distribution stays healthy (supply 4–9, upgrade
12–18, build 0–6). Bodies can now reach the 400-energy ideal instead of being pinned at the
200 minimum forever.

**Lesson worth keeping:** every ratio-of-capacity threshold is a latent bug once capacity
becomes dynamic. Audit any remaining one.

**Next iteration candidates:**
1. **RCL 3 extension allowance is nearly exhausted (9/10).** The next capacity step needs
   RCL 4, which needs upgrade throughput — check whether upgraders are actually the
   bottleneck now that bodies can be larger.
2. **Verify bodies actually grew.** `bodyFor()` should now be returning `IDEAL_BODY` at 750
   capacity; confirm in telemetry rather than assuming.
3. **Idle state for all-negative-margin creeps** (research doc §4.2.1) — still unaddressed.
4. **M3 pheromone routing** — the next milestone proper, still untouched.

### 2026-07-30 — iteration 5b: telemetry volume

The human flagged SigNoz flooding. Measured rather than guessed: **task-switch was 1502 of
1592 records (94%)** over 5 minutes, and screeps was the 2nd-noisiest service on the shared
instance at 318 records/min (behind hermes at 598).

Cause: exploration. At ~50 ticks/sec with 25 creeps and a 2% per-creep-per-tick exploration
roll, that is ~25 switches/sec, nearly all of it uninformative noise.

**Fix:** switch counts are now aggregated by reason into the periodic snapshot
(`"switches":{"explore":1}`), and per-switch events were demoted to `DEBUG`, which is off by
default. The signal — how much churn and why — is preserved; only the per-event spam is gone.

**Result:** 318 → **64 records/min**, 4th on the instance. No signal lost.

Note: `spawn` events are now the largest remaining share (~40/min). That is legitimate at
this tick speed — creeps live 1500 ticks ≈ 30 real seconds, so the colony genuinely turns
over ~25 creeps every 30s. If volume needs cutting further, fold spawn counts into the
snapshot the same way.

**General lesson:** any per-creep, per-tick event is unshippable at 50 ticks/sec. Aggregate
into the periodic snapshot by default; keep per-event detail behind DEBUG.

### 2026-07-30 — iteration 6 — roads from traffic (M3 first half)

**Prompted by the human's observation:** builders idle when no construction sites exist. True
and structural — `build` stimulus is `siteCount / BUILD_SATURATION_SITES`, so zero sites means
zero pull, and builders sat doing nothing.

**Researched:** *Atta* trunk trails. The biology is literal — leafcutters physically clear
trails through undergrowth, move faster on them, and recoup the clearing cost within days.
Decisively, it is "infrastructure construction without information exchange": no ant plans
the network; each clears obstacles on paths it uses, and the network is the residue. Folded
into research doc §5.4 with sources.

**Shipped: `src/pheromone.ts`** — trail pheromone with roads as its permanent form (§11.3).
Creeps deposit on the tile they occupy each tick; the map evaporates every 100 ticks
(`TRAFFIC_DECAY = 0.85`) and prunes cold tiles; tiles above `ROAD_TRAFFIC_THRESHOLD = 60` get
a road site, capped at 4 outstanding so builders are not swamped. No route is planned
anywhere in the code.

**Result:** **105 roads built**, hottest tiles reading 419–488 accumulated traffic. Builders
now have permanent self-generated work, and it compounds — every road makes future traffic
cheaper. Memory holding the sparse map: 22.7 KB across 265 tracked tiles, well within budget.

**New artifact to fix next — a one-tick stampede.** At tick 222800 the snapshot read
`{"supply":0,"upgrade":1,"build":24}`: 24 of 25 creeps piled onto build simultaneously, then
dispersed the following tick. Cause is the one-tick lag in congestion damping — occupancy is
sampled from the *previous* tick (deliberately, so damping cannot depend on iteration order),
so when new sites appear the damped stimulus is still computed against near-zero occupancy.
Every creep sees an undamped 1.0 and commits at once; damping only bites the tick after.
It self-corrects and was harmless here (supply stimulus was low), but it abandons supply and
upgrade for a tick, which could starve the colony if it coincided with an energy trough.

Likely fix: damp against the *anticipated* occupancy — count commitments as they are made
within the tick, while still evaluating every creep against the same snapshot — or cap how
many creeps may switch to one task per tick.

**Still open:** bodies-actually-grew verification; idle state for all-negative-margin creeps
(§4.2.1); pheromone-weighted *pathfinding* (the other half of M3 — roads exist now, but
movement does not yet prefer high-pheromone routes).

### 2026-07-30 — iteration 7 — recruitment rate limit

**Observed.** The stampede logged in iteration 6 was not a one-off. Six occurrences found,
and the `switches` counts revealed the mechanism — mass simultaneous `abandon`:
`supply 23/24` with 18 abandons (tick 222500), `supply 20/24` with 23 abandons (222200),
`supply 23/23` with 22 abandons (220400), `build 24/25` (222800). The colony was oscillating
between monocultures rather than holding a division of labor.

Colony otherwise thriving: **RCL 4**, 139 roads, capacity 750, memory 20.7 KB, zero ERRORs.

**Root cause.** Congestion damping structurally cannot prevent this. Occupancy is sampled
from the *previous* tick (deliberately, so damping cannot depend on iteration order), so when
a stimulus saturates, every creep evaluates against a near-empty task and commits in the same
tick. Damping only bites the tick *after* the stampede has already happened.

**Researched:** recruitment kinetics. Honest result — a search for quantitative time-course
measurements did not surface usable numbers. What it did establish qualitatively is that
workers *accelerate a transition* toward a task rather than switching instantly, and that
switching is age/state dependent. Reallocation is a rate. Folded into research doc §4.2 with
that caveat stated explicitly, since the rate limit's value is tuned from observed behavior
rather than derived from a published figure.

**Improved: `RECRUIT_LIMIT_PER_TICK = 2`.** At most two creeps may *join* any one task per
tick; refused creeps keep their current task and may switch later. This is a distinct
mechanism from congestion damping and both are needed — congestion answers "is this task
crowded?", the rate limit answers "how fast can labor physically move?". A `deferred` counter
now rides on the snapshot to show how hard the colony is straining against the limit.

**Result:** stampedes **6 → 0**. Distribution stable and mixed (supply 2–6, upgrade 15–20,
build 1–5). `deferred` reads 3 during a surge and 0 otherwise, confirming the limit binds only
when it should rather than throttling normal operation.

**Next iteration candidates:**
1. **Nest growth is now circularly capped.** `desiredExtensions = min(RCL allowance,
   ceil(creeps / 3))`. RCL 4 permits 20 extensions, but with `COLONY_MAX = 25` the colony only
   ever wants 9 — and capacity caps body size, which caps throughput. Population gates the
   nest while `COLONY_MAX` gates population. Worth deciding whether `COLONY_MAX` should scale
   with capacity, or be removed now that the growth gate is absolute rather than ratio-based.
2. **Pheromone-weighted pathfinding** — the other half of M3. Roads exist, but movement does
   not yet prefer high-traffic routes; creeps still take default paths.
3. **Idle state for all-negative-margin creeps** (§4.2.1) — still unaddressed.

### 2026-07-30 — iteration 8 — expansion readiness (answering "how about expansion?")

**Expansion is not a missing feature — it is gated, and the gate is arithmetic.**
Verified against `@screeps/common/lib/constants.js` on disk (`GCL_POW = 2.4`,
`GCL_MULTIPLY = 1000000`):

- GCL progress 509,431 → **GCL level 1**, so exactly one room is claimable and we already
  hold it (W5N8).
- GCL 2 needs 1,000,000 points. We were **50.9%** there, 490,569 short.
- GCL comes *only* from upgrading the controller. Therefore **expansion speed is upgrade
  throughput**, nothing else.

**Two caps I had written were throttling exactly that.**
1. `bodyFor` returned a fixed `IDEAL_BODY` (400 energy, 2 WORK) and never grew. At 750
   capacity it was spawning the identical creep it spawned at 400 — every point above 400
   wasted. Since `UPGRADE_CONTROLLER_POWER` is per WORK part, this capped throughput directly.
2. `desiredExtensions = ceil(creeps / 3)` = 9, while RCL 4 permits **20**. Capacity capped
   body size, body size capped throughput, and `COLONY_MAX` capped population which capped the
   nest — a closed loop with no exit.

**Improved (both, since they are one problem):**
- Bodies now scale: repeat the `[WORK, CARRY, MOVE]` unit (200e, 1:1 MOVE so the creep stays
  full-speed off-road) up to `MAX_BODY_UNITS = 16` (`MAX_CREEP_SIZE` is 50 parts).
- Nest also grows when reserves are satiated, not only on population pressure. A ratio is the
  correct shape *here* even though it was wrong for the spawn gate: each extension added makes
  satiation harder, so nest growth decelerates as the nest fills — genuine negative feedback
  rather than the runaway the spawn gate suffered.

**Result:** creep part counts now 6 / 9 / 12 (was uniformly 6); total WORK across the colony
**50 → 74 (+48%)**; extensions 9 → 13; capacity 750 → 950; GCL 50.9% → 55.7%.

**Research note, stated honestly:** this iteration's investigation was Screeps mechanics
verified on disk (GCL formula, `MAX_CREEP_SIZE`, `UPGRADE_CONTROLLER_POWER`, `BODYPART_COST`,
`CONTROLLER_STRUCTURES`) rather than a biology search, because the blocker was mechanical, not
behavioural. No WebSearch was performed.

**When GCL 2 arrives, M4 budding is implementable** and the design doc already specifies it
(§1.3): claim + pre-built spawn + escrowed energy, which drops founder mortality from >99% to
10–30% versus dumping a lone claimer into an empty room. Concrete prerequisites, all now met
or in reach:
- A CLAIM creep costs 600 (`BODYPART_COST.claim`) + 50 MOVE = **650**; capacity is 950, so it
  is already affordable.
- `CREEP_CLAIM_LIFE_TIME` is 600 ticks, so the target must be within reach of that.
- 120 unowned rooms exist on this server, so target selection is unconstrained.

**Next iteration candidates:**
1. Let capacity keep climbing to the RCL 4 ceiling (20 extensions / 1300) and confirm bodies
   scale with it; consider whether `COLONY_MAX = 25` should rise now that the growth gate is
   absolute rather than ratio-based.
2. **Room scouting / evaluation** — the genuinely useful pre-expansion step, and safe to build
   before GCL 2: score neighbouring rooms on sources, controller, terrain, and threat so a
   target is already chosen when the gate opens.
3. Pheromone-weighted pathfinding (other half of M3); idle state for all-negative-margin
   creeps (§4.2.1).

### 2026-07-30 — iteration 9 — HUD, heredity, and the claim/reserve answer

**1. Colony HUD (`src/hud.ts`).** Per-creep labels answered "what is this creep doing"; the
panel answers "how is the colony doing". Shows RCL and GCL progress bars, energy, population
vs `COLONY_MAX`, total WORK parts, per-task counts with live stimuli, nest (extensions /
roads / sites), evolution generation and best fitness, and recruitment-deferred pressure when
non-zero. All read from live game state rather than recomputed, so it cannot drift from what
the colony believes.

**2. Heredity — "a dying ant births a better ant" (`src/evolution.ts`).** Previously every
creep drew a fresh random profile, so nothing accumulated across generations; the colony
re-rolled the same lottery forever. Now:
- **Fitness** = fraction of a creep's lifetime spent doing useful work. Measured, not assumed
  — each task reports whether its action actually succeeded, and a builder with no site to
  work is explicitly scored as idle.
- **Selection** = fitness-weighted draw from a bounded pool of the 20 fittest retired
  profiles. The retirement happens in `pruneCreepMemory`, the only moment the information
  still exists.
- **Mutation** = jitter per threshold so the pool keeps exploring.
- **Minimum boundaries** (the constraint the human specifically asked for): thresholds clamp
  to [0.1, 0.9]. Without a floor, selection drives every threshold to 0, because a creep that
  always works scores perfectly — and a colony of those stampedes every task at once, which is
  exactly what the recruitment limiter exists to prevent. Without a ceiling, profiles drift so
  high the creep never works. The bounds keep enough spread for the inactive-reserve caste
  (§4.2.1) to survive selection rather than being optimised away.

**Observed after ~90s: generation 44, pool full at 20, best fitness 1.0.** Selection is
already structured — the fittest genes cluster at *low* upgrade thresholds (0.26–0.48) and
*high* supply thresholds (0.46–0.70).

**PROBLEM WORTH FIXING NEXT — the fitness proxy is misaligned.** It rewards task
*availability*, not task *value*. `upgrade` always has work (constant 0.5 stimulus), so a
creep that always upgrades scores 1.0 regardless of whether the colony was starving for
supply at the time. `supply` and `build` have intermittent work, so genes preferring them
idle more and score worse — and get bred out. Left alone this erodes the division of labor
toward a monoculture of upgraders, undone only by the threshold bounds and the congestion /
recruitment limiters. A value-aware fitness would weight productive ticks by the stimulus
intensity at the moment the work was done, so scarce-but-critical work outscores abundant
busywork.

**3. Claim vs reserve — different gates, and this matters.** Verified on disk:
- **Claiming** needs a free GCL slot. GCL is level 1 and the one slot is used by W5N8, so
  claiming is impossible until GCL 2 (was 50.9%, now ~56%).
- **Reserving needs no GCL at all** — only a CLAIM part. `CONTROLLER_RESERVE = 1` tick per
  CLAIM part per tick, `CONTROLLER_RESERVE_MAX = 5000`. A claimer costs 650 (`BODYPART_COST.claim`
  = 600 + 50 MOVE) against 950 capacity, so it is already affordable, and
  `CREEP_CLAIM_LIFE_TIME` is 600 ticks.

So **reservation is available right now and claiming is not.** Reserving a neighbour also
unlocks remote mining, which raises income, which raises upgrade throughput, which is the only
thing that opens the claim gate — it is the correct next move on its own merits rather than a
consolation prize. It needs room scouting first (score neighbours on sources, controller,
terrain, threat), which is safe to build before the gate opens.

**Next iteration candidates:**
1. Value-aware fitness (weight productive ticks by stimulus intensity) — fixes the
   monoculture pressure described above.
2. Room scouting + reservation — available now, and accelerates the claim gate.
3. Pheromone-weighted pathfinding (other half of M3).

### 2026-07-30 — iteration 10 — value-weighted fitness

**Fixed the flaw shipped in iteration 9.** The fitness function scored the *fraction of life
spent working*, which rewarded task availability rather than task value. `upgrade` always has
work (constant 0.5 stimulus), so always-upgraders scored a perfect 1.0 regardless of whether
the colony was starving for supply at the time, while `supply` and `build` genes idled during
quiet periods and were bred out. The pool was converging on a monoculture.

**Fitness is now value delivered per tick of life.** Each unit of work is weighted by the
colony's raw need for that task at the moment it happened, so hauling during an energy crisis
outscores upgrading a controller that was never starved. Idle ticks still contribute nothing,
which is what punishes a builder standing around with no site.

The weight is the **undamped** stimulus, deliberately. Congestion damping describes how
crowded a task is, not how much the work mattered — a creep should not be penalised for
helping with something genuinely urgent just because others helped too.

**Gene pools are versioned now (`FITNESS_VERSION`), and this was essential rather than
tidiness.** Scores are only comparable within one fitness definition: the old scale routinely
hit 1.0 while the new one tops out near the mean stimulus. Carrying the old genes across would
have let obsolete high scores outrank every honestly scored newcomer permanently, and the fix
would have silently never taken effect. On a version change the pool is discarded and
re-earned.

**Result after ~100s (229 generations, pool refilled):**
- Best fitness **1.000 → 0.525** — the new ceiling is honest; ~0.52 is roughly the mean
  stimulus a creep can capture, where the old function was trivially saturable.
- Fittest genes' upgrade thresholds **0.26–0.48 → 0.41–0.53**, and supply/build now sit in a
  comparable band. Selection produces balanced profiles instead of upgrade specialists.
- Colony健康 throughout: capacity reached **1350** (from 300 at the start of the session),
  distribution supply 3–5 / upgrade 18–22 / build 0–2.

Note the remaining upgrade-heaviness is now *correct* rather than an artifact: upgrade
stimulus is a constant 0.5 while supply sits at 0 whenever reserves are full, and GCL — the
sole gate on claiming — comes only from upgrading. The colony is weighting toward the thing it
actually needs.

**Next iteration candidates:** room scouting + reservation (available now, no GCL needed, and
it accelerates the claim gate); pheromone-weighted pathfinding (other half of M3); idle state
for all-negative-margin creeps (§4.2.1).

### Note on iteration speed and subagents (2026-07-30)

Asked whether subagents would speed the loop up. They would not, and would likely harm it.

**Where the time goes:** ~60–70% of an iteration is waiting for game ticks so the colony can
react to a change. Editing, type-checking and deploying take ~15s combined. Parallel agents
cannot compress a physical wait — they would wait in parallel.

**Why parallel changes are actively wrong here.** There is exactly one `main.js`, so
concurrent deploys clobber each other. More importantly the loop is an *experiment*: change
one thing, wait, measure. Two changes shipped together makes attribution impossible — and
attribution is what caught the congestion-damping freeze, the capacity-ratio death spiral,
and the availability-biased fitness function. All three were only visible because exactly one
variable moved.

**Where a subagent does help:** research (WebSearch) and bulk telemetry analysis — read-only
work that cannot conflict with a deploy and keeps large query dumps out of the main context.
Worth using opportunistically, not by default.

**Cheaper real speedups:** write the docs/commit while the colony is reacting rather than
after, and shorten the observation window — at ~20ms/tick, 60s is already ~3000 ticks, two
full creep generations, which is enough to judge most changes.

### 2026-07-30 — iteration 11 — synchronized cohort death

**Caught by the regime monitor:** colony fell **24 → 2 creeps in ~400 ticks**, then rebuilt,
repeatedly. `upgrade` sat at **0** through each trough, burning exactly the GCL progress that
gates expansion.

**First hypothesis was wrong, and checking mattered.** I expected the iteration-8 body scaling
to have produced oversized creeps draining the economy. It had not — bodies were 6 parts
(400 energy), nowhere near the 1200 I feared, because `bodyFor` reads *available* energy at
spawn time and availability stays low while population is low. Had I "fixed" body scaling I
would have removed a working feature and left the real fault untouched.

**Actual cause: the population is one age-cohort.** Creeps live 1500 ticks. After each crash
the colony rebuilt as fast as energy allowed, so the entire population shared a birth window
and therefore a death window — and the rebuild recreated the cohort, making the oscillation
self-perpetuating. The creep names show it plainly: 16 of them spawned inside a single
900-tick window.

**Fix: `SPAWN_STAGGER_TICKS = 60` on growth spawns.** `CREEP_LIFE_TIME / COLONY_MAX` =
1500 / 25 = 60 spreads births evenly across one lifetime, which is what a steady-state age
distribution requires. Survival spawning below `COLONY_MIN` is deliberately exempt — a colony
near death must replace immediately, and real colonies likewise do not ration brood while
facing collapse.

**Also fixed a monitoring defect that hid this.** The regime monitor's bands tested
`creeps < 2` for CRITICAL, so a 25 → 2 collapse was reported as *HEALTHY*. Rebanded to
DEAD / COLLAPSE (≤5) / RECOVERING (<12) / HEALTHY. Worth noting as a class of bug: an alerting
threshold that never fires is indistinguishable from a system that never fails.

**Next iteration:** confirm the oscillation is gone — population should hold near
`COLONY_MAX` with deaths spread out rather than sawtoothing — then resume the open candidates
(room scouting + reservation; pheromone-weighted pathfinding; idle state for
all-negative-margin creeps).

### 2026-07-30 — iteration 12 — remote foraging (polydomy, first half)

**Prompted by the human:** "single room too crowded". Confirmed, and far worse than
suspected. Verified against constants on disk (`SOURCE_ENERGY_CAPACITY = 3000`,
`ENERGY_REGEN_TIME = 300`, `HARVEST_POWER = 2`): one source sustains 10 energy/tick and
exactly **5 WORK parts**. W5N8 has 2 sources → a hard ceiling of **20 energy/tick and 10
useful WORK parts however large the colony grows**. It was fielding **74 WORK parts —
7.4× oversubscribed**, with ~64 contributing nothing. This is the mechanical cause of the
slow controller progress and the population oscillation.

**Researched:** polydomy. A colony cannot outgrow its central place; the biological answer is
a central nest plus subnests spread across the foraging territory, adopted specifically to
raise food encounter and exploitation rates. Notably colony size does *not* predict foraging
distance — colonies reorganise spatially rather than simply ranging further, so growth past
carrying capacity is a structural change rather than a scaling one. Folded into research doc
§7.1.1 with the measured numbers.

**Shipped: `remote` as a fourth task** (`src/creep/tasks/remote.ts`), deliberately a task and
not a dedicated role, so remote foraging competes for labor through the same threshold
mechanism as everything else — no central allocation. Its stimulus is home-room
oversubscription: `(workParts − sources × WORK_PER_SOURCE) / (sources × WORK_PER_SOURCE)`,
so remote becomes attractive exactly when extra WORK at home would be idle. Creeps record
what they see (`Memory.remotes`), prefer the best room actually observed, and explore
unvisited neighbours otherwise.

**Gene pool preserved rather than reset — the human's call, and it was the right one.**
Adding a task widens the profile but does not change what fitness *means*, so scores stay
comparable and discarding would have thrown away every generation of selection for nothing.
The new axis is seeded per gene from its own `supply` threshold plus jitter: remote foraging
is a gathering task, so a gene eager to supply is plausibly eager to fetch energy abroad, and
the jitter gives the axis immediate diversity for selection to act on.

`ensureProfile` needed the same treatment and would otherwise have silently undone the whole
thing — it validated that a profile contained *every* task key, so on the first tick after
deploy every living creep's inherited profile would have been judged corrupt and regenerated
at random. It now patches missing keys instead of discarding.

**Result:** gene pool intact at **generation 950** (not reset), `remote` thresholds spread
0.49–0.79 across the pool, fitness risen **0.525 → 0.68** as remote work began contributing
value. Creeps have crossed into **three adjacent rooms** (W5N7, W6N8, W5N9) with 15 on the
remote task. Six unowned adjacent sources are now reachable, no Source Keeper lairs.

**Next iteration:**
1. **Verify remote foraging actually pays.** Watch whether home `energyAvailable` and
   controller progress rise now that income is not capped at 20/tick. Travel is overhead —
   confirm the round trip is worth it rather than assuming.
2. **Reservation doubles it.** Neutral sources hold 1500 vs a reserved room's 3000, so
   reserving takes remote sources from 5 to 10 energy/tick each. Needs no GCL, only a CLAIM
   part (650 energy against 1800 capacity).
3. Pheromone-weighted pathfinding; idle state for all-negative-margin creeps.

### 2026-07-30 — iteration 13 — remote foraging FAILED and is disabled

The human reported foragers "circling back and forth at the door". Confirmed: 11 of 25 creeps
sat on room-edge tiles with zero carry.

**Two causes, one real and one self-inflicted.**

*Real:* `moveTo(RoomPosition(25,25,target), {range: 20})` let a creep stop while still
standing on an exit tile. The engine teleports creeps off exit tiles into the adjacent room,
so an "arrived" creep bounces across the border indefinitely.

*Self-inflicted:* I then added trip commitment — `away from home OR carrying` — on the theory
that central-place foraging is a committed round trip. A forager is in one of those states
almost its whole life, so commitment became permanent. Creeps could not re-evaluate even when
remote stimulus fell to zero, which bypassed congestion damping and the recruitment limiter
entirely. **The whole colony locked onto remote, nobody supplied the spawn, population
collapsed 25 → 2.**

Narrowing commitment to carrying-only recovered the population but did not fix foraging:
every forager remained stuck in `gathering` phase with a partial load (8/100, 16/50, 77/100,
84/100) and all seven were still on exit tiles. `updatePhase` only flips gathering→delivering
on a *full* store, so a forager that never fills never goes home.

**Decision: disabled behind `REMOTE_ENABLED = false` rather than patched further.** Two
consecutive changes of mine collapsed a colony that had been healthy at 25 creeps, RCL 5,
GCL 73%. Continuing to guess against a live colony was the wrong move; restoring stability
first is the right one. Colony recovered immediately — **22–23 creeps, energy up to 1050,
distribution supply 9 / upgrade 11 / build 2**.

This is a switch, not a revert: the code and the `remote` threshold axis stay, so the gene
pool keeps its shape and nothing is lost.

**What a correct implementation needs, derived from the observed failures:**
1. Movement that never leaves a creep resting on an exit tile — probably explicit
   `findExitTo` pathing plus a forced inward step after crossing, rather than trusting
   `moveTo` to a room centre.
2. A phase flip on "enough to be worth the trip", not only on a full store. Foragers stranded
   at 77/100 forever is a direct consequence of reusing `updatePhase`, which was written for
   in-room tasks where topping up is cheap.
3. Commitment scoped to a single leg (outbound, or inbound) and time-bounded, never
   open-ended.
4. Ideally validated against a *small* number of foragers first — the failure was amplified
   because remote stimulus went to 1.0 and pulled a large share of the colony at once.

**Also changed, per the human:** gene-pool seeding for a new task axis is now uniform random
across the legal range rather than derived from the `supply` threshold. Deriving it encoded my
assumption about which existing task the new one resembles, as a prior the colony could never
argue with. Spreading the seed asserts nothing and lets selection discover the value, which is
the point of having selection at all.

### 2026-07-30 — iteration 14 — remote foraging failed a second time; STOP hand-rolling movement

Rebuilt remote foraging "carefully" against the three known failure modes. It failed again,
and the colony degraded again (25 → 5 creeps, `upgrade` at 0). Disabled a second time;
recovered immediately to 24–25.

**The human's instruction to research first was correct and I should have followed it before
writing any of this.** Two documented causes, neither of which I would have derived:

1. [screepspl.us wiki — Exit tiles](https://wiki.screepspl.us/index.php/Exit_tiles): a creep
   *transported* into a room lands on an exit tile, and if it does not move off during that
   same tick it is transported straight back. The blink is an arrival-side problem.
2. [Screeps forum — Pathing ignores walls on room edge](https://screeps.com/forum/topic/184/pathing-ignores-walls-on-room-edge):
   pathfinding **ignores walls on room borders**, so paths route along and terminate on them.
   Documented fix is a CostMatrix marking border tiles 255.

**And then I introduced a worse bug than either.** My `stepOffEdge` guard was unconditional,
so it shoved creeps back inward *every time they approached the border* — including when they
were trying to leave. To exit a room a creep must step onto an exit tile. No forager ever
crossed; `Memory.remotes` recorded only the home room through every attempt, which was the
tell I kept failing to read. Making the guard arrival-only did get creeps into neighbouring
rooms, but by then the colony was collapsing and no round trip ever completed.

**Conclusion: hand-rolling multi-room movement is the wrong approach and I should stop.**
Six attempts, two colony collapses, and the failure mode changed each time. This is a solved
problem in the Screeps community — `Traveler` (bonzAI) is the canonical movement library and
handles exit tiles, cross-room routing, path-cache invalidation and stuck detection. Overmind's
own `Movement`/`Pathing` classes derive from it. Notably the vendored Overmind we deleted
contained a working implementation of exactly this.

**Recommended next step is a decision for the human, not another attempt:**
- (a) Integrate Traveler (or port Overmind's `Pathing`) as the movement layer, then rebuild
  remote foraging on top of a movement primitive that is known to work.
- (b) Leave remote foraging out. The colony is healthy without it and **GCL 2 has now been
  reached (112.9%)**, so claiming a second room — which does not depend on cross-room creep
  movement in the same way — is available and may be the better use of effort.

**Unrelated good news observed during this:** GCL crossed 100% and sits at **112.9%**, so the
claim gate that gated M4 is now open.

**State:** remote disabled behind the flag, code and threshold axis retained, colony healthy
at 24–25 creeps, RCL 5, capacity 1800.

### 2026-07-30 — iteration 15 — remote foraging WORKS; the bug was never movement

The human suggested reading the archived Overmind fork (`archive/overmind-fork`, the tag made
before deleting it). That was the turning point, in two ways.

**What Overmind's `Movement`/`Pathing` showed.** Three separate pieces, each of which I had
either missed or mis-scoped:
1. `MatrixLib.blockExits` — block border tiles in cost matrices for in-room pathing, because
   Screeps pathfinding ignores walls on room borders and will route along and terminate on them.
2. `moveOffExit` — a *single step* to the best adjacent non-edge walkable tile, weighted
   against swamp and toward the goal. Not a path to the room centre, which can be blocked or
   fail; the creep must clear the border on that exact tick.
3. It is called ONLY inside `goTo`'s `rangeToDestination <= opts.range` branch — arrival only.
   Applying it whenever a creep neared a border, as I had, makes leaving a room impossible,
   since exiting requires stepping onto an exit tile.

**But the actual bug was in `main.ts`, and had nothing to do with movement.** The loop iterated
`room.find(FIND_MY_CREEPS)` for owned rooms only, so **a creep that walked into a neighbouring
room stopped being processed entirely** — no orders, no task, no `noteRoom`. It drifted onto an
exit tile and the engine bounced it back and forth. Every "movement bug" across six attempts
was a symptom of foragers simply not being run.

The tell was visible the whole time and I misread it repeatedly: `Memory.remotes` recorded only
the home room even while creeps were physically standing in three neighbours. `noteRoom` is the
first statement in the remote task — if it never fired for those creeps, the task was never
executing for them. Fixed by selecting creeps by their **home** room rather than their current
one.

**Results, against the metrics that failed six times running:**
| metric | before | after |
|---|---|---|
| rooms recorded | W5N8 only | **all 5** (W5N8, W6N8, W4N8, W5N9, W5N7) |
| foragers delivering | 0 | **7** |
| creeps stuck on exit tiles | 16 of 25 | **0 of 25** |

**Follow-up fix in the same iteration.** With foraging working, remote monopolised labor —
14 of 17 creeps with `upgrade` at 0, stopping GCL progress. Cause was outbound commitment
overriding congestion damping. Outbound commitment only ever existed to compensate for the
main-loop bug, so removing it restored balance: **supply 4–6 / upgrade 2–9 / build 1–11 /
remote 3–6**, with remote sitting near its capacity of 6 exactly as designed. Commitment now
covers only the homeward leg with a load, which is the one case where abandoning genuinely
wastes work.

**Lesson worth keeping.** Six attempts fixed the symptom because I never questioned whether the
code was running at all. When a subsystem misbehaves in a way that looks impossible, check that
it executes before debugging its logic — `Memory.remotes` was a direct assertion that it did
not, and I explained it away every time.

**Also:** GCL is now **116%** — past the claim gate. Claiming a second room is available.

### 2026-07-30 — iteration 16 — reservation (remote income doubled)

**Observed.** Boom-bust is **fixed**: population held 14–24 (avg 18.5 across 79 samples), no
sawtooth, zero ERRORs. All four tasks staffed simultaneously (supply 3–8, upgrade 3–10,
build 1–12, remote 3–10). Energy now cycles 184–905 of 1800 rather than sitting pinned at
capacity, meaning the colony consumes what it earns instead of wasting surplus.

No defect to fix, so: next milestone. Capacity is maxed for RCL 5 (30 extensions → 1800), and
the highest-ratio available move was reservation rather than new territory.

**Verified on disk** (`@screeps/common/lib/constants.js`): `SOURCE_ENERGY_NEUTRAL_CAPACITY`
1500 vs `SOURCE_ENERGY_CAPACITY` 3000, so an unreserved remote source sustains 5 energy/tick
and a reserved one 10 — **reservation doubles the return on foraging already happening**.
`CONTROLLER_RESERVE` 1 tick per CLAIM part per tick, `CONTROLLER_RESERVE_MAX` 5000,
`CREEP_CLAIM_LIFE_TIME` 600, `BODYPART_COST.claim` 600. One `[CLAIM, MOVE]` reserver costs 650
against 1800 capacity and roughly sustains a reservation if replaced promptly. Needs **no GCL**.

**Shipped: the reserver caste.** This is the design's one deliberate exception to
"no fixed castes", and it is worth stating plainly: a `[CLAIM, MOVE]` body has no WORK and no
CARRY, so it *physically cannot* harvest, build or upgrade whatever its thresholds say.
Behaviour follows morphology, so the colony must decide to build one rather than let one
emerge from stimulus — and reservers are dispatched by body, bypassing the threshold system.

Researched and folded into research doc §4.2: this is faithful rather than a compromise. The
textbook claim is that allocation is not caste-fixed "*in most species*" — but many ants do
have morphological castes (*Atta* majors and minors, soldier castes), where bodies make some
work impossible and the colony produces them deliberately in the proportions it needs. Every
creep that physically *can* do general work still chooses its own task from thresholds.

**Result:** a reserver spawned, travelled to W6N8, and holds the controller —
`RESERVED by user 28f62b5ff0c690b`. W6N8's two sources now regenerate 3000 instead of 1500.
`RESERVE_MAX = 2`, so a second reserver will take W5N9 (also 2 sources) as energy allows,
which would put 4 of the 6 remote sources at double yield.

**Next iteration candidates:**
1. **Confirm the income actually doubled.** Reservation is theory until observed — watch
   whether energy throughput and RCL progress rise now that W6N8 yields 10/tick per source.
2. **Claim a second room.** GCL is **116%**, so the gate is open. A second room brings its own
   sources, controller and eventually spawn — structurally larger than reservation, and the
   remote-foraging plumbing now works, which was the blocker.
3. Pheromone-weighted pathfinding; idle state for all-negative-margin creeps.

### 2026-07-30 — iteration 17 — reserve all four neighbours

**Observed.** Both fixes from the previous turn confirmed: population stable **14–23**
(avg 19.5 across 64 samples), average energy **300 → 780** with peaks at 1503, `upgrade`
recovered from 0–2 to **3–6**, zero ERRORs. Most telling, **`remote` is now the dominant
task at 7–14 creeps** — foraging finally outweighs home work, which is correct when home
sources sustain only 10 WORK parts.

Reservation is self-sustaining: 2 reservers alive, W5N9 held, a replacement en route to W6N8
after the first lapsed. Reservers live 600 ticks and add 1 reservation tick each per tick, so
they roughly break even and must be replaced continuously — working as designed, if narrowly.

**Researched: reserve versus claim economics**, verified on disk. This settles the "should we
claim now that the gate is open" question with numbers rather than instinct:

| | reserve | claim |
|---|---|---|
| source yield | 10 energy/tick each | identical |
| cost | 650-energy creep, ~1.1/tick amortised | **15000-energy spawn**, built remotely |
| obligation | none, lapses harmlessly | controller downgrades in 20000 ticks unless upgraded |
| GCL needed | no | yes |

Reservation buys the entire energy benefit for ~1/700th of the capital cost. Claiming buys the
same energy *plus* a second controller for GCL and eventual independence — a different
investment, not a larger version of the same one. Folded into research doc §2.1 alongside the
biology: colonies mark far more territory than they occupy, because marking costs patrol
effort while occupation costs a nest. **Mark wide, build narrow.**

**Improved: `RESERVE_MAX` 2 → 4.** The colony forages all four neighbours but reserved only
two, so half its remote sources ran at the neutral 1500 cap. Reserving the rest is about
**+20 energy/tick** for two more reservers costing ~2.2/tick between them — by far the best
ratio available, and much cheaper than claiming.

**Next iteration:**
1. Confirm all four reservations actually establish and hold, and that total income rises.
   Reservers lapse if not replaced promptly, so watch for gaps.
2. **Claiming remains the largest milestone** and the gate is open — but it is an
   independence play, not an income one. Worth doing when the goal is a second nest rather
   than more energy.
3. Pheromone-weighted pathfinding; idle state for all-negative-margin creeps.

**Verified same iteration:** 3 of 4 neighbours reserved (W6N8, W5N9, W5N7), 4 reservers alive,
the fourth en route to W4N8. Population 18.7 avg, energy avg 543.

Worth recording — reservations sit permanently at "1–2 ticks remaining". That is the steady
state, not a fault: `CONTROLLER_RESERVE` adds 1 tick per CLAIM part per tick while reservation
decays 1/tick, so a single-CLAIM reserver **exactly breaks even**. It holds the reservation
while standing there but accumulates no buffer, so the room drops to unreserved the moment
that creep dies and stays so until a replacement walks over. A `[CLAIM, CLAIM, MOVE]` body
(1250 energy) would add 2/tick and build a cushion that survives the gap — a candidate for a
later iteration, deliberately not bundled here.

Energy average dipped 780 → 543 as four reservers were paid for (650 each, ~4.3 energy/tick
amortised across all four) against a projected +20/tick gain. Net positive but worth
confirming over a longer window before treating the payoff as established.

### 2026-07-30 — iteration 17b — reservers were starving the workforce

**Caught by the regime monitor within minutes of the RESERVE_MAX 2 → 4 change:** colony
collapsed to 5 creeps. Cause was entirely in the spawn logic I had written, two bugs
compounding:

1. **Reservers spawned ahead of workers.** The reserver branch sat before the worker path and
   returned early, gated only on `energy.available >= 650`. It also bypassed
   `SPAWN_STAGGER_TICKS`. With four rooms to hold and a 600-tick reserver lifetime, some room
   almost always wanted one — so the spawn produced reservers more or less continuously
   instead of workers.
2. **Reservers counted as population.** `alive` came from `room.find(FIND_MY_CREEPS)`, which
   includes reservers. A `[CLAIM, MOVE]` creep cannot harvest, haul, build or upgrade, so the
   growth gate believed the colony was at full strength while its actual workforce starved.

**Fix:** count workers only (excluding the reserver caste), and gate reserver spawning behind
`RESERVE_WORKFORCE_FRACTION = 0.6` of `COLONY_MAX`. A reservation is worthless if there is
nobody left to forage the room it protects.

**Result:** recovered to **27 creeps — 24 workers, 3 reservers** — with two rooms still held.
Population 11–25 (avg 18.4).

**Pattern worth naming, since this is now the fourth instance.** Every collapse this session
came from the same shape of error: a quantity that looked safe in isolation but was measured
against the wrong denominator.
- growth gate: share of *capacity* rather than an absolute reserve
- body size: *available* energy rather than sustainable income
- road threshold: an *absolute* traffic count rather than a share of current traffic
- reserver spawning: *all bodies* rather than working bodies

Each was fine until the denominator moved. The check to apply before shipping any threshold:
**what happens to this when the thing it is measured against changes?**

**Next iteration:** reservations still only hold 2 of 4 rooms and sit at break-even (1 CLAIM
part adds 1/tick against 1/tick decay), so a room drops the moment its reserver dies. A
`[CLAIM, CLAIM, MOVE]` body would build a buffer. Also unverified: whether reservation has
actually raised sustained income — average energy is 477 here versus 543-780 earlier, though
that is confounded by the collapse and recovery.

### 2026-07-30 — iteration 18 — measuring output, not buffer level

**Methodological correction, and it invalidates how I judged the last two iterations.**
I had been treating `energyAvailable` as an income signal. It is not — it is a *buffer level*.
A colony that spends everything it earns keeps it low no matter how much comes in, so the flat
377–609 trend across 20 minutes proved nothing in either direction.

GCL rises **only** from upgrading, so its rate is a genuine output measure. Measured over 1632
ticks: **5020 GCL points → 3.08 energy/tick of sustained upgrade output.**

That number reframes everything. Rough energy budget at ~20 workers:
- creep replacement: 20 × 800 / 1500 ≈ **10.7/tick**
- reservers: 3 × 650 / 600 ≈ **3.25/tick**
- upgrading: **3.08/tick**

**The reservers were costing more than the colony's entire upgrade throughput** while holding
only **2 of 4** rooms — verified directly against controller reservation state, not inferred.

**Root cause: the reserver body was break-even by construction.** `CONTROLLER_RESERVE` adds 1
tick per CLAIM part per tick against 1/tick decay, so a `[CLAIM, MOVE]` reserver nets exactly
zero. It holds a room only while standing at the controller and banks nothing, so the room
lapses the moment that creep dies or spends time travelling. Three reservers alive, two rooms
held — the missing coverage is travel time and replacement gaps.

**Improved: reserver body `[CLAIM, MOVE]` → `[CLAIM, CLAIM, MOVE]`** (650 → 1250 energy).
Two CLAIM parts net +1/tick, banking roughly 500 ticks of buffer per lifetime, which carries a
reservation across the gap until a replacement arrives. The right comparison is not cost per
creep but **coverage per energy**: a reservation that lapses half the time delivers none of the
doubled source yield it was bought for.

**Next iteration:**
1. Verify coverage actually reaches 4 of 4 and stays there, and that upgrade output rises above
   3.08/tick. If coverage improves but output does not, reservation is not the bottleneck and
   the energy is going somewhere else — check the replacement-cost share.
2. **Use GCL rate as the standard output metric from now on.** `energyAvailable` answers "is
   the buffer full", never "is the colony productive".
3. Still open: pheromone-weighted pathfinding; idle state for all-negative-margin creeps.

**Verified same iteration.** The 2-CLAIM body works as intended and the evidence is stark:

| room | buffer with 1x CLAIM | buffer with 2x CLAIM |
|---|---|---|
| W5N7 | 1-2 ticks | **4998** (at CONTROLLER_RESERVE_MAX 5000) |
| W6N8 | 1-2 ticks | **1082** |

Reservations now persist for thousands of ticks with **zero reservers alive**, which is exactly
the point — one reserver saturates a room and the banked buffer carries it long after that
creep dies. Workers recovered to 25.

**New binding constraint, and it is different from the old one.** Coverage sits at 2 of 4, but
no longer because reservations lapse instantly — because reservers cost 1250 and average energy
is 528, so they only spawn on peaks (energy tops out around 1374). Coverage should fill in
gradually rather than needing another mechanism.

There was a transient collapse to 4 creeps around the deploy. Not attributed with confidence:
it coincided with a 1250-energy spawn while energy was tight, but the colony also had a dip in
progress at the time. Worth watching rather than acting on — the recovery to 25 workers was
prompt.

**Do not "fix" the low reserver count by lowering the cost back.** The 1-CLAIM body was
strictly worse: cheaper per creep but delivering no coverage at all, since it banked nothing.
This is a coverage-per-energy question, not a cost-per-creep one.

### 2026-07-31 — iteration 19 — the colony tunes its own constants

**Question raised: introduce TensorFlow so the ants can self-learn?** Investigated before
answering, and the answer is that they already do — but the more useful finding came from the
archived Overmind fork.

**Overmind never ran TensorFlow inside Screeps.** `@tensorflow/tfjs` and `onnxjs` were in
`package.json` with **zero imports anywhere in `src/`**. Its RL was `main_RL()`, a stripped
loop that disables all colony logic and only executes actions written into
`Memory.reinforcementLearning` by *external Python optimizers*. Screeps was the environment;
learning happened outside. That is the only architecture where real TF makes sense here —
our bundle is 78 KB against tfjs at 1000+ KB, the Screeps VM is pure JS with no WebGL/WASM
backend, and CPU is 100/tick measured in milliseconds.

More importantly, learning was not the bottleneck: measured 10.7 energy/tick goes to creep
replacement against 3.08 to upgrading. A better task-selection policy does not move that ratio.

**Chosen instead: widen the genome.** Three global hand-picked constants became per-creep
heritable traits, inherited and mutated with the thresholds, each bounded:
`switchBuffer` (decisiveness), `explorationChance` (curiosity), `returnFraction` (load size).
Missing traits are seeded uniformly at random rather than derived from anything, so no
assumption of mine is baked in.

**Result after ~3900 generations — the colony disagreed with me on all three:**

| trait | hand-picked | evolved mean |
|---|---|---|
| switchBuffer | 0.15 | **0.220** |
| explorationChance | 0.02 | **0.040** |
| returnFraction | 0.70 | **0.566** |

Fitness rose ~0.68 → **0.85–0.91**; population healthy 16–24; pool stayed diverse
(switchBuffer spanning 0.065–0.36) rather than converging.

`returnFraction` is the instructive one: 0.70 assumed fuller loads mean fewer trips, but
selection preferred leaving at ~0.57, because topping up at a contended source costs more than
the extra journey. Central-place foraging theory predicts exactly that — optimal load size
falls as loading slows relative to travel. Folded into research doc §4.2.2.

**The general principle, and it is the answer to several of this project's failures.** A wrong
global constant is wrong for every creep at once — that is how four collapses happened. The
same value as a gene is wrong only for its bearer, costs that creep its fitness, and is bred
out. Moving a decision from code into the genome converts a systemic risk into a local one.

**Next iteration candidates:** more constants are still hand-picked and are candidates for the
genome (congestion factor, recruit limit, spawn stagger — though these are colony-level rather
than per-creep and would need a different mechanism). Also still open: reducing the
creep-replacement share of the energy budget; pheromone-weighted pathfinding.

### 2026-07-31 — iteration 20 — the survival floor was set uselessly low

**Collapse to 4 creeps, and it was NOT the trait change.** Diagnosed from the trajectory
rather than guessed:

```
tick 528700 -> 530000:  23, 23, 21, 17, 14, 11, 6, 1, 0, 1, 2, 3
energy during crash:    908, 911, 562, 779, 283, 489, 86, 186, 286, 300
spawn gaps:             60, 74, 60, 60, [385 TICKS], 65, 127
```

Energy fell under `GROWTH_MIN_RESERVE` (400), so growth spawning stalled for **385 ticks**
while creeps kept dying. Fewer workers meant less income, which kept energy low, which
prevented spawning — a runaway.

**The emergency brake existed and was set uselessly low.** `COLONY_MIN = 2` meant the colony
had to fall to a single creep before survival spawning bypassed the energy gate and the
stagger. At 14, 11 and 6 creeps it was plainly dying and did nothing.

**Fifth instance of the same mistake in this project:** a threshold expressed as an absolute
when the thing it guards is relative. `COLONY_MIN = 2` was chosen when the colony was small
and became fatal once `COLONY_MAX` reached 25. Now `COLONY_MIN_FRACTION = 0.35`, giving a
floor of 9 — below which the colony spawns whatever it can afford, ignoring both the reserve
gate and the stagger. This is the design doc's `MINIMUM_CIVILIAN_FLOOR` (§1.1): in founding-
stage conditions survival outranks efficiency.

**Result:** minimum population **0 → 17**, average 21.2, no spawn gaps. Survival spawns have
not needed to fire at all, because the decline never reaches the floor — the fix works
preventively rather than as a rescue.

**Also caught: a shell pipeline was masking type errors.** `npx tsc --noEmit | head -5 && echo
CLEAN` takes its exit status from `head`, so a genuine compile error (a
use-before-declaration) printed while "TSC CLEAN" still echoed and the deploy proceeded.
Verification commands must not pipe the thing whose exit status is the verification. Use
`if npx tsc --noEmit -p .; then ... fi`.

**Running tally of the recurring pattern — every collapse this project has had:**
| what | measured against | should have been |
|---|---|---|
| growth gate | share of capacity | absolute reserve |
| body size | available energy | sustainable income |
| road threshold | absolute traffic count | share of current traffic |
| reserver spawning | all bodies | working bodies |
| survival floor | absolute count | share of target size |

Three of these needed an absolute where a ratio was used; two needed a ratio where an absolute
was used. The question that catches all five: **when the thing this is measured against
changes, does this threshold still mean what I intended?**

### 2026-07-31 — iteration 21 — the rescue mechanism was scheduling the next emergency

**Collapse to 1 creep, despite iteration 20's survival floor.** The floor itself worked: 8
survival spawns fired and the colony recovered 1 → 18 workers unaided, and energy was never
the blocker (559 available against a 200 minimum). So the rescue succeeded — but the crash
still happened, and the reason is a genuine feedback trap I built.

**Creeps only die of old age here (1500 ticks), so a mass die-off can ONLY be cohort
synchronisation.** Survival spawning deliberately bypassed the stagger so a dying colony could
rebuild at full speed — and that rebuilt the entire population inside one short window,
producing a fresh synchronised cohort which then aged out together a lifetime later. Observed
spawn gaps during recovery: 27, 44, 105, 88, 57, 50, 50 ticks — the whole workforce reborn in
roughly 400 ticks against a 1500-tick lifespan.

So the sequence was: crash → unstaggered rescue → new cohort → crash 1500 ticks later. **The
mechanism that saved the colony was scheduling its next emergency.** Iteration 11's stagger
fix only ever applied to growth spawning, so it could not break the loop.

**Fix: `SURVIVAL_STAGGER_TICKS = 15`.** Survival spawning now staggers too, just four times
faster than growth. Fast enough to rescue (nine creeps in ~135 ticks against a 1500-tick
lifespan), spread enough to break the resonance. Also corrected the bookkeeping: the last-spawn
timestamp now records births of *either* kind, so survival births stagger against each other
rather than only against growth births.

**Result over 51 samples: population 12–25, average 21.4**, with no crash across the
observation window. Energy cycling 56–1718.

**The general shape, which is worth more than the fix.** An emergency response that restores
the prior state can restore the *pathology* along with it. The stagger existed precisely to
prevent synchronisation; exempting the emergency path from it meant every emergency undid the
protection. Worth asking of any recovery mechanism: does this restore health, or does it
restore the conditions that caused the failure?

### 2026-07-31 — iteration 22 — the bodies were the wrong shape

**Measured with GCL rate, not buffer level.** Over 2136 ticks: **2.91 energy/tick of upgrade
output** — slightly *below* the 3.08 baseline, so neither reservation nor the trait genome
raised throughput. Reservation coverage had fallen to 1 of 4.

Against that, creep replacement costs **11.6 energy/tick**. The colony spends roughly **4x more
energy replacing its own workforce than it delivers to its controller.** That is the actual
bottleneck, and it had been sitting on the candidate list for several iterations while I chased
reservation.

**Two defects in the body, both measured rather than assumed:**
- **WORK 2.3x oversupplied** — 90 parts against ~40 that home (2 sources) and remote (6
  sources) can sustain. Idle capability, paid for on every replacement.
- **MOVE-starved** — 180 non-MOVE parts against 90 MOVE. Screeps charges 2 fatigue per
  non-MOVE part off-road and 1 on roads, so the fleet ran at **half speed anywhere without
  roads**. Only the home room has roads, so the penalty landed squarely on remote foraging,
  the colony's dominant task.

**Improved: body unit `[WORK, CARRY, MOVE]` → `[WORK, CARRY, CARRY, MOVE, MOVE, MOVE]`**, max
2 units. Result per creep: 2 WORK / 4 CARRY / 6 MOVE at 700 energy, against 4 WORK / 4 CARRY /
4 MOVE at 800. Cheaper, identical hauling capacity, half the idle WORK, and full off-road speed
instead of half. Parts are also now grouped with MOVE last, since damage consumes parts in
order and a wounded creep should keep mobility longest.

Replacement drops 12.8 → 11.2 energy/tick on the arithmetic, but the larger effect should be
indirect: foragers that travel at full speed off-road complete round trips in roughly half the
time, so the same fleet delivers more.

**Prediction to check next iteration:** upgrade output should rise above 2.91/tick. If it does
not, the freed energy is going somewhere other than the controller and the next place to look
is build spending (roads and extensions) rather than the body.

**Caution recorded:** WORK now totals ~48 across the fleet against ~40 sustainable — still a
margin, but a much thinner one. If reservation coverage collapses (unreserved remote sources
sustain half as much WORK), the fleet could become genuinely WORK-limited. Watch harvest
throughput alongside upgrade output.

### 2026-07-31 — iteration 23 — two real bugs found from a screenshot

The human asked whether a cluster of dots on the map were dead creeps. They were not — the
room held 22 creeps, 30 extensions, 23 roads, 2 dropped-energy piles and exactly **one**
tombstone. But answering the question surfaced two genuine defects.

**1. Nothing ever repaired anything, and the road network was dissolving.**
Roads had gone **125 → 22, with all 22 below half health** and the worst at 200 hits. Verified
on disk: `ROAD_WEAROUT` charges 1 hit per body part per tile crossed, so a 12-part creep costs
a road 12 hits every time it passes — the colony was destroying its own infrastructure through
ordinary use. `REPAIR_COST` is 0.01 energy per hit, so restoring a 5000-hit road costs 50
energy against 300 to rebuild: **maintenance is ~6x cheaper than replacement.**

Galling detail: research doc §5.4 already recorded that *Atta* colonies keep workers dedicated
to trail upkeep, and even said "repair creeps prioritize roads". I researched the mechanism,
wrote it down, and never implemented it.

Fixed by folding maintenance into `build`: the stimulus is now
`max(sites / BUILD_SATURATION_SITES, disrepair)`, and a builder with no construction site
repairs the most worn road or container instead of idling. This also resolves the older
"builders idle when no sites exist" problem properly, rather than by generating more roads.
Result after ~100s: roads under threshold **22 of 22 → 14 of 21**, health now spanning
12–100% with some fully restored.

**2. The population metric was wrong, and it invalidates several earlier readings.**
`emitSnapshot` reported `room.find(FIND_MY_CREEPS).length` — creeps standing in the *home
room only*. With remote foraging as the dominant task, every forager away in a neighbour
silently vanished from the figure. A "20 → 0 crash" in the series was creeps *leaving*, not
dying.

**This falsifies the cohort-collapse hypothesis for the current population.** Actual creep ages,
read directly: 1470, 1270, 1150, 1073, 977, 920, 869, 809, 769, 690, 614, 554, 494, 434, 374,
314, 254, 194, 134, 74, 14 — evenly spread across the full 1500-tick lifespan, recent births
exactly 60 ticks apart. That is a textbook healthy age structure. No hostiles in any room, every
creep at full HP. The stagger fixes from iterations 11 and 21 are working; I was reading a
broken gauge.

Snapshot now reports `creeps` as the true total and `creepsHome` separately. Post-fix the
series reads **25–27 total against 19–23 at home**, i.e. 4–8 creeps abroad at any moment —
previously invisible.

**Lesson, and it is the same shape as the energyAvailable mistake two iterations ago.** Twice
now a conclusion has rested on a metric that did not measure what its name implied.
`energyAvailable` was a buffer level read as income; `creeps` was a home-room census read as
population. Before trusting any series, check what the field actually counts — and prefer
cross-checking against raw game state, which is how both were caught.

**Next iteration:** re-measure GCL rate against the 2.91 baseline now that the body reshape has
had time to take effect, and confirm road health keeps climbing rather than stabilising at a
worn equilibrium. Population figures before this fix should be treated as suspect.

### 2026-07-31 — iteration 24 — prediction falsified; the crisis response was the bug

**The outstanding prediction FAILED.** Reshaping bodies was supposed to raise upgrade output
above 2.91/tick. Measured over 1972 ticks: **1.25 energy/tick** — worse, not better.

But the two mechanisms shipped last iteration did work in isolation:
- replacement cost **11.6 → 4.4** energy/tick
- roads under repair threshold **14 of 21 → 3 of 23**
- MOVE now balanced against non-MOVE

Output fell because *population* fell (24 → 11), which the falsified prediction usefully
exposed rather than hid.

**Two hypotheses tested and rejected before finding the real cause:**
1. *Cohort death* — rejected in iteration 23; ages are evenly spread across the full lifespan.
2. *An oscillator in the remote stimulus*, since `workParts` counts only creeps in the home
   room (the same bug class as the population metric). Rejected by arithmetic: the stimulus is
   capped at 0.55 and the WORK surplus is large enough that the cap absorbs all the variation,
   so undercounting changes nothing in practice. Worth recording as a hypothesis killed by
   numbers rather than argument.

**Actual cause: the crisis response made the crisis worse.** When energy collapsed to 27-268,
`supply` saturated to 1.0 and outbid `remote` at its 0.55 ceiling. Every creep crowded the two
home sources — which sustain 10 WORK between them and were already saturated — so the colony
switched off the only activity that brings *new* energy in. Population fell 26 → 2.

The distinction the design was missing: **supply moves energy that already exists; remote
foraging creates income.** During a shortage the second is what matters.

**Improved: `REMOTE_CRISIS_WEIGHT = 0.85`.** A shortage now raises the remote signal as well as
the supply signal, so the two compete instead of one silencing the other. Folded the supporting
biology into research doc §4.3.1, including the honest caveat that the literature is mixed on
direction (Formica range further under scarcity; Argentine ants restrict) — what transfers is
exploitation competition, where depleted near-nest resources push foraging outward.

**Result, measured on the specific failure case:** remote foraging during low energy (<400)
went from **0 creeps to 9.5 average**. Population now holds **25-26 across every sample** with
energy cycling 337-1200 and all four tasks staffed. At the deepest dip (337) remote rose to 13.

**Next iteration:** re-measure GCL rate now that population is stable — the 1.25 reading was
taken at 11 workers and is not comparable to the 2.91 baseline taken at ~24. Only compare
output at similar headcount, otherwise the metric measures population rather than efficiency.

### 2026-07-31 — iteration 25 — the colony had no granary, and could never build one

Triggered by the user observing GCL had not moved past 2. It had not: **1,822,616 of the
5,278,032 needed for GCL 3 (34.5%)**, roughly 2.03M ticks away at the rate then measured.

**Measured, at 27 creeps (comparable to the 2.91-at-24 baseline):** upgrade output **1.70
energy/tick against ~35 available — 4.9% capture.** So the earlier 1.25 reading was not purely
a population artifact; per-worker efficiency really had degraded.

**Cause: the colony owned exactly one spawn and 30 extensions.** No storage, no containers, no
links, no towers — and only two `createConstructionSite` calls existed in the entire codebase,
for roads and extensions. There was no code path that could ever build any of them. RCL 5
allows 1 storage, 5 containers, 2 links, 2 towers.

Two consequences, and the second was the bigger one:
- Total energy capacity was 1800. A Screeps source refills on a fixed 300-tick timer regardless
  of whether anyone draws from it, so income the colony could not absorb was never harvested.
- `gather.ts` only ever harvested. Upgraders mined their own energy at `HARVEST_POWER` 2 per
  WORK per tick — ~50 ticks per 100-energy load — so they spent most of their lives not
  upgrading.

**Shipped:** `runStoragePlan` in `spawn/nest.ts`, storage as a sink in `supply`/`remote`, and
`gatherEnergy(creep, fromStore)` letting upgraders withdraw instantly. Storage built in under a
minute — the energy was already there, with nowhere to go.

**First attempt failed and the failure was informative.** Overflow-only filling left storage at
**0 for 5319 ticks**: spawning drains spawn+extensions at ~4.4 energy/tick, so they always had
free capacity and nothing ever spilled over. A leaky bucket never overflows. Fixed by splitting
income by origin — local suppliers feed the nest, remote foragers bank.

**Result: 1.70 to 1.97 energy/tick at comparable headcount (27 to 26).** Storage still reads ~0,
which is correct: it is a conduit, not a reservoir. The binding constraint moved from buffer
capacity to foraging inflow.

**Also withdrew a claim made earlier in this iteration.** "3,153 energy stranded in creeps" was
presented as hoarding; it is ~126 of 200 capacity per creep, ordinary working inventory. The
number was real, the interpretation was not.

**Next iteration — the biggest remaining defect, now unblocked.** `fitnessOf` is
`record.value / record.ticks` where `value` is *the stimulus of the task being performed*, added
whenever `productive` is true. It never mentions energy. Two branches in `remote.ts` scored
`productive = true` while delivering nothing — walking home, and arriving at a full nest — so a
creep that foraged far, returned, deposited nothing and died full scored maximum fitness for its
whole life. ~4000 generations have been selecting for busywork. One of those branches is now
fixed; the objective function is not. Fitness should count energy actually delivered.

This was deliberately NOT done first: with only 1800 of capacity and no granary, delivery-based
fitness would have scored nearly every creep zero and destroyed the selection gradient. The
granary had to exist before delivery could be the objective. It exists now.

### 2026-07-31 — iteration 25b — I caused a collapse, and the granary has not paid off

**A monitor caught a collapse from 26 creeps to 2, and it was my change.** Routing remote
foragers to the granary first read `granary ?? nestSink`. Storage free capacity is 1,000,000, so
that branch is taken *every single time* — foragers stopped feeding spawn and extensions
entirely. Spawn fell to 36 of 300, nest fill to 15.2%, spawning stopped, population collapsed.

This is trap (f) from this file's own list, inverted. I replaced "a fallback that never fires"
with "a preference that never yields." Both are the same underlying error: **a two-way choice
written as fixed precedence resolves the same way every tick regardless of what the colony
needs.** Neither ordering is a policy; a threshold on actual need is.

**Fixed** with `NEST_PRIORITY_FILL = 0.75` — feed the nest while it is below three-quarters
full, bank above it. Expressed as a fraction of nest capacity, not an absolute, because capacity
grows with RCL (trap (c)). Population recovered and is stable at 24-27 across five samples, nest
oscillating 7-53% as a working buffer should.

**The honest result of the whole granary effort: no measurable gain.** Upgrade output is
**1.76 energy/tick** over 5581 ticks at 24-27 creeps, against **1.70 before any of it**. Within
noise. The granary reads 0 at every single sample.

**Why, and this is the useful finding:** the granary is empty because there is no surplus to
put in it. The colony consumes everything it earns on spawning plus upgrading. I built a
warehouse for an economy with no leftovers. Storage was a real missing capability — a colony
that cannot bank is limited by its worst tick — but it is *infrastructure that pays off once
inflow exceeds consumption*, not a fix in itself. It was necessary and it was not sufficient,
and I should not have presented "1.70 to 1.97" as a win when the next measurement regressed to
1.76; that reading was one sample and I over-read it.

**What this does not change:** the fitness function is still the biggest known defect, and it
is now unblocked because delivery is measurable. Keep it as the next change.

**What this adds to the queue:** the colony is at equilibrium — it spends exactly what it earns.
No amount of buffering escapes that. Per the new §9.5.4, nothing in the stimulus set measures
growth, so equilibrium is the system's fixed point and it will return there after every fix.
The growth term matters more than any further plumbing.

### 2026-07-31 — iteration 25c — the same wrong-denominator error, a third time

The colony collapsed again after the previous fix (26 -> 2 -> 26 -> 4). Checked for an
exception first, per trap (a), because "sources full while the nest starves" is a
looks-impossible signature. There was none — no ERROR severity, no console entries — so the
logic was running and this was a real dynamic.

**What the data showed:** creep bodies had degraded to 3 parts `[WORK, CARRY, MOVE]` (200 energy)
from the 6-part 350-energy unit, and 21 of 23 creeps were carrying energy while all four sources
sat at or near full. A poverty trap: a poor nest can only afford small creeps, small creeps earn
less, the nest stays poor.

**The cause was `NEST_PRIORITY_FILL = 0.75` — unreachable by construction.** Nest capacity is
1800, so the rule demanded 1350 before a forager would bank. Measured nest fill across every
sample ever taken: 52.8% at the very highest. The banking branch could not execute, which is
why the granary read 0 at every single sample. Arithmetic, not observation, should have caught
this when I wrote it.

**This is the wrong-denominator failure for the third time in two iterations**, and the pattern
is now unmistakable: 0.75 was measured against *total nest capacity*, a quantity with no
relationship to what the nest is for. Replaced with `NEST_SPAWN_RESERVE = MAX_BODY_UNITS *
BODY_UNIT_COST` (700) — spawning is the only thing that draws on the nest, so the amount worth
reserving is the cost of the largest creep the colony builds. Past that, energy in extensions
buys nothing.

**Result over six samples:** population stable at **25-26** (was oscillating to 2 and 4), bodies
back to full size at **24 of 25** (was 6 of 15), nest healthy at 501-1172 (was 130-950). Those
are real fixes.

**GCL rate 1.85 energy/tick against 1.70 before the whole granary effort.** Marginal, and I am
not going to call it a win. The granary still reads 0 at every sample — energy now passes
through it to upgraders rather than accumulating, so the buffer that would damp the oscillation
still does not exist. What actually stabilised the population was body size recovering, not
banking.

**Standing lesson for the next iteration, stated as a rule:** before shipping any threshold,
compute the range the measured quantity actually takes and confirm the threshold falls inside
it. Two of these three failures were unreachable-by-construction (`granary ?? nest` always true,
`0.75 * 1800` never reached) and both were provable at the keyboard without touching the colony.

**Next remains the fitness function.** Nothing here changed that assessment: output is still
~1.85 against ~35 available, the colony sits at equilibrium, and per §9.5.4 no stimulus in the
system measures growth.

### 2026-07-31 — iteration 26 — stopped guessing, instrumented instead

**Three collapses had been attributed to three different causes and "fixed" three times without
stopping them.** Pulling the full population series instead of another five-sample window showed
the signature was never an oscillation: **long stable stretches at 25-27 for 20-30k ticks, then a
sudden near-total wipe to 1-5, then fast recovery.**

Ruled out by direct check, not by argument: no hostile creeps in our rooms, no damaged creeps,
no damaged structures, tombstones only in W6N5 which is not ours. Not an attack. Telemetry
`creeps` was also verified against db.json ground truth (25 = 25), so the collapses are real and
not a metric artifact — a failure mode this project has had before.

**One real defect found and fixed: the colony reserved rooms nobody foraged.** `reservationTargets`
qualified rooms on "seen", and a creep merely passing through records a room. Measured cost:
**929 reserver spawns at 1250 energy each = 1,161,250 energy, 59% of everything ever delivered to
the controller**, while the single live reserver held W5N7 whose source sat untouched at
3000/3000. Reservation is worth +5 energy/tick on a foraged room and costs 2.08 energy/tick to
hold, so on an unforaged room it is a pure loss. Now gated on `lastHarvest` within one
`CREEP_LIFE_TIME`. Reserver spawns fell **4.25/min to 0.75/min (-82%)**.

**But it did not stop the collapses**, which continued throughout the measurement window. Stated
plainly: the reserver waste was real and worth fixing on its own arithmetic, and it was not the
cause. That is three wrong attributions in a row.

**So the next collapse gets evidence.** Added spawn-block telemetry — every `return null` in
`runSpawning` now records why. Telemetry-only, which this loop's own rules exempt from the
one-change limit, and it immediately paid for itself.

**Steady-state result, and it invalidates today's whole line of attack:**

| block reason | ticks per 100 |
|---|---|
| `at-cap` (alive >= COLONY_MAX) | 23-58 |
| `spawn-busy` | 40-68 |
| `too-poor` | **0** |
| `growth-reserve` | 0-18 |

`at-cap` plus `spawn-busy` accounts for essentially every tick. **Energy is never what stops
reproduction.** The granary, the nest reserve and the delivery routing were all aimed at a
constraint that was not binding — which is why none of them moved output. I should have measured
what was blocking before assuming it was scarcity.

**And the plateau now has a concrete mechanism: `COLONY_MAX = 25` is a hard ceiling**, hit on
~40% of all ticks. The colony cannot grow past 25 workers by construction. §9.5.4 argued the
system has no growth term; this is where that abstraction touches the code.

**Next iteration:** the fitness fix is still queued and still right. But read the spawn-block
histogram during a collapse first — the instrumentation is live and the answer will be in it.
Do not ship another hypothesis about the collapses without that data.

### 2026-07-31 — iteration 27 — the objective function finally mentions energy

**Observed first.** No ERROR severity. Population pinned at exactly 25 across the whole window,
with `at-cap` 26-59 ticks per 100 and `spawn-busy` 38-70 — together essentially every tick, while
`too-poor` stayed 0. The colony is hard-capped, not starved. No collapse occurred since the
instrumentation landed, so the collapse question is still open and still waiting on data.

**Changed: `fitnessOf` now counts energy the creep actually delivered.** It was
`record.value / record.ticks` where `value` was the *stimulus of the task being performed*, added
whenever a caller passed `productive = true` — an objective function that never mentioned energy.
It rewarded looking busy, and two call sites in `remote.ts` scored walking home and arriving at a
full nest as productive.

Delivery is measured as **a decrease in the creep's own energy store**, not self-reported per
task. A store only falls when energy leaves the creep, so one measurement captures transfers,
upgrades, construction and repair at once, and no call site can misreport it. Harvesting and
withdrawing raise the store and correctly count for nothing. All 24 `recordWork` call sites lost
their now-meaningless `productive`/`value` arguments rather than being left as decoration.

`FITNESS_VERSION` bumped 2 → 3, which wipes the pool — old scores are in different units and
would have outranked every honestly scored newcomer forever. Reservers needed no special case:
they spawn without a threshold profile and `retire` already returns early without one.

**Result — the largest single gain in this project so far.** Upgrade output **1.85 → 2.29
energy/tick** at comparable headcount (25-26 → 25), +24%, against a 2.91 historic best measured
at 24. Bodies stayed full size, population stable.

**Trajectory — the answer to "where is evolution going" is no longer "nowhere".** Best fitness
moved off 0.9055 for the first time in ~7500 generations (now 1.956, in new units, so the level
is not comparable — the fact that it moves is the point). Across ten consecutive samples:
fitMean 1.184 → 1.229 rising; supplyMean 0.50 → 0.46 with spread 0.116 → 0.088; upgradeMean
0.67 → 0.70 with spread 0.089 → 0.070; remoteMean 0.83 → 0.81 with spread 0.057 → 0.054.
**Mean moving while spread narrows on every gene is convergence under selection, not drift** —
which is exactly the distinction the spread metric was added to make.

Direction, read carefully because threshold semantics invert: a *lower* threshold means a creep
adopts that task more readily. So the colony is becoming more willing to supply, slightly more
willing to forage, and *less* willing to upgrade — yet upgrade output rose 24%. The consistent
reading is that fewer, better-supplied upgraders deliver more than many perpetually empty ones,
which is the same lesson as the granary: an upgrader that has to mine its own energy barely
upgrades.

**Caveat, stated before it can become an overclaim.** This is ~5300 ticks. The trend is
consistent across ten trajectory samples rather than resting on one favourable reading, which is
better evidence than the 1.97 figure I over-read in iteration 25 — but it is not yet a full
creep generation of selection. Re-measure before treating 2.29 as the new baseline.

**Next:** the growth term. `COLONY_MAX = 25` is a hard ceiling hit on ~40% of ticks and energy
never blocks reproduction, so the plateau is now a one-constant problem with a well-supported
design behind it — §12.4 finds the growth-versus-reproduction trade-off in the biology, and
§12.2 reached the same consumption/investment split from economics.

### 2026-07-31 — iteration 28 — the collapse diagnosed from evidence, and only half solved

**The instrumentation paid for itself.** A collapse finally occurred with spawn-block telemetry
live, and it reads unambiguously (ticks 813800-814300):

| tick | creeps | at-cap | too-poor | spawn-busy | **stagger-growth** |
|---|---|---|---|---|---|
| 813800 | 25 | 48 | 0 | 51 | 0 |
| 813900 | 20 | 0 | 0 | 70 | **28** |
| 814000 | 15 | 0 | 0 | 54 | **44** |
| 814100 | 10 | 0 | 0 | 51 | **48** |
| 814200 | 7 | 0 | 0 | 97 | 0 |
| 814300 | 3 | 0 | **47** | 32 | 0 |

Through the entire fall the blocker was `stagger-growth`. `SPAWN_STAGGER_TICKS = 60` throttles
replacement to one creep per 60 ticks, so replacing 25 losses needs 1500 ticks — they died in
500. **The rule that exists to prevent cohorts also forbade recovering from one.** Trap (d)
exactly: the emergency response restored the pathology.

`too-poor` appears only at the very bottom, after the foragers were already dead. **Energy was a
consequence of the crash, never its cause** — which is precisely why three earlier diagnoses were
wrong. Each read the state at the bottom of the crash and concluded scarcity. Recorded here so it
is not repeated: reading a failure at its worst moment tells you what it decayed into, not what
started it.

**Changed:** stagger now divides by the deficit — `Math.ceil(base / Math.max(1, COLONY_MAX - alive))`.
One creep short is ordinary turnover and still spreads births across a lifetime (60 ticks);
fifteen short is an emergency and spawns near-continuously (4 ticks). No new threshold, so no
edge to get wrong: deficit spans 1..25, stagger spans 60..2, saturating harmlessly because a
6-part body already occupies the spawn ~18 ticks.

**Result: it did what it was designed to do and did not fix the problem.** `stagger-growth`
during declines went from 24-48 ticks per 100 to **0**. But the colony collapsed again anyway,
and the remaining blockers at the bottom are `spawn-busy` (up to 97 at 4 creeps — one spawn is
physically saturated) and `too-poor`.

**The trigger is now isolated, and it is not spawning at all.** At tick 822500 there were 15
creeps; 100 ticks later, 4. Eleven deaths in 100 ticks is not an age distribution aging out — it
is a cohort dying together. The stagger governed how *deep* the crash ran; something else decides
*when* it starts.

**A risk this change introduces, stated before it bites.** Faster rebuild produces a *tighter*
cohort, which is the same trap in a new costume — the mechanism that rescues the colony schedules
its next emergency. Recovery speed and birth spread are in direct tension and cannot both be
maximised by tuning one constant.

**Not confirmed: the 2.29 figure from iteration 27.** This window measured 2.03 energy/tick, but
headcount fell 25 → 18 across it and full-size bodies fell 25 → 10, so it is not comparable and
neither confirms nor refutes 2.29. Both readings are withheld until a clean window at stable
headcount exists. No favourable sample is being banked.

**Next iteration — pre-spawn replacements on time-to-live.** The real fix dissolves the tension
rather than tuning it: trigger replacement when a creep's `ticksToLive` falls below the time
needed to spawn and position its successor, instead of waiting for it to die. Deaths then never
produce a population dip, and cohort structure stops mattering because replacement is continuous
rather than reactive. `CREEP_SPAWN_TIME` is 3 ticks per part — verify against
`@screeps/common/lib/constants.js` on disk before using it. This is standard practice in mature
Screeps bots and directly targets the mechanism the telemetry just isolated.

### 2026-07-31 — iteration 29 — the fitness change confirmed, and a noise floor established

**Settled the outstanding measurement, and it was better than claimed.** A clean window (6129
ticks, headcount 25-26 stable, full bodies) measured **4.57 energy/tick**. The unconfirmed
2.29 from iteration 27 was not an overclaim but an *understatement*: it was taken shortly after
`FITNESS_VERSION 3` wiped the pool, when genes were still random. With ~60k ticks of selection
since, output against the 1.85@25-26 baseline is roughly **2.5x**, and against the 2.91@24
historic best about **1.6x**. Delivering energy as the objective is the single largest change
this project has made.

**Trajectory — evolution went somewhere, decisively.** Across the whole post-reset run:
fitMean **0.332 → 2.089** (6.3x). supplyMean 0.50 → **0.12** with spread 0.094 → **0.042**;
remoteMean 0.87 with spread **0.036**; upgradeSpread 0.095 → 0.090. So supply and remote have
converged hard while upgrade is still exploring. Reading the direction correctly matters here
because thresholds invert: supply at 0.12 means creeps adopt supply almost unconditionally. The
colony has learned that keeping the nest fed dominates, which is consistent with the delivery
objective — a supplier's energy reliably lands somewhere, an upgrader's only lands if it reaches
the controller with something in hand.

**Changed: replacement now happens before death, not after it.** Rather than adding a branch or
letting population exceed the cap, the definition of "alive" was corrected: a creep counts only
if it will still be alive by the time a replacement could reach the work — `MAX_BODY_UNITS *
BODY_UNIT.length * CREEP_SPAWN_TIME + PRESPAWN_TRAVEL_TICKS`, i.e. 12 parts x 3 + 15 = **51
ticks** (`CREEP_SPAWN_TIME` verified as 3/part on disk). A creep inside its final lead time stops
counting, a deficit of one appears, and the ordinary growth path builds the successor so it
matures as its predecessor expires. Threshold range check: `ticksToLive` spans 0-1500 and 51 sits
well inside it; at the observed ~60-tick birth spacing at most one creep occupies the window at a
time, so the deficit stays at one and the 60-tick stagger is preserved.

**Result: no-gain in steady state, which is the correct outcome.** Population floor rose from 24
to **25 and never below** (avg 26.17). Output measured 3.91 then 5.02 against 4.57 before — no
detectable change. That is what the design predicted: pre-spawning buys *collapse resilience*,
and no cohort event occurred in these windows. Predicted steady-state cost is 0.40 energy/tick
(replacing ~51 ticks early), which is below the noise floor and therefore unmeasurable here.

**A methodological result worth more than the change itself: the noise floor is ±1.1 energy/tick
over 6000-tick windows.** Two consecutive post-change windows read 3.91 and 5.02 with nothing
different between them. **Any claimed improvement below ~1.1 energy/tick is not evidence.** This
retroactively vindicates withholding the 1.97 figure in iteration 25 and the 2.29 in 27 — both
were inside the noise band. From here, a single window can only support a claim if the effect
exceeds that spread; otherwise take two.

**Still unexplained: what synchronises the cohort.** Current TTL spread is near-perfectly uniform
(0, 26, 95, 146, ..., 1442 — ~60-tick gaps), so no cohort exists right now and the colony is
healthy. Pre-spawning should make a future die-off survivable rather than fatal, but that remains
**unverified until one occurs**. Do not record it as working until a cohort event is observed
passing through without a crash.

**Next: the growth term.** `at-cap` still accounts for 15-57 ticks per 100 while `too-poor` stays
at 0 — the colony is bounded by a constant, not by its economy, and now delivers ~4.5-5.0
energy/tick with which to fund expansion.

### 2026-07-31 — iteration 30 — a growth gate was throttling maintenance

A collapse occurred immediately after the pre-spawn deploy (26 → 2), and with instrumentation
live it exposed a blocker that had never appeared before. Reading across the fall, not at its
bottom:

| tick | creeps | spawn-busy | stagger-growth | **growth-reserve** | too-poor |
|---|---|---|---|---|---|
| 901300 | 26 | 54 | 45 | 0 | 0 |
| 901500 | 21 | **97** | 0 | 0 | 0 |
| 901600 | 17 | 88 | 0 | **9** | 0 |
| 901700 | 12 | 68 | 0 | **28** | 0 |
| 901800 | 4 | 16 | 0 | **45** | 37 |
| 901900 | 2 | 0 | 0 | 0 | **100** |

**Two findings, and the second is structural.**

**1. `GROWTH_MIN_RESERVE` was gating replacement, not growth.** From 17 creeps downward the
colony refused to spawn because it held under 400 energy — while `too-poor` was still 0, meaning
it *could* afford a creep and declined to build one. With a fixed `COLONY_MAX` almost every spawn
is replacing a creep that died, not adding one; a gate meant to prevent over-investment was
throttling maintenance, and did so hardest exactly when maintenance was survival. The colony was
saving for a rainy day during the storm.

Fixed by scaling the requirement with the deficit, the same shape as the stagger fix: one short
still demands the full 400, eight short demands 50. `bodyFor` already sizes the body to what is
affordable, so `too-poor` is the real floor and this gate no longer pre-empts it. Range check:
`energy.available` spans 0-1800 and the requirement spans 400 down to 16, inside the range at
every deficit.

**2. One spawn is a hard physical limit until RCL 7.** Verified on disk —
`CONTROLLER_STRUCTURES.spawn` is 1 for RCL 1-6 and only reaches 2 at RCL 7. `spawn-busy` hit
**97%** during the fall: the spawn was running flat out and still losing. A 12-part body takes 36
ticks, so rebuilding 25 creeps costs ~900 ticks minimum no matter what any policy says.

**This reframes the whole collapse problem.** Recovery speed cannot be meaningfully improved
before RCL 7, so **preventing die-offs is worth far more than accelerating recovery** — and the
three spawn-policy fixes so far (deficit stagger, pre-spawn, scaled reserve) have all been
recovery-side. The remaining question is still what synchronises the cohort in the first place,
which none of them addresses. RCL 5 sits at ~98% toward RCL 6, so RCL 7 is not near.

**Unverified, and deliberately not claimed.** This change can only be tested by another die-off.
Do not record it as working until a collapse is observed passing through with `growth-reserve`
staying at 0 while creeps are below strength.

**Next:** the growth term remains queued, and the RCL-7 finding gives it a second motive — a
second spawn is itself an investment that raises future capacity, which is exactly the
consumption-versus-investment distinction §12.2 says the colony cannot currently express.

### 2026-07-31 — iteration 31 — the cohort mechanism found, and it is phase-locking

**Iteration 30 verified on a real die-off.** Comparing the same population band across two
collapses: at 17-19 creeps `growth-reserve` previously blocked 9-45 ticks per 100, and now blocks
**0**. The gate no longer throttles replacement. Through the whole fall the dominant blocker is
`spawn-busy` at 85-98%, with `too-poor` only at the bottom — **every policy blocker is now
cleared and what remains is the physical one-spawn limit.**

**The cohort mechanism is now identified, from birth-gap data rather than inference.** Gaps
between consecutive creep birthdays, oldest first:

```
36 36 36 36 36 36 | 59 60 71 60 | 94 150 206 336 | 69 30 24 15 27 15 23 16
```

A run of six births **exactly 36 ticks apart** — precisely `12 parts * CREEP_SPAWN_TIME 3`, so
those births were **spawn-limited, not stagger-limited**. Then healthy 59-71 gaps under the
60-tick stagger, then the die-off, then the current emergency rebuild at 15-30.

**Every rebuild runs the single spawn flat out, so births land 36 ticks apart instead of 60.**
That compresses the age distribution; the compressed cohort dies together; the deeper rebuild
packs tighter still. Each collapse breeds a worse one. This is phase-locking, and the
deficit-scaled stagger from iteration 28 accelerates it — the risk flagged there, now with
evidence.

**Rejected on arithmetic before shipping: fewer, larger workers (r/K selection, §12.1).** The
appeal is obvious — fewer bodies to replace. But spawn time is proportional to part count and
total parts is fixed by what the economy supports, so 25 creeps of 12 parts and 17 of 18 both
occupy the spawn about 60% of the time. It relieves nothing. Recorded in §12.3 as rejected so no
future iteration retries it as a spawn-throughput fix.

**Changed: per-creep jitter on the replacement lead time.** Deliberate noise is the standard cure
for coupled oscillators, and real colonies get it free through variable worker lifespan. Screeps
fixes `CREEP_LIFE_TIME` at 1500 for everyone, so the variation goes where it can — into *when a
replacement is started*, which shifts the successor's birthday without altering any lifespan. The
offset is a hash of the creep's name, deterministic so a creep cannot flicker in and out of the
headcount, and needing no memory field so it applies to creeps already alive.

`PRESPAWN_JITTER_TICKS = 200` is derived from the jam rather than guessed: wider than the 36-tick
spacing that causes the lock and wider than the 60-tick healthy stagger, so successive
generations diffuse instead of re-locking, while sitting far inside the 0-1500 range
`ticksToLive` occupies. Cost is about 7% extra bodies carried
(`PRESPAWN_JITTER_TICKS / CREEP_LIFE_TIME`), bounded and self-correcting.

**Unverified, and not claimed.** This needs a full cohort cycle to show up. The test is specific:
birth gaps should stop showing runs of identical 36-tick values and instead scatter. Check the
gap sequence directly — population stability alone will not distinguish it, because the colony is
stable between collapses anyway.

**Also confirmed:** the nest expanded to the RCL 6 maximum of 40 extensions on its own, so nest
capacity is 2300 and `runNestExpansion` is working without intervention.
