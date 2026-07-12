const pathing = require('utils.pathing');
const metrics = require('utils.metrics');
const stats = require('utils.stats');

function findEnergySource(creep) {
	var fromContainers = creep.room.find(FIND_STRUCTURES, {
		filter: function (s) { return (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) && s.store[RESOURCE_ENERGY] > 0; },
	});
	if (fromContainers.length > 0) return creep.pos.findClosestByPath(fromContainers);

	var fromSpawn = creep.room.find(FIND_MY_STRUCTURES, {
		filter: function (s) { return (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store[RESOURCE_ENERGY] > 0; },
	});
	if (fromSpawn.length > 0) return creep.pos.findClosestByPath(fromSpawn);

	return creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
}

var roleUpgrader = {
	run: function (creep) {
		if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
		if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;

		if (creep.memory.working) {
			if (creep.room.controller) {
				var result = creep.upgradeController(creep.room.controller);
				metrics.recordRoleResult('upgrader', 'upgradeController', result);
				if (result === OK) stats.recordUpgrade(creep, 1);
				if (result === ERR_NOT_IN_RANGE) {
					pathing.moveTo(creep, creep.room.controller, 'default', { stroke: '#ffffff' });
					stats.recordMove(creep);
				}
			}
			return;
		}

		var source = findEnergySource(creep);
		if (!source) return;

		if (source.structureType) {
			var result = creep.withdraw(source, RESOURCE_ENERGY);
			metrics.recordRoleResult('upgrader', 'withdraw', result);
			if (result === OK) stats.recordWithdraw(creep, Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), source.store[RESOURCE_ENERGY]));
			if (result === ERR_NOT_IN_RANGE) {
				pathing.moveTo(creep, source, 'default', { stroke: '#ffaa00' });
				stats.recordMove(creep);
			}
			return;
		}

		var result = creep.harvest(source);
		metrics.recordRoleResult('upgrader', 'harvest', result);
		if (result === OK) stats.recordHarvest(creep, creep.store.getUsedCapacity(RESOURCE_ENERGY));
		if (result === ERR_NOT_IN_RANGE) {
			pathing.moveTo(creep, source, 'default', { stroke: '#ffaa00' });
			stats.recordMove(creep);
		}
	},
};

module.exports = roleUpgrader;
