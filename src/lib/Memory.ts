// src/lib/Memory.ts

export const CURRENT_NS = 'v1';

const ENGINE_KEYS: Record<string, true> = {
  creeps: true,
  rooms: true,
  flags: true,
  powerCreeps: true,
};

export function ensureRoomMemory(room: Room): void {
  // Nothing required — layout is optional
}

export function ensureCreepMemory(creep: Creep): void {
  if (!creep.memory.role) {
    creep.memory.role = 'harvester';
  }
  if (!creep.memory.roomName) {
    creep.memory.roomName = creep.room.name;
  }
}

export function ensureMemoryNs(): void {
  if (!Memory[CURRENT_NS]) {
    Memory[CURRENT_NS] = {};
  }
}

export function cleanLegacyMemory(): void {
  for (const key in Memory) {
    if (key === CURRENT_NS) continue;
    if (ENGINE_KEYS[key]) continue;
    delete Memory[key];
  }
}