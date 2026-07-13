# Hatchery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal 4-role spawner with a full ant colony hatchery system: Queen evaluates room phase + TTL death watch → submits priority requests → Hatchery queues and spawns highest-priority affordable.

**Architecture:** 4 new files in `src/hatchery/`, 2 modified files, 4 deleted files. Queen + Hatchery communicate via `Memory.v1.hatchery.queue[roomName]`. No changes to role files.

**Tech Stack:** TypeScript, Screeps globals, Rollup build.

---

### Task 1: Request types + Priority enum

**Files:**
- Create: `src/hatchery/Request.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Define SpawnRequest interface and Priority enum in Request.ts**

```ts
// src/hatchery/Request.ts

import { BodyPartConstant } from 'screeps';

export enum Priority {
  CRITICAL = 0,
  HIGH = 100,
  NORMAL = 300,
  LOW = 600,
  IDLE = 900,
}

export interface SpawnRequest {
  role: string
  priority: number
  body: { min: BodyPartConstant[]; ideal: BodyPartConstant[] }
  count: number
  memory: Record<string, any>
  createdAt: number
  roomName: string
}
```

- [ ] **Step 2: Update src/types/index.ts with HatcheryMemory types**

Add to existing types file:

```ts
import { SpawnRequest } from '../hatchery/Request';

// Add after existing interfaces:

export interface SpawnRequestData {
  role: string
  priority: number
  bodyMin: number[]
  bodyIdeal: number[]
  count: number
  memory: Record<string, any>
  createdAt: number
  roomName: string
}

export interface DeathWatchEntry {
  name: string
  ttl: number
}

export interface HatcheryMemory {
  queue: Record<string, SpawnRequestData[]>
  deathWatch: Record<string, Record<string, DeathWatchEntry[]>>
}

// Extend global Memory
declare global {
  interface Memory {
    v1: {
      hatchery: HatcheryMemory
    }
  }
}
```

The `SpawnRequestData` type uses serialized `number[]` for body parts (CostMatrix-style) instead of `BodyPartConstant[]` for reliable Memory serialization. Hatchery converts between them.

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/hatchery/Request.ts src/types/index.ts
git commit -m "feat: add SpawnRequest types and Priority enum"
```

---

### Task 2: Body scaling

**Files:**
- Create: `src/hatchery/Body.ts`

- [ ] **Step 1: Implement scaleBody and bodyCost**

```ts
// src/hatchery/Body.ts

import { BodyPartConstant } from 'screeps';

const PART_COST: Record<string, number> = {
  [WORK]: 100,
  [CARRY]: 50,
  [MOVE]: 50,
  [ATTACK]: 80,
  [RANGED_ATTACK]: 150,
  [HEAL]: 250,
  [TOUGH]: 10,
  [CLAIM]: 600,
};

export function bodyCost(body: BodyPartConstant[]): number {
  return body.reduce((sum, p) => sum + (PART_COST[p] || 0), 0);
}

export function scaleBody(
  min: BodyPartConstant[],
  ideal: BodyPartConstant[],
  availableEnergy: number
): BodyPartConstant[] | null {
  const minCost = bodyCost(min);
  if (minCost > availableEnergy) return null;

  const body: BodyPartConstant[] = [...min];
  let remaining = availableEnergy - minCost;

  // Build list of parts in ideal that are beyond the minimum
  // We process ideal from index min.length onwards
  for (let i = min.length; i < ideal.length && body.length < 50; i++) {
    const part = ideal[i];
    const cost = PART_COST[part] || 0;
    if (cost <= remaining) {
      body.push(part);
      remaining -= cost;
    } else {
      break;
    }
  }

  return body;
}

export function serializeBody(body: BodyPartConstant[]): number[] {
  const map: Record<string, number> = {
    [WORK]: 1,
    [CARRY]: 2,
    [MOVE]: 3,
    [ATTACK]: 4,
    [RANGED_ATTACK]: 5,
    [HEAL]: 6,
    [TOUGH]: 7,
    [CLAIM]: 8,
  };
  return body.map(p => map[p] || 0);
}

export function deserializeBody(data: number[]): BodyPartConstant[] {
  const map: Record<number, BodyPartConstant> = {
    1: WORK,
    2: CARRY,
    3: MOVE,
    4: ATTACK,
    5: RANGED_ATTACK,
    6: HEAL,
    7: TOUGH,
    8: CLAIM,
  };
  return data.map(n => map[n] || WORK);
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/hatchery/Body.ts
git commit -m "feat: add body scaling between min and ideal"
```

---

### Task 3: Hatchery — priority queue + spawn execution

**Files:**
- Create: `src/hatchery/Hatchery.ts`
- Modify: `src/hatchery/Request.ts` (add utility for serializing/deserializing requests to/from memory)

- [ ] **Step 1: Add serialize/deserialize helpers to Request.ts**

Append to `src/hatchery/Request.ts`:

```ts
import { deserializeBody, serializeBody } from './Body';

export function requestToMemory(req: SpawnRequest): SpawnRequestData {
  return {
    role: req.role,
    priority: req.priority,
    bodyMin: serializeBody(req.body.min),
    bodyIdeal: serializeBody(req.body.ideal),
    count: req.count,
    memory: req.memory,
    createdAt: req.createdAt,
    roomName: req.roomName,
  };
}

export function requestFromMemory(data: SpawnRequestData): SpawnRequest {
  return {
    role: data.role,
    priority: data.priority,
    body: {
      min: deserializeBody(data.bodyMin),
      ideal: deserializeBody(data.bodyIdeal),
    },
    count: data.count,
    memory: data.memory,
    createdAt: data.createdAt,
    roomName: data.roomName,
  };
}
```

- [ ] **Step 2: Implement Hatchery.ts**

```ts
// src/hatchery/Hatchery.ts

import { SpawnRequest, requestToMemory, requestFromMemory } from './Request';
import { scaleBody } from './Body';
import { HatcheryMemory, SpawnRequestData } from '../types';

const QUEUE_TTL = 100;

function ensureHatcheryMemory(roomName: string): void {
  if (!Memory.v1) Memory.v1 = {} as any;
  if (!Memory.v1.hatchery) Memory.v1.hatchery = { queue: {}, deathWatch: {} } as HatcheryMemory;
  if (!Memory.v1.hatchery.queue[roomName]) Memory.v1.hatchery.queue[roomName] = [];
  if (!Memory.v1.hatchery.deathWatch[roomName]) Memory.v1.hatchery.deathWatch[roomName] = {};
}

export function request(req: SpawnRequest): void {
  ensureHatcheryMemory(req.roomName);
  const queue = Memory.v1.hatchery.queue[req.roomName];

  // Check for existing matching request (same role, same room, same body min+ideal)
  const existing = queue.find(
    (r: SpawnRequestData) =>
      r.role === req.role &&
      r.bodyMin.join(',') === serializeBody(req.body.min).join(',') &&
      r.bodyIdeal.join(',') === serializeBody(req.body.ideal).join(',')
  );

  if (existing) {
    existing.count = Math.max(existing.count, req.count);
    // Use the higher priority
    existing.priority = Math.min(existing.priority, req.priority);
  } else {
    queue.push(requestToMemory(req));
  }
}

function serializeBody(body: BodyPartConstant[]): number[] {
  const map: Record<string, number> = { [WORK]: 1, [CARRY]: 2, [MOVE]: 3, [ATTACK]: 4, [RANGED_ATTACK]: 5, [HEAL]: 6, [TOUGH]: 7, [CLAIM]: 8 };
  return body.map(p => map[p] || 0);
}

export function process(room: Room): void {
  ensureHatcheryMemory(room.name);
  const queue = Memory.v1.hatchery.queue[room.name];

  // Filter out invalid entries
  const valid: SpawnRequestData[] = queue.filter(r => r && typeof r.role === 'string' && r.count > 0);

  // Purge stale
  const now = Game.time;
  const fresh = valid.filter(r => now - r.createdAt < QUEUE_TTL);

  // Sort by priority ascending
  fresh.sort((a, b) => a.priority - b.priority);

  // Find idle spawn
  const spawns = room.find(FIND_MY_SPAWNS);
  const spawn = spawns.find(s => !s.spawning);
  if (!spawn) {
    Memory.v1.hatchery.queue[room.name] = fresh;
    return;
  }

  for (const entry of fresh) {
    const req = requestFromMemory(entry);
    const body = scaleBody(req.body.min, req.body.ideal, room.energyAvailable);
    if (!body) continue; // can't afford min, keep for next tick

    const name = `${req.role}_${room.name}_${Game.time}`;
    const result = spawn.spawnCreep(body, name, {
      memory: { role: req.role, roomName: room.name, ...req.memory },
    });

    if (result === OK) {
      entry.count--;
      if (entry.count <= 0) {
        const idx = fresh.indexOf(entry);
        if (idx >= 0) fresh.splice(idx, 1);
      }
      Memory.v1.hatchery.queue[room.name] = fresh;
      return;
    }

    // On errors other than energy, remove the request
    if (result !== ERR_NOT_ENOUGH_ENERGY && result !== ERR_NOT_ENOUGH_RESOURCES) {
      const idx = fresh.indexOf(entry);
      if (idx >= 0) fresh.splice(idx, 1);
    }
  }

  Memory.v1.hatchery.queue[room.name] = fresh;
}
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/hatchery/Hatchery.ts src/hatchery/Request.ts
git commit -m "feat: add Hatchery with priority queue and spawn execution"
```

---

### Task 4: Queen — phase detection, death watch, request submission

**Files:**
- Create: `src/hatchery/Queen.ts`

- [ ] **Step 1: Implement Queen.ts**

```ts
// src/hatchery/Queen.ts

import { BodyPartConstant } from 'screeps';
import { Priority, SpawnRequest } from './Request';
import { request } from './Hatchery';
import { DeathWatchEntry } from '../types';

const ROLE_PRIORITIES: Record<string, number> = {
  harvester: Priority.HIGH,
  hauler: Priority.NORMAL,
  builder: Priority.NORMAL,
  upgrader: Priority.NORMAL,
  defender: Priority.HIGH,
  scout: Priority.LOW,
  claimer: Priority.LOW,
  attacker: Priority.IDLE,
  healer: Priority.IDLE,
};

const DEFAULT_BODIES: Record<string, { min: BodyPartConstant[]; ideal: BodyPartConstant[] }> = {
  harvester: {
    min: [WORK, CARRY, MOVE],
    ideal: [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
  },
  hauler: {
    min: [CARRY, CARRY, MOVE],
    ideal: [CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE],
  },
  builder: {
    min: [WORK, CARRY, MOVE],
    ideal: [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
  },
  upgrader: {
    min: [WORK, CARRY, MOVE],
    ideal: [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE],
  },
  defender: {
    min: [TOUGH, ATTACK, ATTACK, MOVE],
    ideal: [TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE],
  },
  scout: {
    min: [MOVE],
    ideal: [MOVE, MOVE],
  },
  claimer: {
    min: [CLAIM, MOVE],
    ideal: [CLAIM, MOVE],
  },
  attacker: {
    min: [ATTACK, MOVE],
    ideal: [ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE],
  },
  healer: {
    min: [HEAL, MOVE],
    ideal: [HEAL, HEAL, MOVE, MOVE],
  },
};

interface PhaseConfig {
  floor: Record<string, number>
  scaling: Record<string, { threshold: number; increment: number }>
}

function getPhase(room: Room): PhaseConfig {
  const rcl = room.controller?.level || 1;
  const energyRatio = room.energyAvailable / Math.max(room.energyCapacityAvailable, 1);

  if (rcl <= 2 && energyRatio < 0.8) {
    return {
      floor: { harvester: 2, hauler: 1 },
      scaling: {},
    };
  }

  if (rcl <= 2) {
    return {
      floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
      scaling: { hauler: { threshold: 5000, increment: 1 } },
    };
  }

  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const hasSites = sites.length > 0;

  // Check for missing critical structures
  const missingCritical = (type: StructureConstant): boolean => {
    const have = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === type }).length;
    const need = CONTROLLER_STRUCTURES[type]?.[rcl] || 0;
    return have < need;
  };

  const missingExtensions = missingCritical(STRUCTURE_EXTENSION);
  const missingTowers = missingCritical(STRUCTURE_TOWER);

  if (rcl <= 4 && (missingExtensions || missingTowers)) {
    return {
      floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
      scaling: {
        builder: { threshold: 30000, increment: 1 },
        upgrader: { threshold: 5000, increment: 1 },
      },
    };
  }

  if (rcl >= 8 || (!hasSites && rcl >= 5)) {
    return {
      floor: { harvester: 2, hauler: 1, upgrader: 1 },
      scaling: {
        upgrader: { threshold: 10000, increment: 1 },
      },
    };
  }

  if (hasSites) {
    return {
      floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
      scaling: {
        hauler: { threshold: 10000, increment: 1 },
        builder: { threshold: 20000, increment: 1 },
      },
    };
  }

  return {
    floor: { harvester: 2, hauler: 1, upgrader: 1 },
    scaling: {},
  };
}

function computeTargets(room: Room): Record<string, number> {
  const phase = getPhase(room);
  const targets: Record<string, number> = { ...phase.floor };

  for (const [role, cfg] of Object.entries(phase.scaling)) {
    const stored = room.storage ? room.storage.store[RESOURCE_ENERGY] || 0 : 0;
    const extra = Math.floor(stored / cfg.threshold) * cfg.increment;
    targets[role] = (targets[role] || 0) + extra;
  }

  return targets;
}

function isEconomyLocked(room: Room): boolean {
  // Simple check: if energyAvailable < 200 and no harvesters alive, lock
  const harvesters = Object.values(Game.creeps).filter(
    c => c.memory.roomName === room.name && c.memory.role === 'harvester'
  );
  return room.energyAvailable < 200 && harvesters.length === 0;
}

function updateDeathWatch(room: Room): void {
  const dw: Record<string, DeathWatchEntry[]> = {};
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.roomName !== room.name) continue;
    const ttl = creep.ticksToLive;
    if (ttl !== undefined && ttl < 100) {
      const role = creep.memory.role || 'unknown';
      if (!dw[role]) dw[role] = [];
      dw[role].push({ name, ttl });
    }
  }
  Memory.v1.hatchery.deathWatch[room.name] = dw;
}

export function tick(room: Room): void {
  // Ensure memory
  if (!Memory.v1) Memory.v1 = {} as any;
  if (!Memory.v1.hatchery) Memory.v1.hatchery = { queue: {}, deathWatch: {} } as any;

  // Update death watch
  updateDeathWatch(room);

  // Economy lock check
  const locked = isEconomyLocked(room);

  // Compute targets
  const targets = computeTargets(room);

  // Count live creeps + soon-dead
  const live: Record<string, number> = {};
  const soonDead: Record<string, number> = {};
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.roomName !== room.name) continue;
    const role = creep.memory.role || 'unknown';
    live[role] = (live[role] || 0) + 1;
    const ttl = creep.ticksToLive;
    if (ttl !== undefined && ttl < 100) {
      soonDead[role] = (soonDead[role] || 0) + 1;
    }
  }

  // Submit requests
  const roleOrder = ['harvester', 'hauler', 'builder', 'upgrader', 'defender', 'scout', 'claimer', 'attacker', 'healer'];

  for (const role of roleOrder) {
    const target = targets[role] || 0;

    // During economy lock: only harvester, hauler
    if (locked && role !== 'harvester' && role !== 'hauler') continue;

    const alive = live[role] || 0;
    const dying = soonDead[role] || 0;
    const need = Math.max(0, target + dying - alive);

    if (need <= 0) continue;

    // Compute TTL-adjusted priority
    const basePrio = ROLE_PRIORITIES[role] || Priority.NORMAL;
    let priority = basePrio;

    // Check death watch for this role — use lowest TTL to set priority
    const dw = Memory.v1.hatchery.deathWatch[room.name]?.[role] || [];
    const minTtl = dw.length > 0 ? Math.min(...dw.map(e => e.ttl)) : 999;

    if (minTtl < 20) priority = Math.min(priority, 50);
    else if (minTtl < 100) priority = Math.min(priority, 150);

    const bodyDef = DEFAULT_BODIES[role] || DEFAULT_BODIES.harvester;

    const spawnReq: SpawnRequest = {
      role,
      priority,
      body: bodyDef,
      count: need,
      memory: {},
      createdAt: Game.time,
      roomName: room.name,
    };

    request(spawnReq);
  }

  // Room expansion trigger
  const rcl = room.controller?.level || 1;
  if (rcl >= 4 && room.energyCapacityAvailable >= 5000 && room.storage) {
    const stored = room.storage.store[RESOURCE_ENERGY] || 0;
    if (stored > 500000) {
      // Find unclaimed adjacent room
      const exits = Game.map.describeExits(room.name);
      for (const exitKey in exits) {
        const exitRoom = exits[exitKey as unknown as ExitKey];
        if (!Game.rooms[exitRoom] || !Game.rooms[exitRoom].controller?.my) {
          const claimReq: SpawnRequest = {
            role: 'claimer',
            priority: Priority.LOW,
            body: DEFAULT_BODIES.claimer,
            count: 1,
            memory: { targetRoom: exitRoom, claim: true },
            createdAt: Game.time,
            roomName: room.name,
          };
          request(claimReq);

          const remoteHarvester: SpawnRequest = {
            role: 'harvester',
            priority: Priority.LOW,
            body: DEFAULT_BODIES.harvester,
            count: 2,
            memory: { remoteRoom: exitRoom },
            createdAt: Game.time,
            roomName: room.name,
          };
          request(remoteHarvester);

          const remoteHauler: SpawnRequest = {
            role: 'hauler',
            priority: Priority.LOW,
            body: DEFAULT_BODIES.hauler,
            count: 1,
            memory: { remoteRoom: exitRoom },
            createdAt: Game.time,
            roomName: room.name,
          };
          request(remoteHauler);

          break; // only one room at a time
        }
      }
    }
  }
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/hatchery/Queen.ts
git commit -m "feat: add Queen with phase detection, death watch, expansion trigger"
```

---

### Task 5: Wire into main.ts + delete old files

**Files:**
- Modify: `src/main.ts`
- Delete: `src/spawn/Spawner.ts`, `src/spawn/Body.ts`, `src/colony/Colony.ts`, `src/colony/Goal.ts`

- [ ] **Step 1: Update main.ts**

Replace imports and loop body:

```ts
// src/main.ts — replace top imports

import { tick as queenTick } from './hatchery/Queen';
import { process as hatcheryProcess } from './hatchery/Hatchery';
import * as Harvester from './roles/Harvester';
import * as Hauler from './roles/Hauler';
import * as Builder from './roles/Builder';
import * as Upgrader from './roles/Upgrader';
import { ensureRoomMemory, ensureCreepMemory, ensureMemoryNs, cleanLegacyMemory } from './lib/Memory';
import { getTerrainMatrix } from './lib/TerrainMatrix';
import { planLayout, planSwap } from './colony/Architect';
```

Replace the room loop inside `loop()`:

```ts
  // Process each owned room
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room.controller || !room.controller.my) continue;

    ensureRoomMemory(room);

    // Queen evaluates colony needs and submits spawn requests
    queenTick(room);

    // Terrain and layout planning — cache every 100 ticks
    getTerrainMatrix(room.name);
    if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
      const layout = planLayout(room);
      const swapPlan = planSwap(room, layout);
      room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
    }

    // Create construction sites from swap plan
    createConstructionSites(room);

    // Periodic layout rechecking
    recheckLayout(room);

    // Hatchery processes queue and spawns highest priority request
    hatcheryProcess(room);

    // Run existing creeps
    runCreeps(room, room.memory.goal);
  }
```

Remove the `import { tick as colonyTick } from './colony/Colony';` and `import { tick as spawnerTick } from './spawn/Spawner';` lines.

Remove the `Goal` import if no longer used directly (it may still be used in runCreeps signature). Check if `Goal` type is still referenced — if so, keep the import from types.

- [ ] **Step 2: Delete old files**

```bash
rm src/spawn/Spawner.ts src/spawn/Body.ts src/colony/Colony.ts src/colony/Goal.ts
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/spawn/ src/colony/
git commit -m "feat: wire Queen+Hatchery into main loop, remove old spawn system"
```

---

### Task 6: AGENTS.md + README.md

**Files:**
- Modify: `AGENTS.md`
- Create: `README.md`

- [ ] **Step 1: Add design philosophy to AGENTS.md**

Insert at top (after the runtime environment section, before "Module contract"):

```markdown
## Design philosophy

This bot uses an **adaptive ant colony** architecture. See README.md for
full strategy documentation.
```

- [ ] **Step 2: Write README.md**

```markdown
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

```
For each owned room:
  1. Queen.tick(room)
     - Detect phase (bootstrap/stabilise/critical_path/buildout/growth/expansion)
     - Update TTL death watch
     - Compute target counts with growth scaling
     - Submit SpawnRequests to Memory.v1.hatchery.queue[room]
  2. Hatchery.process(room)
     - Read queue, sort by priority
     - Scale body from min→ideal within available energy
     - Spawn highest-priority affordable request
  3. runCreeps(room)
     - Each creep executes its role function
```

## Queen — Colony Manager

The Queen evaluates room state each tick and decides what to spawn.

### Phase detection

| Phase | Trigger | Behaviour |
|-------|---------|-----------|
| bootstrap | RCL 1-2, low energy | 2 harvesters, 1 hauler — survival only |
| stabilise | RCL 1-2, energy stable | Add builder + upgrader, scale haulers with storage |
| critical_path | RCL 3-4, missing extensions/towers | Prioritise builders for critical gates |
| buildout | RCL 5-7, construction sites exist | Scale builders with backlog |
| growth | RCL 5-7, no active sites | Scale upgraders, consider defenders |
| expansion | RCL 8 or RCL 4+ with 500k reserve | Claim next room, deploy remote workers |

### TTL death watch

Every tick, the Queen scans all creeps and categorises them by remaining TTL:

| Band | TTL | Effect |
|------|-----|--------|
| critical | 0-20 | Emergency replacement at priority 0-99 |
| warning | 21-100 | Planned replacement at priority 100-299 |
| stable | 100+ | Normal priority |

Request count = `max(0, target - alive + soonDead)`. This pre-spawns
replacements before the old creep dies, avoiding service gaps.

### Growth scaling

Target counts are not static. They scale with stored energy and construction
backlog:

- +1 hauler per 5-10k stored energy
- +1 builder per 20-30k construction backlog
- +1 upgrader per 5-10k reserve
- +1 defender per 50k surplus

### Room expansion

When RCL ≥ 4 with 500k+ stored energy, the Queen auto-submits:
- 1 claimer (priority LOW)
- 2 remote harvesters
- 1 remote hauler

## Hatchery — Spawn Execution

The Hatchery maintains a per-room priority queue in memory.

**process(room)** every tick:
1. Read `Memory.v1.hatchery.queue[roomName]`
2. Purge requests older than 100 ticks
3. Sort by priority ascending (lower = more urgent)
4. For each request, scale body to fit `room.energyAvailable`
5. Spawn the first affordable request
6. Decrement count or remove fulfilled requests

### Body scaling

Each role defines a minimum body and an ideal body:

```
harvester: min [WORK,CARRY,MOVE] (200e)
           ideal [WORK,WORK,WORK,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE] (600e)
```

`scaleBody(min, ideal, energy)` starts at min, adds parts from ideal in order
while energy and 50-part cap allow. A room with 350e produces
`[WORK,WORK,CARRY,CARRY,MOVE,MOVE]` (350e).

If even the minimum body is unaffordable, the request is deferred (retried
next tick).

### Priority bands

| Band | Range | Roles |
|------|-------|-------|
| CRITICAL | 0-99 | Emergency, death-watch critical, bootstrap |
| HIGH | 100-299 | Harvester, defender, death-watch warning |
| NORMAL | 300-599 | Hauler, builder, upgrader |
| LOW | 600-899 | Scout, remote miner, claimer |
| IDLE | 900+ | Attacker, healer (only with surplus) |

## Room Layout (Architect)

The bunker planner (`colony/Architect.ts`) uses terrain-aware zone carving:

1. **Core zone** — spawn, storage, terminal, factory, links (25 contiguous tiles)
2. **Lab zone** — 15 labs in ring around core
3. **Extensions** — up to 60 extensions in outer rings
4. **Towers** — optimal coverage positions
5. **Ramparts + walls** — protect all structures
6. **Swap planner** — handles structure relocation during construction

Layout is recomputed every 100 ticks and when structures are destroyed.

## Memory Structure

```ts
Memory.v1.hatchery.queue[roomName]       // SpawnRequest[]
Memory.v1.hatchery.deathWatch[roomName]   // { role: [{name, ttl}] }
Memory.v1.pathing.terrain[roomName]       // CostMatrix cache
Memory[CURRENT_NS].metrics                // CPU, spawn, KPI stats
```

## Build & Deploy

```bash
npm run build         # compiles src/main.ts → main.js
```

The Screeps client syncs `main.js` to the game server. There is no test
framework — verify behaviour by monitoring in-game console and Memory.

## Future Work

- DEFEND/RECOVER goal transitions for hostile response
- Multi-room logistics between colonies
- Lab boosting pipeline
- Market trading
- Power harvesting
- Nuke defence
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: add ant colony philosophy to AGENTS.md, write README"
```

---

### Self-Review

**Spec coverage check:**
- Overview/ant colony philosophy → Task 6 (README)
- Architecture + folder structure → Task 5 (main.ts wiring), Task 6 (README)
- Queen phase detection → Task 4
- Growth scaling per phase → Task 4
- Economy lock override → Task 4 (`isEconomyLocked`)
- TTL death watch → Task 4 (`updateDeathWatch`, priority adjustment)
- Death watch memory → Task 4
- Room expansion trigger → Task 4 (claimer + remote spawns at 500k reserve)
- SpawnRequest type + Priority enum → Task 1
- Body scaling (min→ideal) → Task 2
- Hatchery process (queue, sort, spawn, purge) → Task 3
- Error handling → Task 3 (ERR_NOT_ENOUGH_ENERGY skip, invalid entries discard)
- Memory structure → Task 1 (types/index.ts)
- Old file deletion → Task 5
- AGENTS.md update → Task 6
- README.md → Task 6

**No placeholder gaps found.**

**Type consistency:** `SpawnRequest` uses `BodyPartConstant[]` in code, `SpawnRequestData` uses `number[]` for memory serialization. `requestToMemory`/`requestFromMemory` bridge them. `Hatchery.ts` has its own `serializeBody` inline (for queue matching) — this is duplicated with `Body.ts`. Acceptable for now, could be refactored later.
