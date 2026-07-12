import pathing from "./utils.pathing";
import metrics from "./utils.metrics";
import stats from "./utils.stats";
import warRoom from "./war.room";
import squadUtils from "./utils.squad";

function getAnchorPos(room) {
	var spawn = room.find(FIND_MY_SPAWNS)[0];
	if (spawn) return spawn.pos;
	if (room.controller) return room.controller.pos;
	return new RoomPosition(25, 25, room.name);
}

function getDefenseAnchorRampart(room, anchor) {
	var ramparts = room.find(FIND_MY_STRUCTURES, {
		filter: function (s) { return s.structureType === STRUCTURE_RAMPART && anchor.getRangeTo(s.pos) <= 3; },
	});
	if (ramparts.length === 0) return null;
	return anchor.findClosestByRange(ramparts);
}

function getExitBlockPosition(room, target, anchor) {
	if (target.pos.x > 3 && target.pos.x < 46 && target.pos.y > 3 && target.pos.y < 46) return null;
	var candidates = [];
	for (var dx = -1; dx <= 1; dx++) {
		for (var dy = -1; dy <= 1; dy++) {
			if (dx === 0 && dy === 0) continue;
			var x = target.pos.x + dx, y = target.pos.y + dy;
			if (x <= 0 || x >= 49 || y <= 0 || y >= 49) continue;
			candidates.push(new RoomPosition(x, y, room.name));
		}
	}
	var best = null, bestScore = Infinity;
	for (var i = 0; i < candidates.length; i++) {
		var score = anchor.getRangeTo(candidates[i]) * 10 + candidates[i].getRangeTo(target);
		if (score < bestScore) { bestScore = score; best = candidates[i]; }
	}
	return best;
}

function pickBestAdjacentTile(creep, target) {
	var terrain = creep.room.getTerrain();
	var best = null, bestScore = Infinity;

	for (var dx = -1; dx <= 1; dx++) {
		for (var dy = -1; dy <= 1; dy++) {
			if (dx === 0 && dy === 0) continue;
			var x = target.pos.x + dx, y = target.pos.y + dy;
			if (x <= 0 || x >= 49 || y <= 0 || y >= 49) continue;
			if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

			var look = creep.room.lookForAt(LOOK_CREEPS, x, y);
			var occupied = false;
			for (var i = 0; i < look.length; i++) { if (look[i].name !== creep.name) { occupied = true; break; } }
			if (occupied) continue;

			var structs = creep.room.lookForAt(LOOK_STRUCTURES, x, y);
			var blocked = false;
			for (var i = 0; i < structs.length; i++) { if (structs[i].structureType !== STRUCTURE_ROAD && structs[i].structureType !== STRUCTURE_CONTAINER) { blocked = true; break; } }
			if (blocked) continue;

			var dist = creep.pos.getRangeTo(new RoomPosition(x, y, creep.room.name));
			var beyondX = target.pos.x + dx * 2, beyondY = target.pos.y + dy * 2;
			var escapeBonus = 0;
			if (beyondX > 0 && beyondX < 49 && beyondY > 0 && beyondY < 49 && terrain.get(beyondX, beyondY) !== TERRAIN_MASK_WALL) escapeBonus = 3;
			if (dist - escapeBonus < bestScore) { bestScore = dist - escapeBonus; best = new RoomPosition(x, y, creep.room.name); }
		}
	}
	return best;
}

var roleDefender = {
	run: function (creep) {
		var anchor = getAnchorPos(creep.room);
		var warPlan = Memory.warPlan;
		var threat = warPlan && warPlan.threat && warPlan.threat[creep.room.name];
		var squad = squadUtils.getMySquad(creep, 'defense');

		if (creep.memory._stuckTicks === 6 && !creep.memory._recordedStuck) {
			creep.memory._recordedStuck = true;
			var patterns = Memory.roomIntel && Memory.roomIntel[creep.room.name] && Memory.roomIntel[creep.room.name].defensePatterns;
			if (patterns) {
				var key = creep.pos.x + ',' + creep.pos.y;
				patterns.blockedTiles[key] = (patterns.blockedTiles[key] || 0) + 1;
			}
		}
		if (creep.memory._stuckTicks === 0) creep.memory._recordedStuck = false;

	if (!threat || !threat.priorityTargetId) {
		if (squad && squad.status === 'idle' && creep.name !== squad.leader) {
			squadUtils.followLeaderSlot(creep, squad, '#ff4444', 1);
			return;
		}
		if (Memory.strategy && Memory.strategy.threatRoom && creep.room.name !== Memory.strategy.threatRoom) {
			pathing.moveTo(creep, new RoomPosition(25, 25, Memory.strategy.threatRoom), 'defender', { stroke: '#ff4444' });
			return;
		}
		// Idle patrol: cycle through controller, anchor, and exit checkpoints
		var checkpoints = Memory.roomIntel && Memory.roomIntel[creep.room.name] && Memory.roomIntel[creep.room.name].checkpoints;
		if (checkpoints) {
			if (!creep.memory._patrolIndex) creep.memory._patrolIndex = 0;
			var waypoints = [];
			if (checkpoints.controller) waypoints.push(new RoomPosition(checkpoints.controller.x, checkpoints.controller.y, creep.room.name));
			if (checkpoints.spawn) waypoints.push(new RoomPosition(checkpoints.spawn.x, checkpoints.spawn.y, creep.room.name));
			if (checkpoints.exit) {
				for (var d in checkpoints.exit) {
					waypoints.push(new RoomPosition(checkpoints.exit[d].x, checkpoints.exit[d].y, creep.room.name));
				}
			}
			if (waypoints.length > 0) {
				var idx = creep.memory._patrolIndex % waypoints.length;
				var dest = waypoints[idx];
				if (creep.pos.getRangeTo(dest) <= 2) {
					creep.memory._patrolIndex = (idx + 1) % waypoints.length;
					dest = waypoints[creep.memory._patrolIndex];
				}
				pathing.moveTo(creep, dest, 'defender', { stroke: '#ff4444' });
				return;
			}
		}
		var anchorRampart = getDefenseAnchorRampart(creep.room, anchor);
		if (anchorRampart && !creep.pos.isEqualTo(anchorRampart.pos)) { pathing.moveTo(creep, anchorRampart, 'defender', { stroke: '#ff4444' }); return; }
		if (creep.pos.getRangeTo(anchor) > 3) pathing.moveTo(creep, anchor, 'defender', { stroke: '#ff4444' });
		return;
	}

		var hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
		var target = null;
		for (var i = 0; i < hostiles.length; i++) {
			if (hostiles[i].id === threat.priorityTargetId) { target = hostiles[i]; break; }
		}
		if (!target) {
			if (hostiles.length > 0) target = hostiles[0];
			else return;
		}

		if (squad && creep.name !== squad.leader && creep.pos.getRangeTo(target) > 2) {
			squadUtils.followLeaderSlot(creep, squad, '#ff4444', 1);
			return;
		}

		if (Memory.strategy && Memory.strategy.invaderPreset === 'raid' && creep.hits < creep.hitsMax * 0.35) {
			var anchorRampart = getDefenseAnchorRampart(creep.room, anchor);
			if (anchorRampart) { pathing.moveTo(creep, anchorRampart, 'defender', { stroke: '#ff4444' }); return; }
		}

		if (creep.pos.isNearTo(target)) {
			var patterns = Memory.roomIntel && Memory.roomIntel[creep.room.name] && Memory.roomIntel[creep.room.name].defensePatterns;
			if (patterns) {
				if (!patterns._grabTicks) patterns._grabTicks = {};
				if (!patterns._grabTicks[target.id]) patterns._grabTicks[target.id] = 0;
				patterns._grabTicks[target.id] += 1;
				if (patterns._grabTicks[target.id] === 3) patterns.grabSuccesses += 1;
			}
			var attackResult = creep.attack(target);
			metrics.recordRoleResult('defender', 'attack', attackResult);
			if (attackResult === OK) stats.recordAttack(creep, 1);
			return;
		}

		var exitBlock = getExitBlockPosition(creep.room, target, anchor);
		if (exitBlock) { pathing.moveTo(creep, exitBlock, 'defender', { stroke: '#ff4444' }); return; }

		if (threat.interceptPos) {
			var intercept = new RoomPosition(threat.interceptPos.x, threat.interceptPos.y, creep.room.name);
			if (creep.pos.getRangeTo(intercept) > 1) { pathing.moveTo(creep, intercept, 'defender', { stroke: '#ff8800' }); return; }
		}

		var pe = warRoom.getPredictedExit(target.id, creep.room);
		if (pe && creep.pos.getRangeTo(pe) <= 10 && creep.pos.getRangeTo(pe) <= target.pos.getRangeTo(pe)) {
			pathing.moveTo(creep, pe, 'defender', { stroke: '#ff4444' });
			return;
		}

		var adjacent = pickBestAdjacentTile(creep, target);
		if (adjacent) { pathing.moveTo(creep, adjacent, 'defender', { stroke: '#ff4444' }); return; }

		pathing.moveTo(creep, target, 'defender', { stroke: '#ff4444' });
	},
};

export default roleDefender;
