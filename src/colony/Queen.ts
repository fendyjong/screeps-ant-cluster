// src/colony/Queen.ts

import { Priority, SpawnRequest } from '../hatchery/Request';
import { request } from '../hatchery/Hatchery';
import { DeathWatchEntry, CashflowHealth } from '../types';
import { getHealth } from '../lib/Cashflow';

const ROLE_PRIORITIES: Record<string, number> = {
	harvester: Priority.HIGH,
	hauler: Priority.NORMAL,
	builder: Priority.NORMAL,
	upgrader: Priority.NORMAL,
	defender: Priority.HIGH,
};

const DEFAULT_BODIES: Record<string, { min: BodyPartConstant[]; ideal: BodyPartConstant[] }> = {
	harvester: {
		min: [WORK, CARRY, MOVE],
		ideal: [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
	},
	hauler: {
		min: [CARRY, CARRY, MOVE],
		ideal: [CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE],
	},
	builder: {
		min: [WORK, CARRY, MOVE],
		ideal: [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
	},
	upgrader: {
		min: [WORK, CARRY, MOVE],
		ideal: [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE],
	},
	defender: {
		min: [TOUGH, ATTACK, ATTACK, MOVE],
		ideal: [TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE],
	},
};

interface PhaseConfig {
	floor: Record<string, number>
	scaling: Record<string, { threshold: number; increment: number }>
}

function getPhaseConfig(room: Room): PhaseConfig {
	const rcl = room.controller?.level || 1;
	const energyRatio = room.energyAvailable / Math.max(room.energyCapacityAvailable, 1);

	if (rcl <= 2 && energyRatio < 0.8) {
		return {
			floor: { harvester: 2, hauler: 1 },
			scaling: {},
		};
	}

	if (rcl <= 2) {
		return {
			floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
			scaling: { hauler: { threshold: 5000, increment: 1 } },
		};
	}

	const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	const hasSites = sites.length > 0;

	const missingCritical = (type: StructureConstant): boolean => {
		const have = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === type }).length;
		const need = CONTROLLER_STRUCTURES[type]?.[rcl] || 0;
		return have < need;
	};

	const missingExtensions = missingCritical(STRUCTURE_EXTENSION);
	const missingTowers = missingCritical(STRUCTURE_TOWER);

	if (rcl <= 4 && (missingExtensions || missingTowers)) {
		return {
			floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
			scaling: {
				builder: { threshold: 30000, increment: 1 },
				upgrader: { threshold: 5000, increment: 1 },
			},
		};
	}

	if (rcl >= 8 || (!hasSites && rcl >= 5)) {
		return {
			floor: { harvester: 2, hauler: 1, upgrader: 1 },
			scaling: {
				upgrader: { threshold: 10000, increment: 1 },
			},
		};
	}

	if (hasSites && rcl >= 5) {
		return {
			floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
			scaling: {
				hauler: { threshold: 10000, increment: 1 },
				builder: { threshold: 20000, increment: 1 },
			},
		};
	}

	return {
		floor: { harvester: 2, hauler: 1, upgrader: 1 },
		scaling: {},
	};
}

function computeTargets(room: Room, health: CashflowHealth): Record<string, number> {
	const phase = getPhaseConfig(room);
	const targets: Record<string, number> = { ...phase.floor };

	const stored = room.storage ? room.storage.store[RESOURCE_ENERGY] || 0 : 0;
	const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	const backlog = sites.reduce((sum, s) => sum + (s.progressTotal - s.progress), 0);

	for (const [role, cfg] of Object.entries(phase.scaling)) {
		let extra = 0;
		const threshold = health === 'red' ? cfg.threshold * 2 : cfg.threshold;
		if (role === 'builder') {
			extra = Math.floor(backlog / threshold) * cfg.increment;
		} else {
			extra = Math.floor(stored / threshold) * cfg.increment;
		}
		targets[role] = (targets[role] || 0) + extra;
	}

	return targets;
}

function isEconomyLocked(room: Room): boolean {
	const harvesters = Object.values(Game.creeps).filter(
		c => c.memory.roomName === room.name && c.memory.role === 'harvester'
	);
	return room.energyAvailable < 200 && harvesters.length === 0;
}

function scanCreeps(room: Room): { live: Record<string, number>; soonDead: Record<string, number>; deathWatch: Record<string, DeathWatchEntry[]> } {
	const live: Record<string, number> = {};
	const soonDead: Record<string, number> = {};
	const deathWatch: Record<string, DeathWatchEntry[]> = {};
	for (const name in Game.creeps) {
		const creep = Game.creeps[name];
		if (creep.memory.roomName !== room.name) continue;
		const role = creep.memory.role || 'unknown';
		live[role] = (live[role] || 0) + 1;
		const ttl = creep.ticksToLive;
		if (ttl !== undefined && ttl < 100) {
			soonDead[role] = (soonDead[role] || 0) + 1;
			if (!deathWatch[role]) deathWatch[role] = [];
			deathWatch[role].push({ name, ttl });
		}
	}
	return { live, soonDead, deathWatch };
}

function processEvents(room: Room): void {
	const events = Memory.v1.events;
	if (!events) return;

	if (events.hostile?.[room.name]) {
		const bodyDef = DEFAULT_BODIES.defender;
		const spawnReq: SpawnRequest = {
			role: 'defender',
			priority: Priority.CRITICAL,
			body: bodyDef,
			count: 1,
			memory: {},
			createdAt: Game.time,
			roomName: room.name,
		};
		request(spawnReq);
		delete events.hostile[room.name];
	}

	if (events.expansion?.[room.name]) {
		const ev = events.expansion[room.name];
		const claimReq: SpawnRequest = {
			role: 'claimer',
			priority: Priority.LOW,
			body: { min: [CLAIM, MOVE], ideal: [CLAIM, MOVE] },
			count: 1,
			memory: { targetRoom: ev.targetRoom, claim: true },
			createdAt: Game.time,
			roomName: room.name,
		};
		request(claimReq);

		const remoteHarvester: SpawnRequest = {
			role: 'harvester',
			priority: Priority.LOW,
			body: DEFAULT_BODIES.harvester,
			count: 2,
			memory: { remoteRoom: ev.targetRoom },
			createdAt: Game.time,
			roomName: room.name,
		};
		request(remoteHarvester);

		const remoteHauler: SpawnRequest = {
			role: 'hauler',
			priority: Priority.LOW,
			body: DEFAULT_BODIES.hauler,
			count: 1,
			memory: { remoteRoom: ev.targetRoom },
			createdAt: Game.time,
			roomName: room.name,
		};
		request(remoteHauler);

		delete events.expansion[room.name];
	}
}

export function tick(room: Room): void {
	if (!Memory.v1) Memory.v1 = {} as Memory['v1'];
	if (!Memory.v1.hatchery) Memory.v1.hatchery = { queue: {}, deathWatch: {} };
	if (!Memory.v1.hatchery.deathWatch[room.name]) Memory.v1.hatchery.deathWatch[room.name] = {};
	if (!Memory.v1.events) Memory.v1.events = {};

	const { live, soonDead, deathWatch } = scanCreeps(room);
	Memory.v1.hatchery.deathWatch[room.name] = deathWatch;

	const locked = isEconomyLocked(room);
	const targets = computeTargets(room, getHealth(room));

	const roleOrder = ['harvester', 'hauler', 'builder', 'upgrader', 'defender'];

	for (const role of roleOrder) {
		const target = targets[role] || 0;

		if (locked && role !== 'harvester' && role !== 'hauler') continue;

		const alive = live[role] || 0;
		const dying = soonDead[role] || 0;
		const need = Math.max(0, target + dying - alive);

		if (need <= 0) continue;

		const basePrio = ROLE_PRIORITIES[role] || Priority.NORMAL;
		let priority = basePrio;

		const dw = deathWatch[role] || [];
		const minTtl = dw.length > 0 ? Math.min(...dw.map(e => e.ttl)) : 999;

		if (minTtl < 20) priority = Math.min(priority, 50);
		else if (minTtl < 100) priority = Math.min(priority, 150);

		const bodyDef = DEFAULT_BODIES[role] || DEFAULT_BODIES.harvester;

		const spawnReq: SpawnRequest = {
			role,
			priority,
			body: bodyDef,
			count: need,
			memory: {},
			createdAt: Game.time,
			roomName: room.name,
		};

		request(spawnReq);
	}

	processEvents(room);
}