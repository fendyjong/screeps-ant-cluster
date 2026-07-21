# Graph Report - src/roomPlanner  (2026-07-22)

## Corpus Check
- Corpus is ~10,112 words - fits in a single context window. You may not need a graph.

## Summary
- 108 nodes · 187 edges · 12 communities (7 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Road Network Planning|Road Network Planning]]
- [[_COMMUNITY_Room Planner Core|Room Planner Core]]
- [[_COMMUNITY_Barrier Planning|Barrier Planning]]
- [[_COMMUNITY_Bunker Layout Data|Bunker Layout Data]]
- [[_COMMUNITY_Planner Memory Types|Planner Memory Types]]
- [[_COMMUNITY_Rampart Layout Helpers|Rampart Layout Helpers]]
- [[_COMMUNITY_Bunker Placement Search|Bunker Placement Search]]
- [[_COMMUNITY_Road Planner Memory|Road Planner Memory]]

## God Nodes (most connected - your core abstractions)
1. `RoomPlanner` - 43 edges
2. `RoadPlanner` - 22 edges
3. `BarrierPlanner` - 13 edges
4. `BasePlanner` - 6 edges
5. `StructureLayout` - 4 edges
6. `getAllStructureCoordsFromLayout()` - 4 edges
7. `bunkerLayout` - 4 edges
8. `translatePositions()` - 3 edges
9. `insideBunkerBounds()` - 3 edges
10. `_allBunkerCoords` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (12 total, 5 thin omitted)

### Community 4 - "Bunker Layout Data"
Cohesion: 0.27
Nodes (7): _allBunkerCoords, bunkerChargingSpots, bunkerCoordLookup, bunkerLayout, energyStructureOrder, quadrantFillOrder, reagentLabSpots

### Community 5 - "Planner Memory Types"
Cohesion: 0.28
Nodes (5): BuildingPlannerOutput, RoomPlan, RoomPlannerMemory, StructureLayout, StructureMap

### Community 7 - "Rampart Layout Helpers"
Cohesion: 0.33
Nodes (4): insideBunkerBounds(), BarrierPlannerMemory, getAllStructureCoordsFromLayout(), translatePositions()

## Knowledge Gaps
- **10 isolated node(s):** `BarrierPlannerMemory`, `BuildingPlannerOutput`, `StructureMap`, `RoomPlan`, `RoomPlannerMemory` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RoomPlanner` connect `Room Planner Core` to `Construction Cleanup`, `Planner Memory Types`, `Planner Lifecycle`, `Rampart Layout Helpers`, `Link Placement`, `Layout Parsing`, `Road Planner Memory`?**
  _High betweenness centrality (0.598) - this node is a cross-community bridge._
- **Why does `RoadPlanner` connect `Road Network Planning` to `Road Planner Memory`, `Planner Memory Types`?**
  _High betweenness centrality (0.336) - this node is a cross-community bridge._
- **Why does `BarrierPlanner` connect `Barrier Planning` to `Planner Memory Types`, `Rampart Layout Helpers`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **What connects `BarrierPlannerMemory`, `BuildingPlannerOutput`, `StructureMap` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._