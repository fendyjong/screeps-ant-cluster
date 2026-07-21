# Dynamic Zone Planner Design

## Goal

Replace template-first base planning with terrain-first dynamic zone planning, while preserving the existing `StructureMap` output consumed by `RoomPlanner`, `RoadPlanner`, `BarrierPlanner`, and colony code.

## Problem

Current bunker planning requires a large fixed layout to fit. Rooms with useful wall pockets, corridors, split plains, or awkward controller/source geometry can be rejected or receive weak anchors because the planner asks where the template fits instead of what the terrain should become.

## Strategy

Implement dynamic planning in stages. First stage creates a new planner module that scores terrain and produces a candidate structure map for core infrastructure. It does not remove bunker planning yet. The existing bunker path remains fallback until dynamic maps are complete and stable.

## Criteria

Balanced farm logistics + defense means lower total score is better:

- Logistics: short, low-swamp paths from storage/core to sources and controller.
- Defense: low min-cut rampart count and fewer exposed gates.
- Capacity: enough protected buildable tiles for future structures.
- Traffic: core roads avoid one-tile bottlenecks except deliberate defended gates.
- Offense staging: reserve protected positions near exits/chokes for defenders.

Initial scoring weights:

```text
total = logistics * 0.45 + defense * 0.35 + capacity * 0.15 + terrain * 0.05
```

## Architecture

Add `src/roomPlanner/DynamicPlanner.ts`.

Responsibilities:

- Build walkable/buildable tile lists from room terrain.
- Generate candidate core positions near source/controller centroid.
- Score candidates by logistics path cost, min-cut size, local build capacity, and terrain penalties.
- Produce a small `StructureMap` containing storage, spawn, tower, road, and extension seeds for early RCL maps.
- Return score details for console/debug visuals later.

Do not modify `RoomPlanner.finalize()` in the first step. Integration will happen after candidate maps can compile and be inspected.

## Data Flow

```text
Room terrain + sources + controller
  -> DynamicPlanner.plan(room)
  -> DynamicPlanCandidate
  -> candidate.map: StructureMap
  -> later copied into RoomPlanner.memory.mapsByLevel
```

## First Deliverable

The first implementation creates a usable planner foundation:

- `DynamicPlanner.plan(room)` returns best candidate or `undefined`.
- Candidate has `anchor`, `map`, `score`, `ramparts`, `roads`, and `extensionFields`.
- `npm run build` passes.
- No live room behavior changes yet.

## Non-Goals

- Do not delete bunker layout.
- Do not auto-finalize dynamic plans.
- Do not place labs/factory/nuker/power spawn in first deliverable.
- Do not rewrite road or barrier planners.

## Future Steps

After foundation works:

1. Add console command or visual mode to preview dynamic candidates.
2. Generate complete RCL maps.
3. Add `RoomPlanner` integration behind a memory flag.
4. Retire bunker template only after dynamic maps survive real-room validation.
