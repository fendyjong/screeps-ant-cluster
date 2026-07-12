import pathing from "./utils.pathing";
import metrics from "./utils.metrics";
import stats from "./utils.stats";

function scorePickup(creep, source) {
	var dist = Math.max(1, creep.pos.getRangeTo(source));
	var available = 0;
	var multiplier = 1;

	if (source.resourceType === RESOURCE_ENERGY) {
		available = source.amount;
		multiplier = 1;
	} else if (source.store) {
		available = source.store[RESOURCE_ENERGY] || 0;
		if (source.structureType === STRUCTURE_CONTAINER) {
			var nearSource = source.pos.findInRange(FIND_SOURCES, 2).length > 0;
			multiplier = nearSource ? 3 : 1.5;
		} else if (source.structureType === STRUCTURE_STORAGE) {
			multiplier = 0.5;
		} else {
			multiplier = 2;
		}
	} else if (source.energy !== undefined) {
		available = source.energy;
		multiplier = 0.3;
	}

	return available * multiplier / dist;
}

function findBestPickup(creep) {
	var best = null;
	var bestScore = 0;

	var candidates = [];

	var dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
		filter: function (r) { return r.resourceType === RESOURCE_ENERGY && r.amount >= 30; },
	});
	for (var i = 0; i < dropped.length; i++) candidates.push(dropped[i]);

	var tombstones = creep.room.find(FIND_TOMBSTONES, {
		filter: function (t) { return t.store[RESOURCE_ENERGY] > 0; },
	});
	for (var i = 0; i < tombstones.length; i++) candidates.push(tombstones[i]);

	var containers = creep.room.find(FIND_STRUCTURES, {
		filter: function (s) { return (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) && s.store[RESOURCE_ENERGY] > 0; },
	});
	for (var i = 0; i < containers.length; i++) candidates.push(containers[i]);

	var sources = creep.room.find(FIND_SOURCES_ACTIVE);
	for (var i = 0; i < sources.length; i++) candidates.push(sources[i]);

	for (var i = 0; i < candidates.length; i++) {
		var c = candidates[i];
		var score = scorePickup(creep, c);
		if (score > bestScore) { bestScore = score; best = c; }
	}

	return best;
}

function getDeliveryPriority(s) {
	if (s.structureType === STRUCTURE_SPAWN) return 0;
	if (s.structureType === STRUCTURE_EXTENSION) return 1;
	if (s.structureType === STRUCTURE_TOWER) return 2;
	if (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) return 3;
	return 4;
}

function findBestDelivery(creep) {
	var best = null;
	var bestScore = -Infinity;

	var structures = creep.room.find(FIND_STRUCTURES, {
		filter: function (s) {
			if (s.structureType === STRUCTURE_CONTAINER) {
				if (s.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) return false;
				var nearSource = s.pos.findInRange(FIND_SOURCES, 2).length > 0;
				if (nearSource) return false;
				return true;
			}
			return (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_TOWER || s.structureType === STRUCTURE_STORAGE) &&
				s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
		},
	});

	for (var i = 0; i < structures.length; i++) {
		var s = structures[i];
		var dist = creep.pos.getRangeTo(s);
		var need = s.store.getFreeCapacity(RESOURCE_ENERGY);
		var priority = getDeliveryPriority(s);
		var score = need / (dist + 1) - priority * 100;
		if (score > bestScore) { bestScore = score; best = s; }
	}

	if (!best && creep.room.controller) {
		return creep.room.controller;
	}

	return best;
}

const roleHauler = {
	run: function (creep) {
		if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
		if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;

		if (!creep.memory.working) {
			var pickup = findBestPickup(creep);
			if (!pickup) return;

			if (pickup.resourceType === RESOURCE_ENERGY) {
				var result = creep.pickup(pickup);
				metrics.recordRoleResult('hauler', 'pickup', result);
				if (result === OK) stats.recordHarvest(creep, pickup.amount);
				if (result === ERR_NOT_IN_RANGE) {
					pathing.moveTo(creep, pickup, 'hauler', { stroke: '#ffaa00' });
					stats.recordMove(creep);
				}
				return;
			}

			if (pickup.store) {
				var result = creep.withdraw(pickup, RESOURCE_ENERGY);
				metrics.recordRoleResult('hauler', 'withdraw', result);
				if (result === OK) stats.recordWithdraw(creep, Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), pickup.store[RESOURCE_ENERGY]));
				if (result === ERR_NOT_IN_RANGE) {
					pathing.moveTo(creep, pickup, 'hauler', { stroke: '#ffaa00' });
					stats.recordMove(creep);
				}
				return;
			}

			var result = creep.harvest(pickup);
			metrics.recordRoleResult('hauler', 'harvest', result);
			if (result === OK) stats.recordHarvest(creep, creep.store.getUsedCapacity(RESOURCE_ENERGY));
			if (result === ERR_NOT_IN_RANGE) {
				pathing.moveTo(creep, pickup, 'hauler', { stroke: '#ffaa00' });
				stats.recordMove(creep);
			}
			return;
		}

		var target = findBestDelivery(creep);
		if (!target) return;

		if (target.structureType) {
			var result = creep.transfer(target, RESOURCE_ENERGY);
			metrics.recordRoleResult('hauler', 'transfer', result);
			if (result === OK) stats.recordTransfer(creep, creep.store[RESOURCE_ENERGY]);
			if (result === ERR_NOT_IN_RANGE) {
				pathing.moveTo(creep, target, 'hauler', { stroke: '#ffffff' });
				stats.recordMove(creep);
			}
			return;
		}

		var result = creep.upgradeController(target);
		metrics.recordRoleResult('hauler', 'upgradeController', result);
		if (result === OK) stats.recordUpgrade(creep, 1);
		if (result === ERR_NOT_IN_RANGE) {
			pathing.moveTo(creep, target, 'hauler', { stroke: '#ffffff' });
			stats.recordMove(creep);
		}
	},
};

export default roleHauler;
