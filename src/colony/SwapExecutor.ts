import { getBudget } from '../lib/Cashflow';

export function shouldRecheck(room: Room, offset = 0): boolean {
	const rcl = room.controller?.level || 1;
	const interval = Math.max(5, Math.floor(100 / (rcl + 1)));
	const hash = Math.abs(room.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
	return Game.time % interval === (hash + offset) % interval;
}

export function demolishMisplaced(room: Room, plan: { destroy: string[]; build: { pos: RoomPosition; structureType: string }[]; state: string }): void {
	const rcl = room.controller?.level || 1;
	const toRemove: number[] = [];
	const maxPerTick = 5;
	let count = 0;

	for (let i = 0; i < plan.destroy.length && count < maxPerTick; i++) {
		const id = plan.destroy[i];
		const structure = Game.getObjectById(id) as Structure | null;
		if (!structure) {
			toRemove.push(i);
			continue;
		}

		const type = structure.structureType;

		if (type === STRUCTURE_SPAWN) {
			const otherSpawns = room.find(FIND_MY_STRUCTURES, {
				filter: s => s.structureType === STRUCTURE_SPAWN && s.id !== id
			});
			if (otherSpawns.length === 0) {
				const { buildBudget } = getBudget(room);
				if (buildBudget < 15000) continue;
				let workerCapacity = 0;
				for (const name in Game.creeps) {
					const c = Game.creeps[name];
					if (c.memory.role === 'builder' && c.memory.roomName === room.name) {
						workerCapacity += c.getActiveBodyparts(WORK) * (c.ticksToLive || 0);
					}
				}
				if (workerCapacity < 15000) continue;
			}
		}

		if (type === STRUCTURE_STORAGE) {
			if (rcl < 4) continue;
			const hasReplacement = plan.build.some(
				e => e.structureType === STRUCTURE_STORAGE
			);
			if (!hasReplacement) continue;
		}

		if (type === STRUCTURE_TERMINAL) {
			if (rcl < 4) continue;
			const storage = room.storage;
			if (!storage) continue;
			const nonEnergy = Object.keys(storage.store).filter(r => r !== RESOURCE_ENERGY);
			if (nonEnergy.some(r => (storage.store[r] || 0) > 1000)) continue;
		}

		if (type === STRUCTURE_RAMPART) {
			continue;
		}

		const result = structure.destroy();
		if (result === OK) {
			count++;
			toRemove.push(i);
		}
	}

	for (let i = toRemove.length - 1; i >= 0; i--) {
		plan.destroy.splice(toRemove[i], 1);
	}
	if (count > 0) plan.state = 'destroying';
}

export function buildMissing(room: Room, plan: { destroy: string[]; build: { pos: RoomPosition; structureType: string }[]; state: string }): void {
	const rcl = room.controller?.level || 1;
	const maxPerTick = Math.min(25, 5 + rcl * 2);
	const existingSites = room.find(FIND_MY_CONSTRUCTION_SITES);
	const toRemove: number[] = [];
	let count = 0;

	for (let i = 0; i < plan.build.length && count < maxPerTick; i++) {
		const entry = plan.build[i];

		if (existingSites.some(s => s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType)) continue;
		if (room.lookForAt(LOOK_STRUCTURES, entry.pos.x, entry.pos.y).some(s => s.structureType === entry.structureType)) {
			toRemove.push(i);
			continue;
		}

		const result = room.createConstructionSite(entry.pos, entry.structureType as StructureConstant);
		if (result === OK) {
			count++;
			toRemove.push(i);
		} else if (result === ERR_INVALID_TARGET) {
			toRemove.push(i);
		}
	}

	for (let i = toRemove.length - 1; i >= 0; i--) {
		plan.build.splice(toRemove[i], 1);
	}
	if (count > 0) plan.state = 'building';
}