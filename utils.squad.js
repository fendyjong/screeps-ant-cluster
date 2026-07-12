const pathing = require('utils.pathing');

function clamp(v, min, max) {
	return Math.max(min, Math.min(max, v));
}

function getMySquad(creep, preferredType) {
	var squads = Memory.warPlan && Memory.warPlan.squads;
	if (!squads) return null;

	for (var i = 0; i < squads.length; i++) {
		var squad = squads[i];
		if (preferredType && squad.type !== preferredType) continue;
		for (var m = 0; m < squad.members.length; m++) {
			if (squad.members[m] === creep.name) return squad;
		}
	}
	return null;
}

function getLeaderCreep(squad) {
	if (!squad || !squad.leader) return null;
	return Game.creeps[squad.leader] || null;
}

function getMemberSlot(squad, creepName) {
	if (!squad || !squad.slots) return null;
	return squad.slots[creepName] || null;
}

function followLeaderSlot(creep, squad, color, acceptableRange) {
	if (!squad || !squad.leader || creep.name === squad.leader) return false;
	var leader = getLeaderCreep(squad);
	if (!leader) return false;
	var slot = getMemberSlot(squad, creep.name) || { dx: 0, dy: 1 };
	var rangeOk = typeof acceptableRange === 'number' ? acceptableRange : 0;

	if (creep.room.name !== leader.room.name) {
		pathing.moveToRoom(creep, leader.room.name, 'defender', { stroke: color || '#ffffff' });
		return true;
	}

	var tx = clamp(leader.pos.x + slot.dx, 1, 48);
	var ty = clamp(leader.pos.y + slot.dy, 1, 48);
	var targetPos = new RoomPosition(tx, ty, leader.room.name);
	if (creep.pos.getRangeTo(targetPos) <= rangeOk) return true;

	pathing.moveTo(creep, targetPos, 'defender', { stroke: color || '#ffffff' });
	return true;
}

module.exports = {
	getMySquad: getMySquad,
	getLeaderCreep: getLeaderCreep,
	getMemberSlot: getMemberSlot,
	followLeaderSlot: followLeaderSlot,
};
