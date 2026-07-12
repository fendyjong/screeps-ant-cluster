const MAX_INTEL_ROOMS = 220;
const INTEL_TTL = 5000;

function partPower(part) {
	if (part === ATTACK) {
		return 30;
	}
	if (part === RANGED_ATTACK) {
		return 24;
	}
	if (part === HEAL) {
		return 30;
	}
	if (part === TOUGH) {
		return 5;
	}
	return 0;
}

function creepCombatPower(creep) {
	let power = 0;
	for (const bodyPart of creep.body) {
		if (bodyPart.hits <= 0) {
			continue;
		}
		power += partPower(bodyPart.type);
	}
	return power;
}

function roomTowerPower(room, my) {
	const towers = room.find(my ? FIND_MY_STRUCTURES : FIND_HOSTILE_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_TOWER;
		},
	});

	let power = 0;
	for (const tower of towers) {
		const energy = tower.store[RESOURCE_ENERGY] || 0;
		if (energy <= 0) {
			continue;
		}
		power += 180;
	}
	return power;
}

function ensure() {
	if (!Memory.strategy) {
		Memory.strategy = {};
	}
	if (!Memory.roomIntel) {
		Memory.roomIntel = {};
	}
	if (!Memory.strategy.enemyProfiles) {
		Memory.strategy.enemyProfiles = {};
	}
	if (!Memory.strategy.economy) {
		Memory.strategy.economy = {
			totalStockpile: 0,
			sourceFillRatio: 1,
			depletedSources: 0,
			avgRegenTicks: 0,
			readyForReserve: false,
			readyForExpansion: false,
			readyForWar: false,
		};
	}
	if (!Memory.strategy.focusTargets) {
		Memory.strategy.focusTargets = {};
	}
	if (!Memory.strategy.kpi) {
		Memory.strategy.kpi = { history: [] };
	}
	if (!Memory.metrics) {
		Memory.metrics = {};
	}
}

function refreshEconomyState() {
	ensure();

	const ownedRooms = getOwnedRooms();
	if (ownedRooms.length === 0) {
		Memory.strategy.economy = {
			totalStockpile: 0,
			sourceFillRatio: 0,
			depletedSources: 0,
			avgRegenTicks: 0,
			readyForReserve: false,
			readyForExpansion: false,
			readyForWar: false,
		};
		return;
	}

	let totalStockpile = 0;
	let totalSourceEnergy = 0;
	let totalSourceCapacity = 0;
	let depletedSources = 0;
	let totalRegenTicks = 0;
	let regenSamples = 0;

	for (const room of ownedRooms) {
		var plan = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].colonyPlan;
		if (plan && plan.economy && plan.economy.stockpile != null) {
			totalStockpile += plan.economy.stockpile;
		} else {
			var structures = room.find(FIND_MY_STRUCTURES, {
				filter: function (structure) {
					return (
						structure.structureType === STRUCTURE_STORAGE ||
						structure.structureType === STRUCTURE_CONTAINER ||
						structure.structureType === STRUCTURE_SPAWN ||
						structure.structureType === STRUCTURE_EXTENSION
					);
				},
			});
			for (var si = 0; si < structures.length; si++) {
				totalStockpile += structures[si].store[RESOURCE_ENERGY] || 0;
			}
		}

		const sources = room.find(FIND_SOURCES);
		for (const source of sources) {
			totalSourceEnergy += source.energy;
			totalSourceCapacity += source.energyCapacity;
			if (source.energy === 0) {
				depletedSources += 1;
			}
			if (typeof source.ticksToRegeneration === 'number') {
				totalRegenTicks += source.ticksToRegeneration;
				regenSamples += 1;
			}
		}
	}

	const sourceFillRatio = totalSourceCapacity > 0 ? totalSourceEnergy / totalSourceCapacity : 0;
	const avgRegenTicks = regenSamples > 0 ? Math.floor(totalRegenTicks / regenSamples) : 0;

	const readyForReserve = totalStockpile >= 800 && sourceFillRatio >= 0.25 && depletedSources <= Math.max(2, ownedRooms.length + 1);
	const readyForExpansion = totalStockpile >= 1200 && sourceFillRatio >= 0.35 && depletedSources <= Math.max(1, ownedRooms.length);
	const readyForWar = totalStockpile >= 1800 && sourceFillRatio >= 0.5 && depletedSources <= Math.max(1, ownedRooms.length);

	Memory.strategy.economy = {
		totalStockpile: totalStockpile,
		sourceFillRatio: Number(sourceFillRatio.toFixed(2)),
		depletedSources: depletedSources,
		avgRegenTicks: avgRegenTicks,
		readyForReserve: readyForReserve,
		readyForExpansion: readyForExpansion,
		readyForWar: readyForWar,
	};
}

function pruneEnemyProfiles() {
	const profiles = Memory.strategy.enemyProfiles;
	const names = Object.keys(profiles);
	if (names.length <= 20) {
		return;
	}

	names.sort(function (a, b) {
		const aSeen = profiles[a].lastSeen || 0;
		const bSeen = profiles[b].lastSeen || 0;
		return bSeen - aSeen;
	});

	for (let i = 20; i < names.length; i += 1) {
		delete profiles[names[i]];
	}
}

function updateEnemyProfile(username, hostilePower, roomName) {
	if (!username) {
		return;
	}

	const profiles = Memory.strategy.enemyProfiles;
	if (!profiles[username]) {
		profiles[username] = {
			lastSeen: Game.time,
			sightings: 0,
			maxPower: 0,
			emaPower: 0,
			raidLikelihood: 'low',
			recommendation: 'monitor',
			lastRoom: roomName,
		};
	}

	const profile = profiles[username];
	profile.lastSeen = Game.time;
	profile.sightings += 1;
	profile.maxPower = Math.max(profile.maxPower, hostilePower);
	profile.emaPower = Math.floor(profile.emaPower * 0.7 + hostilePower * 0.3);
	profile.lastRoom = roomName;

	if (profile.emaPower >= 500 || profile.maxPower >= 700) {
		profile.raidLikelihood = 'high';
		profile.recommendation = 'fortify_and_spawn_defenders';
	} else if (profile.emaPower >= 250 || profile.maxPower >= 400) {
		profile.raidLikelihood = 'medium';
		profile.recommendation = 'maintain_defense_readiness';
	} else {
		profile.raidLikelihood = 'low';
		profile.recommendation = 'continue_scouting';
	}
}

function classifyRoom(intel, roomName) {
	const coords = /^([WE])(\d+)([NS])(\d+)$/.exec(roomName);
	let ew = 0;
	let ns = 0;
	if (coords) {
		ew = Number(coords[2]) % 10;
		ns = Number(coords[4]) % 10;
	}
	const isHighway = ew === 0 || ns === 0;
	const isSourceKeeper = !isHighway && ew >= 4 && ew <= 6 && ns >= 4 && ns <= 6;
	if (Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my) {
		return 'owned';
	}
	if (isSourceKeeper) {
		return 'source_keeper';
	}
	if (isHighway) {
		return 'highway';
	}
	if (intel.owner) {
		return 'enemy';
	}
	if (intel.reserver) {
		return 'reserved';
	}
	if (intel.hostiles > 0) {
		return 'threat';
	}
	return 'neutral';
}

function updateRoom(room) {
	if (!room || !room.controller) {
		return;
	}

	ensure();

	const exits = Game.map.describeExits(room.name) || {};
	const owner = room.controller.owner ? room.controller.owner.username : null;
	const reserver = room.controller.reservation ? room.controller.reservation.username : null;
	const hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
	let hostilePower = 0;
	const hostileOwners = {};
	for (const hostile of hostileCreeps) {
		const power = creepCombatPower(hostile);
		hostilePower += power;
		const ownerName = hostile.owner && hostile.owner.username ? hostile.owner.username : null;
		if (ownerName) {
			hostileOwners[ownerName] = (hostileOwners[ownerName] || 0) + power;
		}
	}

	const hostileTowerPower = roomTowerPower(room, false);
	const totalHostilePower = hostilePower + hostileTowerPower;
	const invaderCore = room.find(FIND_HOSTILE_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_INVADER_CORE;
		},
	})[0];

	let friendlyPower = 0;
	const friendlyCombat = room.find(FIND_MY_CREEPS, {
		filter: function (creep) {
			return creep.memory.role === 'defender' || creep.memory.role === 'attacker';
		},
	});
	for (const friendly of friendlyCombat) {
		friendlyPower += creepCombatPower(friendly);
	}
	friendlyPower += roomTowerPower(room, true);

	let hostileEconomicValue = 0;
	const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
	for (const structure of hostileStructures) {
		if (structure.structureType === STRUCTURE_STORAGE || structure.structureType === STRUCTURE_TERMINAL) {
			hostileEconomicValue += 80;
		} else if (structure.structureType === STRUCTURE_SPAWN) {
			hostileEconomicValue += 120;
		} else if (structure.structureType === STRUCTURE_TOWER) {
			hostileEconomicValue += 60;
		} else if (structure.structureType === STRUCTURE_EXTENSION) {
			hostileEconomicValue += 8;
		}
	}

	const intel = {
		lastSeen: Game.time,
		owner: owner,
		reserver: reserver,
		sources: room.find(FIND_SOURCES).length,
		hostiles: hostileCreeps.length,
		hostilePower: totalHostilePower,
		hostileTowerPower: hostileTowerPower,
		hostileEconomicValue: hostileEconomicValue,
		friendlyPower: friendlyPower,
		safeMode: room.controller.safeMode || 0,
		exits: exits,
		class: 'neutral',
		remoteProfitScore: 0,
		invaderCoreLevel: invaderCore ? (invaderCore.level || 0) : 0,
		isStronghold: !!invaderCore,
		threatLevel: 'low',
		canDefeat: false,
		recommendedStance: 'defensive',
		mitigation: 'maintain_scouting',
	};
	intel.class = classifyRoom(intel, room.name);
	intel.remoteProfitScore = Math.max(0, intel.sources * 20 + hostileEconomicValue - intel.hostilePower - (intel.class === 'source_keeper' ? 80 : 0));

	if (intel.hostilePower >= 500 || intel.hostiles >= 4) {
		intel.threatLevel = 'extreme';
	} else if (intel.hostilePower >= 250 || intel.hostiles >= 2) {
		intel.threatLevel = 'high';
	} else if (intel.hostilePower > 0) {
		intel.threatLevel = 'medium';
	}

	const effectiveFriendlyPower = Math.max(1, friendlyPower);
	intel.canDefeat = effectiveFriendlyPower >= intel.hostilePower * 1.2 && intel.safeMode === 0;
	intel.recommendedStance = intel.canDefeat && intel.hostilePower > 0 ? 'offensive' : 'defensive';

	if (intel.safeMode > 0) {
		intel.mitigation = 'delay_attack_until_safe_mode_ends';
	} else if (intel.hostileTowerPower > 0) {
		intel.mitigation = 'increase_attacker_healer_force';
	} else if (intel.hostilePower > effectiveFriendlyPower) {
		intel.mitigation = 'spawn_more_defenders';
	} else if (intel.hostilePower > 0) {
		intel.mitigation = 'attack_with_superiority';
	}

	Memory.roomIntel[room.name] = intel;
	if (intel.hostiles > 0 && !Memory.metrics.threatStartedAt) {
		Memory.metrics.threatStartedAt = Game.time;
	}

	for (const username in hostileOwners) {
		updateEnemyProfile(username, hostileOwners[username], room.name);
	}
	pruneEnemyProfiles();
}

function pruneRoomIntel() {
	ensure();

	const keys = Object.keys(Memory.roomIntel);
	if (keys.length <= MAX_INTEL_ROOMS) {
		return;
	}

	keys.sort(function (a, b) {
		const aTick = (Memory.roomIntel[a] && Memory.roomIntel[a].lastSeen) || 0;
		const bTick = (Memory.roomIntel[b] && Memory.roomIntel[b].lastSeen) || 0;
		return bTick - aTick;
	});

	for (let i = MAX_INTEL_ROOMS; i < keys.length; i += 1) {
		delete Memory.roomIntel[keys[i]];
	}
}

function getOwnedRooms() {
	return _.filter(Game.rooms, function (room) {
		return room.controller && room.controller.my;
	});
}

function computeClaimScore(roomName, intel, ownedRooms) {
	if (!intel || !ownedRooms || ownedRooms.length === 0) {
		return Infinity;
	}

	let minDistance = Infinity;
	for (const room of ownedRooms) {
		const dist = Game.map.getRoomLinearDistance(room.name, roomName);
		if (dist < minDistance) {
			minDistance = dist;
		}
	}

	const hostilePenalty = intel.hostiles > 0 ? 20 : 0;
	const distancePenalty = minDistance * 8;
	const sourceBonus = (intel.sources || 0) * 4;
	return distancePenalty + hostilePenalty - sourceBonus;
}

function refreshThreatRoom() {
	ensure();

	const ownedRooms = getOwnedRooms();
	let bestRoom = null;
	let bestScore = Infinity;

	for (const roomName in Memory.roomIntel) {
		const intel = Memory.roomIntel[roomName];
		if (!intel || (intel.hostiles <= 0 && intel.hostilePower <= 0) || Game.time - intel.lastSeen > INTEL_TTL) {
			continue;
		}

		let minDistance = Infinity;
		for (const room of ownedRooms) {
			const dist = Game.map.getRoomLinearDistance(room.name, roomName);
			if (dist < minDistance) {
				minDistance = dist;
			}
		}

		const score = minDistance * 10 + intel.hostilePower - Math.min(10, intel.hostiles * 2);
		if (score < bestScore) {
			bestScore = score;
			bestRoom = roomName;
		}
	}

	Memory.strategy.threatRoom = bestRoom;
	if (bestRoom) {
		const intel = Memory.roomIntel[bestRoom];
		if (intel && intel.isStronghold) {
			Memory.strategy.invaderPreset = 'stronghold';
		} else if (intel && intel.hostiles >= 3) {
			Memory.strategy.invaderPreset = 'raid';
		} else if (intel && intel.hostiles > 0) {
			Memory.strategy.invaderPreset = 'light';
		}
		if (Memory.metrics.threatStartedAt) {
			Memory.metrics.threatResponseTicks = Game.time - Memory.metrics.threatStartedAt;
		}
	}
}

function refreshClaimTarget() {
	ensure();
	refreshEconomyState();

	const ownedRooms = getOwnedRooms();
	const canClaim = Game.gcl.level > ownedRooms.length;
	if (!canClaim || !Memory.strategy.economy.readyForExpansion) {
		Memory.strategy.claimTarget = null;
		Memory.strategy.claimReady = false;
		return;
	}

	let bestTarget = null;
	let bestScore = Infinity;

	for (const roomName in Memory.roomIntel) {
		const intel = Memory.roomIntel[roomName];
		if (!intel || Game.time - intel.lastSeen > INTEL_TTL) {
			continue;
		}
		if (intel.owner || intel.reserver) {
			continue;
		}
		if (intel.class === 'source_keeper') {
			continue;
		}
		if (intel.class !== 'neutral' && intel.class !== 'threat') {
			continue;
		}
		if (intel.hostilePower > 120 || intel.hostiles > 2) {
			continue;
		}

		const score = computeClaimScore(roomName, intel, ownedRooms);
		if (score < bestScore) {
			bestScore = score;
			bestTarget = roomName;
		}
	}

	Memory.strategy.claimTarget = bestTarget;
	Memory.strategy.claimReady = !!bestTarget;
}

function refreshReserveTarget() {
	ensure();
	refreshEconomyState();

	if (!Memory.strategy.economy.readyForReserve) {
		Memory.strategy.reserveTarget = null;
		Memory.strategy.reserveReady = false;
		return;
	}

	const ownedRooms = getOwnedRooms();
	let bestTarget = null;
	let bestScore = Infinity;

	for (const roomName in Memory.roomIntel) {
		const intel = Memory.roomIntel[roomName];
		if (!intel || Game.time - intel.lastSeen > INTEL_TTL) {
			continue;
		}
		if (intel.owner) {
			continue;
		}
		if (intel.remoteProfitScore < 15) {
			continue;
		}
		if (intel.hostilePower > 160 || intel.hostiles > 2) {
			continue;
		}

		const score = computeClaimScore(roomName, intel, ownedRooms) - (intel.reserver ? 0 : 6);
		if (score < bestScore) {
			bestScore = score;
			bestTarget = roomName;
		}
	}

	Memory.strategy.reserveTarget = bestTarget;
	Memory.strategy.reserveReady = !!bestTarget && !Memory.strategy.claimReady;
}

function refreshAttackTarget() {
	ensure();

	const ownedRooms = getOwnedRooms();
	let bestTarget = null;
	let bestScore = Infinity;

	for (const roomName in Memory.roomIntel) {
		const intel = Memory.roomIntel[roomName];
		if (!intel || Game.time - intel.lastSeen > INTEL_TTL) {
			continue;
		}
		if (!intel.owner) {
			continue;
		}
		if (intel.class !== 'enemy') {
			continue;
		}
		if (intel.safeMode > 0) {
			continue;
		}
		if (!intel.canDefeat) {
			continue;
		}

		let minDistance = Infinity;
		for (const room of ownedRooms) {
			const dist = Game.map.getRoomLinearDistance(room.name, roomName);
			if (dist < minDistance) {
				minDistance = dist;
			}
		}

		const economicBonus = intel.hostileEconomicValue || 0;
		const sourceBonus = (intel.sources || 0) * 12;
		const profitBonus = intel.remoteProfitScore || 0;
		const towerPenalty = intel.hostileTowerPower * 0.35;
		const resistancePenalty = intel.hostilePower * 0.45;
		const score = minDistance * 12 + resistancePenalty + towerPenalty - economicBonus - sourceBonus - profitBonus;
		if (score < bestScore) {
			bestScore = score;
			bestTarget = roomName;
		}
	}

	Memory.strategy.attackTarget = bestTarget;
}

function refreshGlobalStance() {
	ensure();
	refreshEconomyState();
	Memory.strategy.defenseRadius = 12;
	Memory.strategy.chaseRadius = 20;

	let highestThreat = 'low';
	let unresolvedThreat = false;
	let highRaidLikelihood = false;

	for (const roomName in Memory.roomIntel) {
		const intel = Memory.roomIntel[roomName];
		if (!intel || Game.time - intel.lastSeen > INTEL_TTL) {
			continue;
		}
		if (!intel.hostiles && !intel.hostilePower) {
			continue;
		}

		if (intel.threatLevel === 'extreme') {
			highestThreat = 'extreme';
		} else if (intel.threatLevel === 'high' && highestThreat !== 'extreme') {
			highestThreat = 'high';
		} else if (intel.threatLevel === 'medium' && highestThreat === 'low') {
			highestThreat = 'medium';
		}

		if (!intel.canDefeat) {
			unresolvedThreat = true;
		}
	}

	if (unresolvedThreat || highestThreat === 'extreme' || highestThreat === 'high') {
		Memory.strategy.globalStance = 'defensive';
		Memory.strategy.attackReady = false;
		Memory.strategy.defenseRadius = highestThreat === 'extreme' ? 26 : 20;
		Memory.strategy.chaseRadius = highestThreat === 'extreme' ? 30 : 24;
		return;
	}

	for (const name in Memory.strategy.enemyProfiles) {
		const profile = Memory.strategy.enemyProfiles[name];
		if (!profile || Game.time - profile.lastSeen > INTEL_TTL) {
			continue;
		}
		if (profile.raidLikelihood === 'high') {
			highRaidLikelihood = true;
			break;
		}
	}

	if (highRaidLikelihood) {
		Memory.strategy.globalStance = 'defensive';
		Memory.strategy.attackReady = false;
		Memory.strategy.defenseRadius = 20;
		Memory.strategy.chaseRadius = 24;
		return;
	}

	if (Memory.strategy.attackTarget && Memory.strategy.economy.readyForWar) {
		const attackIntel = Memory.roomIntel[Memory.strategy.attackTarget];
		if (!attackIntel || attackIntel.class !== 'enemy' || attackIntel.safeMode > 0 || !attackIntel.canDefeat) {
			Memory.strategy.attackTarget = null;
			Memory.strategy.attackReady = false;
			Memory.strategy.globalStance = 'balanced';
			return;
		}
		const defenderReserve = _.sum(Game.creeps, function (creep) {
			return creep.memory.role === 'defender' ? 1 : 0;
		});
		Memory.strategy.overextendBlocked = defenderReserve < Math.max(2, getOwnedRooms().length);
		if (Memory.strategy.overextendBlocked) {
			Memory.strategy.globalStance = 'balanced';
			Memory.strategy.attackReady = false;
			return;
		}
		Memory.strategy.globalStance = 'offensive';
		Memory.strategy.attackReady = true;
		Memory.strategy.defenseRadius = 10;
		Memory.strategy.chaseRadius = 16;
		return;
	}

	Memory.strategy.globalStance = 'balanced';
	Memory.strategy.attackReady = false;
}

function clearStaleTargets() {
	ensure();
	const claimTarget = Memory.strategy.claimTarget;
	if (claimTarget) {
		const intel = Memory.roomIntel[claimTarget];
		if (!intel || Game.time - intel.lastSeen > INTEL_TTL || intel.owner || intel.reserver) {
			Memory.strategy.claimTarget = null;
			Memory.strategy.claimReady = false;
		}
	}

	const reserveTarget = Memory.strategy.reserveTarget;
	if (reserveTarget) {
		const intel = Memory.roomIntel[reserveTarget];
		if (!intel || Game.time - intel.lastSeen > INTEL_TTL || intel.owner) {
			Memory.strategy.reserveTarget = null;
			Memory.strategy.reserveReady = false;
		}
	}

	const attackTarget = Memory.strategy.attackTarget;
	if (attackTarget) {
		const intel = Memory.roomIntel[attackTarget];
		if (!intel || Game.time - intel.lastSeen > INTEL_TTL || intel.class !== 'enemy' || !intel.owner || intel.safeMode > 0) {
			Memory.strategy.attackTarget = null;
			Memory.strategy.attackReady = false;
		}
	}
}

function updateBootstrapMetrics() {
	ensure();
	if (!Memory.strategy.bootstrapRooms) {
		return;
	}
	let completed = 0;
	let totalTicks = 0;
	for (const roomName in Memory.strategy.bootstrapRooms) {
		const bootstrap = Memory.strategy.bootstrapRooms[roomName];
		const room = Game.rooms[roomName];
		if (room && room.controller && room.controller.my && room.find(FIND_MY_SPAWNS).length > 0) {
			completed += 1;
			totalTicks += Game.time - bootstrap.tick;
			bootstrap.stage = 'stabilized';
		}
	}
	if (completed > 0) {
		Memory.metrics.roomBootstrapAvg = Math.floor(totalTicks / completed);
	}
}

function pickScoutTarget(fromRoomName) {
	ensure();

	const exits = Game.map.describeExits(fromRoomName);
	if (!exits) {
		return null;
	}

	let unknown = null;
	let oldestSeen = null;
	let oldestTick = Infinity;

	for (const dir in exits) {
		const roomName = exits[dir];
		const intel = Memory.roomIntel[roomName];
		if (!intel) {
			unknown = roomName;
			break;
		}
		const childExits = Game.map.describeExits(roomName) || {};
		let frontierUnknowns = 0;
		for (const childDir in childExits) {
			if (!Memory.roomIntel[childExits[childDir]]) {
				frontierUnknowns += 1;
			}
		}
		if (frontierUnknowns > 0) {
			return roomName;
		}
		if ((intel.lastSeen || 0) < oldestTick) {
			oldestTick = intel.lastSeen || 0;
			oldestSeen = roomName;
		}
	}

	return unknown || oldestSeen;
}

function refreshStrategicTargets() {
	clearStaleTargets();
	updateBootstrapMetrics();
	refreshThreatRoom();
	refreshReserveTarget();
	refreshClaimTarget();
	refreshAttackTarget();
	refreshGlobalStance();
}

function drawStrategicMapVisuals() {
	ensure();
	if (Game.time % 5 !== 0) {
		return;
	}

	Game.map.visual.clear();

	if (Memory.strategy.threatRoom) {
		Game.map.visual.circle(new RoomPosition(25, 25, Memory.strategy.threatRoom), {
			radius: 18,
			stroke: '#ff4444',
			lineStyle: 'dashed',
		});
		Game.map.visual.text('THREAT', new RoomPosition(25, 25, Memory.strategy.threatRoom), { color: '#ff4444', fontSize: 8 });
	}

	if (Memory.strategy.claimTarget) {
		Game.map.visual.circle(new RoomPosition(25, 25, Memory.strategy.claimTarget), {
			radius: 16,
			stroke: '#99ff99',
			lineStyle: 'solid',
		});
		Game.map.visual.text('CLAIM', new RoomPosition(25, 25, Memory.strategy.claimTarget), { color: '#99ff99', fontSize: 8 });
	}

	if (Memory.strategy.reserveTarget) {
		Game.map.visual.circle(new RoomPosition(25, 25, Memory.strategy.reserveTarget), {
			radius: 14,
			stroke: '#66ddaa',
			lineStyle: 'dotted',
		});
		Game.map.visual.text('RESERVE', new RoomPosition(25, 25, Memory.strategy.reserveTarget), { color: '#66ddaa', fontSize: 8 });
	}

	if (Memory.strategy.attackTarget) {
		Game.map.visual.circle(new RoomPosition(25, 25, Memory.strategy.attackTarget), {
			radius: 18,
			stroke: '#ff66aa',
			lineStyle: 'solid',
		});
		Game.map.visual.text('ATTACK', new RoomPosition(25, 25, Memory.strategy.attackTarget), { color: '#ff66aa', fontSize: 8 });
	}
}

export default {
	ensure: ensure,
	updateRoom: updateRoom,
	pruneRoomIntel: pruneRoomIntel,
	refreshStrategicTargets: refreshStrategicTargets,
	pickScoutTarget: pickScoutTarget,
	drawStrategicMapVisuals: drawStrategicMapVisuals,
};
