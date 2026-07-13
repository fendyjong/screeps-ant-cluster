# Screeps AI — agent notes

Single-directory Screeps (screeps.com official server) bot. No build system,
no tests, no package.json. Files in this dir are auto-synced to the game by
the Screeps client; "deploy" = save the file (the client pushes it).
`.sync` is the client sync stamp, not source control.

## Runtime environment (Screeps globals — do NOT import or declare)

`Game`, `Memory`, `RawMemory`, `PathFinder`, `RoomPosition`, `_` (lodash),
`BODYPART_COST`, `CREEP_SPAWN_TIME`, all `STRUCTURE_*` / `RESOURCE_*` /
`ERR_*` / `TERRAIN_MASK_*` / `FIND_*` constants are globals. There is no
Node, no `fs`, no `process`. Each tick the engine calls `module.exports.loop`
in `main.js` once.

## Design philosophy

This bot uses an **adaptive ant colony** architecture. See README.md for
full strategy documentation.

## Build & Deploy

TypeScript source in `src/`, compiled to `main.js` via Rollup:

```bash
npm run build
```

The Screeps client syncs `main.js` to the game server.

## CPU budget gating (in `main.js`)

- `getCpuBudgets()` derives `soft` and `hard` ceilings from `Game.cpu.limit`,
  `tickLimit`, and `bucket`. Do not reimplement; call these.
- Roles run only when `Game.cpu.getUsed() < hard`, EXCEPT `harvester`,
  `hauler`, `defender` (and `builder` while sites exist) which always run.
- Non-critical/burst work (`links`, `labs`, `factory`, `market`, `power`,
  `construction`, `strategyRefresh`, `report`) rotates one job per tick via
  `Memory.runtime.burstQueue` and only when `bucket >= 3000` and under `soft`.
- When adding periodic work, gate with `shouldRunNonCritical()` /
  `shouldRunBurstWork()` and prefer `Game.time % N === 0` cadences.

## Shared state: `Memory.roomIntel[roomName].colonyPlan`

Written every tick by `colony.manager.run(room)` (only for owned rooms) and
read by `auto.spawn`, `role.builder`, `role.ranged_escort`, the runtime
banner, and KPI snapshots. Schema (see `colony.manager.js` around line 584):

```
plan.phase         // { status, label, ... }  status ∈ bootstrap|stabilize|critical_path|buildout|defense|upgrade|complete
plan.economy       // { locked, survival, storedEnergy, stockpile, reserveFloor, hostiles }
plan.buildGovernor // { mode, constructionEnabled, maxNewSitesPerRun }
plan.civilian      // per-role target counts keyed by RCL
plan.minimums      // hard floors (MINIMUM_CIVILIAN_FLOOR)
plan.buildPriority // structureType -> int (lower = built first)
plan.construction  // { activeType, enabled, maxNewSitesPerRun, queue }
plan.eta           // { phase, ... }
```

`plan.economy.locked` / `survival` gate spawning and body sizes — respect
them in any code that spends energy. Treat the plan as read-only outside
`colony.manager.js`; never hand-write it from roles.

## Other `Memory` trees

- `Memory.strategy` — global stance (`defensive`/`offensive`/`na`), `attackTarget`,
  `claimReady`, `attackReady`, `kpi.history`, `spawnState`, `routeCache`,
  `economy` (aggregate `totalStockpile`, `sourceFillRatio`, `depletedSources`).
- `Memory.warPlan` — `threat[room]`, `doctrine[room].template`, squad state.
  Written by `war.room.js`; roles read `Memory.warPlan.threat[room]`.
- `Memory.roomIntel[roomName]` — per-room intel incl. `colonyPlan`,
  `lastSeen`, `threatLevel`. Pruned by `strategy.map.pruneRoomIntel` when
  `RawMemory` exceeds `MEMORY_SOFT_LIMIT` (1.85 MB).
- `Memory.metrics` — `cpu.roles`, `spawnIdle`, `towerStats`, KPI counters.
  Record into it via `utils.metrics` / `utils.stats`, don't ad-hoc write.
- `Memory.debugReport.markdown` — full markdown report regenerated every 25
  ticks by `debug.report.generate()` when CPU allows.

## Conventions to follow

- Tabs for indentation (the existing files use tabs, not spaces).
- Per-tick periodic work uses `Game.time % N === 0`. Common cadences: 25
  (memory/report), 50 (module health logs, strategic refresh), 100
  (intel prune / KPI snapshot), 250 (summary log).
- Pathing must go through `utils.pathing` (`moveTo` / `moveToRoom`); it
  sets per-profile cost matrices, handles stuck-creep detection, and caches
  inter-room routes in `Memory.strategy.routeCache`. Don't call
  `creep.moveTo` directly.
- Action results are logged via `metrics.recordRoleResult(role, action, result)`
  (only records negative/error codes) and resource flows via
  `utils.stats.record*(creep, amount)`. Wire these in on any new role action.
- `auto.spawn` is the only spawner and owns `BODY_PRESETS` and emergency
  bodies. To add a body variant, edit there — roles don't pick their own bodies.
- `role.defender.js` requires `war.room.js`. Before adding a
  `war.room -> role.*` edge, check for cycles; `main.js`'s safe-require will
  mask a cycle as a `noopRun`, which is hard to notice.

## Adding a new role (check list)

1. Create `role.<name>.js` exporting `{ run: function (creep) {} }`. Require
   `utils.pathing`, `utils.metrics`, `utils.stats` as needed.
2. Add a `safeRequireRole('role.<name>')` line in `main.js` near the others.
3. Add a dispatch `if (creep.memory.role === '<name>') ...` branch in the
   creep loop (copy the `updateCpuMetrics` pattern).
4. Add the role to `ROLE_LIST`, `BODY_PRESETS`, and the spawn logic in
   `auto.spawn.js`; add to `CIVILIAN_PHASES` / `PRIORITY_ORDER` in
   `colony.manager.js` if it should scale with RCL.
5. If the file/require name contains an underscore (like `ranged_escort`),
   keep the underscore in the filename but use camelCase for the
   `creep.memory.role` value and stay consistent with the dispatch table.
