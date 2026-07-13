// src/roles/Builder.ts

import { moveTo } from '../lib/Pathing';
import { getTask, setTask, clearTask, isValidTask, executeTask } from '../lib/TaskManager';

const MAX_DEMOLISH_PER_TICK = 3;

function findConstructionSite(creep: Creep): ConstructionSite | null {
	const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
	if (sites.length === 0) return null;
	return creep.pos.findClosestByPath(sites);
}

function findDamagedStructure(creep: Creep): Structure | null {
	const structures = creep.room.find(FIND_STRUCTURES, {
		filter: (s) => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
	});
	if (structures.length === 0) return null;
	return creep.pos.findClosestByPath(structures);
}

function findRechargeSource(creep: Creep): AnyStoreStructure | null {
	const containers = creep.room.find(FIND_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
	});
	if (containers.length > 0) return creep.pos.findClosestByPath(containers);

	const storage = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0
	});
	if (storage.length > 0) return storage[0];

	return null;
}

function actionDismantle(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	const layout = creep.room.memory.layout;
	const swapPlan = layout?.swap;
	if (!swapPlan || swapPlan.destroy.length === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'dismantle' && isValidTask(creep)) return true;

	let demolishCount = 0;
	for (let i = 0; i < swapPlan.destroy.length && demolishCount < MAX_DEMOLISH_PER_TICK; i++) {
		const structureId = swapPlan.destroy[i];
		const structure = Game.getObjectById(structureId) as Structure | null;
		if (!structure) {
			swapPlan.destroy.splice(i, 1);
			i--;
			continue;
		}
		const alreadyTargeted = Object.values(Game.creeps).some(c =>
			c.memory.role === 'builder' && c.memory.task?.targetId === structureId && c.name !== creep.name
		);
		if (alreadyTargeted) continue;

		setTask(creep, 'dismantle', structureId);
		return true;
	}

	return false;
}

function actionBuildFromSwap(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	const layout = creep.room.memory.layout;
	const swapPlan = layout?.swap;
	if (!swapPlan || swapPlan.build.length === 0) return false;

	const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
	for (const entry of swapPlan.build) {
		const site = sites.find(s =>
			s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType
		);
		if (site) {
			setTask(creep, 'build', site.id);
			return true;
		}
	}

	return false;
}

function actionBuild(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'build' && isValidTask(creep)) return true;

	const site = findConstructionSite(creep);
	if (!site) return false;
	setTask(creep, 'build', site.id);
	return true;
}

function actionRepair(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'repair' && isValidTask(creep)) return true;

	const structure = findDamagedStructure(creep);
	if (!structure) return false;
	setTask(creep, 'repair', structure.id);
	return true;
}

function actionRecharge(creep: Creep): boolean {
	if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'recharge' && isValidTask(creep)) return true;

	const source = findRechargeSource(creep);
	if (!source) return false;
	setTask(creep, 'recharge', source.id);
	return true;
}

export const PRIORITY: ((creep: Creep) => boolean)[] = [
	actionDismantle,
	actionBuildFromSwap,
	actionBuild,
	actionRepair,
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