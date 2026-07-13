import { getBudget } from '../lib/Cashflow';

export const REBUILD_COSTS: Partial<Record<StructureConstant, number>> = {
  [STRUCTURE_SPAWN]: 15000,
  [STRUCTURE_STORAGE]: 100000,
  [STRUCTURE_TOWER]: 5000,
  [STRUCTURE_LINK]: 5000,
  [STRUCTURE_TERMINAL]: 100000,
  [STRUCTURE_LAB]: 50000,
  [STRUCTURE_OBSERVER]: 8000,
  [STRUCTURE_NUKER]: 100000,
  [STRUCTURE_POWER_SPAWN]: 200000,
  [STRUCTURE_EXTRACTOR]: 5000,
  [STRUCTURE_ROAD]: 300,
  [STRUCTURE_WALL]: 10000,
  [STRUCTURE_RAMPART]: 10000,
  [STRUCTURE_EXTENSION]: 3000,
};

export const BUILD_PRIORITIES: StructureConstant[] = [
  STRUCTURE_SPAWN,
  STRUCTURE_STORAGE,
  STRUCTURE_TOWER,
  STRUCTURE_LINK,
  STRUCTURE_TERMINAL,
  STRUCTURE_LAB,
  STRUCTURE_OBSERVER,
  STRUCTURE_NUKER,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_EXTRACTOR,
  STRUCTURE_EXTENSION,
  STRUCTURE_ROAD,
  STRUCTURE_RAMPART,
  STRUCTURE_WALL,
];

export function sortByPriority(
  buildList: { pos: RoomPosition; structureType: StructureConstant }[]
): { pos: RoomPosition; structureType: StructureConstant }[] {
  return buildList.sort((a, b) => {
    const aIdx = BUILD_PRIORITIES.indexOf(a.structureType);
    const bIdx = BUILD_PRIORITIES.indexOf(b.structureType);
    return aIdx - bIdx;
  });
}

export function isSafeToDestroy(room: Room, structure: Structure): boolean {
  const type = structure.structureType;
  const cost = REBUILD_COSTS[type] || 0;

  if (type === STRUCTURE_SPAWN) {
    const otherSpawns = room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_SPAWN && s.id !== structure.id
    });
    if (otherSpawns.length > 0) return true;
    const { buildBudget } = getBudget(room);
    return buildBudget >= cost;
  }

  if (type === STRUCTURE_TERMINAL || type === STRUCTURE_STORAGE) {
    if (room.controller && room.controller.level < 4) return false;
  }

  if (type === STRUCTURE_TERMINAL) {
    const storage = room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_STORAGE
    })[0];
    if (!storage) return false;
  }

  if (type === STRUCTURE_STORAGE) {
    const terminal = room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_TERMINAL
    })[0] as StructureTerminal | undefined;
    if (terminal) {
      const nonEnergy = Object.keys(terminal.store).filter(r => r !== RESOURCE_ENERGY);
      if (nonEnergy.some(r => (terminal.store[r] || 0) > 1000)) return false;
    }
  }

  return true;
}