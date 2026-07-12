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