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
