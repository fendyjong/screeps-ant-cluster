const pathing = require('utils.pathing');
const metrics = require('utils.metrics');

const roleClaimer = {
	run: function (creep) {
		if (!Memory.strategy) {
			return;
		}

		const targetRoom = Memory.strategy.claimReady === true && Memory.strategy.claimTarget
			? Memory.strategy.claimTarget
			: (Memory.strategy.reserveReady === true ? Memory.strategy.reserveTarget : null);
		if (!targetRoom) {
			return;
		}

		if (creep.room.name !== targetRoom) {
			pathing.moveToRoom(creep, targetRoom, 'default', { stroke: '#99ff99' });
			return;
		}

		const controller = creep.room.controller;
		if (!controller) {
			return;
		}

		if (controller.owner && !controller.my) {
			const attackResult = creep.attackController(controller);
			metrics.recordRoleResult('claimer', 'attackController', attackResult);
			if (attackResult === ERR_NOT_IN_RANGE) {
				creep.moveTo(controller, { visualizePathStyle: { stroke: '#99ff99' }, reusePath: 10, maxOps: 1200 });
			}
			return;
		}

		if (Memory.strategy.claimReady !== true) {
			const reserveResult = creep.reserveController(controller);
			metrics.recordRoleResult('claimer', 'reserveController', reserveResult);
			if (reserveResult === ERR_NOT_IN_RANGE) {
				creep.moveTo(controller, { visualizePathStyle: { stroke: '#99ff99' }, reusePath: 10, maxOps: 1200 });
			}
			if (reserveResult === OK) {
				if (!Memory.strategy.bootstrapRooms) {
					Memory.strategy.bootstrapRooms = {};
				}
				Memory.strategy.bootstrapRooms[targetRoom] = { stage: 'reserve', tick: Game.time };
			}
			return;
		}

		const claimResult = creep.claimController(controller);
		metrics.recordRoleResult('claimer', 'claimController', claimResult);
		if (claimResult === ERR_NOT_IN_RANGE) {
			creep.moveTo(controller, { visualizePathStyle: { stroke: '#99ff99' }, reusePath: 10, maxOps: 1200 });
			return;
		}
		if (claimResult === OK) {
			if (!Memory.strategy.bootstrapRooms) {
				Memory.strategy.bootstrapRooms = {};
			}
			Memory.strategy.bootstrapRooms[targetRoom] = { stage: 'claim', tick: Game.time };
			if (!Memory.metrics) {
				Memory.metrics = {};
			}
			Memory.metrics.claimSuccesses = (Memory.metrics.claimSuccesses || 0) + 1;
		}

		if (claimResult === ERR_GCL_NOT_ENOUGH) {
			creep.reserveController(controller);
		}
	},
};

module.exports = roleClaimer;
