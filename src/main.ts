// src/main.ts

import { tick as queenTick } from './hatchery/Queen';
import { process as hatcheryProcess } from './hatchery/Hatchery';
import * as Harvester from './roles/Harvester';
import * as Hauler from './roles/Hauler';
import * as Builder from './roles/Builder';
import * as Upgrader from './roles/Upgrader';
import { ensureRoomMemory, ensureCreepMemory, ensureMemoryNs, cleanLegacyMemory, CURRENT_NS } from './lib/Memory';
import { getTerrainMatrix } from './lib/PathFinder';
import { shouldRecheck, demolishMisplaced, buildMissing } from './colony/Lifecycle';
import { planLayout, planSwap } from './colony/Architect';
import { Goal } from './types';
import * as HUD from './lib/HUD';
import { trackIncome, getBudget, getHealth, trackBuild } from './lib/Cashflow';

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

const MAX_ROADS_PER_TICK = 5;

function drainPendingRoads(room: Room): void {
  const ns = Memory[CURRENT_NS];
  if (!ns.pathing || !ns.pathing.pendingRoads) return;

  const pending = ns.pathing.pendingRoads;
  let placed = 0;

  for (let i = pending.length - 1; i >= 0 && placed < MAX_ROADS_PER_TICK; i--) {
    const entry = pending[i];
    if (entry.roomName !== room.name) continue;

    const result = room.createConstructionSite(entry.x, entry.y, STRUCTURE_ROAD);
    if (result === OK || result === ERR_INVALID_TARGET) {
      pending.splice(i, 1);
      if (result === OK) placed++;
    }
  }
}

function recheckLayout(room: Room): void {
  // Only recheck every 200 ticks
  if (Game.time % 200 !== 0) return;
  
  const layout = room.memory.layout;
  if (!layout || !layout.bunker) return;
  
  // Verify all planned positions are still valid
  let needsReplan = false;
  
  // Check if planned structures still exist at correct positions
  for (const towerPos of layout.bunker.towers) {
    const tower = room.lookForAt(LOOK_STRUCTURES, towerPos.x, towerPos.y)
      .find(s => s.structureType === STRUCTURE_TOWER);
    if (!tower) {
      needsReplan = true;
      break;
    }
  }
  
  // Check if structures moved or were destroyed
  const existingSpawns = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_SPAWN
  });
  
  if (existingSpawns.length > 0) {
    const spawn = existingSpawns[0];
    if (!spawn.pos.isEqualTo(layout.bunker.spawn)) {
      needsReplan = true;
    }
  }
  
  // Re-plan if needed
  if (needsReplan) {
    const newLayout = planLayout(room);
    const newSwapPlan = planSwap(room, newLayout);
    room.memory.layout = { bunker: newLayout, swap: newSwapPlan, lastUpdated: Game.time };
  }
}

export const loop = (): void => {
  // Migration: carry v1 → v2 (or whatever next version) when CURRENT_NS changes
  if (Memory.v1 && !Memory[CURRENT_NS]) {
    Memory[CURRENT_NS] = Memory.v1;
    delete Memory.v1;
  }

  // Ensure current version namespace exists
  ensureMemoryNs();

  // Clean up dead creep memory
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) {
      delete Memory.creeps[name];
    }
  }

  // Prune legacy top-level Memory keys every 100 ticks
  if (Game.time % 100 === 0) {
    cleanLegacyMemory();
  }

  // Process each owned room
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room.controller || !room.controller.my) continue;

    ensureRoomMemory(room);

    // Queen evaluates colony needs and submits spawn requests
    queenTick(room);

    // Track energy for cashflow
    const prevTotal = (Memory.v1 as any)._prevTotalEnergy?.[roomName] ?? -1;
    const currentTotal = room.energyAvailable + (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0);
    if (prevTotal >= 0) {
      trackIncome(roomName, currentTotal, prevTotal);
    }
    if (!(Memory.v1 as any)._prevTotalEnergy) (Memory.v1 as any)._prevTotalEnergy = {};
    (Memory.v1 as any)._prevTotalEnergy[roomName] = currentTotal;

    // Terrain and layout planning — cache every 100 ticks
    getTerrainMatrix(room.name);
    if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
      const health = getHealth(room);
      if (health !== 'red' || !room.memory.layout) {
        const layout = planLayout(room);
        const swapPlan = planSwap(room, layout);
        room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
      }
    }

    // Create construction sites from swap plan
    if (room.memory.layout && room.memory.layout.swap) {
      if (shouldRecheck(room)) {
        demolishMisplaced(room, room.memory.layout.swap);
      } else if (shouldRecheck(room, 1)) {
        buildMissing(room, room.memory.layout.swap);
      }
    }

    // Drain pending roads from traffic heatmap (up to 5 per tick)
    drainPendingRoads(room);

    // Periodic layout rechecking
    recheckLayout(room);

    // Hatchery processes queue and spawns highest priority request
    hatcheryProcess(room);

    // Run existing creeps
    runCreeps(room, room.memory.goal);

    // Track construction progress for build rate
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    let progressDelta = 0;
    for (const site of sites) {
      const prev = (Memory.v1 as any)._prevProgress?.[site.id] || site.progress;
      progressDelta += Math.max(0, site.progress - prev);
      if (!(Memory.v1 as any)._prevProgress) (Memory.v1 as any)._prevProgress = {};
      (Memory.v1 as any)._prevProgress[site.id] = site.progress;
    }
    if (progressDelta > 0) {
      trackBuild(roomName, progressDelta);
    }

    HUD.run(room);
  }
};
