import { hasPos } from 'screeps';

export function normalizePos(destination: HasPos | RoomPosition): RoomPosition {
	if (hasPos(destination)) {
		return destination.pos;
	}
	return destination;
}

export function isExit(pos: Coord): boolean {
	return pos.x === 0 || pos.y === 0 || pos.x === 49 || pos.y === 49;
}

export function sameCoord(pos1: Coord, pos2: Coord): boolean {
	return pos1.x === pos2.x && pos1.y === pos2.y;
}

export function getTerrainCosts(creep: Creep): { plainCost: number; swampCost: number } {
	let weighted = 0;
	let moveParts = 0;
	for (const part of creep.body) {
		switch (part.type) {
			case MOVE:
				moveParts++;
				break;
			case CARRY:
				break;
			default:
				weighted++;
		}
	}

	if (moveParts === 0) moveParts = 1;

	const carryUsed = creep.store.getUsedCapacity();
	weighted += Math.ceil(carryUsed / CARRY_CAPACITY);

	const ratio = Math.ceil(weighted / moveParts);
	return {
		plainCost: Math.max(ratio, 1),
		swampCost: Math.max(ratio * 5, 5),
	};
}
