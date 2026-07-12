# Screeps Rebuild MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-room economy bot from scratch using goal-driven ant colony pattern in TypeScript.

**Architecture:** Colony reads room state → sets global goal → roles follow rules per goal → spawn counts targets and spawns creeps. MVP implements ECONOMY goal only.

**Tech Stack:** TypeScript, Rollup, Screeps API

---

## File Structure

```
src/
  main.ts                    ← entry point, game loop
  colony/
    Colony.ts                ← reads room state, sets colony goal
    Goal.ts                  ← goal enum + transition logic
  roles/
    Harvester.ts             ← harvester behavior per goal
    Hauler.ts                ← hauler behavior per goal
    Builder.ts               ← builder behavior per goal
    Upgrader.ts              ← upgrader behavior per goal
  spawn/
    Spawner.ts               ← reads targets, spawns creeps
    Body.ts                  ← body part calculations
  lib/
    Pathing.ts               ← moveTo wrapper
    Memory.ts                ← typed memory helpers
  types/
    index.ts                 ← shared type definitions
```

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `rollup.config.js`
- Create: `.gitignore`

- [ ] **Step 1: Initialize npm project**

```bash
cd /home/jin/.config/Screeps/scripts/screeps.com/default
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install --save-dev typescript@^5.0.0 rollup@^3.0.0 rollup-plugin-typescript2 rollup-plugin-node-resolve rollup-plugin-commonjs @types/screeps @types/lodash lodash
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowJs": false,
    "sourceMap": false,
    "strict": false,
    "noImplicitAny": false,
    "skipLibCheck": true,
    "types": ["screeps"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create rollup.config.js**

```js
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import typescript from "rollup-plugin-typescript2";

export default {
  input: "src/main.ts",
  plugins: [
    resolve(),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json" })
  ],
  treeshake: false,
  output: {
    file: "dist/main.js",
    format: "cjs",
    sourcemap: false
  }
};
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
```

- [ ] **Step 6: Add build script to package.json**

```json
"scripts": {
  "build": "rollup -c"
}
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json rollup.config.js .gitignore
git commit -m "feat: initialize TypeScript project with Rollup"
```

---

### Task 2: Type Definitions

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Create type definitions**

```ts
// src/types/index.ts

export enum Goal {
  ECONOMY = 'economy',
  DEFEND = 'defend',
  RECOVER = 'recover',
}

export interface RoleTargets {
  harvester: number;
  hauler: number;
  builder: number;
  upgrader: number;
}

export interface CreepMemory {
  role: string;
  roomName: string;
}

export interface RoomMemory {
  goal: Goal;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add type definitions for Goal, RoleTargets, Memory"
```

---

### Task 3: Goal System

**Files:**
- Create: `src/colony/Goal.ts`

- [ ] **Step 1: Create Goal module**

```ts
// src/colony/Goal.ts

import { Goal } from '../types';

export function getColonyGoal(room: Room): Goal {
  // MVP: ECONOMY only
  // Future: check hostiles for DEFEND, damage for RECOVER
  return Goal.ECONOMY;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/colony/Goal.ts
git commit -m "feat: add Goal system with ECONOMY default"
```

---

### Task 4: Colony Orchestrator

**Files:**
- Create: `src/colony/Colony.ts`

- [ ] **Step 1: Create Colony module**

```ts
// src/colony/Colony.ts

import { getColonyGoal } from './Goal';
import { Goal } from '../types';

export function tick(room: Room): void {
  const goal = getColonyGoal(room);
  room.memory.goal = goal;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/colony/Colony.ts
git commit -m "feat: add Colony orchestrator with goal setting"
```

---

### Task 5: Pathing Utility

**Files:**
- Create: `src/lib/Pathing.ts`

- [ ] **Step 1: Create Pathing module**

```ts
// src/lib/Pathing.ts

export function moveTo(creep: Creep, target: RoomPosition | { pos: RoomPosition }, opts?: MoveToOpts): void {
  creep.moveTo(target, {
    visualizePathStyle: { stroke: '#ffffff' },
    ...opts
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/Pathing.ts
git commit -m "feat: add Pathing utility with moveTo wrapper"
```

---

### Task 6: Memory Helpers

**Files:**
- Create: `src/lib/Memory.ts`

- [ ] **Step 1: Create Memory module**

```ts
// src/lib/Memory.ts

import { Goal } from '../types';

export function ensureRoomMemory(room: Room): void {
  if (!room.memory.goal) {
    room.memory.goal = Goal.ECONOMY;
  }
}

export function ensureCreepMemory(creep: Creep): void {
  if (!creep.memory.role) {
    creep.memory.role = 'harvester';
  }
  if (!creep.memory.roomName) {
    creep.memory.roomName = creep.room.name;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/Memory.ts
git commit -m "feat: add Memory helpers for room and creep initialization"
```

---

### Task 7: Body Generation

**Files:**
- Create: `src/spawn/Body.ts`

- [ ] **Step 1: Create Body module**

```ts
// src/spawn/Body.ts

import { BodyPartConstant } from 'screeps';

export function forRole(role: string, room: Room): BodyPartConstant[] {
  const energy = room.energyAvailable;
  
  switch (role) {
    case 'harvester':
      if (energy >= 300) return [WORK, WORK, CARRY, MOVE];
      if (energy >= 200) return [WORK, CARRY, MOVE];
      return [WORK, MOVE];
    
    case 'hauler':
      if (energy >= 300) return [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
      if (energy >= 200) return [CARRY, CARRY, MOVE, MOVE];
      return [CARRY, MOVE];
    
    case 'builder':
      if (energy >= 300) return [WORK, WORK, CARRY, MOVE];
      if (energy >= 200) return [WORK, CARRY, MOVE];
      return [WORK, MOVE];
    
    case 'upgrader':
      if (energy >= 300) return [WORK, WORK, CARRY, MOVE];
      if (energy >= 200) return [WORK, CARRY, MOVE];
      return [WORK, MOVE];
    
    default:
      return [WORK, CARRY, MOVE];
  }
}

export function cost(body: BodyPartConstant[]): number {
  const costs: Record<string, number> = {
    [WORK]: 100,
    [CARRY]: 50,
    [MOVE]: 50,
    [ATTACK]: 80,
    [RANGED_ATTACK]: 150,
    [HEAL]: 250,
    [TOUGH]: 10,
    [CLAIM]: 600,
  };
  
  return body.reduce((sum, part) => sum + (costs[part] || 0), 0);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/spawn/Body.ts
git commit -m "feat: add Body generation with energy scaling"
```

---

### Task 8: Spawner

**Files:**
- Create: `src/spawn/Spawner.ts`

- [ ] **Step 1: Create Spawner module**

```ts
// src/spawn/Spawner.ts

import { Goal, RoleTargets } from '../types';
import * as Body from './Body';

const ROLE_ORDER = ['harvester', 'hauler', 'builder', 'upgrader'];

function getTargets(goal: Goal): RoleTargets {
  switch (goal) {
    case Goal.ECONOMY:
      return { harvester: 2, hauler: 1, builder: 1, upgrader: 1 };
    case Goal.DEFEND:
      return { harvester: 1, hauler: 0, builder: 0, upgrader: 0 };
    case Goal.RECOVER:
      return { harvester: 2, hauler: 1, builder: 2, upgrader: 0 };
  }
}

function countCreeps(room: Room): Record<string, number> {
  const counts: Record<string, number> = {};
  
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.roomName === room.name) {
      const role = creep.memory.role;
      counts[role] = (counts[role] || 0) + 1;
    }
  }
  
  return counts;
}

function getSpawn(room: Room): StructureSpawn | null {
  const spawns = room.find(FIND_MY_SPAWNS);
  return spawns[0] || null;
}

export function tick(room: Room, goal: Goal): void {
  const spawn = getSpawn(room);
  if (!spawn || spawn.spawning) return;
  
  const targets = getTargets(goal);
  const counts = countCreeps(room);
  
  for (const role of ROLE_ORDER) {
    const target = targets[role as keyof RoleTargets] || 0;
    const current = counts[role] || 0;
    
    if (current < target) {
      const body = Body.forRole(role, room);
      const bodyCost = Body.cost(body);
      
      if (room.energyAvailable >= bodyCost) {
        const name = `${role}_${room.name}_${Game.time}`;
        const result = spawn.spawnCreep(body, name, {
          memory: { role, roomName: room.name }
        });
        
        if (result === OK) break;
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/spawn/Spawner.ts
git commit -m "feat: add Spawner with target counting and role priority"
```

---

### Task 9: Harvester Role

**Files:**
- Create: `src/roles/Harvester.ts`

- [ ] **Step 1: Create Harvester module**

```ts
// src/roles/Harvester.ts

import { Goal } from '../types';
import { moveTo } from '../lib/Pathing';

function findSource(creep: Creep): Source | null {
  const sources = creep.room.find(FIND_SOURCES);
  if (sources.length === 0) return null;
  
  // Prefer source with energy
  for (const source of sources) {
    if (source.energy > 0) return source;
  }
  
  return sources[0];
}

function findDropOff(creep: Creep): Structure | null {
  // Prefer containers and storage
  const targets = creep.room.find(FIND_STRUCTURES, {
    filter: (s) => (
      (s.structureType === STRUCTURE_CONTAINER ||
       s.structureType === STRUCTURE_STORAGE) &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    )
  });
  
  if (targets.length > 0) {
    return creep.pos.findClosestByPath(targets);
  }
  
  // Fallback to spawn and extensions
  const spawnTargets = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (s) => (
      (s.structureType === STRUCTURE_SPAWN ||
       s.structureType === STRUCTURE_EXTENSION) &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    )
  });
  
  if (spawnTargets.length > 0) {
    return creep.pos.findClosestByPath(spawnTargets);
  }
  
  return null;
}

function harvestAndTransfer(creep: Creep): void {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const source = findSource(creep);
    if (source) {
      if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        moveTo(creep, source);
      }
    }
  } else {
    const dropOff = findDropOff(creep);
    if (dropOff) {
      if (creep.transfer(dropOff, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveTo(creep, dropOff);
      }
    }
  }
}

function repairNearby(creep: Creep): void {
  const damagedStructures = creep.room.find(FIND_STRUCTURES, {
    filter: (s) => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
  });
  
  if (damagedStructures.length > 0) {
    const target = creep.pos.findClosestByPath(damagedStructures);
    if (target) {
      if (creep.repair(target) === ERR_NOT_IN_RANGE) {
        moveTo(creep, target);
      }
    }
  }
}

export function run(creep: Creep, goal: Goal): void {
  switch (goal) {
    case Goal.ECONOMY:
      harvestAndTransfer(creep);
      break;
    case Goal.DEFEND:
      repairNearby(creep);
      break;
    case Goal.RECOVER:
      harvestAndTransfer(creep);
      break;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/roles/Harvester.ts
git commit -m "feat: add Harvester role with goal-based behavior"
```

---

### Task 10: Hauler Role

**Files:**
- Create: `src/roles/Hauler.ts`

- [ ] **Step 1: Create Hauler module**

```ts
// src/roles/Hauler.ts

import { Goal } from '../types';
import { moveTo } from '../lib/Pathing';

function findEnergy(creep: Creep): Resource | null {
  // Look for dropped energy
  const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
  });
  
  if (droppedEnergy.length > 0) {
    return creep.pos.findClosestByPath(droppedEnergy);
  }
  
  // Look for containers with energy
  const containers = creep.room.find(FIND_STRUCTURES, {
    filter: (s) => (
      s.structureType === STRUCTURE_CONTAINER &&
      s.store[RESOURCE_ENERGY] > 0
    )
  });
  
  if (containers.length > 0) {
    const container = creep.pos.findClosestByPath(containers);
    if (container) {
      // Withdraw from container
      if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveTo(creep, container);
      }
    }
  }
  
  return null;
}

function findDropOff(creep: Creep): Structure | null {
  // Prefer spawn and extensions
  const targets = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (s) => (
      (s.structureType === STRUCTURE_SPAWN ||
       s.structureType === STRUCTURE_EXTENSION) &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    )
  });
  
  if (targets.length > 0) {
    return creep.pos.findClosestByPath(targets);
  }
  
  // Fallback to storage
  const storage = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (s) => (
      s.structureType === STRUCTURE_STORAGE &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    )
  });
  
  if (storage.length > 0) {
    return storage[0];
  }
  
  return null;
}

function haulEnergy(creep: Creep): void {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const energy = findEnergy(creep);
    if (energy) {
      if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
        moveTo(creep, energy);
      }
    }
  } else {
    const dropOff = findDropOff(creep);
    if (dropOff) {
      if (creep.transfer(dropOff, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveTo(creep, dropOff);
      }
    }
  }
}

function deliverToTowers(creep: Creep): void {
  const towers = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (s) => (
      s.structureType === STRUCTURE_TOWER &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    )
  });
  
  if (towers.length > 0) {
    const tower = creep.pos.findClosestByPath(towers);
    if (tower) {
      if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveTo(creep, tower);
      }
    }
  }
}

export function run(creep: Creep, goal: Goal): void {
  switch (goal) {
    case Goal.ECONOMY:
      haulEnergy(creep);
      break;
    case Goal.DEFEND:
      deliverToTowers(creep);
      break;
    case Goal.RECOVER:
      haulEnergy(creep);
      break;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/roles/Hauler.ts
git commit -m "feat: add Hauler role with goal-based behavior"
```

---

### Task 11: Builder Role

**Files:**
- Create: `src/roles/Builder.ts`

- [ ] **Step 1: Create Builder module**

```ts
// src/roles/Builder.ts

import { Goal } from '../types';
import { moveTo } from '../lib/Pathing';

function findConstructionSite(creep: Creep): ConstructionSite | null {
  const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
  if (sites.length === 0) return null;
  
  // Prioritize by progress ratio
  return creep.pos.findClosestByPath(sites);
}

function findDamagedStructure(creep: Creep): Structure | null {
  const structures = creep.room.find(FIND_STRUCTURES, {
    filter: (s) => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
  });
  
  if (structures.length === 0) return null;
  
  return creep.pos.findClosestByPath(structures);
}

function buildStructures(creep: Creep): void {
  const site = findConstructionSite(creep);
  if (site) {
    if (creep.build(site) === ERR_NOT_IN_RANGE) {
      moveTo(creep, site);
    }
  }
}

function repairStructures(creep: Creep): void {
  const structure = findDamagedStructure(creep);
  if (structure) {
    if (creep.repair(structure) === ERR_NOT_IN_RANGE) {
      moveTo(creep, structure);
    }
  }
}

export function run(creep: Creep, goal: Goal): void {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    switch (goal) {
      case Goal.ECONOMY:
        buildStructures(creep);
        break;
      case Goal.DEFEND:
        repairStructures(creep);
        break;
      case Goal.RECOVER:
        repairStructures(creep);
        break;
    }
  } else {
    // Find energy
    const sources = creep.room.find(FIND_SOURCES);
    if (sources.length > 0) {
      const source = sources[0];
      if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        moveTo(creep, source);
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/roles/Builder.ts
git commit -m "feat: add Builder role with goal-based behavior"
```

---

### Task 12: Upgrader Role

**Files:**
- Create: `src/roles/Upgrader.ts`

- [ ] **Step 1: Create Upgrader module**

```ts
// src/roles/Upgrader.ts

import { Goal } from '../types';
import { moveTo } from '../lib/Pathing';

function upgradeController(creep: Creep): void {
  if (!creep.room.controller) return;
  
  if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    moveTo(creep, creep.room.controller);
  }
}

function parkNearSpawn(creep: Creep): void {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  if (spawn) {
    const range = creep.pos.getRangeTo(spawn);
    if (range > 3) {
      moveTo(creep, spawn.pos);
    }
  }
}

export function run(creep: Creep, goal: Goal): void {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    switch (goal) {
      case Goal.ECONOMY:
        upgradeController(creep);
        break;
      case Goal.DEFEND:
        parkNearSpawn(creep);
        break;
      case Goal.RECOVER:
        upgradeController(creep);
        break;
    }
  } else {
    // Find energy
    const sources = creep.room.find(FIND_SOURCES);
    if (sources.length > 0) {
      const source = sources[0];
      if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        moveTo(creep, source);
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/roles/Upgrader.ts
git commit -m "feat: add Upgrader role with goal-based behavior"
```

---

### Task 13: Main Entry Point

**Files:**
- Create: `src/main.ts`

- [ ] **Step 1: Create main entry point**

```ts
// src/main.ts

import { tick as colonyTick } from './colony/Colony';
import { tick as spawnerTick } from './spawn/Spawner';
import * as Harvester from './roles/Harvester';
import * as Hauler from './roles/Hauler';
import * as Builder from './roles/Builder';
import * as Upgrader from './roles/Upgrader';
import { ensureRoomMemory, ensureCreepMemory } from './lib/Memory';
import { Goal } from './types';

function runCreeps(room: Room, goal: Goal): void {
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.roomName !== room.name) continue;
    
    ensureCreepMemory(creep);
    
    switch (creep.memory.role) {
      case 'harvester':
        Harvester.run(creep, goal);
        break;
      case 'hauler':
        Hauler.run(creep, goal);
        break;
      case 'builder':
        Builder.run(creep, goal);
        break;
      case 'upgrader':
        Upgrader.run(creep, goal);
        break;
    }
  }
}

export const loop = (): void => {
  // Clean up dead creep memory
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) {
      delete Memory.creeps[name];
    }
  }
  
  // Process each owned room
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room.controller || !room.controller.my) continue;
    
    ensureRoomMemory(room);
    colonyTick(room);
    spawnerTick(room, room.memory.goal);
    runCreeps(room, room.memory.goal);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/main.ts
git commit -m "feat: add main entry point with game loop"
```

---

### Task 14: Build and Test

**Files:**
- Modify: `package.json` (add build script)

- [ ] **Step 1: Verify build works**

```bash
npm run build
```

Expected: `dist/main.js` created without errors

- [ ] **Step 2: Commit**

```bash
git add dist/main.js
git commit -m "feat: add compiled output"
```

---

### Task 15: Documentation

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README**

```markdown
# Screeps Bot - Goal-Driven Colony

TypeScript Screeps bot using goal-driven ant colony pattern.

## Architecture

- Colony reads room state → sets global goal
- Roles follow rules per goal
- Spawner counts targets and spawns creeps

## Goals

- ECONOMY: harvest, haul, build, upgrade
- DEFEND: repair structures, support towers (future)
- RECOVER: rebuild after attack (future)

## Build

```bash
npm install
npm run build
```

Output: `dist/main.js`

## Development

- `src/main.ts` - entry point
- `src/colony/` - goal system and orchestrator
- `src/roles/` - creep behavior per goal
- `src/spawn/` - spawn logic and body generation
- `src/lib/` - utilities (pathing, memory)
- `src/types/` - type definitions
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with architecture overview"
```

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-12-screeps-rebuild-mvp-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
