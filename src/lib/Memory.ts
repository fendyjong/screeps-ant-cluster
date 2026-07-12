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
