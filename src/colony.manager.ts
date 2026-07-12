var STATIC_PRIORITY = {};
STATIC_PRIORITY[STRUCTURE_SPAWN] = 10;
STATIC_PRIORITY[STRUCTURE_EXTENSION] = 20;
STATIC_PRIORITY[STRUCTURE_CONTAINER] = 30;
STATIC_PRIORITY[STRUCTURE_STORAGE] = 40;
STATIC_PRIORITY[STRUCTURE_ROAD] = 50;
STATIC_PRIORITY[STRUCTURE_LINK] = 60;
STATIC_PRIORITY[STRUCTURE_TOWER] = 70;
STATIC_PRIORITY[STRUCTURE_LAB] = 80;
STATIC_PRIORITY[STRUCTURE_EXTRACTOR] = 90;
STATIC_PRIORITY[STRUCTURE_FACTORY] = 100;
STATIC_PRIORITY[STRUCTURE_OBSERVER] = 110;
STATIC_PRIORITY[STRUCTURE_POWER_SPAWN] = 120;
STATIC_PRIORITY[STRUCTURE_RAMPART] = 130;
STATIC_PRIORITY[STRUCTURE_WALL] = 140;

var PHASE_QUEUES = {
	1: [],
	2: [{ type: STRUCTURE_EXTENSION, count: 5 }],
	3: [{ type: STRUCTURE_EXTENSION, count: 10 }, { type: STRUCTURE_TOWER, count: 1 }],
	4: [{ type: STRUCTURE_STORAGE, count: 1 }, { type: STRUCTURE_EXTENSION, count: 20 }],
	5: [{ type: STRUCTURE_LINK, count: 2 }, { type: STRUCTURE_EXTENSION, count: 30 }, { type: STRUCTURE_TOWER, count: 2 }],
	6: [{ type: STRUCTURE_LAB, count: 3 }, { type: STRUCTURE_EXTRACTOR, count: 1 }, { type: STRUCTURE_EXTENSION, count: 40 }, { type: STRUCTURE_TOWER, count: 2 }, { type: STRUCTURE_LINK, count: 3 }],
	7: [{ type: STRUCTURE_FACTORY, count: 1 }, { type: STRUCTURE_LAB, count: 6 }, { type: STRUCTURE_EXTENSION, count: 50 }, { type: STRUCTURE_TOWER, count: 3 }, { type: STRUCTURE_LINK, count: 4 }],
	8: [{ type: STRUCTURE_OBSERVER, count: 1 }, { type: STRUCTURE_POWER_SPAWN, count: 1 }],
};

var CIVILIAN_PHASES = {
	1: { harvester: 2, hauler: 1, builder: 0, upgrader: 1, scout: 0, claimer: 0 },
	2: { harvester: 2, hauler: 1, builder: 1, upgrader: 1, scout: 0, claimer: 0 },
	3: { harvester: 2, hauler: 1, builder: 1, upgrader: 2, scout: 1, claimer: 0 },
	4: { harvester: 3, hauler: 2, builder: 2, upgrader: 2, scout: 1, claimer: 0 },
	5: { harvester: 3, hauler: 2, builder: 2, upgrader: 2, scout: 1, claimer: 1 },
	6: { harvester: 3, hauler: 2, builder: 2, upgrader: 2, scout: 1, claimer: 1 },
	7: { harvester: 3, hauler: 2, builder: 2, upgrader: 2, scout: 1, claimer: 1 },
	8: { harvester: 3, hauler: 2, builder: 1, upgrader: 1, scout: 0, claimer: 0 },
};

var PRIORITY_ORDER = ['harvester', 'hauler', 'defender', 'rangedEscort', 'builder', 'upgrader', 'scout', 'claimer', 'attacker', 'healer'];

var MINIMUM_CIVILIAN_FLOOR = {
	harvester: 2,
	builder: 1,
	upgrader: 1,
};

var RCL_REQUIREMENTS = {
	2: { extensions: 5, towers: 0, storage: false, links: 0, labs: 0, extractor: false, factory: false, observer: false, powerSpawn: false },
	3: { extensions: 10, towers: 1, storage: false, links: 0, labs: 0, extractor: false, factory: false, observer: false, powerSpawn: false },
	4: { extensions: 30, towers: 1, storage: true, links: 0, labs: 0, extractor: false, factory: false, observer: false, powerSpawn: false },
	5: { extensions: 30, towers: 3, storage: true, links: 2, labs: 0, extractor: false, factory: false, observer: false, powerSpawn: false },
	6: { extensions: 40, towers: 4, storage: true, links: 2, labs: 0, extractor: true, factory: false, observer: false, powerSpawn: false },
	7: { extensions: 50, towers: 4, storage: true, links: 3, labs: 3, extractor: true, factory: true, observer: false, powerSpawn: false },
	8: { extensions: 60, towers: 4, storage: true, links: 4, labs: 5, extractor: true, factory: true, observer: true, powerSpawn: true },
};

function countBuilt(room, type) {
	return room.find(FIND_MY_STRUCTURES, {
		filter: function (s) { return s.structureType === type; },
	}).length;
}

function countSites(room, type) {
	return room.find(FIND_MY_CONSTRUCTION_SITES, {
		filter: function (s) { return s.structureType === type; },
	}).length;
}

function getBuildableTarget(reqsTarget, type, rcl) {
	var currentLimit = CONTROLLER_STRUCTURES[type] ? (CONTROLLER_STRUCTURES[type][rcl] || 0) : 0;
	if (currentLimit === 0) return 0;
	return Math.min(reqsTarget, currentLimit);
}

function getTarget(room, entry) {
	var rcl = room.controller.level;
	var limit = CONTROLLER_STRUCTURES[entry.type] ? (CONTROLLER_STRUCTURES[entry.type][rcl] || 0) : Infinity;
	return Math.min(entry.count, limit);
}

function auditQueue(room, queue) {
	for (var i = 0; i < queue.length; i++) {
		var entry = queue[i];
		var target = getTarget(room, entry);
		var built = countBuilt(room, entry.type);
		var sites = countSites(room, entry.type);
		entry.built = built;
		entry.sites = sites;
		entry.placed = built + sites;
		entry.target = target;
		entry.done = entry.placed >= target;
	}
}

function findActiveEntry(queue) {
	for (var i = 0; i < queue.length; i++) {
		if (!queue[i].done) return queue[i];
	}
	return null;
}

function countRole(room, role) {
	var total = 0;
	for (var name in Game.creeps) {
		var creep = Game.creeps[name];
		if (creep && creep.memory && creep.memory.role === role && creep.memory.roomName === room.name) {
			total += 1;
		}
	}
	return total;
}

function getMissingCritical(room) {
	if (!room.controller || !room.controller.my) return [];
	var rcl = room.controller.level;
	if (rcl >= 8) return [];
	var nextRCL = rcl + 1;
	var reqs = RCL_REQUIREMENTS[nextRCL];
	if (!reqs) return [];

	var missing = [];

	if (reqs.extensions > 0) {
		var target = getBuildableTarget(reqs.extensions, STRUCTURE_EXTENSION, rcl);
		if (target > 0) {
			var built = countBuilt(room, STRUCTURE_EXTENSION);
			var sites = countSites(room, STRUCTURE_EXTENSION);
			var need = Math.max(0, target - built - sites);
			if (need > 0) missing.push({ type: STRUCTURE_EXTENSION, need: need, label: 'extensions' });
		}
	}

	if (reqs.towers > 0) {
		var target = getBuildableTarget(reqs.towers, STRUCTURE_TOWER, rcl);
		if (target > 0) {
			var built = countBuilt(room, STRUCTURE_TOWER);
			var sites = countSites(room, STRUCTURE_TOWER);
			var need = Math.max(0, target - built - sites);
			if (need > 0) missing.push({ type: STRUCTURE_TOWER, need: need, label: 'towers' });
		}
	}

	if (reqs.storage && !room.storage) {
		var hasSite = room.find(FIND_MY_CONSTRUCTION_SITES, {
			filter: function (s) { return s.structureType === STRUCTURE_STORAGE; },
		}).length > 0;
		if (!hasSite) missing.push({ type: STRUCTURE_STORAGE, need: 1, label: 'storage' });
	}

	if (reqs.links > 0) {
		var target = getBuildableTarget(reqs.links, STRUCTURE_LINK, rcl);
		if (target > 0) {
			var built = countBuilt(room, STRUCTURE_LINK);
			var sites = countSites(room, STRUCTURE_LINK);
			var need = Math.max(0, target - built - sites);
			if (need > 0) missing.push({ type: STRUCTURE_LINK, need: need, label: 'links' });
		}
	}

	if (reqs.labs > 0) {
		var target = getBuildableTarget(reqs.labs, STRUCTURE_LAB, rcl);
		if (target > 0) {
			var built = countBuilt(room, STRUCTURE_LAB);
			var sites = countSites(room, STRUCTURE_LAB);
			var need = Math.max(0, target - built - sites);
			if (need > 0) missing.push({ type: STRUCTURE_LAB, need: need, label: 'labs' });
		}
	}

	if (reqs.extractor && !room.find(FIND_MY_STRUCTURES, {
		filter: function (s) { return s.structureType === STRUCTURE_EXTRACTOR; },
	}).length) {
		missing.push({ type: STRUCTURE_EXTRACTOR, need: 1, label: 'extractor' });
	}

	if (reqs.factory) {
		var built = countBuilt(room, STRUCTURE_FACTORY);
		var sites = countSites(room, STRUCTURE_FACTORY);
		if (built + sites === 0) missing.push({ type: STRUCTURE_FACTORY, need: 1, label: 'factory' });
	}

	if (reqs.observer) {
		var built = countBuilt(room, STRUCTURE_OBSERVER);
		var sites = countSites(room, STRUCTURE_OBSERVER);
		if (built + sites === 0) missing.push({ type: STRUCTURE_OBSERVER, need: 1, label: 'observer' });
	}

	if (reqs.powerSpawn) {
		var built = countBuilt(room, STRUCTURE_POWER_SPAWN);
		var sites = countSites(room, STRUCTURE_POWER_SPAWN);
		if (built + sites === 0) missing.push({ type: STRUCTURE_POWER_SPAWN, need: 1, label: 'powerSpawn' });
	}

	return missing;
}

function getPhase(room, context) {
	if (!room.controller || !room.controller.my) {
		return { status: 'foreign', label: 'Foreign Room', missing: [] };
	}

	var rcl = room.controller.level;
	var missing = getMissingCritical(room);
	var sourceCount = room.find(FIND_SOURCES).length;
	var minimumHarvesters = Math.max(1, Math.min(2, sourceCount));
	var hostileCount = context ? context.hostiles : room.find(FIND_HOSTILE_CREEPS).length;
	var backlog = context ? context.backlog : 0;
	var siteCount = context ? context.sites : room.find(FIND_MY_CONSTRUCTION_SITES).length;
	var hasStorageEnergy = context ? context.storedEnergy > 200 : getStoredEnergy(room) > 200;
	var harvesters = context ? context.harvesters : countRole(room, 'harvester');
	var haulers = context ? context.haulers : countRole(room, 'hauler');

	if (rcl >= 8 && missing.length === 0) {
		return { status: 'complete', label: 'RCL 8 Complete', missing: [], nextRCL: 8 };
	}

	if (hostileCount > 0) {
		return {
			status: 'defense',
			label: 'Defend Room (' + hostileCount + ' hostiles)',
			missing: [],
			nextRCL: Math.min(8, rcl + 1),
		};
	}

	if (harvesters <= 0) {
		return {
			status: 'bootstrap',
			label: 'Bootstrap Economy (no harvesters)',
			missing: [{ type: 'economy', need: minimumHarvesters, label: 'harvesters' }],
			nextRCL: Math.min(8, rcl + 1),
		};
	}

	if (harvesters < minimumHarvesters || (haulers <= 0 && hasStorageEnergy)) {
		return {
			status: 'stabilize',
			label: 'Stabilize Economy Pipeline',
			missing: [],
			nextRCL: Math.min(8, rcl + 1),
		};
	}

	if (missing.length > 0) {
		var label = 'Critical Buildout RCL ' + (rcl + 1) + ': ' + missing.map(function (m) { return m.need + ' ' + m.label; }).join(', ');
		return { status: 'critical_path', label: label, missing: missing, nextRCL: rcl + 1 };
	}

	if (siteCount >= 6 || backlog >= 8000) {
		return {
			status: 'buildout',
			label: 'Buildout (' + siteCount + ' sites)',
			missing: [],
			nextRCL: Math.min(8, rcl + 1),
		};
	}

	return { status: 'upgrade', label: 'Upgrade to RCL ' + (rcl + 1), missing: [], nextRCL: rcl + 1 };
}

function getStoredEnergy(room) {
	var total = 0;
	var structures = room.find(FIND_STRUCTURES, {
		filter: function (s) { return s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE; },
	});
	for (var i = 0; i < structures.length; i++) {
		total += structures[i].store[RESOURCE_ENERGY] || 0;
	}
	if (!room.storage) {
		var spawns = room.find(FIND_MY_SPAWNS);
		for (var i = 0; i < spawns.length; i++) {
			total += spawns[i].store[RESOURCE_ENERGY] || 0;
		}
	}
	return total;
}

function hasNoSafeMode(room) {
	return room.controller && !room.controller.safeMode && (!room.controller.safeModeAvailable || room.controller.safeModeAvailable <= 0);
}

function reorderQueueForDefense(queue, room) {
	if (!queue || queue.length <= 1) return;
	if (!hasNoSafeMode(room)) return;
	var military = [];
	var rest = [];
	for (var i = 0; i < queue.length; i++) {
		if (queue[i].type === STRUCTURE_TOWER) {
			military.push(queue[i]);
		} else {
			rest.push(queue[i]);
		}
	}
	queue.length = 0;
	for (var i = 0; i < military.length; i++) queue.push(military[i]);
	for (var i = 0; i < rest.length; i++) queue.push(rest[i]);
}

function getReserveFloor(phaseStatus) {
	if (phaseStatus === 'bootstrap') return 0;
	if (phaseStatus === 'stabilize') return 100;
	if (phaseStatus === 'defense') return 350;
	if (phaseStatus === 'critical_path') return 200;
	if (phaseStatus === 'buildout') return 150;
	if (phaseStatus === 'upgrade') return 100;
	return 300;
}

function getBaseTargets(rcl) {
	return Object.assign({}, CIVILIAN_PHASES[rcl] || CIVILIAN_PHASES[1]);
}

function adjustTargets(targets, room, phase, economyState) {
	var hasSites = room.find(FIND_MY_CONSTRUCTION_SITES).length > 0;
	var sourceCount = room.find(FIND_SOURCES).length;
	var minHarvesters = Math.max(1, Math.min(2, sourceCount));
	var hostiles = room.find(FIND_HOSTILE_CREEPS).length;

	if (phase.status === 'bootstrap') {
		targets.harvester = Math.max(minHarvesters, 2);
		targets.hauler = 0;
		targets.builder = 0;
		targets.upgrader = 0;
		targets.scout = 0;
		targets.claimer = 0;
		targets.defender = hostiles > 0 ? 1 : 0;
		return targets;
	}

	if (phase.status === 'stabilize') {
		targets.harvester = Math.max(targets.harvester, minHarvesters);
		targets.hauler = Math.max(1, targets.hauler);
		targets.builder = hasSites && economyState.storedEnergy >= 450 ? 1 : 0;
		targets.upgrader = room.controller && room.controller.ticksToDowngrade < 12000 ? 1 : 0;
		targets.scout = 0;
		targets.claimer = 0;
		targets.defender = hostiles > 0 ? Math.max(1, targets.defender || 0) : 0;
		return targets;
	}

	if (phase.status === 'defense') {
		targets.defender = Math.max(2, targets.defender || 0);
		targets.rangedEscort = Math.max(1, targets.rangedEscort || 0);
		targets.builder = hasSites ? Math.max(1, targets.builder) : targets.builder;
		targets.scout = 0;
		targets.claimer = 0;
	}

	if (phase.status === 'buildout') {
		targets.builder = Math.max(targets.builder, 2);
		targets.upgrader = Math.min(targets.upgrader, 1);
	}

	if (economyState.survival) {
		targets.hauler = 0;
		targets.builder = 0;
		targets.upgrader = 0;
		targets.scout = 0;
		return targets;
	}

	if (!hasSites) {
		targets.builder = economyState.locked ? 0 : Math.min(targets.builder, 1);
	}

	if (room.controller && room.controller.ticksToDowngrade < 20000 && room.controller.level < 8) {
		targets.upgrader = Math.max(targets.upgrader, 1);
	}

	if (economyState.locked) {
		targets.hauler = Math.min(targets.hauler, 1);
		targets.scout = 0;
		targets.claimer = 0;
	}

	if (MINIMUM_CIVILIAN_FLOOR.harvester) {
		targets.harvester = Math.max(targets.harvester || 0, MINIMUM_CIVILIAN_FLOOR.harvester);
	}
	if (MINIMUM_CIVILIAN_FLOOR.builder) {
		targets.builder = Math.max(targets.builder || 0, MINIMUM_CIVILIAN_FLOOR.builder);
	}
	if (MINIMUM_CIVILIAN_FLOOR.upgrader) {
		targets.upgrader = Math.max(targets.upgrader || 0, MINIMUM_CIVILIAN_FLOOR.upgrader);
	}

	return targets;
}

function computeReadinessGates(room, phase, economyState, backlog) {
	var harvesters = countRole(room, 'harvester');
	var haulers = countRole(room, 'hauler');
	var defenders = countRole(room, 'defender');
	var rangedEscorts = countRole(room, 'rangedEscort');
	var hasStorageLike = room.storage || room.find(FIND_STRUCTURES, {
		filter: function (s) { return s.structureType === STRUCTURE_CONTAINER; },
	}).length > 0;

	var economyReady = economyState.stockpile >= Math.max(300, economyState.reserveFloor + 100);
	var logisticsReady = harvesters >= 2 && haulers >= 1 && hasStorageLike;
	var defenseReady = phase.status !== 'defense' || (defenders + rangedEscorts >= 2);
	var cpuReady = Game.cpu.bucket >= 2500;
	var rclReady = room.controller && room.controller.level < 8;

	return {
		economyReady: economyReady,
		logisticsReady: logisticsReady,
		defenseReady: defenseReady,
		cpuReady: cpuReady,
		rclReady: rclReady,
		backlogHigh: backlog >= 1800,
	};
}

function computeBuildGovernor(room, phase, economyState, activeEntry, backlog, targets) {
	var gates = computeReadinessGates(room, phase, economyState, backlog);
	var hostiles = economyState.hostiles || 0;
	var downgradeRisk = room.controller && room.controller.ticksToDowngrade < 18000;

	var scores = {
		defenseRisk: hostiles > 0 ? 100 + hostiles * 20 : 0,
		criticalBuild: phase.status === 'critical_path' ? 90 : (activeEntry ? 40 : 0),
		backlogPressure: backlog > 3000 ? 70 : (backlog > 1000 ? 35 : 10),
		upgradeUrgency: downgradeRisk ? 80 : (phase.status === 'upgrade' ? 45 : 20),
	};

	var mode = 'optimize';
	if (!gates.defenseReady || scores.defenseRisk >= 120) {
		mode = 'defend';
	} else if (scores.criticalBuild >= 80 || phase.status === 'critical_path') {
		mode = 'critical_build';
	} else if (gates.backlogHigh && gates.economyReady) {
		mode = 'build_push';
	} else if (phase.status === 'upgrade' && gates.economyReady && gates.logisticsReady && gates.cpuReady) {
		mode = 'upgrade_push';
	}

	if (mode === 'defend') {
		targets.builder = Math.min(targets.builder || 0, 1);
		targets.upgrader = Math.max(1, Math.min(targets.upgrader || 1, 1));
	}
	if (mode === 'critical_build' || mode === 'build_push') {
		targets.builder = Math.max(targets.builder || 0, mode === 'critical_build' ? 3 : 2);
		targets.upgrader = Math.max(1, Math.min(targets.upgrader || 1, 2));
	}
	if (mode === 'upgrade_push') {
		targets.builder = Math.min(targets.builder || 0, backlog > 0 ? 1 : 0);
		targets.upgrader = Math.max(2, targets.upgrader || 0);
	}

	if (MINIMUM_CIVILIAN_FLOOR.builder) {
		targets.builder = Math.max(targets.builder || 0, MINIMUM_CIVILIAN_FLOOR.builder);
	}
	if (MINIMUM_CIVILIAN_FLOOR.upgrader) {
		targets.upgrader = Math.max(targets.upgrader || 0, MINIMUM_CIVILIAN_FLOOR.upgrader);
	}

	var constructionEnabled = mode !== 'upgrade_push' || backlog > 0 || phase.status === 'critical_path';
	var maxNewSitesPerRun = 4;
	if (mode === 'critical_build') maxNewSitesPerRun = 10;
	else if (mode === 'build_push') maxNewSitesPerRun = 8;
	else if (mode === 'defend') maxNewSitesPerRun = 3;
	else if (mode === 'upgrade_push') maxNewSitesPerRun = 2;

	return {
		mode: mode,
		gates: gates,
		scores: scores,
		constructionEnabled: constructionEnabled,
		maxNewSitesPerRun: maxNewSitesPerRun,
	};
}

function computeEta(room, targets, phase) {
	var rcl = room.controller.level;
	var energyCapacity = room.energyCapacityAvailable;
	var avgHarvestWork = Math.max(1, Math.floor((energyCapacity - 150) / 300) + 1);
	var avgWork = Math.max(1, Math.floor(energyCapacity / 300));

	var sources = room.find(FIND_SOURCES).length;
	var energyPerTick = Math.min(targets.harvester * avgHarvestWork * 2, sources * 10);

	var existingBuilders = 0;
	var existingUpgraders = 0;
	for (var name in Game.creeps) {
		var c = Game.creeps[name];
		if (!c || !c.memory || c.memory.roomName !== room.name) continue;
		if (c.memory.role === 'builder') existingBuilders++;
		if (c.memory.role === 'upgrader') existingUpgraders++;
	}

	var buildWork = existingBuilders * avgWork;
	var upgradeWork = existingUpgraders * avgWork;
	var totalWork = buildWork + upgradeWork;

	var energyRatio = totalWork > 0 ? Math.min(1, energyPerTick / totalWork) : 0;
	var buildRate = existingBuilders > 0 ? existingBuilders * avgWork * 5 * energyRatio : 0;
	var upgradeRate = existingUpgraders > 0 ? existingUpgraders * avgWork * 1 * energyRatio : 0;

	var backlog = 0;
	var sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	for (var i = 0; i < sites.length; i++) backlog += Math.max(0, sites[i].progressTotal - sites[i].progress);

	var upgradeRemaining = 0;
	if (rcl < 8 && room.controller) {
		upgradeRemaining = Math.max(0, room.controller.progressTotal - room.controller.progress);
	}

	var constructionEta = backlog > 0 && buildRate > 0 ? Math.ceil(backlog / buildRate) : (backlog > 0 ? null : 0);
	var upgradeEta = upgradeRemaining > 0 && upgradeRate > 0 ? Math.ceil(upgradeRemaining / upgradeRate) : (upgradeRemaining > 0 ? null : 0);

	var phaseEta = null;
	if (constructionEta !== null && constructionEta > 0 && upgradeEta !== null && upgradeEta > 0) {
		phaseEta = Math.max(constructionEta, upgradeEta);
	} else if (constructionEta !== null && constructionEta > 0) {
		phaseEta = constructionEta;
	} else if (upgradeEta !== null && upgradeEta > 0) {
		phaseEta = upgradeEta;
	}

	return {
		construction: constructionEta,
		upgrade: upgradeEta,
		phase: phaseEta,
	};
}

function run(room) {
	if (!room.controller || !room.controller.my) return;

	var rcl = room.controller.level;

	var queueDef = PHASE_QUEUES[rcl] || [];
	var queue = [];
	for (var i = 0; i < queueDef.length; i++) {
		queue.push({ type: queueDef[i].type, count: queueDef[i].count, built: 0, sites: 0, placed: 0, target: 0, done: false });
	}
	auditQueue(room, queue);
	reorderQueueForDefense(queue, room);
	var activeEntry = findActiveEntry(queue);

	var storedEnergy = getStoredEnergy(room);
	var availableEnergy = room.energyAvailable;
	var stockpile = storedEnergy + availableEnergy;
	var sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	var backlog = 0;
	for (var si = 0; si < sites.length; si++) {
		backlog += Math.max(0, sites[si].progressTotal - sites[si].progress);
	}
	var hostiles = room.find(FIND_HOSTILE_CREEPS).length;

	var effectiveHarvesters = countRole(room, 'harvester');
	var effectiveHaulers = countRole(room, 'hauler');

	var phaseContext = {
		harvesters: effectiveHarvesters,
		haulers: effectiveHaulers,
		hostiles: hostiles,
		sites: sites.length,
		backlog: backlog,
		storedEnergy: storedEnergy,
	};

	var phase = getPhase(room, phaseContext);
	var reserveFloor = getReserveFloor(phase.status);
	var survivalMode = phase.status === 'bootstrap' || effectiveHarvesters < 1;
	var economyLocked = survivalMode || phase.status === 'stabilize' || storedEnergy < reserveFloor;

	var economyState = {
		locked: economyLocked,
		survival: survivalMode,
		storedEnergy: storedEnergy,
		stockpile: stockpile,
		reserveFloor: reserveFloor,
		hostiles: hostiles,
	};

	var targets = getBaseTargets(rcl);
	adjustTargets(targets, room, phase, economyState);
	var buildGovernor = computeBuildGovernor(room, phase, economyState, activeEntry, backlog, targets);

	var eta = computeEta(room, targets, phase);
	var constructionActiveType = buildGovernor.constructionEnabled && activeEntry ? activeEntry.type : null;

	var plan = {
		phase: phase,
		phaseComplete: !activeEntry && rcl >= 8,
		buildPriority: Object.assign({}, STATIC_PRIORITY),
		construction: {
			activeType: constructionActiveType,
			enabled: buildGovernor.constructionEnabled,
			maxNewSitesPerRun: buildGovernor.maxNewSitesPerRun,
			queue: queue,
		},
		economy: economyState,
		buildGovernor: buildGovernor,
		civilian: targets,
		minimums: MINIMUM_CIVILIAN_FLOOR,
		priorityOrder: PRIORITY_ORDER,
		eta: eta,
		timestamp: Game.time,
	};

	if (!Memory.roomIntel) Memory.roomIntel = {};
	if (!Memory.roomIntel[room.name]) Memory.roomIntel[room.name] = {};
	Memory.roomIntel[room.name].colonyPlan = plan;
}

export default {
	run: run,
};
