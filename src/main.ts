// src/main.ts

import { tick as colonyTick } from './colony/Colony';
import { tick as spawnerTick } from './spawn/Spawner';
import * as Harvester from './roles/Harvester';
import * as Hauler from './roles/Hauler';
import * as Builder from './roles/Builder';
import * as Upgrader from './roles/Upgrader';
import { ensureRoomMemory, ensureCreepMemory } from './lib/Memory';
import { getTerrainMatrix } from './lib/TerrainMatrix';
import { planLayout, planSwap } from './colony/Architect';
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

    spawnerTick(room, room.memory.goal);
    runCreeps(room, room.memory.goal);
  }
};
