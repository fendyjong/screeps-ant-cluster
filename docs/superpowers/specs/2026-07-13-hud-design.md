# Four-Corner RoomVisual HUD — Design Spec

**Date:** 2026-07-13

## Overview

RoomVisual HUD drawn on each owned room's map. Four panels positioned in the four corners of the 50x50 grid. Redrawn every 25 ticks to save CPU. Each panel has a semi-transparent black background rect for readability.

## Architecture

Single file: `src/lib/HUD.ts`

```ts
export function run(room: Room): void {
  if (Game.time % 25 !== 0) return
  const vis = new RoomVisual(room.name)
  drawTopLeft(vis, room)
  drawTopRight(vis, room)
  drawBottomLeft(vis, room)
  drawBottomRight(vis, room)
}
```

Called from `main.ts` in the room loop, after `runCreeps`.

## Panel Layout

### Top-Left (x=0.5, y=0.5) — Colony Identity

```
E1S8  RCL 6  STABILIZE
Sources: S1(2) S2(1)  ○○○○○● 95%
Creeps: 24/30  idle: 5 (20%)
CPU: 4.2ms
```

**Data sources:**
- Room name, RCL: `room.name`, `room.controller.level`
- Phase: `room.memory.layout?.bunker` exists → `'SETTLED'` else `'BOOTSTRAP'`
- Sources: `room.find(FIND_SOURCES).length`, harvesters per source via `Memory.creeps` filtered by `role === 'harvester' && targetSourceId === source.id`
- Source fill %: `source.energy / source.energyCapacity` averaged
- Creep count: `_.filter(Game.creeps, c => c.memory.roomName === room.name).length`
- Target capacity: from spawn Spawner target counts
- Idle: creeps with `_stuckTicks > 5` (caught by pathing system in Pathing.ts)
- CPU: `Game.cpu.getUsed()` delta from start of room processing

### Top-Right (x=35, y=0.5) — Energy Economy

```
Energy       42,300 / 300,000
Income       +12.4/t
Spend        -8.1/t
Stockpile    285,000
```

**Data sources:**
- Energy: `room.energyAvailable` / `room.energyCapacityAvailable`
- Income: energy harvested in last N ticks (rolling average, stored in memory)
- Spend: energy spent on spawn/build in last N ticks (rolling average)
- Stockpile: `room.storage?.store[RESOURCE_ENERGY] || 0`

Rolling averages computed in `HUD.ts` and stored in `Memory.v1.hud.income[roomName]` as a ring buffer (last 100 ticks).

### Bottom-Left (x=0.5, y=35) — Defense & Health

```
Towers: ■■■□□ 3/5  online
Walls:  ██████ 95%  Ramparts: 85%
Hostiles: 0 in room
Last threat: 1,240 ticks ago
```

**Data sources:**
- Towers: `room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER })` — count total, count with energy > 0
- Walls: average `hits / hitsMax` of all walls in room
- Ramparts: average `hits / hitsMax` of all ramparts in room
- Hostiles: `room.find(FIND_HOSTILE_CREEPS).length`
- Last threat: `Memory.v1.hud.lastThreat[room.name]` or `Game.time` if never threatened. Updated by HUD when hostiles detected.

### Bottom-Right (x=35, y=35) — Construction & Activity

```
Swap: destroying → building
Sites: 5 pending, 0 active
Roads pending: 3
Next replan: 88 ticks
```

**Data sources:**
- Swap state: `room.memory.layout?.swap?.state` ('idle' | 'destroying' | 'building')
- Sites: `room.find(FIND_MY_CONSTRUCTION_SITES).length`
- Roads pending: `Memory.v1.pathing?.pendingRoads?.filter(r => r.roomName === room.name).length`
- Next replan: `100 - (Game.time % 100)` ticks until next layout replan

## Creep Labels

Drawn every tick (not gated at 25) — cheap single `RoomVisual.text()` per creep:

```
[H→S1]  green  (harvester)
[U→CTRL] purple (upgrader)
[B→ext] yellow (builder)
[T→stor] cyan   (hauler)
```

Format: `[action→target]`. Action from `creep.memory.lastTask` or inferred from creep state. Target from `creep.memory.targetSourceId` or `creep.memory.targetId`.

Position: `vis.text(label, creep.pos.x, creep.pos.y - 0.5, { fontSize: 5, stroke: '#000', strokeWidth: 0.15 })`.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/HUD.ts` | Create — four panel functions + creep labels |
| `src/main.ts` | Import and call `HUD.run(room)` in room loop |
| `main.js` | Compiled output (regenerated) |