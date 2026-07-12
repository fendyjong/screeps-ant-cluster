function getBodyCost(body) {
	return _.sum(body, function (part) {
		return BODYPART_COST[part];
	});
}

function buildBody(capacity, pattern, minimum) {
	const minimumCost = getBodyCost(minimum);
	if (capacity < minimumCost) {
		return minimum;
	}

	const patternCost = getBodyCost(pattern);
	const body = minimum.slice();
	let used = getBodyCost(body);

	while (used + patternCost <= capacity && body.length + pattern.length <= 50) {
		body.push.apply(body, pattern);
		used += patternCost;
	}

	return body;
}

function countByRole(role, roomName) {
	return _.sum(Game.creeps, function (creep) {
		return creep.memory.role === role && creep.memory.roomName === roomName ? 1 : 0;
	});
}

function getReplacementLead(creep, fallbackThreshold) {
	const bodyLength = creep.body ? creep.body.length : 0;
	const spawnLead = bodyLength * CREEP_SPAWN_TIME;
	return Math.max(fallbackThreshold || 0, spawnLead + 25);
}

function countExpiringByRole(role, roomName, ttlThreshold) {
	return _.sum(Game.creeps, function (creep) {
		if (creep.memory.role !== role || creep.memory.roomName !== roomName || !creep.ticksToLive) {
			return 0;
		}

		return creep.ticksToLive <= getReplacementLead(creep, ttlThreshold) ? 1 : 0;
	});
}

function getAvailableSpawn() {
	for (const spawnName in Game.spawns) {
		const spawn = Game.spawns[spawnName];
		if (!spawn.spawning) {
			return spawn;
		}
	}
	return null;
}

var ROLE_LIST = ['harvester', 'hauler', 'builder', 'upgrader', 'defender', 'rangedEscort', 'scout', 'claimer', 'attacker', 'healer'];

var BODY_PRESETS = {
	harvester: { pattern: [WORK, WORK, CARRY, MOVE], minimum: [WORK, CARRY, MOVE] },
	hauler: { pattern: [CARRY, CARRY, MOVE], minimum: [CARRY, MOVE] },
	builder: { pattern: [WORK, WORK, CARRY, MOVE], minimum: [WORK, CARRY, MOVE] },
	upgrader: { pattern: [WORK, WORK, CARRY, MOVE], minimum: [WORK, CARRY, MOVE] },
	defender: { pattern: [TOUGH, ATTACK, ATTACK, MOVE], minimum: [MOVE, ATTACK] },
	rangedEscort: { pattern: [MOVE, RANGED_ATTACK, RANGED_ATTACK, MOVE], minimum: [MOVE, RANGED_ATTACK] },
	attacker: { pattern: [TOUGH, ATTACK, ATTACK, MOVE], minimum: [MOVE, ATTACK] },
	healer: { pattern: [HEAL, HEAL, MOVE], minimum: [HEAL, MOVE] },
	scout: { pattern: [MOVE, MOVE], minimum: [MOVE] },
	claimer: { pattern: [CLAIM, MOVE], minimum: [CLAIM, MOVE] },
};

function getEmergencyHarvesterBody(room) {
	if (room.energyAvailable >= 200) {
		return [WORK, CARRY, MOVE];
	}
	if (room.energyAvailable >= 150) {
		return [WORK, MOVE];
	}
	return null;
}

function getBodyForRole(role, room) {
	var preset = BODY_PRESETS[role];
	if (!preset) return null;

	var plan = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].colonyPlan;
	if (role === 'harvester' || role === 'hauler') {
		if (plan && plan.economy && plan.economy.survival) {
			return getEmergencyHarvesterBody(room);
		}
	}

	return buildBody(room.energyAvailable, preset.pattern, preset.minimum);
}

function canSpendEnergy(role, room, bodyCost, plan, existingCount, minimumFloor) {
	if (room.energyAvailable < bodyCost) {
		return false;
	}

	if ((minimumFloor || 0) > 0 && (existingCount || 0) < minimumFloor) {
		return true;
	}

	if (role === 'harvester' || role === 'hauler' || role === 'defender') {
		return true;
	}

	if (plan && plan.economy && plan.economy.locked) {
		var phase = plan.phase;
		if (!phase) return false;

		var controllerRisk = room.controller && room.controller.ticksToDowngrade < 8000;
		var hasSites = room.find(FIND_MY_CONSTRUCTION_SITES).length > 0;

		var allowDuringLocked = role === 'upgrader' && (controllerRisk || phase.status === 'upgrade');
		allowDuringLocked = allowDuringLocked || (role === 'builder' && hasSites);
		allowDuringLocked = allowDuringLocked || (phase.status === 'critical_path');
		if (allowDuringLocked) {
			return true;
		}
		return false;
	}

	return true;
}

function getCriticalMinimums(plan) {
	var phaseStatus = plan && plan.phase ? plan.phase.status : 'upgrade';
	var civilian = plan && plan.civilian ? plan.civilian : {};
	var minimums = plan && plan.minimums ? plan.minimums : {};
	var mins = {
		harvester: Math.max(1, civilian.harvester || 1, minimums.harvester || 0),
	};

	if (minimums.builder) mins.builder = Math.max(1, minimums.builder);
	if (minimums.upgrader) mins.upgrader = Math.max(1, minimums.upgrader);

	if (phaseStatus === 'bootstrap') {
		return mins;
	}

	if ((civilian.hauler || 0) > 0 || phaseStatus === 'stabilize') {
		mins.hauler = Math.max(1, civilian.hauler || 1);
	}

	if (phaseStatus === 'critical_path' || phaseStatus === 'buildout' || phaseStatus === 'upgrade' || phaseStatus === 'complete') {
		if ((civilian.builder || 0) > 0) {
			mins.builder = Math.max(1, civilian.builder);
		}
		if ((civilian.upgrader || 0) > 0) {
			mins.upgrader = Math.max(1, civilian.upgrader);
		}
	}

	if (phaseStatus === 'defense') {
		mins.defender = Math.max(1, civilian.defender || 1);
	}

	return mins;
}

function buildRoleSnapshot(roomName) {
	var counts = {};
	var expiring = {};
	for (var i = 0; i < ROLE_LIST.length; i++) {
		var role = ROLE_LIST[i];
		counts[role] = countByRole(role, roomName);
		expiring[role] = countExpiringByRole(role, roomName);
	}
	return {
		counts: counts,
		expiring: expiring,
	};
}

function recordSpawnState(room, plan, role) {
	if (!Memory.strategy) Memory.strategy = {};
	if (!Memory.strategy.spawnState) Memory.strategy.spawnState = {};

	Memory.strategy.spawnState[room.name] = {
		tick: Game.time,
		role: role,
		survivalMode: plan.economy.survival,
		economyLocked: plan.economy.locked,
		storedEnergy: plan.economy.storedEnergy,
	};
}

function spawnVisual(spawn) {
	if (!spawn.spawning) return;
	var creep = Game.creeps[spawn.spawning.name];
	if (creep) {
		spawn.room.visual.text('SPAWNING ' + creep.memory.role, spawn.pos.x + 1, spawn.pos.y, {
			align: 'left', opacity: 0.8,
		});
	}
}

// Demand‑tracker helper – updates smoothed demand metrics every 25 ticks
function updateDemandTracker(room) {
	var plan = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].colonyPlan;
	var sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	var backlog = _.sum(sites, function(s) { return Math.max(0, s.progressTotal - s.progress); });
	var idleRatio = (Memory.debug && Memory.debug.creepAnalysis && Memory.debug.creepAnalysis.idleCreeps / Object.keys(Game.creeps).length) || 0;
	var energyReserve = (Memory.strategy && Memory.strategy.economy && Memory.strategy.economy.stockpile) || 0;
	var prev = Memory.spawnDemand || {};
	Memory.spawnDemand = {
		backlog: (prev.backlog || backlog) * 0.8 + backlog * 0.2,
		idleRatio: (prev.idleRatio || idleRatio) * 0.8 + idleRatio * 0.2,
		energyReserve: (prev.energyReserve || energyReserve) * 0.8 + energyReserve * 0.2,
	};
}

// Baseline computation – derives desired creep counts from demand
function computeBaseline(room) {
	var d = Memory.spawnDemand || {};
	var desired = {};
	desired.harvester = Math.max(2, Math.ceil((1 - (d.idleRatio || 0)) * 4));
	desired.hauler = Math.max(1, Math.ceil((d.energyReserve || 0) / 5000));
	desired.builder = Math.max(1, Math.ceil((d.backlog || 0) / 15000));
	var ctrl = room.controller;
	desired.upgrader = (ctrl && ctrl.ticksToDowngrade < 8000) ? 2 : 1;
	desired.defender = 0;
	desired.scout = 0;
	desired.claimer = 0;
	desired.attacker = 0;
	desired.healer = 0;
	return desired;
}

// Per‑tick triggers – adjust baseline for spikes and emergencies
function applyTriggers(room, baseline) {
	var d = Memory.spawnDemand || {};
	if ((d.backlog || 0) > 2 * (baseline.builder || 0) * 15000) {
		baseline.builder = (baseline.builder || 0) + 1;
	}
	if ((d.idleRatio || 0) > 0.6) {
		Object.keys(baseline).forEach(function(r) {
			baseline[r] = (baseline[r] || 0) + 1;
		});
	}
	var plan = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].colonyPlan;
	if (plan && plan.economy && plan.economy.stockpile < plan.economy.reserveFloor) {
		baseline.harvester = Math.max(baseline.harvester, 2);
	}
	return baseline;
}

function hybridRun() {
	for (const roomName in Game.rooms) {
		const room = Game.rooms[roomName];
		if (!room.controller || !room.controller.my) continue;

		// 1) every 25 ticks – update demand tracker
		if (Game.time % 25 === 0) updateDemandTracker(room);

		// 2) compute baseline & apply triggers
		let desired = computeBaseline(room);
		desired = applyTriggers(room, desired);

		// 3) current role counts
		const snapshot = buildRoleSnapshot(roomName);
		const cur = snapshot.counts;

		// 4) pick first role below desired baseline
		for (const role of ROLE_LIST) {
			const need = (desired[role] || 0) - (cur[role] || 0);
			if (need > 0) {
				const body = getBodyForRole(role, room);
				if (!body) continue; // not enough energy
				const spawn = getAvailableSpawn();
				if (!spawn) break; // no idle spawn
				const name = `${role}_${roomName}_${Game.time}`;
				spawn.spawnCreep(body, name, {memory:{role,roomName,stats:{}}});
				const plan = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].colonyPlan;
				recordSpawnState(room, plan, role);
				break; // spawn only one creep per tick
				}
			}
		}
	}
}
const autoSpawn = {
	run: hybridRun,

};

module.exports = autoSpawn;
