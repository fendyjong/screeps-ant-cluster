import { moveTo } from '../lib/Pathing';
import { getTask, setTask, clearTask, isValidTask, executeTask } from '../lib/TaskManager';

function findEnergy(creep: Creep): Resource | Structure | null {
	const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
		filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
	});
	if (droppedEnergy.length > 0) {
		return creep.pos.findClosestByPath(droppedEnergy);
	}

	const containers = creep.room.find(FIND_STRUCTURES, {
		filter: (s) => (
			s.structureType === STRUCTURE_CONTAINER &&
			s.store[RESOURCE_ENERGY] > 0
		)
	});
	if (containers.length > 0) {
		return creep.pos.findClosestByPath(containers);
	}

	const storage = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => (
			s.structureType === STRUCTURE_STORAGE &&
			s.store[RESOURCE_ENERGY] > 0
		)
	});
	if (storage.length > 0) {
		return storage[0];
	}

	return null;
}

function findDropOff(creep: Creep): Structure | null {
	const targets = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => (
			(s.structureType === STRUCTURE_SPAWN ||
			 s.structureType === STRUCTURE_EXTENSION) &&
			s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
		)
	});
	if (targets.length > 0) {
		return creep.pos.findClosestByPath(targets);
	}

	const storage = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => (
			s.structureType === STRUCTURE_STORAGE &&
			s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
		)
	});
	if (storage.length > 0) {
		return storage[0];
	}

	return null;
}

function actionPickup(creep: Creep): boolean {
	if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'pickup' && isValidTask(creep)) return true;

	const energy = creep.room.find(FIND_DROPPED_RESOURCES, {
		filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
	});
	if (energy.length === 0) return false;
	const closest = creep.pos.findClosestByPath(energy);
	if (!closest) return false;
	setTask(creep, 'pickup', closest.id);
	return true;
}

function actionWithdraw(creep: Creep): boolean {
	if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'withdraw' && isValidTask(creep)) return true;

	const energy = findEnergy(creep);
	if (!energy) return false;
	setTask(creep, 'withdraw', energy.id);
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
	actionPickup,
	actionWithdraw,
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