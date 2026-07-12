const pathing = require('utils.pathing');
const metrics = require('utils.metrics');
const stats = require('utils.stats');
const squadUtils = require('utils.squad');

function findWoundedTarget(creep, squad) {
	var best = null, bestDist = Infinity;
	for (var m = 0; m < squad.members.length; m++) {
		var c = Game.creeps[squad.members[m]];
		if (!c || c.hits >= c.hitsMax) continue;
		var dist = creep.pos.getRangeTo(c);
		if (dist < bestDist) { bestDist = dist; best = c; }
	}
	if (best) return best;

	var wounded = creep.room.find(FIND_MY_CREEPS, { filter: function (c) { return c.hits < c.hitsMax; } });
	return creep.pos.findClosestByPath(wounded) || wounded[0];
}

function findLeader(creep, squad) {
	if (squad.leader && Game.creeps[squad.leader]) return Game.creeps[squad.leader];
	for (var m = 0; m < squad.members.length; m++) {
		var c = Game.creeps[squad.members[m]];
		if (c && c.memory.role === 'attacker') return c;
	}
	return null;
}

var roleHealer = {
	run: function (creep) {
		var squad = squadUtils.getMySquad(creep);
		if (!squad) {
			var rally = creep.room.find(FIND_MY_SPAWNS)[0];
			if (rally && creep.pos.getRangeTo(rally) > 4) pathing.moveTo(creep, rally, 'defender', { stroke: '#55ff55' });
			return;
		}

		if (squad.status === 'marching' && creep.name !== squad.leader) {
			squadUtils.followLeaderSlot(creep, squad, '#55ff55', 0);
		}

		var wounded = findWoundedTarget(creep, squad);
		if (wounded) {
			if (creep.pos.getRangeTo(wounded) <= 1) {
				var result = creep.heal(wounded);
				metrics.recordRoleResult('healer', 'heal', result);
				if (result === OK) stats.recordHeal(creep, 1);
			} else {
				var result = creep.rangedHeal(wounded);
				metrics.recordRoleResult('healer', 'rangedHeal', result);
				if (result === OK) stats.recordHeal(creep, 1);
				if (creep.pos.getRangeTo(wounded) > 3) pathing.moveTo(creep, wounded, 'defender', { stroke: '#55ff55' });
			}
			return;
		}

		var leader = findLeader(creep, squad);
		if (leader) {
			if (creep.pos.getRangeTo(leader) > 1) pathing.moveTo(creep, leader, 'defender', { stroke: '#55ff55' });
			else if (leader.fatigue > 0) { leader.pull(creep); creep.move(leader); }
			return;
		}

		if (squad.status === 'marching' && squad.waypoints.length > 0 && creep.name === squad.leader) {
			var wp = squad.waypoints[0];
			if (creep.room.name !== wp.room) {
				pathing.moveToRoom(creep, wp.room, 'defender', { stroke: '#55ff55' });
				return;
			}
			if (wp.pos) pathing.moveTo(creep, new RoomPosition(wp.pos.x, wp.pos.y, creep.room.name), 'defender', { stroke: '#55ff55' });
		}
	},
};

module.exports = roleHealer;
