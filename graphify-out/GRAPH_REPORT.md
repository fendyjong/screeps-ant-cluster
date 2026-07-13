# Graph Report - .  (2026-07-13)

## Corpus Check
- Corpus is ~48,271 words - fits in a single context window. You may not need a graph.

## Summary
- 304 nodes · 680 edges · 18 communities (14 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Terrain Carving Functions|Terrain Carving Functions]]
- [[_COMMUNITY_Body & Cost Utilities|Body & Cost Utilities]]
- [[_COMMUNITY_Bunker Layout & CPU Mgmt|Bunker Layout & CPU Mgmt]]
- [[_COMMUNITY_Pathing & Construction|Pathing & Construction]]
- [[_COMMUNITY_Architecture & Migration|Architecture & Migration]]
- [[_COMMUNITY_Builder Role|Builder Role]]
- [[_COMMUNITY_HUD & Main Loop|HUD & Main Loop]]
- [[_COMMUNITY_Defense Layout|Defense Layout]]
- [[_COMMUNITY_Colony Strategy|Colony Strategy]]
- [[_COMMUNITY_Memory Cleanup|Memory Cleanup]]
- [[_COMMUNITY_Hatchery Queen Dispatch|Hatchery Queen Dispatch]]
- [[_COMMUNITY_HUD Rendering|HUD Rendering]]
- [[_COMMUNITY_Hatchery Processing|Hatchery Processing]]
- [[_COMMUNITY_Rollup Config|Rollup Config]]
- [[_COMMUNITY_Debug Tools|Debug Tools]]
- [[_COMMUNITY_Build Configuration|Build Configuration]]
- [[_COMMUNITY_Tutorial Stub|Tutorial Stub]]

## God Nodes (most connected - your core abstractions)
1. `src/main.ts` - 19 edges
2. `moveTo()` - 17 edges
3. `Main Game Loop` - 17 edges
4. `loop()` - 15 edges
5. `planLayout()` - 14 edges
6. `getTerrainMatrix()` - 13 edges
7. `Goal Enum (ECONOMY/DEFEND/RECOVER)` - 12 edges
8. `getTerrainMatrix()` - 11 edges
9. `planLayout()` - 10 edges
10. `Queen Colony Evaluator` - 10 edges

## Surprising Connections (you probably didn't know these)
- `CPU Budget Gating (soft/hard ceilings)` --rationale_for--> `Main Game Loop`  [INFERRED]
  AGENTS.md → 127_0_0_1___21025/default/main.js
- `Adaptive Ant Colony Architecture` --rationale_for--> `Hatchery Spawn System`  [INFERRED]
  README.md → 127_0_0_1___21025/default/main.js
- `Adaptive Ant Colony Architecture` --rationale_for--> `Queen Colony Evaluator`  [INFERRED]
  README.md → 127_0_0_1___21025/default/main.js
- `Growth-Maximizing Principle` --rationale_for--> `Queen Colony Evaluator`  [INFERRED]
  README.md → 127_0_0_1___21025/default/main.js
- `Dynamic Spawn Balancing Design Spec` --conceptually_related_to--> `Queen Colony Evaluator`  [INFERRED]
  docs/superpowers/specs/2026-07-12-dynamic-spawn-balancing-design.md → 127_0_0_1___21025/default/main.js

## Hyperedges (group relationships)
- **Hatchery Spawn Pipeline** — queen, hatchery, priority_enum, body_scaling, ttl_death_watch, colony_phases, room_expansion [EXTRACTED 1.00]
- **Bunker Layout Pipeline** — architect, terrain_matrix, zone_carving, swap_plan, safety_checks, build_priorities, construct_site_creation, layout_recheck [EXTRACTED 1.00]
- **Pathing Subsystem** — pathing, terrain_matrix, cost_matrix_cache, traffic_heatmap, give_way [EXTRACTED 1.00]
- **Goal-driven control flow (main loop → Queen → Hatchery → roles)** — goal_driven_role_dispatch, src_main, src_hatchery_queen, src_hatchery_hatchery, src_role_harvester, src_role_hauler, src_role_builder, src_role_upgrader, goal_enum [INFERRED 0.90]
- **Terrain → Layout → Swap pipeline** — terrain_cost_matrix_cache, bunker_layout_type, swap_plan_type, src_lib_terrainmatrix, src_architect, swap_plan_execution, src_role_builder [INFERRED 0.90]
- **Queen evaluates → Request serializes → Hatchery spawns** — phase_based_targeting, hatchery_queue_system, src_hatchery_queen, src_hatchery_request, src_hatchery_body, src_hatchery_hatchery [INFERRED 0.90]

## Communities (18 total, 4 thin omitted)

### Community 0 - "Terrain Carving Functions"
Cohesion: 0.11
Nodes (36): carveCoreZone(), carveExtensions(), carveLabZone(), computeRampartPositions(), computeRoadPositions(), computeWallPositions(), findSpawnPosition(), getAdjacentWalkable() (+28 more)

### Community 1 - "Body & Cost Utilities"
Cohesion: 0.09
Nodes (33): BunkerLayout, SwapPlan, bodyCost(), deserializeBody(), PART_COST, scaleBody(), serializeBody(), ensureHatcheryMemory() (+25 more)

### Community 2 - "Bunker Layout & CPU Mgmt"
Cohesion: 0.07
Nodes (38): Architect Bunker Layout Planner, BUILD_PRIORITIES Array, Algorithmic Bunker Design Spec, Algorithmic Bunker Implementation Plan, Construction Site Creation from Swap Plan, Persistent Cost Matrix Cache, CPU Budget Gating (soft/hard ceilings), CPU Metrics Update in Creep Dispatch (+30 more)

### Community 3 - "Pathing & Construction"
Cohesion: 0.11
Nodes (30): BUILD_PRIORITIES, computeStructSig(), getOrBuildCostMatrix(), giveWayIfStuck(), isCreepStuck(), moveTo(), recordTraffic(), buildFromSwapPlan() (+22 more)

### Community 4 - "Architecture & Migration"
Cohesion: 0.13
Nodes (32): BunkerLayout interface, Goal-driven role dispatch pattern, Goal Enum (ECONOMY/DEFEND/RECOVER), Hatchery queue system (spawn request queue), HUD visual overlay (RoomVisual panels), screeps.com/default/main.js (legacy JS), Memory.v1 namespace + migration, Screeps Rebuild MVP Plan (+24 more)

### Community 5 - "Builder Role"
Cohesion: 0.15
Nodes (28): BUILD_PRIORITIES, buildFromSwapPlan(), buildStructures(), deliverToTowers(), dismantleStructure(), ensureCreepMemory(), findConstructionSite(), findDamagedStructure() (+20 more)

### Community 6 - "HUD & Main Loop"
Cohesion: 0.17
Nodes (19): computeRampartPositions(), computeStructSig(), DEFAULT_BODIES, drawBottomLeft(), drawBottomRight(), drawCreepLabels(), drawPanel(), drawTopLeft() (+11 more)

### Community 7 - "Defense Layout"
Cohesion: 0.2
Nodes (17): calculateCoverage(), carveCoreZone(), carveExtensions(), carveLabZone(), computeRoadPositions(), computeWallPositions(), findChokepoints(), findOptimalTowerPositions() (+9 more)

### Community 8 - "Colony Strategy"
Cohesion: 0.16
Nodes (15): Adaptive Ant Colony Architecture, Body Scaling (min-to-ideal), Colony Phase Detection (bootstrap/stabilize/critical_path/buildout/growth), Expansionist Colony Principle, Growth-Maximizing Principle, Hatchery Spawn System, Hatchery Design Spec, Hatchery Implementation Plan (+7 more)

### Community 9 - "Memory Cleanup"
Cohesion: 0.2
Nodes (11): cleanLegacyMemory(), createConstructionSites(), drainPendingRoads(), ensureMemoryNs(), ensurePathingMemory(), ensureRoomMemory(), isSafeToDestroy(), loop() (+3 more)

### Community 10 - "Hatchery Queen Dispatch"
Cohesion: 0.25
Nodes (9): computeTargets(), getPhaseConfig(), isEconomyLocked(), maybeRequestRoomExpansion(), request(), requestToMemory(), scanCreeps(), serializeBody() (+1 more)

### Community 11 - "HUD Rendering"
Cohesion: 0.57
Nodes (7): drawBottomLeft(), drawBottomRight(), drawCreepLabels(), drawPanel(), drawTopLeft(), drawTopRight(), run()

### Community 12 - "Hatchery Processing"
Cohesion: 0.33
Nodes (6): bodyCost(), deserializeBody(), ensureHatcheryMemory(), process(), requestFromMemory(), scaleBody()

## Knowledge Gaps
- **47 isolated node(s):** `SERVER_DIRS`, `STRUCTURE_COSTS`, `RoleTargets`, `CreepMemory`, `LayoutMemory` (+42 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Main Game Loop` connect `Bunker Layout & CPU Mgmt` to `Colony Strategy`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `Goal Enum (ECONOMY/DEFEND/RECOVER)` connect `Architecture & Migration` to `Bunker Layout & CPU Mgmt`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `src/main.ts` (e.g. with `Hatchery queue system (spawn request queue)` and `BunkerLayout interface`) actually correct?**
  _`src/main.ts` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `SERVER_DIRS`, `STRUCTURE_COSTS`, `RoleTargets` to the rest of the system?**
  _47 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Terrain Carving Functions` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Body & Cost Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Bunker Layout & CPU Mgmt` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._