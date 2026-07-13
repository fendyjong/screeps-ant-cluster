// src/lib/TaskManager.ts

import { TaskMemory } from '../types';
import { moveTo } from './Pathing';

export function getTask(creep: Creep): TaskMemory | null {
	return creep.memory.task || null;
}

export function setTask(creep: Creep, type: TaskMemory['type'], targetId: string): void {
	creep.memory.task = { type, targetId };
}

export function clearTask(creep: Creep): void {
	delete creep.memory.task;
}

export function isValidTask(creep: Creep): boolean {
	const task = creep.memory.task;
	if (!task || !task.targetId) return false;
	const target = Game.getObjectById(task.targetId);
	if (!target) return false;

	switch (task.type) {
		case 'harvest':
			return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
		case 'transfer':
			return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
		case 'withdraw':
			return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && (target as AnyStoreStructure).store[RESOURCE_ENERGY] > 0;
		case 'pickup':
			return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
		case 'build':
			return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
		case 'repair':
			return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 && (target as Structure).hits < (target as Structure).hitsMax;
		case 'upgrade':
			return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
		case 'dismantle':
			return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
		case 'recharge':
			return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
		default:
			return false;
	}
}

export function executeTask(creep: Creep): 'ok' | 'working' | 'invalid' {
	const task = creep.memory.task;
	if (!task || !task.targetId) return 'invalid';

	const target = Game.getObjectById(task.targetId);
	if (!target) {
		clearTask(creep);
		return 'invalid';
	}

	let result: number;

	switch (task.type) {
		case 'harvest':
			result = creep.harvest(target as Source);
			break;
		case 'transfer':
			result = creep.transfer(target as AnyStructure, RESOURCE_ENERGY);
			break;
		case 'withdraw':
			result = creep.withdraw(target as AnyStoreStructure, RESOURCE_ENERGY);
			break;
		case 'pickup':
			result = creep.pickup(target as Resource);
			break;
		case 'build':
			result = creep.build(target as ConstructionSite);
			break;
		case 'repair':
			result = creep.repair(target as Structure);
			break;
		case 'upgrade':
			result = creep.upgradeController(target as StructureController);
			break;
		case 'dismantle':
			result = creep.dismantle(target as Structure);
			break;
		case 'recharge':
			if (target instanceof Resource) {
				result = creep.pickup(target);
			} else if (target instanceof Tombstone) {
				result = creep.withdraw(target, RESOURCE_ENERGY);
			} else {
				result = creep.withdraw(target as AnyStoreStructure, RESOURCE_ENERGY);
			}
			break;
		default:
			return 'invalid';
	}

	if (result === OK) {
		switch (task.type) {
			case 'harvest':
				if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
					clearTask(creep);
					return 'ok';
				}
				break;
			case 'transfer':
				if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
					clearTask(creep);
					return 'ok';
				}
				break;
			case 'withdraw':
			case 'pickup':
			case 'recharge':
				if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
					clearTask(creep);
					return 'ok';
				}
				break;
			case 'build':
			case 'repair':
			case 'upgrade':
			case 'dismantle':
				if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
					clearTask(creep);
					return 'ok';
				}
				break;
		}
		return 'ok';
	}

	if (result === ERR_NOT_IN_RANGE) {
		moveTo(creep, target as any);
		return 'working';
	}

	if (result === ERR_INVALID_TARGET) {
		clearTask(creep);
		return 'invalid';
	}

	return 'working';
}