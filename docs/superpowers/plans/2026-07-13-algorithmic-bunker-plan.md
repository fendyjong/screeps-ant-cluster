# Algorithmic Zone-Carving Bunker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `planLayout()` with a zone-carving algorithm that produces a full RCL8 bunker layout adapted to room terrain.

**Architecture:** Single source file change (`src/colony/Architect.ts`). Zone carver is a set of private helper functions orchestrated by `planLayout()`. Expanded `BunkerLayout` interface feeds into the existing `planSwap` → `Builder.ts` pipeline unchanged.

**Tech Stack:** TypeScript, Screeps globals, existing terrain matrix cache

---

### Task 1: Expand BunkerLayout interface and extend planSwap

**Files:**
- Modify: `src/colony/Architect.ts`

- [ ] **Step 1: Expand BunkerLayout interface**

Replace the existing `BunkerLayout` interface:

```ts
export interface BunkerLayout {
  anchor: RoomPosition;
  spawn: RoomPosition;
  storage: RoomPosition;
  terminal: RoomPosition;
  factory: RoomPosition;
  powerSpawn: RoomPosition;
  nuker: RoomPosition;
  observer: RoomPosition;
  labs: RoomPosition[];
  extensions: RoomPosition[];
  towers: RoomPosition[];
  linkSpawn: RoomPosition;
  linkController: RoomPosition;
  linkLab: RoomPosition;
  ramparts: RoomPosition[];
  walls: RoomPosition[];
  roads: RoomPosition[];
}
```

- [ ] **Step 2: Add RAMPART and ROAD to BUILD_PRIORITIES**

Add to the `BUILD_PRIORITIES` array after `STRUCTURE_EXTENSION`:

```ts
  STRUCTURE_ROAD,
  STRUCTURE_RAMPART,
  STRUCTURE_WALL,
```

Replace the existing `BUILD_PRIORITIES` with the expanded version (roads and ramparts at end since they're last-priority builds):

```ts
export const BUILD_PRIORITIES: StructureConstant[] = [
  STRUCTURE_SPAWN,
  STRUCTURE_STORAGE,
  STRUCTURE_TOWER,
  STRUCTURE_LINK,
  STRUCTURE_TERMINAL,
  STRUCTURE_LAB,
  STRUCTURE_FACTORY,
  STRUCTURE_OBSERVER,
  STRUCTURE_NUKER,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_EXTRACTOR,
  STRUCTURE_EXTENSION,
  STRUCTURE_ROAD,
  STRUCTURE_RAMPART,
  STRUCTURE_WALL,
];
```

- [ ] **Step 3: Extend planSwap to diff all new structure types**

Append to the existing `planSwap` function after the tower loop (after line 242). Add checks for each new structure type:

```ts
  // Check terminal
  const existingTerminal = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TERMINAL
  })[0];
  if (existingTerminal && !existingTerminal.pos.isEqualTo(layout.terminal)) {
    if (isSafeToDestroy(room, existingTerminal)) {
      destroy.push(existingTerminal.id);
      build.push({ pos: layout.terminal, structureType: STRUCTURE_TERMINAL });
    }
  }

  // Check factory
  const existingFactory = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_FACTORY
  })[0];
  if (existingFactory && !existingFactory.pos.isEqualTo(layout.factory)) {
    if (isSafeToDestroy(room, existingFactory)) {
      destroy.push(existingFactory.id);
      build.push({ pos: layout.factory, structureType: STRUCTURE_FACTORY });
    }
  }

  // Check power spawn
  const existingPowerSpawn = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_POWER_SPAWN
  })[0];
  if (existingPowerSpawn && !existingPowerSpawn.pos.isEqualTo(layout.powerSpawn)) {
    if (isSafeToDestroy(room, existingPowerSpawn)) {
      destroy.push(existingPowerSpawn.id);
      build.push({ pos: layout.powerSpawn, structureType: STRUCTURE_POWER_SPAWN });
    }
  }

  // Check nuker
  const existingNuker = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_NUKER
  })[0];
  if (existingNuker && !existingNuker.pos.isEqualTo(layout.nuker)) {
    if (isSafeToDestroy(room, existingNuker)) {
      destroy.push(existingNuker.id);
      build.push({ pos: layout.nuker, structureType: STRUCTURE_NUKER });
    }
  }

  // Check observer
  const existingObserver = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_OBSERVER
  })[0];
  if (existingObserver && !existingObserver.pos.isEqualTo(layout.observer)) {
    if (isSafeToDestroy(room, existingObserver)) {
      destroy.push(existingObserver.id);
      build.push({ pos: layout.observer, structureType: STRUCTURE_OBSERVER });
    }
  }

  // Check labs
  const existingLabs = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_LAB
  });
  const labPosSet = new Set(layout.labs.map(p => p.x + ',' + p.y));
  for (const lab of existingLabs) {
    if (!labPosSet.has(lab.pos.x + ',' + lab.pos.y)) {
      if (isSafeToDestroy(room, lab)) {
        destroy.push(lab.id);
      }
    }
  }
  for (const labPos of layout.labs) {
    const exists = existingLabs.some(l => l.pos.isEqualTo(labPos));
    if (!exists) {
      build.push({ pos: labPos, structureType: STRUCTURE_LAB });
    }
  }

  // Check links
  const existingLinks = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_LINK
  });
  const linkPositions = [layout.linkSpawn, layout.linkController, layout.linkLab].filter(isWalkablePos);
  const linkPosSet = new Set(linkPositions.map(p => p.x + ',' + p.y));
  for (const link of existingLinks) {
    if (!linkPosSet.has(link.pos.x + ',' + link.pos.y)) {
      if (isSafeToDestroy(room, link)) {
        destroy.push(link.id);
      }
    }
  }
  for (const linkPos of linkPositions) {
    const exists = existingLinks.some(l => l.pos.isEqualTo(linkPos));
    if (!exists) {
      build.push({ pos: linkPos, structureType: STRUCTURE_LINK });
    }
  }

  // Check extensions
  const existingExtensions = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_EXTENSION
  });
  // Only destroy extensions if we have capacity to rebuild
  const extPosSet = new Set(layout.extensions.map(p => p.x + ',' + p.y));
  for (const ext of existingExtensions) {
    if (!extPosSet.has(ext.pos.x + ',' + ext.pos.y)) {
      if (isSafeToDestroy(room, ext)) {
        destroy.push(ext.id);
      }
    }
  }
  for (const extPos of layout.extensions) {
    const exists = existingExtensions.some(e => e.pos.isEqualTo(extPos));
    if (!exists) {
      build.push({ pos: extPos, structureType: STRUCTURE_EXTENSION });
    }
  }
```

Add helper function at bottom of file:

```ts
function isWalkablePos(pos: RoomPosition): boolean {
  return pos !== undefined && pos.x >= 0 && pos.y >= 0;
}
```

- [ ] **Step 4: Verify compilation**

Run: `npx rollup -c rollup.config.mjs`
Expected: No new errors, `main.js` regenerated.

- [ ] **Step 5: Commit**

```bash
git add src/colony/Architect.ts main.js
git commit -m "feat: expand BunkerLayout interface and extend planSwap for all structure types"
```

---

### Task 2: Implement zone carver algorithm

**Files:**
- Modify: `src/colony/Architect.ts`

Add the following functions before `planLayout()`. Keep existing `findSpawnPosition`, `findStoragePosition`, `findRampartPositions`, `findWallPositions` — they're still useful as building blocks.

- [ ] **Step 1: Add helper to find adjacent walkable tiles**

```ts
function getAdjacentWalkable(matrix: CostMatrix, pos: RoomPosition): RoomPosition[] {
  const dirs = [
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
    { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
  ];
  const result: RoomPosition[] = [];
  for (const d of dirs) {
    const x = pos.x + d.dx;
    const y = pos.y + d.dy;
    if (isWalkable(matrix, x, y)) {
      result.push(new RoomPosition(x, y, pos.roomName));
    }
  }
  return result;
}
```

- [ ] **Step 2: Add core zone carver**

```ts
function carveCoreZone(room: Room, anchor: RoomPosition, matrix: CostMatrix): BunkerLayout {
  const roomName = room.name;
  const layout = {} as BunkerLayout;
  layout.anchor = anchor;
  layout.spawn = anchor;

  // Claim anchor and all adjacent walkable tiles as the core footprint
  const coreTiles = new Map<string, RoomPosition>();
  coreTiles.set(anchor.x + ',' + anchor.y, anchor);

  // BFS to claim up to ~25 core tiles (5x5 area)
  const queue = [anchor];
  while (queue.length > 0 && coreTiles.size < 25) {
    const current = queue.shift()!;
    for (const adj of getAdjacentWalkable(matrix, current)) {
      const key = adj.x + ',' + adj.y;
      if (!coreTiles.has(key)) {
        coreTiles.set(key, adj);
        queue.push(adj);
      }
    }
  }

  // Assign core structures: sort core tiles by distance from anchor
  const sortedTiles = Array.from(coreTiles.values())
    .sort((a, b) => a.getRangeTo(anchor) - b.getRangeTo(anchor));

  // Place storage, terminal, factory adjacent to spawn
  const adjToSpawn = sortedTiles.filter(t => t.getRangeTo(anchor) === 1);
  layout.storage = adjToSpawn[0] || sortedTiles[1];
  layout.terminal = adjToSpawn[1] || sortedTiles[2];
  layout.factory = adjToSpawn[2] || sortedTiles[3];
  layout.powerSpawn = adjToSpawn[3] || sortedTiles[4];
  layout.nuker = sortedTiles[5] || sortedTiles[6];
  layout.observer = sortedTiles[6] || sortedTiles[7];

  // Link near spawn
  layout.linkSpawn = sortedTiles[8] || sortedTiles[7];

  // Initialize arrays
  layout.labs = [];
  layout.extensions = [];
  layout.towers = [];
  layout.ramparts = [];
  layout.walls = [];
  layout.roads = [];
  layout.linkController = layout.linkSpawn;
  layout.linkLab = layout.linkSpawn;

  return layout;
}
```

- [ ] **Step 3: Add lab zone carver**

```ts
function carveLabZone(room: Room, matrix: CostMatrix, coreTiles: Set<string>): RoomPosition[] {
  const roomName = room.name;
  const labs: RoomPosition[] = [];
  const claimed = new Set(coreTiles);

  // BFS from core to find adjacent walkable tiles
  const queue: RoomPosition[] = [];
  for (const key of coreTiles) {
    const [x, y] = key.split(',').map(Number);
    queue.push(new RoomPosition(x, y, roomName));
  }

  const candidates: RoomPosition[] = [];
  const visited = new Set<string>();
  while (queue.length > 0 && candidates.length < 30) {
    const current = queue.shift()!;
    for (const adj of getAdjacentWalkable(matrix, current)) {
      const key = adj.x + ',' + adj.y;
      if (claimed.has(key) || visited.has(key)) continue;
      visited.add(key);
      candidates.push(adj);
      queue.push(adj);
    }
  }

  // Sort by Manhattan distance from core edge, pick first 15 for labs
  candidates.sort((a, b) => {
    const distA = a.getRangeTo(new RoomPosition(25, 25, roomName));
    const distB = b.getRangeTo(new RoomPosition(25, 25, roomName));
    return distA - distB;
  });

  for (let i = 0; i < Math.min(15, candidates.length); i++) {
    labs.push(candidates[i]);
    claimed.add(candidates[i].x + ',' + candidates[i].y);
  }

  return labs;
}
```

- [ ] **Step 4: Add extension and perimeter placement**

```ts
function carveExtensions(
  room: Room, matrix: CostMatrix,
  coreTiles: Set<string>, labTiles: Set<string>
): RoomPosition[] {
  const roomName = room.name;
  const claimed = new Set<string>();
  for (const k of coreTiles) claimed.add(k);
  for (const k of labTiles) claimed.add(k);

  const extensions: RoomPosition[] = [];
  const maxExtensions = room.controller ? Math.min(60, CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0) : 0;

  // BFS outward from core+lab perimeter
  const queue: RoomPosition[] = [];
  for (const key of claimed) {
    const [x, y] = key.split(',').map(Number);
    for (const adj of getAdjacentWalkable(matrix, new RoomPosition(x, y, roomName))) {
      const k = adj.x + ',' + adj.y;
      if (!claimed.has(k)) {
        queue.push(adj);
        claimed.add(k);
      }
    }
  }

  while (queue.length > 0 && extensions.length < maxExtensions) {
    const pos = queue.shift()!;
    extensions.push(pos);

    // Enqueue neighbors for next ring
    for (const adj of getAdjacentWalkable(matrix, pos)) {
      const k = adj.x + ',' + adj.y;
      if (!claimed.has(k)) {
        queue.push(adj);
        claimed.add(k);
      }
    }
  }

  return extensions;
}

function placeTowers(room: Room, matrix: CostMatrix, extensions: RoomPosition[]): RoomPosition[] {
  // Reuse existing optimal tower finder but prefer edge of extension zone
  const towerCount = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][Math.min(room.controller ? room.controller.level : 1, 8)] || 0;
  return findOptimalTowerPositions(room.name, towerCount);
}

function computeRampartPositions(core: BunkerLayout, labs: RoomPosition[], extensions: RoomPosition[]): RoomPosition[] {
  const ramparts: RoomPosition[] = [];

  // Core structures get ramparts
  const corePositions = [
    core.spawn, core.storage, core.terminal, core.factory,
    core.powerSpawn, core.nuker, core.observer, core.linkSpawn
  ];
  for (const pos of corePositions) {
    if (pos && isWalkablePos(pos)) ramparts.push(pos);
  }

  // Labs get ramparts
  for (const pos of labs) ramparts.push(pos);

  // Towers get ramparts
  for (const pos of core.towers) {
    if (pos && isWalkablePos(pos)) ramparts.push(pos);
  }

  return ramparts;
}

function computeWallPositions(room: Room, matrix: CostMatrix, allStructureKeys: Set<string>): RoomPosition[] {
  const walls: RoomPosition[] = [];
  const roomName = room.name;

  // Find perimeter tiles around the bunker footprint
  for (const key of allStructureKeys) {
    const [x, y] = key.split(',').map(Number);
    for (const adj of getAdjacentWalkable(matrix, new RoomPosition(x, y, roomName))) {
      const k = adj.x + ',' + adj.y;
      if (!allStructureKeys.has(k)) {
        walls.push(adj);
      }
    }
  }

  return walls.slice(0, 50); // Limit walls
}

function computeRoadPositions(
  room: Room, matrix: CostMatrix,
  core: BunkerLayout, extensions: RoomPosition[]
): RoomPosition[] {
  const roads: RoomPosition[] = [];
  const roomName = room.name;

  // Simple road: place on every extension and lab for now
  // (extensions are placed in BFS order, roads naturally connect them)
  for (const ext of extensions) {
    roads.push(ext);
  }

  return roads;
}
```

- [ ] **Step 5: Replace `planLayout()` with zone carver orchestration**

Replace the existing `planLayout` function:

```ts
export function planLayout(room: Room): BunkerLayout {
  const matrix = getTerrainMatrix(room.name);
  const anchor = findSpawnPosition(room.name);

  // Phase 1: Core zone
  const core = carveCoreZone(room, anchor, matrix);

  // Collect core tile keys explicitly
  const coreKeys = new Set<string>();
  coreKeys.add(core.spawn.x + ',' + core.spawn.y);
  coreKeys.add(core.storage.x + ',' + core.storage.y);
  coreKeys.add(core.terminal.x + ',' + core.terminal.y);
  coreKeys.add(core.factory.x + ',' + core.factory.y);
  coreKeys.add(core.powerSpawn.x + ',' + core.powerSpawn.y);
  coreKeys.add(core.nuker.x + ',' + core.nuker.y);
  coreKeys.add(core.observer.x + ',' + core.observer.y);
  coreKeys.add(core.linkSpawn.x + ',' + core.linkSpawn.y);

  // Phase 2: Lab zone
  const labs = carveLabZone(room, matrix, coreKeys);
  core.labs = labs;

  const labKeys = new Set(labs.map(p => p.x + ',' + p.y));

  // Phase 3: Extensions
  const extensions = carveExtensions(room, matrix, coreKeys, labKeys);
  core.extensions = extensions;

  // Phase 4: Towers
  core.towers = placeTowers(room, matrix, extensions);

  // Phase 5: Ramparts + walls
  const allKeys = new Set<string>();
  for (const k of coreKeys) allKeys.add(k);
  for (const k of labKeys) allKeys.add(k);
  for (const ext of extensions) allKeys.add(ext.x + ',' + ext.y);
  for (const t of core.towers) allKeys.add(t.x + ',' + t.y);

  core.ramparts = computeRampartPositions(core, labs, extensions);
  core.walls = computeWallPositions(room, matrix, allKeys);

  // Phase 6: Roads
  core.roads = computeRoadPositions(room, matrix, core, extensions);

  // Links
  core.linkController = new RoomPosition(
    room.controller ? room.controller.pos.x : 25,
    room.controller ? room.controller.pos.y + 1 : 25,
    room.name
  );
  core.linkLab = labs.length > 0 ? labs[Math.floor(labs.length / 2)] : core.linkSpawn;

  return core;
}
```

- [ ] **Step 7: Add CONTROLLER_STRUCTURES import**

Architect.ts likely doesn't import `CONTROLLER_STRUCTURES`. Add it. If `CONTROLLER_STRUCTURES` is a Screeps global, no import needed. Otherwise add to top:

```ts
import { getTerrainMatrix, isWalkable, findOptimalTowerPositions, findChokepoints } from '../lib/TerrainMatrix';
```

The `CONTROLLER_STRUCTURES` constant is a Screeps global, so no import needed.

- [ ] **Step 6: Verify compilation**

Run: `npx rollup -c rollup.config.mjs`
Expected: No new errors, `main.js` regenerated.

- [ ] **Step 7: Commit**

```bash
git add src/colony/Architect.ts main.js
git commit -m "feat: implement zone-carving bunker algorithm"
```