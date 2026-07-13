// src/main.ts

import { tick as colonyTick } from './colony/Colony';
import { tick as spawnerTick } from './spawn/Spawner';
import * as Harvester from './roles/Harvester';
import * as Hauler from './roles/Hauler';
import * as Builder from './roles/Builder';
import * as Upgrader from './roles/Upgrader';
import { ensureRoomMemory, ensureCreepMemory, ensureMemoryNs, cleanLegacyMemory, CURRENT_NS } from './lib/Memory';
import { getTerrainMatrix } from './lib/TerrainMatrix';
import { planLayout, planSwap } from './colony/Architect';
import { Goal } from './types';
import * as HUD from './lib/HUD';

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

const STRUCTURE_COSTS: Record<string, number> = {
  [STRUCTURE_SPAWN]: 15000,
  [STRUCTURE_STORAGE]: 100000,
  [STRUCTURE_TOWER]: 5000,
  [STRUCTURE_LINK]: 5000,
  [STRUCTURE_TERMINAL]: 100000,
  [STRUCTURE_LAB]: 50000,
  [STRUCTURE_FACTORY]: 100000,
  [STRUCTURE_OBSERVER]: 8000,
  [STRUCTURE_NUKER]: 100000,
  [STRUCTURE_POWER_SPAWN]: 200000,
  [STRUCTURE_EXTRACTOR]: 5000,
  [STRUCTURE_ROAD]: 300,
  [STRUCTURE_WALL]: 10000,
  [STRUCTURE_RAMPART]: 10000,
  [STRUCTURE_CONTAINER]: 5000,
  [STRUCTURE_EXTENSION]: 3000,
};

function createConstructionSites(room: Room): void {
  const layout = room.memory.layout;
  if (!layout || !layout.swap || layout.swap.build.length === 0) return;

  // Only create sites every 100 ticks
  if (Game.time % 100 !== 0) return;

  // Check energy availability
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);

  const sitesPerRun = 5;
  let sitesCreated = 0;

  for (const entry of layout.swap.build) {
    // Skip if construction site already exists at this position
    const existingSite = sites.find(s => 
      s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType
    );
    if (existingSite) continue;

    // Skip if structure already exists at this position
    const existingStructure = room.lookForAt(LOOK_STRUCTURES, entry.pos.x, entry.pos.y)
      .find(s => s.structureType === entry.structureType);
    if (existingStructure) continue;

    // Check energy availability (50% of structure cost)
    const cost = STRUCTURE_COSTS[entry.structureType] || 0;
    if (cost > 0 && room.energyAvailable < cost * 0.5) continue;

    // Create construction site
    const result = room.createConstructionSite(entry.pos, entry.structureType);
    if (result === OK) {
      sitesCreated++;
      if (sitesCreated >= sitesPerRun) break;
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
    colonyTick(room);

    // Track energy for HUD income/spend
    const prevEnergy = (Memory.v1 as any)?.hud?.prevEnergy?.[roomName];
    const currentEnergy = room.energyAvailable + (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0);
    if (prevEnergy !== undefined) {
      const delta = currentEnergy - prevEnergy;
      if (!(Memory.v1 as any).hud) (Memory.v1 as any).hud = {};
      if (!(Memory.v1 as any).hud.income) (Memory.v1 as any).hud.income = {};
      if (!(Memory.v1 as any).hud.spend) (Memory.v1 as any).hud.spend = {};
      if (delta > 0) {
        (Memory.v1 as any).hud.income[roomName] = (Memory.v1 as any).hud.income[roomName] || 0;
        (Memory.v1 as any).hud.income[roomName] = (Memory.v1 as any).hud.income[roomName] * 0.9 + delta * 0.1;
      } else {
        (Memory.v1 as any).hud.spend[roomName] = (Memory.v1 as any).hud.spend[roomName] || 0;
        (Memory.v1 as any).hud.spend[roomName] = (Memory.v1 as any).hud.spend[roomName] * 0.9 + Math.abs(delta) * 0.1;
      }
    }
    if (!(Memory.v1 as any).hud.prevEnergy) (Memory.v1 as any).hud.prevEnergy = {};
    (Memory.v1 as any).hud.prevEnergy[roomName] = currentEnergy;

    // Terrain and layout planning — cache every 100 ticks
    getTerrainMatrix(room.name);
    if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
      const layout = planLayout(room);
      const swapPlan = planSwap(room, layout);
      room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
    }

    // Create construction sites from swap plan
    createConstructionSites(room);

    // Drain pending roads from traffic heatmap (up to 5 per tick)
    drainPendingRoads(room);

    // Periodic layout rechecking
    recheckLayout(room);

    spawnerTick(room, room.memory.goal);
    runCreeps(room, room.memory.goal);

    HUD.run(room);
  }
};
