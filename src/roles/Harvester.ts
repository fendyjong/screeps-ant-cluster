// src/roles/Harvester.ts

import { moveTo } from '../lib/Pathing';
import { getTerrainMatrix } from '../lib/PathFinder';
import { getTask, setTask, clearTask, isValidTask, executeTask } from '../lib/TaskManager';

function findSource(creep: Creep): Source | null {
	const sources = creep.room.find(FIND_SOURCES_ACTIVE);
	if (sources.length === 0) {
		const allSources = creep.room.find(FIND_SOURCES);
		return allSources[0] || null;
	}

	const harvesters = creep.room.find(FIND_MY_CREEPS, {
		filter: (c: Creep) => c.memory.role === 'harvester' && c.name !== creep.name
	});

	let best: Source | null = null;
	let bestScore = Infinity;

	for (const source of sources) {
		const dist = creep.pos.getRangeTo(source);
		const harvesterCount = harvesters.filter((h: Creep) =>
			h.memory.task?.targetId === source.id
		).length;
		const score = dist * 10 + harvesterCount;
		if (score < bestScore) {
			bestScore = score;
			best = source;
		}
	}

	return best;
}

function findDropOff(creep: Creep): Structure | null {
	const targets = creep.room.find(FIND_STRUCTURES, {
		filter: (s) => (
			(s.structureType === STRUCTURE_CONTAINER ||
			 s.structureType === STRUCTURE_STORAGE) &&
			s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
		)
	});

	if (targets.length > 0) {
		return creep.pos.findClosestByPath(targets);
	}

	const spawnTargets = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => (
			(s.structureType === STRUCTURE_SPAWN ||
			 s.structureType === STRUCTURE_EXTENSION) &&
			s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
		)
	});

	if (spawnTargets.length > 0) {
		return creep.pos.findClosestByPath(spawnTargets);
	}

	return null;
}

function actionHarvest(creep: Creep): boolean {
	if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'harvest' && isValidTask(creep)) return true;

	const source = findSource(creep);
	if (!source) return false;
	setTask(creep, 'harvest', source.id);

	const totalAdj = [
		{ dx: -1, dy: 0 }, { dx: 1, dy: 0 },
		{ dx: 0, dy: -1 }, { dx: 0, dy: 1 },
		{ dx: -1, dy: -1 }, { dx: 1, dy: -1 },
		{ dx: -1, dy: 1 }, { dx: 1, dy: 1 },
	].filter(d => {
		const x = source.pos.x + d.dx, y = source.pos.y + d.dy;
		if (x < 0 || x >= 50 || y < 0 || y >= 50) return false;
		return getTerrainMatrix(creep.room.name).get(x, y) < 255;
	}).length;

	const busyAdj = source.pos.findInRange(FIND_MY_CREEPS, 1)
		.filter((c: Creep) => c.pos.getRangeTo(source) === 1).length;

	if (busyAdj >= totalAdj && totalAdj > 0 && creep.pos.getRangeTo(source) <= 1) {
		const freeSpots = [
			{ dx: -1, dy: 0 }, { dx: 1, dy: 0 },
			{ dx: 0, dy: -1 }, { dx: 0, dy: 1 },
			{ dx: -1, dy: -1 }, { dx: 1, dy: -1 },
			{ dx: -1, dy: 1 }, { dx: 1, dy: 1 },
		]
			.map(d => new RoomPosition(source.pos.x + d.dx, source.pos.y + d.dy, creep.room.name))
			.filter(p => {
				if (p.x < 0 || p.x >= 50 || p.y < 0 || p.y >= 50) return false;
				return getTerrainMatrix(creep.room.name).get(p.x, p.y) < 255
					&& creep.room.lookForAt(LOOK_CREEPS, p.x, p.y).length === 0;
			});
		if (freeSpots.length > 0) {
			moveTo(creep, freeSpots[0]);
			return true;
		}
	}

	return true;
}

function actionTransfer(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'transfer' && isValidTask(creep)) return true;

	const dropOff = findDropOff(creep);
	if (!dropOff) return false;
	setTask(creep, 'transfer', dropOff.id);
	return true;
}

export const PRIORITY: ((creep: Creep) => boolean)[] = [
	actionHarvest,
	actionTransfer,
];

export function run(creep: Creep): void {
	if (isValidTask(creep)) {
		const result = executeTask(creep);
		if (result !== 'invalid') return;
	}
	for (const action of PRIORITY) {
		if (action(creep)) {
			executeTask(creep);
			return;
		}
	}
}