function hostileThreatScore(hostile) {
	return (
		hostile.getActiveBodyparts(ATTACK) * 4 +
		hostile.getActiveBodyparts(RANGED_ATTACK) * 4 +
		hostile.getActiveBodyparts(HEAL) * 5 +
		hostile.getActiveBodyparts(WORK) * 2 +
		hostile.getActiveBodyparts(CLAIM) * 3
	);
}

function creepCombatPower(creep) {
	var power = 0;
	for (var i = 0; i < creep.body.length; i++) {
		var part = creep.body[i];
		if (part.hits <= 0) continue;
		if (part.type === ATTACK) power += 30;
		else if (part.type === RANGED_ATTACK) power += 24;
		else if (part.type === HEAL) power += 30;
		else if (part.type === TOUGH) power += 5;
	}
	return power;
}

var ROLE_ORDER = ['defender', 'attacker', 'healer', 'rangedEscort'];
var FORMATION_PRESETS = {
	column: [
		{ dx: 0, dy: 0 },
		{ dx: 0, dy: 1 },
		{ dx: 0, dy: 2 },
		{ dx: 0, dy: 3 },
		{ dx: 1, dy: 1 },
		{ dx: -1, dy: 1 },
	],
	spread: [
		{ dx: 0, dy: 0 },
		{ dx: 2, dy: 0 },
		{ dx: -2, dy: 0 },
		{ dx: 0, dy: 2 },
		{ dx: 0, dy: -2 },
		{ dx: 2, dy: 2 },
	],
	wedge: [
		{ dx: 0, dy: 0 },
		{ dx: -1, dy: 1 },
		{ dx: 1, dy: 1 },
		{ dx: -2, dy: 2 },
		{ dx: 2, dy: 2 },
		{ dx: 0, dy: 2 },
	],
};

var DEFENSE_TEMPLATES = {
	defense_light: {
		name: 'defense_light',
		composition: { defender: 2, rangedEscort: 1, healer: 0 },
		idleFormationType: 'column',
		idleMovementMode: 'anchor_hold',
		engagedFormationType: 'spread',
		engagedMovementMode: 'combat_swarm',
		retreatAt: 0.35,
	},
	defense_ranged_heavy: {
		name: 'defense_ranged_heavy',
		composition: { defender: 4, rangedEscort: 2, healer: 1 },
		idleFormationType: 'column',
		idleMovementMode: 'waypoint_chain',
		engagedFormationType: 'spread',
		engagedMovementMode: 'combat_swarm',
		retreatAt: 0.45,
	},
	defense_emergency_core: {
		name: 'defense_emergency_core',
		composition: { defender: 5, rangedEscort: 2, healer: 1 },
		idleFormationType: 'column',
		idleMovementMode: 'anchor_hold',
		engagedFormationType: 'spread',
		engagedMovementMode: 'retreat_regroup',
		retreatAt: 0.5,
	},
	rapid_response: {
		name: 'rapid_response',
		composition: { defender: 2, rangedEscort: 1, healer: 0 },
		idleFormationType: 'column',
		idleMovementMode: 'waypoint_chain',
		engagedFormationType: 'spread',
		engagedMovementMode: 'combat_swarm',
		retreatAt: 0.35,
	},
};

var ASSAULT_TEMPLATES = {
	assault_probe: {
		name: 'assault_probe',
		formationType: 'wedge',
		marchFormationType: 'column',
		marchMovementMode: 'waypoint_chain',
		engagedMovementMode: 'combat_swarm',
		retreatAt: 0.35,
	},
	assault_siege: {
		name: 'assault_siege',
		formationType: 'spread',
		marchFormationType: 'column',
		marchMovementMode: 'waypoint_chain',
		engagedMovementMode: 'combat_swarm',
		retreatAt: 0.45,
	},
};

var DEFENSE_CALIBRATION = {
	emergencyHostiles: 5,
	emergencyThreat: 550,
	rangedHeavyHostiles: 4,
	rangedHeavyParts: 4,
	rapidResponseHostiles: 2,
	rapidResponseThreat: 180,
	healerThreat: 450,
	defenderPerThreat: 90,
	maxDefenders: 5,
	minDefendersForLargeSquad: 4,
};

function getPreferredLeaderRole(squadType) {
	return squadType === 'assault' ? 'attacker' : 'defender';
}

function assignSquadSlots(squad) {
	var formation = FORMATION_PRESETS[squad.formationType] || FORMATION_PRESETS.column;
	var members = squad.members.slice();
	members.sort(function (a, b) {
		var ca = Game.creeps[a];
		var cb = Game.creeps[b];
		var ra = ca && ca.memory ? ca.memory.role : 'defender';
		var rb = cb && cb.memory ? cb.memory.role : 'defender';
		var ia = ROLE_ORDER.indexOf(ra);
		var ib = ROLE_ORDER.indexOf(rb);
		ia = ia < 0 ? ROLE_ORDER.length : ia;
		ib = ib < 0 ? ROLE_ORDER.length : ib;
		if (ia !== ib) return ia - ib;
		return a < b ? -1 : 1;
	});

	if (squad.leader) {
		members.sort(function (a, b) {
			if (a === squad.leader) return -1;
			if (b === squad.leader) return 1;
			return a < b ? -1 : 1;
		});
	}

	squad.slots = {};
	for (var i = 0; i < members.length; i++) {
		var memberName = members[i];
		var creep = Game.creeps[memberName];
		var role = creep && creep.memory ? creep.memory.role : 'defender';
		var offset = formation[Math.min(i, formation.length - 1)];
		squad.slots[memberName] = {
			index: i,
			role: role,
			dx: offset.dx,
			dy: offset.dy,
		};
	}
}

function selectAssaultTemplate(squad) {
	var attackers = squad.composition && squad.composition.attacker ? squad.composition.attacker : 0;
	var healers = squad.composition && squad.composition.healer ? squad.composition.healer : 0;
	if (attackers >= 3 || (attackers >= 2 && healers >= 1)) return ASSAULT_TEMPLATES.assault_siege;
	return ASSAULT_TEMPLATES.assault_probe;
}

function finalizeSquadState(squad, threatMap, doctrineByRoom) {
	if (!squad.leader || !Game.creeps[squad.leader]) {
		squad.leader = squad.members.length > 0 ? squad.members[0] : null;
	}

	if (squad.type === 'assault') {
		var assaultTemplate = selectAssaultTemplate(squad);
		var leader = squad.leader ? Game.creeps[squad.leader] : null;
		var inTargetRoom = leader && leader.room && leader.room.name === squad.targetRoom;
		squad.status = inTargetRoom ? 'engaged' : 'marching';
		squad.engaged = !!inTargetRoom;
		squad.template = assaultTemplate.name;
		squad.retreatAt = assaultTemplate.retreatAt;
		squad.movementMode = inTargetRoom ? assaultTemplate.engagedMovementMode : assaultTemplate.marchMovementMode;
		squad.formationType = inTargetRoom ? assaultTemplate.formationType : assaultTemplate.marchFormationType;
		if (squad.waypoints.length <= 1 && squad.targetRoom !== squad.room) {
			squad.waypoints.push({ room: squad.targetRoom, pos: { x: 25, y: 25 } });
		}
	} else {
		var doctrine = doctrineByRoom && doctrineByRoom[squad.room] ? doctrineByRoom[squad.room] : null;
		var threat = threatMap[squad.room];
		squad.status = threat ? 'engaged' : 'idle';
		squad.engaged = !!threat;
		squad.template = doctrine ? doctrine.template : 'defense_light';
		squad.retreatAt = doctrine ? doctrine.retreatAt : 0.35;
		squad.movementMode = threat ? (doctrine ? doctrine.engagedMovementMode : 'combat_swarm') : (doctrine ? doctrine.idleMovementMode : 'anchor_hold');
		squad.formationType = threat ? (doctrine ? doctrine.engagedFormationType : 'spread') : (doctrine ? doctrine.idleFormationType : 'column');
	}

	assignSquadSlots(squad);
}

function ensureIntel(roomName) {
	if (!Memory.roomIntel) Memory.roomIntel = {};
	if (!Memory.roomIntel[roomName]) Memory.roomIntel[roomName] = {};
}

function ensureTerrainMap(room) {
	ensureIntel(room.name);
	if (Memory.roomIntel[room.name].terrain) return;
	if (Game.cpu.getUsed() > Game.cpu.limit * 0.6) return;

	var terrain = room.getTerrain();
	var chokes = [];

	for (var x = 1; x < 49; x++) {
		for (var y = 1; y < 49; y++) {
			if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
			var walls = 0;
			if (terrain.get(x - 1, y) === TERRAIN_MASK_WALL) walls++;
			if (terrain.get(x + 1, y) === TERRAIN_MASK_WALL) walls++;
			if (terrain.get(x, y - 1) === TERRAIN_MASK_WALL) walls++;
			if (terrain.get(x, y + 1) === TERRAIN_MASK_WALL) walls++;
			if (walls >= 3) chokes.push({ x: x, y: y });
		}
	}

	chokes.sort(function (a, b) {
		var aWalls = 0, bWalls = 0;
		for (var dx = -1; dx <= 1; dx++) {
			for (var dy = -1; dy <= 1; dy++) {
				if (dx === 0 && dy === 0) continue;
				var ax = a.x + dx, ay = a.y + dy, bx = b.x + dx, by = b.y + dy;
				if (ax >= 0 && ax <= 49 && ay >= 0 && ay <= 49 && terrain.get(ax, ay) === TERRAIN_MASK_WALL) aWalls++;
				if (bx >= 0 && bx <= 49 && by >= 0 && by <= 49 && terrain.get(bx, by) === TERRAIN_MASK_WALL) bWalls++;
			}
		}
		return bWalls - aWalls;
	});

	var exits = room.find(FIND_EXIT);
	var exitCPs = {};
	for (var i = 0; i < exits.length; i++) {
		var e = exits[i];
		if (e.x <= 1) exitCPs.left = { x: e.x, y: e.y };
		else if (e.x >= 48) exitCPs.right = { x: e.x, y: e.y };
		if (e.y <= 1) exitCPs.top = { x: e.x, y: e.y };
		else if (e.y >= 48) exitCPs.bottom = { x: e.x, y: e.y };
	}

	var spawn = room.find(FIND_MY_SPAWNS)[0];

	Memory.roomIntel[room.name].terrain = {
		choked: Game.time,
		chokePoints: chokes.slice(0, 15),
	};

	Memory.roomIntel[room.name].checkpoints = {
		exit: exitCPs,
		chokes: chokes.slice(0, 3),
		center: { x: 25, y: 25 },
		spawn: spawn ? { x: spawn.pos.x, y: spawn.pos.y } : null,
		controller: room.controller ? { x: room.controller.pos.x, y: room.controller.pos.y } : null,
	};
}

function trackHostilePositions(room) {
	ensureIntel(room.name);
	if (!Memory.roomIntel[room.name].hostileTracks) Memory.roomIntel[room.name].hostileTracks = {};

	if (!Memory.roomIntel[room.name].defensePatterns) {
		Memory.roomIntel[room.name].defensePatterns = { exitUsage: {}, blockedTiles: {}, grabSuccesses: 0 };
	}

	var tracks = Memory.roomIntel[room.name].hostileTracks;
	var patterns = Memory.roomIntel[room.name].defensePatterns;
	var hostiles = room.find(FIND_HOSTILE_CREEPS);
	var active = {};

	for (var i = 0; i < hostiles.length; i++) {
		var h = hostiles[i];
		active[h.id] = true;
		if (!tracks[h.id]) {
			tracks[h.id] = [];
			var pos = h.pos;
			if (pos.x <= 1) patterns.exitUsage.left = (patterns.exitUsage.left || 0) + 1;
			else if (pos.x >= 48) patterns.exitUsage.right = (patterns.exitUsage.right || 0) + 1;
			if (pos.y <= 1) patterns.exitUsage.top = (patterns.exitUsage.top || 0) + 1;
			else if (pos.y >= 48) patterns.exitUsage.bottom = (patterns.exitUsage.bottom || 0) + 1;
		}
		tracks[h.id].push({ x: h.pos.x, y: h.pos.y });
		if (tracks[h.id].length > 5) tracks[h.id].shift();
	}

	for (var id in tracks) {
		if (!active[id]) {
			if (patterns._grabTicks && patterns._grabTicks[id] && patterns._grabTicks[id] >= 3) delete patterns._grabTicks[id];
			delete tracks[id];
		}
	}
}

function getPredictedPosition(hostileId, room) {
	var tracks = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].hostileTracks;
	if (!tracks || !tracks[hostileId] || tracks[hostileId].length < 2) return null;

	var positions = tracks[hostileId];
	var len = positions.length;
	var last = positions[len - 1];
	var prev = positions[len - 2];

	var dx = last.x - prev.x;
	var dy = last.y - prev.y;
	if (dx === 0 && dy === 0) return null;

	var px = last.x + dx * 2;
	var py = last.y + dy * 2;
	px = Math.max(0, Math.min(49, px));
	py = Math.max(0, Math.min(49, py));

	var terrain = room.getTerrain();
	if (terrain.get(px, py) === TERRAIN_MASK_WALL) {
		px = last.x + dx;
		py = last.y + dy;
		px = Math.max(0, Math.min(49, px));
		py = Math.max(0, Math.min(49, py));
		if (terrain.get(px, py) === TERRAIN_MASK_WALL) return null;
	}

	return new RoomPosition(px, py, room.name);
}

function getChokeIntercept(hostileId, room) {
	var tracks = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].hostileTracks;
	if (!tracks || !tracks[hostileId] || tracks[hostileId].length < 2) return null;

	var positions = tracks[hostileId];
	var len = positions.length;
	var last = positions[len - 1];
	var prev = positions[len - 2];

	var dx = last.x - prev.x;
	var dy = last.y - prev.y;
	if (dx === 0 && dy === 0) return null;

	var sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
	var sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
	var terrain = room.getTerrain();

	for (var i = 1; i <= 10; i++) {
		var px = last.x + sx * i;
		var py = last.y + sy * i;
		if (px <= 0 || px >= 49 || py <= 0 || py >= 49) break;
		if (terrain.get(px, py) === TERRAIN_MASK_WALL) {
			var bx = last.x + sx * (i - 1);
			var by = last.y + sy * (i - 1);
			var perps;
			if (sx === 0) perps = [[bx - 1, by], [bx + 1, by]];
			else if (sy === 0) perps = [[bx, by - 1], [bx, by + 1]];
			else perps = [[bx, by + sy], [bx + sx, by]];

			for (var p = 0; p < perps.length; p++) {
				var px2 = perps[p][0], py2 = perps[p][1];
				if (px2 <= 0 || px2 >= 49 || py2 <= 0 || py2 >= 49) continue;
				if (terrain.get(px2, py2) === TERRAIN_MASK_WALL) continue;
				return new RoomPosition(px2, py2, room.name);
			}
			return null;
		}
	}

	return getPredictedPosition(hostileId, room);
}

function getPredictedExit(hostileId, room) {
	var tracks = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].hostileTracks;
	if (!tracks || !tracks[hostileId] || tracks[hostileId].length < 2) return null;

	var positions = tracks[hostileId];
	var len = positions.length;
	var last = positions[len - 1];
	var prev = positions[len - 2];

	var dx = last.x - prev.x;
	var dy = last.y - prev.y;
	if (dx === 0 && dy === 0) return null;

	var exitX = last.x, exitY = last.y;

	if (dx > 0) {
		var steps = (49 - last.x) / dx;
		exitX = 49; exitY = last.y + dy * steps;
	} else if (dx < 0) {
		var steps = (0 - last.x) / dx;
		exitX = 0; exitY = last.y + dy * steps;
	}

	if (dy > 0 && (dx === 0 || Math.abs(dy) > Math.abs(dx))) {
		var steps = (49 - last.y) / dy;
		exitY = 49; exitX = last.x + dx * steps;
	} else if (dy < 0 && (dx === 0 || Math.abs(dy) > Math.abs(dx))) {
		var steps = (0 - last.y) / dy;
		exitY = 0; exitX = last.x + dx * steps;
	}

	if (exitX < 0 || exitX > 49 || exitY < 0 || exitY > 49) return null;
	var rx = Math.round(exitX), ry = Math.round(exitY);
	if (rx <= 0 || rx >= 49 || ry <= 0 || ry >= 49) return new RoomPosition(Math.max(0, Math.min(49, rx)), Math.max(0, Math.min(49, ry)), room.name);
	return null;
}

function assessThreat(room) {
	var hostiles = room.find(FIND_HOSTILE_CREEPS);
	if (hostiles.length === 0) return null;

	var totalThreat = 0;
	var hostilesData = [];
	var highest = { id: null, threat: -1 };

	for (var i = 0; i < hostiles.length; i++) {
		var h = hostiles[i];
		var threat = hostileThreatScore(h);
		totalThreat += threat;
		hostilesData.push({ id: h.id, threat: threat, pos: { x: h.pos.x, y: h.pos.y } });
		if (threat > highest.threat) { highest.threat = threat; highest.id = h.id; }
	}

	var level = 'low';
	if (totalThreat >= 500 || hostiles.length >= 4) level = 'extreme';
	else if (totalThreat >= 250 || hostiles.length >= 2) level = 'high';
	else if (totalThreat > 0) level = 'medium';

	var hostileIds = [];
	for (var i = 0; i < hostiles.length; i++) hostileIds.push(hostiles[i].id);

	var interceptPos = null;
	if (highest.id) interceptPos = getChokeIntercept(highest.id, room);
	if (!interceptPos && highest.id) interceptPos = getPredictedPosition(highest.id, room);

	return {
		level: level,
		totalThreat: totalThreat,
		hostiles: hostilesData,
		hostileIds: hostileIds,
		priorityTargetId: highest.id,
		interceptPos: interceptPos ? { x: interceptPos.x, y: interceptPos.y } : null,
		safeToEngage: true,
	};
}

function run() {
	if (!Memory.warPlan) Memory.warPlan = {};
	if (!Memory.strategy) Memory.strategy = {};

	var ownedRooms = [];
	for (var name in Game.rooms) {
		var room = Game.rooms[name];
		if (room.controller && room.controller.my) ownedRooms.push(room);
	}

	var warPlan = {
		threat: {},
		squads: [],
		milTargets: {},
		doctrine: {},
		timestamp: Game.time,
	};

	for (var r = 0; r < ownedRooms.length; r++) {
		var room = ownedRooms[r];
		ensureTerrainMap(room);
		trackHostilePositions(room);

		var threat = assessThreat(room);
		if (threat) warPlan.threat[room.name] = threat;
	}

	var squadIndex = 0;
	var assigned = {};

	for (var name in Game.creeps) {
		var creep = Game.creeps[name];
		var role = creep.memory.role;
		if (role !== 'defender' && role !== 'attacker' && role !== 'healer' && role !== 'rangedEscort') continue;

		var cRoom = creep.room.name;
		var at = Memory.strategy.attackTarget;
		var isAssaultRole = role === 'attacker' || role === 'healer' || role === 'rangedEscort';
		var useAssault = isAssaultRole && at && Memory.strategy.attackReady;
		var squadType = useAssault ? 'assault' : 'defense';
		var targetRoom = useAssault ? at : cRoom;
		var squadKey = squadType + '_' + targetRoom;
		if (!assigned[squadKey]) {
			var objective = squadType === 'assault' ? 'siege' : 'intercept';

			assigned[squadKey] = {
				id: squadIndex++,
				type: squadType,
				status: 'idle',
				room: cRoom,
				targetRoom: targetRoom,
				objective: objective,
				formationType: 'column',
				movementMode: 'anchor_hold',
				leader: null,
				members: [],
				composition: {},
				slots: {},
				waypoints: [{ room: cRoom, pos: { x: 25, y: 25 } }],
				power: 0,
				engaged: false,
			};
		}

		var squad = assigned[squadKey];
		squad.members.push(name);
		squad.power += creepCombatPower(creep);
		squad.composition[role] = (squad.composition[role] || 0) + 1;

		if (!squad.leader) {
			squad.leader = name;
		} else {
			var preferred = getPreferredLeaderRole(squad.type);
			var currentLeader = Game.creeps[squad.leader];
			var currentRole = currentLeader && currentLeader.memory ? currentLeader.memory.role : null;
			if (role === preferred && currentRole !== preferred) {
				squad.leader = name;
			}
		}
	}

	for (var key in assigned) {
		warPlan.squads.push(assigned[key]);
	}

	var assaultAttackerNeed = 0;
	var assaultHealerNeed = 0;
	var hasAssault = false;
	for (var i = 0; i < warPlan.squads.length; i++) {
		if (warPlan.squads[i].type === 'assault') { hasAssault = true; break; }
	}
	if (hasAssault) {
		var at = Memory.strategy.attackTarget;
		var intel = Memory.roomIntel && Memory.roomIntel[at];
		var attackerCount = 0, healerCount = 0;
		for (var i = 0; i < warPlan.squads.length; i++) {
			if (warPlan.squads[i].type === 'assault') {
				for (var m = 0; m < warPlan.squads[i].members.length; m++) {
					var c = Game.creeps[warPlan.squads[i].members[m]];
					if (c && c.memory.role === 'attacker') attackerCount++;
					if (c && c.memory.role === 'healer') healerCount++;
				}
			}
		}
		var needPower = (intel ? (intel.hostilePower || 0) + (intel.hostileTowerPower || 0) : 100) * 1.2;
		var needAttackers = Math.ceil(needPower / 120);
		assaultAttackerNeed = Math.max(0, needAttackers - attackerCount);
		assaultHealerNeed = Math.max(0, Math.ceil(needAttackers / 2) - healerCount);
	}

	warPlan.milTargets = {};
	for (var r = 0; r < ownedRooms.length; r++) {
		var room = ownedRooms[r];
		var mil = getMilTargets(room, warPlan.threat[room.name]);
		warPlan.doctrine[room.name] = {
			template: mil.template,
			idleFormationType: mil.idleFormationType,
			idleMovementMode: mil.idleMovementMode,
			engagedFormationType: mil.engagedFormationType,
			engagedMovementMode: mil.engagedMovementMode,
			retreatAt: mil.retreatAt,
			trace: mil.trace,
		};

		if (!Memory.metrics) Memory.metrics = {};
		if (!Memory.metrics.defenseCalibration) Memory.metrics.defenseCalibration = {};
		if (!Memory.metrics.defenseCalibration[room.name]) Memory.metrics.defenseCalibration[room.name] = [];
		Memory.metrics.defenseCalibration[room.name].push(mil.trace);
		if (Memory.metrics.defenseCalibration[room.name].length > 25) {
			Memory.metrics.defenseCalibration[room.name].shift();
		}

		var spawnMil = {
			defender: mil.defender,
			rangedEscort: mil.rangedEscort,
			healer: mil.healer,
		};
		if (r === 0) {
			spawnMil.attacker = assaultAttackerNeed;
			spawnMil.healer = Math.max(spawnMil.healer || 0, assaultHealerNeed);
		}
		warPlan.milTargets[room.name] = spawnMil;
	}

	for (var si = 0; si < warPlan.squads.length; si++) {
		finalizeSquadState(warPlan.squads[si], warPlan.threat, warPlan.doctrine);
	}

	Memory.warPlan = warPlan;
}

function hasNoSafeMode(room) {
	return room.controller && !room.controller.safeMode && (!room.controller.safeModeAvailable || room.controller.safeModeAvailable <= 0);
}

function selectDefenseTemplate(hostiles, hostileThreat, hostileRanged, towerDPS) {
	if (hostiles >= DEFENSE_CALIBRATION.emergencyHostiles || hostileThreat >= DEFENSE_CALIBRATION.emergencyThreat) return DEFENSE_TEMPLATES.defense_emergency_core;
	if (hostiles >= DEFENSE_CALIBRATION.rangedHeavyHostiles && hostileRanged > 0) return DEFENSE_TEMPLATES.defense_ranged_heavy;
	if (hostileRanged >= DEFENSE_CALIBRATION.rangedHeavyParts) return DEFENSE_TEMPLATES.defense_ranged_heavy;
	if (hostiles >= DEFENSE_CALIBRATION.rapidResponseHostiles || hostileThreat >= DEFENSE_CALIBRATION.rapidResponseThreat) return DEFENSE_TEMPLATES.rapid_response;
	if (hostiles > 0) return DEFENSE_TEMPLATES.defense_light;
	return towerDPS > 0 ? DEFENSE_TEMPLATES.defense_light : DEFENSE_TEMPLATES.rapid_response;
}

function getMilTargets(room, threat) {
	var defenderCount = 0;
	var rangedEscortCount = 0;
	var healerCount = 0;
	var selectedTemplate = DEFENSE_TEMPLATES.defense_light;

	// Baseline sentry when no safe mode available and no active threat
	if (!threat && hasNoSafeMode(room)) defenderCount = 1;

	if (threat) {
		var towerDPS = 0;
		var towers = room.find(FIND_MY_STRUCTURES, {
			filter: function (s) { return s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] >= 10; },
		});
		for (var i = 0; i < towers.length; i++) {
			towerDPS += TOWER_POWER_ATTACK;
		}

		var hostileThreat = 0;
		var hostileRanged = 0;
		var hostiles = room.find(FIND_HOSTILE_CREEPS);
		for (var i = 0; i < hostiles.length; i++) {
			hostileRanged += hostiles[i].getActiveBodyparts(RANGED_ATTACK);
			hostileThreat += hostileThreatScore(hostiles[i]);
		}

		selectedTemplate = selectDefenseTemplate(hostiles.length, hostileThreat, hostileRanged, towerDPS);
		defenderCount = selectedTemplate.composition.defender;
		rangedEscortCount = selectedTemplate.composition.rangedEscort;
		healerCount = selectedTemplate.composition.healer;

		if (towerDPS >= hostileThreat) {
			defenderCount = hostiles.length >= 4 ? Math.max(2, Math.floor(defenderCount / 2)) : Math.max(0, defenderCount - 1);
			rangedEscortCount = hostileRanged > 0 ? Math.max(1, rangedEscortCount) : Math.max(0, rangedEscortCount - 1);
		} else {
			var remaining = Math.max(0, hostileThreat - towerDPS);
			defenderCount = Math.max(1, Math.min(DEFENSE_CALIBRATION.maxDefenders, Math.ceil(remaining / DEFENSE_CALIBRATION.defenderPerThreat)));
			if (hostiles.length >= DEFENSE_CALIBRATION.rangedHeavyHostiles) defenderCount = Math.max(defenderCount, DEFENSE_CALIBRATION.minDefendersForLargeSquad);
			if (hostileRanged >= DEFENSE_CALIBRATION.rangedHeavyParts) {
				rangedEscortCount = Math.max(1, Math.min(3, Math.ceil(hostileRanged / 4)));
			}
			if (hostiles.length >= DEFENSE_CALIBRATION.rangedHeavyHostiles && hostileRanged > 0) {
				rangedEscortCount = Math.max(rangedEscortCount, 2);
			}
			if (hostileThreat >= DEFENSE_CALIBRATION.healerThreat) healerCount = Math.max(healerCount, 1);
		}
	} else if (hasNoSafeMode(room)) {
		selectedTemplate = DEFENSE_TEMPLATES.defense_light;
		defenderCount = Math.max(defenderCount, 1);
	}

	var trace = {
		tick: Game.time,
		room: room.name,
		template: selectedTemplate.name,
		hostiles: threat ? threat.hostiles.length : 0,
		hostileThreat: threat ? threat.totalThreat : 0,
		hostileRanged: threat ? _.sum(room.find(FIND_HOSTILE_CREEPS), function (h) { return h.getActiveBodyparts(RANGED_ATTACK); }) : 0,
		towerDPS: _.sum(room.find(FIND_MY_STRUCTURES, {
			filter: function (s) { return s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] >= 10; },
		}), function () { return TOWER_POWER_ATTACK; }),
		targets: {
			defender: defenderCount,
			rangedEscort: rangedEscortCount,
			healer: healerCount,
		},
	};

	return {
		defender: defenderCount,
		rangedEscort: rangedEscortCount,
		healer: healerCount,
		template: selectedTemplate.name,
		idleFormationType: selectedTemplate.idleFormationType,
		idleMovementMode: selectedTemplate.idleMovementMode,
		engagedFormationType: selectedTemplate.engagedFormationType,
		engagedMovementMode: selectedTemplate.engagedMovementMode,
		retreatAt: selectedTemplate.retreatAt,
		trace: trace,
	};
}

export default {
	run: run,
	getChokeIntercept: getChokeIntercept,
	getPredictedPosition: getPredictedPosition,
	getPredictedExit: getPredictedExit,
	hostileThreatScore: hostileThreatScore,
};
