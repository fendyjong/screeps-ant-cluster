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
  if (!Memory.v1) (Memory as any).v1 = {};
  if (!Memory.v1.hatchery) Memory.v1.hatchery = { queue: {}, deathWatch: {} } as any;
  if (!Memory.v1.hatchery.deathWatch[room.name]) Memory.v1.hatchery.deathWatch[room.name] = {};

  updateDeathWatch(room);

  const locked = isEconomyLocked(room);
  const targets = computeTargets(room);

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

  const roleOrder = ['harvester', 'hauler', 'builder', 'upgrader', 'defender', 'scout', 'claimer', 'attacker', 'healer'];

  for (const role of roleOrder) {
    const target = targets[role] || 0;

    if (locked && role !== 'harvester' && role !== 'hauler') continue;

    const alive = live[role] || 0;
    const dying = soonDead[role] || 0;
    const need = Math.max(0, target + dying - alive);

    if (need <= 0) continue;

    const basePrio = ROLE_PRIORITIES[role] || Priority.NORMAL;
    let priority = basePrio;

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

          break;
        }
      }
    }
  }
}