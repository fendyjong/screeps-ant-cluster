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
