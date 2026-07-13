# Screeps Bot — Adaptive Ant Colony

A growth-maximizing, expansionist Screeps AI built in TypeScript.

## Philosophy

The bot operates as an **adaptive ant colony**:

- **Growth-maximizing** — every surplus energy tick should produce more creeps.
  The colony scales up workers, soldiers, and expansion proportionally to
  available surplus.
- **Replacement-first** — dying creeps get emergency spawn priority, preventing
  service gaps. A harvester with 10 TTL left will spawn before a brand-new
  builder request.
- **Expansionist** — once a room is stable (RCL 4+, 500k stored energy), the
  colony automatically claims and populates the next room.
- **Soldiers are growth** — military scales with energy surplus, not as a
  separate system. A wealthy colony naturally produces defenders.

## Architecture

```
src/
  main.ts              ← entry point, ticks each owned room
  hatchery/
    Queen.ts           ← colony manager: phase detection, death watch, requests
    Hatchery.ts        ← priority queue, spawn execution
    Request.ts         ← SpawnRequest type, Priority enum
    Body.ts            ← body scaling between min and ideal
  roles/
    Harvester.ts       ← harvest energy → container/storage/spawn
    Hauler.ts          ← move energy from containers to storage/spawn/tower
    Builder.ts         ← build construction sites, repair, upgrade fallback
    Upgrader.ts        ← upgrade controller
  colony/
    Architect.ts       ← terrain-aware bunker layout planner
  lib/
    Memory.ts          ← typed memory helpers, namespace management
    TerrainMatrix.ts   ← terrain cache with version stamping
    Pathing.ts         ← moveTo wrapper with cost matrices
  types/
    index.ts           ← shared type definitions
```

### Tick flow

For each owned room:
1. **Queen.tick(room)** — detect phase, update TTL death watch, compute targets with growth scaling, submit SpawnRequests to queue
2. **Hatchery.process(room)** — read queue, sort by priority, scale body from min→ideal, spawn highest-priority affordable request
3. **runCreeps(room)** — each creep executes its role function

## Queen — Colony Manager

### Phase detection

| Phase | Trigger | Behaviour |
|-------|---------|-----------|
| bootstrap | RCL 1-2, low energy | 2 harvesters, 1 hauler — survival only |
| stabilise | RCL 1-2, energy stable | Add builder + upgrader, scale haulers with storage |
| critical_path | RCL 3-4, missing extensions/towers | Prioritise builders for critical gates |
| buildout | RCL 5-7, construction sites exist | Scale builders with backlog |
| growth | RCL 5-7, no active sites | Scale upgraders, consider defenders |
| upgrade | RCL 8 | Scale upgraders |

### TTL death watch

Every tick, the Queen scans all creeps and categorises them by remaining TTL:

| Band | TTL | Effect |
|------|-----|--------|
| critical | 0-20 | Emergency replacement at priority ~50 |
| warning | 21-100 | Planned replacement at priority ~150 |
| stable | 100+ | Role's default priority |

Request count = `max(0, target - alive + soonDead)`. This pre-spawns replacements before the old creep dies, avoiding service gaps.

### Growth scaling

Target counts are not static. They scale with stored energy and construction backlog:
- +1 hauler per 5-10k stored energy
- +1 builder per 20-30k construction backlog
- +1 upgrader per 5-10k reserve

### Room expansion

When RCL ≥ 4 with 500k+ stored energy, the Queen auto-submits:
- 1 claimer (priority LOW)
- 2 remote harvesters (priority LOW)
- 1 remote hauler (priority LOW)

## Hatchery — Spawn Execution

The Hatchery maintains a per-room priority queue in `Memory.v1.hatchery.queue[roomName]`.

**process(room)** every tick:
1. Read queue, validate entries, purge stale (>100 ticks)
2. Sort by priority ascending (lower = more urgent)
3. For each request, scale body to fit `room.energyAvailable`
4. Spawn the first affordable request
5. Decrement count or remove fulfilled/errored requests

### Body scaling

Each role defines a minimum body and an ideal body. `scaleBody(min, ideal, energy)` starts at min, appends parts from ideal in order while energy and 50-part cap allow.

Example: harvester with `min: [WORK,CARRY,MOVE] (200e)`, `ideal: [WORK,WORK,WORK,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE] (600e)`. Room has 350e → `[WORK,WORK,CARRY,CARRY,MOVE,MOVE]` (350e).

If even the minimum body is unaffordable, the request is deferred to next tick.

### Priority bands

| Band | Range | Roles |
|------|-------|-------|
| CRITICAL | 0-99 | Emergency, death-watch critical (<20 TTL), bootstrap |
| HIGH | 100-299 | Harvester, defender, death-watch warning (21-100 TTL) |
| NORMAL | 300-599 | Hauler, builder, upgrader |
| LOW | 600-899 | Scout, remote miner, claimer |
| IDLE | 900+ | Attacker, healer (only with surplus) |

## Room Layout

The bunker planner (`colony/Architect.ts`) uses terrain-aware zone carving:

1. **Core zone** — spawn, storage, terminal, factory, links (25 contiguous tiles)
2. **Lab zone** — 15 labs in ring around core
3. **Extensions** — up to 60 in outer rings
4. **Towers** — optimal coverage positions
5. **Ramparts + walls** — protect all structures
6. **Swap planner** — handles structure relocation during construction

## Build & Deploy

```bash
npm run build          # compiles src/main.ts → main.js
```

The Screeps client syncs `main.js` to the game server. There is no test framework — verify by monitoring in-game console and Memory.

## Memory Structure

```ts
Memory.v1.hatchery.queue[roomName]       // SpawnRequest[]
Memory.v1.hatchery.deathWatch[roomName]   // { role: [{name, ttl}] }
Memory.v1.pathing.terrain[roomName]       // CostMatrix cache
Memory.v1.pathing.traffic[roomName]       // Movement heatmap
Memory[CURRENT_NS].metrics                // CPU, spawn, KPI stats
```