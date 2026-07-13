# Algorithmic Zone-Carving Bunker — Design Spec

**Date:** 2026-07-13

## Overview

Replace the current `planLayout()` in `Architect.ts` with a zone-carving algorithm that analyzes room terrain and produces a full RCL8 bunker layout adaptively. Every room gets a different layout fitted to its walkable terrain, but all follow the same zoning rules.

The existing swap pipeline (`planSwap` → `Builder.ts` execution) is unchanged — the zone carver is a drop-in replacement for `planLayout()`.

## Architecture

```
main.ts:
  planLayout(room)         ← zone carver replaces this
    ↓ BunkerLayout (expanded)
  planSwap(room, layout)   ← extended to diff all new types
    ↓ SwapPlan (destroy[], build[], state)
  Builder.ts executes      ← unchanged
```

## Expands `BunkerLayout`

```ts
interface BunkerLayout {
  anchor: RoomPosition;                    // spawn position
  spawn: RoomPosition;
  storage: RoomPosition;
  terminal: RoomPosition;
  factory: RoomPosition;
  powerSpawn: RoomPosition;
  nuker: RoomPosition;
  observer: RoomPosition;
  labs: RoomPosition[];                    // all lab positions
  extensions: RoomPosition[];              // up to 60
  towers: RoomPosition[];
  linkSpawn: RoomPosition;                 // inbound link (spawn side)
  linkController: RoomPosition;            // outbound link (controller side)
  linkLab: RoomPosition;                   // mineral link (lab side)
  ramparts: RoomPosition[];
  walls: RoomPosition[];
  roads: RoomPosition[];
}
```

## Zone Carving Algorithm

### Phase 1: Get Anchor

Use existing `findSpawnPosition(room.name)` — scans the cached terrain matrix (`getTerrainMatrix`) for the most central walkable tile. This is the bunker center. No additional room scanning needed.

### Phase 2: Carve Core Zone

Claim a block of walkable tiles around the anchor. Place structures by priority:

1. Spawn at anchor
2. Storage adjacent to spawn
3. Terminal adjacent to storage
4. Factory, power spawn, nuker, observer packed tight around them

All core structures get roads between them. Result is a dense ~5x5 cluster. Exact shape depends on which tiles are walkable.

### Phase 3: Carve Lab Zone

BFS from core perimeter. Find the longest straight or L-shaped corridor of walkable tiles. Place labs in a 3-wide grid:
- If corridor length ≥ 3: 3-wide rows for reactions
- If corridor is L-shaped: fill the L
- Place linkLab at one end

### Phase 4: Carve Extensions

BFS outward from core+lab perimeter. Place extensions on every unclaimed walkable tile in BFS order until 60 placed or space exhausted. Extensions naturally fill in expanding rings around the bunker.

### Phase 5: Place Perimeter

- **Towers**: reuse `findOptimalTowerPositions(room.name, N)` — picks positions that maximize coverage. Place at edges of the bunker footprint.
- **Ramparts**: core structures get ramparts (spawn, storage, terminal, factory, power spawn, nuker, observer, labs, towers). Extensions do not — too expensive to maintain.
- **Walls**: fill perimeter gaps between ramparts and natural walls to create a continuous barrier.
- **Entrances**: leave 1-tile-wide gaps at perimeter edges, always within tower coverage.

### Phase 6: Road Network

Place roads along shortest walkable paths between:
- Core → controller (upgrader path)
- Core → lab zone (mineral transport)  
- Core → extension zones (energy distribution)
- Perimeter ring road inside walls (defender patrol)

## planSwap Changes

Extend existing `planSwap()` to diff the following structure types against current room state:

| Structure | Action |
|-----------|--------|
| spawn, storage, terminal, factory, powerSpawn, nuker, observer | destroy + rebuild if out of position (gated by `isSafeToDestroy`) |
| labs | destroy + rebuild if out of position (only if all labs can relocate) |
| extensions | destroy + rebuild one at a time, energy-gated |
| towers | destroy + rebuild (existing logic) |
| links | destroy + rebuild if out of position |
| ramparts | add missing only — no destroy (decay handles removal) |
| walls | add missing only — no destroy |
| roads | add missing only — roads can overlap safely |

## Files Changed

| File | Change |
|------|--------|
| `src/colony/Architect.ts` | Replace `planLayout()` with zone carver. Expand `BunkerLayout`. Extend `planSwap()` for new types. |
| `src/types/index.ts` | Update `LayoutMemory` if needed. |
| `main.js` | Compiled output (regenerated) |