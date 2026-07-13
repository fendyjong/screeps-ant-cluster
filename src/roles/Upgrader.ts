import { moveTo } from '../lib/Pathing';
import { getTask, setTask, clearTask, isValidTask, executeTask } from '../lib/TaskManager';

function findEnergySource(creep: Creep): AnyStoreStructure | Resource | Tombstone | null {
	const containers = creep.room.find(FIND_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
	});
	if (containers.length > 0) return creep.pos.findClosestByPath(containers);

	const storage = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0
	});
	if (storage.length > 0) return storage[0];

	const dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
		filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
	});
	if (dropped.length > 0) return creep.pos.findClosestByPath(dropped);

	return null;
}

function actionUpgrade(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'upgrade' && isValidTask(creep)) return true;

	const controller = creep.room.controller;
	if (!controller) return false;
	setTask(creep, 'upgrade', controller.id);
	return true;
}

function actionRecharge(creep: Creep): boolean {
	if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'recharge' && isValidTask(creep)) return true;

	const source = findEnergySource(creep);
	if (!source) return false;
	setTask(creep, 'recharge', source.id);
	return true;
}

export const PRIORITY: ((creep: Creep) => boolean)[] = [
	actionUpgrade,
	actionRecharge,
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