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

    spawnerTick(room, room.memory.goal);
    runCreeps(room, room.memory.goal);
  }
};
