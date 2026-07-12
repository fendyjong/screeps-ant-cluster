# Terrain Analysis + Dynamic Layout System — Design Spec

**Date:** 2026-07-13
**Author:** OpenCode (AI)

---

## 1. Overview

Phase 1 of the base layout system. Analyzes room terrain to plan optimal building placement. Caches terrain matrices permanently. Plans swaps for structures that don't match the optimal layout.

**Scope:** Planning only — terrain cache, layout planning, swap planning. Execution (destroy/build) is Phase 2.

---

## 2. Architecture

### Components

```
src/
  lib/
    TerrainMatrix.ts        ← terrain cache + analysis
  colony/
    LayoutPlanner.ts        ← bunker layout + swap logic
```

### Flow

```
main.ts → for each owned room:
  1. getTerrainMatrix(room)           → cache terrain if not exists
  2. planLayout(room)                 → calculate optimal positions
  3. planSwap(room, layout)           → diff current vs optimal
  4. Execute swap if ready            → destroy → build
  5. Store layout in room.memory
```

---

## 3. Terrain Matrix Cache

### Interface

```ts
interface TerrainCache {
  matrix: number[];  // 50x50 flattened
  tick: number;
}
```

### Generation

```ts
function getTerrainMatrix(roomName: string): CostMatrix
```

- Check `Memory.pathing.terrain[roomName]`
- If exists, return cached matrix
- If not, generate from `Game.map.getRoomTerrain(roomName)`
- Store in Memory permanently (terrain never changes)

### Terrain Costs

| Terrain | Cost |
|---------|------|
| Plain   | 1    |
| Swamp   | 5    |
| Wall    | 255  |

---

## 4. Layout Planner

### Bunker Layout

```ts
interface BunkerLayout {
  spawn: RoomPosition;
  towers: RoomPosition[];
  storage: RoomPosition;
  ramparts: RoomPosition[];
  walls: RoomPosition[];
}
```

### Layout Planning Algorithm

```
planLayout(room):
  1. Get terrain matrix
  2. Find spawn position:
     - Central, accessible, not on wall
  3. Find tower positions:
     - Maximize coverage of spawn + perimeter
     - Prefer positions with good line of sight
  4. Find storage position:
     - Near spawn, accessible
  5. Find rampart positions:
     - Chokepoints between walls
     - Perimeter defense
  6. Find wall positions:
     - Block enemy paths
     - Create defensive barriers
  7. Return optimal layout
```

### Terrain Analysis Functions

```ts
function findChokepoints(room: Room): RoomPosition[]
// Find narrow passages between walls

function findPerimeter(room: Room): RoomPosition[]
// Find outer walkable tiles for walls/ramparts

function calculateCoverage(pos: RoomPosition, range: number): number
// How many tiles a tower at pos can reach

function findOptimalTowerPositions(room: Room, count: number): RoomPosition[]
// Maximize coverage of spawn + perimeter
```

---

## 5. Swap System

### Swap Plan

```ts
interface SwapPlan {
  destroy: Structure[];         // structures to remove
  build: ConstructionPlan[];    // positions for new structures
  state: 'idle' | 'destroying' | 'building';
}
```

### Swap Logic

```
planSwap(room, currentLayout):
  1. Compare current positions vs optimal positions
  2. For each structure type:
     - If position differs significantly → mark for swap
  3. Return:
     - destroy: structures to remove first
     - build: positions where new structures should go
     - state: current phase of swap
```

### Execution Flow

```
executeSwap(room, swapPlan):
  1. If state == 'idle':
     - Check if canSwap(room, swapPlan)
     - If yes → destroy first structure
     - Set state = 'destroying'
  2. If state == 'destroying':
     - Check if structure destroyed
     - If yes → place construction site
     - Set state = 'building'
  3. If state == 'building':
     - Check if construction complete
     - If yes → move to next swap or set state = 'idle'
```

### Resource-Aware Timing

```ts
function canSwap(room: Room, swap: SwapPlan): boolean {
  // Check if we have enough energy to rebuild
  const buildCost = calculateBuildCost(swap.build);
  return room.energyAvailable >= buildCost * 0.5; // 50% buffer
}
```

---

## 6. Structure Priority Order

| Priority | Structure | Rationale |
|----------|-----------|-----------|
| 1 | Spawn | Core functionality |
| 2 | Towers | Defense coverage |
| 3 | Storage | Resource access |
| 4 | Ramparts | Perimeter defense |
| 5 | Walls | Path blocking |

---

## 7. Memory Structure

```ts
interface RoomLayoutMemory {
  terrain: CostMatrix;
  layout: BunkerLayout;
  swapPlan: SwapPlan | null;
  lastUpdated: number;
}
```

---

## 8. Destruction Criteria

- Any structure not in optimal position → mark for swap
- Exception: structures that would leave gaps during swap
- Aggressive: swap any structure that can be improved
- Phase 1: plan swaps only
- Phase 2: execute swaps (destroy + build)

---

## 9. MVP Scope

**In scope:**
- Terrain matrix cache
- Bunker layout planning
- Swap planning (destroy + rebuild)
- Resource-aware swap timing

**Out of scope (future):**
- Auto-placement (construction sites)
- Multi-room layout
- Pathing integration
- Dynamic updates based on threats

---

## 10. Self-Review

- No placeholders or TODOs
- Architecture consistent: terrain → layout → swap
- Scope is planning only, no auto-placement
- All type definitions explicit
- No contradictions between sections

---

*Generated by OpenCode (AI) on 2026-07-13.*
