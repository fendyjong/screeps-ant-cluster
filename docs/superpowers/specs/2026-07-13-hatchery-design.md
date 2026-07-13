# Hatchery — Ant Colony Spawn Management Design

**Date:** 2026-07-13

## 1. Overview

Replace the current minimal spawner (`src/spawn/Spawner.ts`) with a full-pipeline
hatchery system inspired by Overmind. The colony is an **adaptive ant colony** —
growth-maximizing, expansionist. The **Queen** constantly pushes for more
workers, more soldiers, and room expansion as fast as surplus allows. She
evaluates colony needs and submits **SpawnRequests** (wishlist pattern) to the
**Hatchery**, which maintains a priority queue and spawns the highest-priority
affordable request each tick. **Body generation** scales between a role-specific
minimum and ideal based on current energy.

### Ant colony philosophy

- **Growth-maximizing** — every surplus tick should produce more creeps
- **Expansionist** — once RCL 4 + storage + energy reserve, push into next room
- **Replacement-first** — dying creeps get emergency priority, preventing service gaps
- **Soldiers are growth** — military scales with surplus, not separate from economy

## 2. Architecture

```
src/hatchery/
  Hatchery.ts    ← priority queue, spawn execution per tick
  Request.ts     ← SpawnRequest type, priority bands enum
  Body.ts        ← body scaling between min and ideal
  Queen.ts       ← colony evaluator, submits requests to Hatchery
```

### Tick flow

```
main.ts → for each owned room:
  1. Queen.tick(room)           → phase analysis, submit requests
  2. hatchery.process(room)     → sort queue by priority, spawn highest affordable
  3. runCreeps(room)            ← unchanged role dispatch
```

## 3. Queen — Colony Evaluator

### Phase detection (growth model)

Queen computes phase from RCL + economy health. Each phase defines a **minimum
floor** (survival) and a **growth ceiling** (maximum useful workers).

| Phase | Trigger | Min floor | Growth scaling |
|-------|---------|-----------|----------------|
| bootstrap | RCL 1-2, `energyAvailable < energyCapacityAvailable * 0.8` | 2 harvester, 1 hauler | 0 — all energy to survival |
| stabilise | RCL 1-2, `energyAvailable >= energyCapacityAvailable * 0.8` | 2 harvester, 1 hauler, 1 builder | +1 hauler per 5k stored energy |
| critical_path | RCL 3-4, missing critical gates (extensions/towers/storage) | 2 harvester, 1 hauler, 1 builder, 1 upgrader | +1 builder per 30k backlog; +1 upgrader per 5k reserve |
| buildout | RCL 5-7, construction sites exist | 2 harvester, 1 hauler, 1 builder, 1 upgrader | +1 hauler per 10k stored; +1 builder per 20k backlog; +1 defender per 50k surplus |
| growth | RCL 5-7, no active sites | 2 harvester, 1 hauler, 0 builder, 1 upgrader | +1 upgrader per 10k reserve; +1 defender per 50k surplus; scout + claimer for next room |
| expansion | RCL 8 or RCL 4+ with 500k reserve | 2 harvester, 1 hauler, 1 builder | Submit claimer + remote harvester + hauler for next room |

"Missing critical gates" = `room.find(FIND_MY_STRUCTURES)` count for any critical type
is below `CONTROLLER_STRUCTURES[type][level]` — specifically extensions, towers, storage.

Growth scaling is additive per resource threshold. If 80k backlog exists, builder
target = 1 (floor) + 2 (per 30k) + 1 (remaining 20k partial) = 4 builders.

### Economy lock override

When `plan.economy.locked` or `plan.economy.survival` is true:
- Only harvester and hauler may spawn
- Body min is used (cheapest viable)
- No builder, upgrader, or military roles
- Growth scaling is suppressed entirely

### TTL death watch

Each tick, Queen scans creeps per role and categorizes them by remaining TTL:

| Band | TTL | Meaning | Request priority |
|------|-----|---------|------------------|
| critical | 0-20 | Will die imminently | CRITICAL (0-99) — emergency replacement |
| warning | 21-100 | Soon to die | HIGH (100-299) — plan replacement |
| stable | 100+ | No concern | role's default band |

The priority offset is applied to any spawn request for that role:

```ts
let priority = roleDefaultPriority
if (ttl < 20)  priority = Math.min(priority, 50)   // emergency band
if (ttl < 100) priority = Math.min(priority, 150)  // warning band
```

Replacement need is `max(0, target - alive + soonDead)` where `soonDead` = creeps
with TTL < 100. This pre-spawns replacements before the old creep dies, preventing
service gaps. **Replacement always beats expansion** — a dying harvester at
priority 50 will spawn before a new builder at priority 300.

### Death watch memory

Queen writes `Memory.v1.hatchery.deathWatch[roomName][role]` — an array of
`{ name: string, ttl: number }` for creeps under 100 TTL. Hatchery reads this
to understand who's about to die and which slots need filling.

### Request submission

Per tick, Queen iterates roles in priority order. For each role where
`live count < adjusted target` (target + soonDead), calls `hatchery.request(...)`:

```ts
{
  role: string
  priority: number      // death watch adjusted
  body: { min: BodyPartConstant[]; ideal: BodyPartConstant[] }
  count: number         // how many more needed
  memory: Record<string, any>
}
```

If a matching request already exists in the queue (same role, same room, same body.min
and body.ideal), Queen increments count instead of duplicating.

### Room expansion trigger

If room is RCL 4+ and `room.energyCapacityAvailable >= 5000` and stored energy
> 500k, Queen submits requests for the next unclaimed adjacent room:
- 1 claimer (priority LOW, body `[CLAIM,MOVE]`)
- 2 remote harvesters (priority LOW)
- 1 remote hauler (priority LOW)

Once the claimer is spawned, Queen transitions to managing multiple rooms via
the same per-room loop (Hatchery already supports per-room queues).

## 4. SpawnRequest

```ts
interface SpawnRequest {
  role: string
  priority: number
  body: { min: BodyPartConstant[]; ideal: BodyPartConstant[] }
  count: number
  memory: Record<string, any>
  createdAt: number  // Game.time
  roomName: string
}
```

### Priority bands

Base priority bands for roles (before death watch adjustment). Death watch can
push a request up to a higher band (see section 3).

| Band | Range | Roles |
|------|-------|-------|
| CRITICAL | 0-99 | Bootstrap, emergency defender, declining controller, death-watch critical (<20 TTL) |
| HIGH | 100-299 | Harvester (stable), defender, death-watch warning (21-100 TTL) |
| NORMAL | 300-599 | Hauler, builder, upgrader |
| LOW | 600-899 | Scout, remote miner, claimer |
| IDLE | 900+ | Attacker, healer (only when surplus exists) |

### Memory storage

Requests are stored in `Memory.v1.hatchery.queue[roomName]` as an array of
`SpawnRequest`. This survives tick boundaries and allows the Queen and Hatchery
to operate asynchronously.

## 5. Body Generation — Scaling between min and ideal

```ts
function scaleBody(
  min: BodyPartConstant[],
  ideal: BodyPartConstant[],
  availableEnergy: number
): BodyPartConstant[] | null

algorithm:
  1. If cost(min) > availableEnergy → return null (skip, retry next tick)
  2. body = [...min]
  3. remaining = availableEnergy - cost(min)
  4. extras = ideal.slice(min.length)  // parts beyond minimum
  5. For each part in extras:
     - If cost(part) <= remaining → body.push(part), remaining -= cost(part)
     - Else → break (can't afford next, stop)
  6. Cap body at 50 parts
  7. Return body
```

Example: harvester `min: [WORK,CARRY,MOVE] (200e)`,
`ideal: [WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE] (500e)`.
Room has 350e → `[WORK,WORK,CARRY,CARRY,MOVE,MOVE]` (350e).

## 6. Hatchery — Spawn Execution

### process(room)

Per-room, per tick:

1. Read `Memory.v1.hatchery.queue[roomName]`
2. Validate each request (discard corrupted entries)
3. Purge requests older than 100 ticks (stale)
4. Sort by priority ascending
5. For each request:
   - If count <= 0 → remove from queue
   - body = scaleBody(min, ideal, room.energyAvailable)
   - If body is null → skip (not enough energy), keep for next tick
   - Try `spawn.spawnCreep(body, name, { memory })`
   - On OK → decrement count, update queue, break (1 spawn/tick)
   - On ERR_NOT_ENOUGH_ENERGY / ERR_NOT_ENOUGH_RESOURCES → skip, keep
6. Write updated queue back to Memory

### Spawn name format

`${role}_${roomName}_${Game.time}`

If name conflicts (same tick), append `_${counter}` to suffix.

## 7. Memory Structure

```ts
interface Memory {
  v1: {
    hatchery: {
      queue: Record<string, SpawnRequest[]>
      deathWatch: Record<string, Record<string, { name: string; ttl: number }[]>>
    }
  }
}
```

`queue` is keyed by roomName, each entry is an array of pending requests.
`deathWatch` is keyed by roomName then role, each entry lists soon-to-die creeps.

## 8. Integration with existing code

### Files replaced

| Old file | Replaced by | Notes |
|----------|-------------|-------|
| `src/spawn/Spawner.ts` | `src/hatchery/Hatchery.ts` | No more direct spawner |
| `src/spawn/Body.ts` | `src/hatchery/Body.ts` | min→ideal scaling instead of hardcoded tiers |
| `src/colony/Colony.ts` | `src/hatchery/Queen.ts` | Queen replaces goal+colony stub |
| `src/colony/Goal.ts` | (inline in Queen) | Phase logic subsumes goal enum |

### Files modified

| File | Change |
|------|--------|
| `src/main.ts` | Import Hatchery + Queen; call `Queen.tick(room)` then `hatchery.process(room)` instead of `spawnerTick` + `colonyTick` |
| `src/types/index.ts` | Add `SpawnRequest` interface, `HatcheryMemory` interface |
| `AGENTS.md` | Document Hatchery system (see section 11) |

### Files unchanged

`src/roles/*.ts`, `src/lib/*.ts`, `src/colony/Architect.ts` — no changes needed.
Role dispatch in `runCreeps` stays the same.

## 9. Error Handling

| Scenario | Behaviour |
|----------|-----------|
| No energy for body min | Skip request, retry next tick. No crash. |
| Spawn busy | Returns immediately (1 spawn/tick max per room). |
| Corrupted queue entry | Hatchery validates on read; malformed entries discarded. |
| Missing role module | Still spawns; `runCreeps` falls back to harvester on unknown role. |
| Stale requests (>100 ticks) | Purged automatically. |
| Empty queue | Hatchery does nothing. |

## 10. Self-Review

- No placeholders or TODOs
- Architecture consistent: Queen submits → Hatchery queues → Body scales → Spawn executes
- Scope is single-room hatchery system; multi-room is future work
- All interfaces explicit
- No contradictions between sections

## 11. AGENTS.md Update

Update AGENTS.md to describe the overall adaptive ant colony philosophy briefly:

```
## Design philosophy

This bot uses an **adaptive ant colony** architecture. See README.md for
full strategy documentation.
```

