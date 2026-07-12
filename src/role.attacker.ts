import pathing from "./utils.pathing";
import metrics from "./utils.metrics";
import stats from "./utils.stats";
import squadUtils from "./utils.squad";

var roleAttacker = {
	run: function (creep) {
		var squad = squadUtils.getMySquad(creep, 'assault');
		if (!squad) {
			var rally = creep.room.find(FIND_MY_SPAWNS)[0];
			if (rally && creep.pos.getRangeTo(rally) > 4) pathing.moveTo(creep, rally, 'defender', { stroke: '#ff66aa' });
			return;
		}

		if (squad.status === 'idle') {
			var rally = creep.room.find(FIND_MY_SPAWNS)[0];
			if (rally && creep.pos.getRangeTo(rally) > 4) pathing.moveTo(creep, rally, 'defender', { stroke: '#ff66aa' });
			return;
		}

		if (squad.status === 'marching') {
			if (creep.name !== squad.leader) {
				squadUtils.followLeaderSlot(creep, squad, '#ff66aa', 0);
				return;
			}

			var wp = squad.waypoints[0];
			if (wp) {
				if (creep.room.name !== wp.room) {
					pathing.moveToRoom(creep, wp.room, 'defender', { stroke: '#ff66aa' });
					return;
				}
				if (wp.pos && creep.pos.getRangeTo(new RoomPosition(wp.pos.x, wp.pos.y, creep.room.name)) > 3) {
					pathing.moveTo(creep, new RoomPosition(wp.pos.x, wp.pos.y, creep.room.name), 'defender', { stroke: '#ff66aa' });
					return;
				}
			}
			if (squad.waypoints.length > 1) squad.waypoints.shift();
			return;
		}

		if (squad.engaged) {
			if (creep.hits < creep.hitsMax * 0.35) {
				var rally = creep.room.find(FIND_MY_SPAWNS)[0];
				if (rally) { pathing.moveTo(creep, rally, 'defender', { stroke: '#ff66aa' }); }
				return;
			}

			var hostileCreep = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS);
			if (hostileCreep) {
				var result = creep.attack(hostileCreep);
				metrics.recordRoleResult('attacker', 'attack', result);
				if (result === OK) stats.recordAttack(creep, 1);
				if (!creep.pos.isNearTo(hostileCreep)) pathing.moveTo(creep, hostileCreep, 'defender', { stroke: '#ff66aa' });
				return;
			}

			var hostileStructure = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {
				filter: function (s) { return s.structureType !== STRUCTURE_CONTROLLER; },
			});
			if (hostileStructure) {
				var result = creep.attack(hostileStructure);
				metrics.recordRoleResult('attacker', 'attack', result);
				if (result === OK) stats.recordAttack(creep, 1);
				if (!creep.pos.isNearTo(hostileStructure)) pathing.moveTo(creep, hostileStructure, 'defender', { stroke: '#ff66aa' });
			}
		}
	},
};

export default roleAttacker;
