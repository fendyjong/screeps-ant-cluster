const pathing = require('utils.pathing');
const metrics = require('utils.metrics');
const squadUtils = require('utils.squad');

function findAttackPartner(creep) {
	const attackers = _.filter(Game.creeps, function (ally) {
		return ally.memory.role === 'attacker' && ally.memory.roomName === creep.memory.roomName;
	});
	if (attackers.length === 0) {
		return null;
	}
	return creep.pos.findClosestByPath(attackers) || attackers[0];
}

const roleRangedEscort = {
	run: function (creep) {
		const squad = squadUtils.getMySquad(creep);
		if (squad && squad.status === 'marching') {
			if (creep.name !== squad.leader) {
				squadUtils.followLeaderSlot(creep, squad, '#ffaaee', 0);
				return;
			}
			if (squad.waypoints && squad.waypoints.length > 0) {
				const wp = squad.waypoints[0];
				if (creep.room.name !== wp.room) {
					pathing.moveToRoom(creep, wp.room, 'defender', { stroke: '#ffaaee' });
					return;
				}
				if (wp.pos && creep.pos.getRangeTo(new RoomPosition(wp.pos.x, wp.pos.y, creep.room.name)) > 3) {
					pathing.moveTo(creep, new RoomPosition(wp.pos.x, wp.pos.y, creep.room.name), 'defender', { stroke: '#ffaaee' });
					return;
				}
				if (squad.waypoints.length > 1) squad.waypoints.shift();
			}
		}

		const roomThreat = Memory.warPlan && Memory.warPlan.threat && Memory.warPlan.threat[creep.room.name];
		const defendRoom = roomThreat && roomThreat.priorityTargetId;
		if (!Memory.strategy || (!Memory.strategy.attackReady || !Memory.strategy.attackTarget) && !defendRoom) {
			const rally = creep.room.find(FIND_MY_SPAWNS)[0];
			if (rally) {
				pathing.moveTo(creep, rally, 'defender', { stroke: '#ffaaee' });
			}
			return;
		}

		const partner = findAttackPartner(creep);
		if (partner && Memory.strategy.attackTarget && creep.room.name !== Memory.strategy.attackTarget) {
			if (creep.pos.getRangeTo(partner) > 2) {
				pathing.moveTo(creep, partner, 'defender', { stroke: '#ffaaee' });
			}
			return;
		}

		const targetRoom = (squad && squad.targetRoom) || Memory.strategy.attackTarget || (defendRoom ? creep.room.name : null);
		if (targetRoom && creep.room.name !== targetRoom) {
			pathing.moveToRoom(creep, targetRoom, 'defender', { stroke: '#ffaaee' });
			return;
		}

		const hostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS) || creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {
			filter: function (structure) {
				return structure.structureType !== STRUCTURE_CONTROLLER;
			},
		});
		if (!hostile) {
			return;
		}

		const rangedResult = creep.rangedAttack(hostile);
		metrics.recordRoleResult('rangedEscort', 'rangedAttack', rangedResult);
		if (rangedResult === ERR_NOT_IN_RANGE) {
			pathing.moveTo(creep, hostile, 'defender', { stroke: '#ffaaee' });
		}
	}
};

module.exports = roleRangedEscort;
