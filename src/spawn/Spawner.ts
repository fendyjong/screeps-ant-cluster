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
      
      if (room.energyCapacityAvailable >= bodyCost) {
        const name = `${role}_${room.name}_${Game.time}`;
        const result = spawn.spawnCreep(body, name, {
          memory: { role, roomName: room.name }
        });
        
        if (result === OK) break;
      }
    }
  }
}
