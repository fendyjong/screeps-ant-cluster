const pathing = require('utils.pathing');
const metrics = require('utils.metrics');
const stats = require('utils.stats');

function hasRoomHauler(creep) {
	return _.some(Game.creeps, function (candidate) {
		return candidate.memory.role === 'hauler' && candidate.memory.roomName === creep.room.name;
	});
}

function getHarvestSpots(source) {
	if (!Memory._cache) Memory._cache = {};
	if (!Memory._cache.harvestSpots) Memory._cache.harvestSpots = {};
	var cached = Memory._cache.harvestSpots[source.id];
	if (cached && cached.tick === Game.time) return cached.spots;

	var spots = [];
	var terrain = Game.map.getRoomTerrain(source.room.name);

	for (var dx = -1; dx <= 1; dx++) {
		for (var dy = -1; dy <= 1; dy++) {
			if (dx === 0 && dy === 0) continue;
			var x = source.pos.x + dx;
			var y = source.pos.y + dy;

			if (x < 0 || x > 49 || y < 0 || y > 49) continue;
			if ((terrain.get(x, y) & TERRAIN_MASK_WALL) !== 0) continue;

			var blocked = false;
			var structs = source.room.lookForAt(LOOK_STRUCTURES, x, y);
			for (var i = 0; i < structs.length; i++) {
				var s = structs[i];
				if (s.structureType !== STRUCTURE_CONTAINER
					&& s.structureType !== STRUCTURE_ROAD
					&& s.structureType !== STRUCTURE_RAMPART) {
					blocked = true;
					break;
				}
			}
			if (!blocked) spots.push(new RoomPosition(x, y, source.room.name));
		}
	}

	Memory._cache.harvestSpots[source.id] = { spots: spots, tick: Game.time };
	return spots;
}

function pickSource(creep) {
	if (creep.memory.sourceId) {
		var assigned = Game.getObjectById(creep.memory.sourceId);
		if (assigned && assigned.energy > 0) {
			return assigned;
		}
	}

	var sources = creep.room.find(FIND_SOURCES_ACTIVE);
	if (sources.length === 0) {
		sources = creep.room.find(FIND_SOURCES);
	}
	if (sources.length === 0) return null;

	var best = null;
	var bestScore = -Infinity;

	for (var i = 0; i < sources.length; i++) {
		var s = sources[i];
		if (s.energy === undefined || s.energy === 0) continue;

		var spots = getHarvestSpots(s);
		var assignedCount = _.filter(Game.creeps, function(c) {
			return c.memory.role === 'harvester' && c.memory.sourceId === s.id && c.name !== creep.name;
		}).length;
		var freeSpots = spots.length - assignedCount;
		if (freeSpots <= 0) continue;

		var dist = creep.pos.getRangeTo(s);
		var score = s.energy / (1 + dist * 0.1);

		if (score > bestScore) {
			bestScore = score;
			best = s;
		}
	}

	if (best) {
		creep.memory.sourceId = best.id;
	}
	return best || sources[0];
}

function findEnergyTarget(creep) {
	var prioritized = creep.room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return (
				(structure.structureType === STRUCTURE_SPAWN ||
					structure.structureType === STRUCTURE_EXTENSION ||
					structure.structureType === STRUCTURE_TOWER) &&
				structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
			);
		},
	});

	if (prioritized.length > 0) {
		var best = null;
		var bestScore = Infinity;
		for (var i = 0; i < prioritized.length; i++) {
			var structure = prioritized[i];
			var priority = 3;
			if (structure.structureType === STRUCTURE_SPAWN) priority = 0;
			else if (structure.structureType === STRUCTURE_EXTENSION) priority = 1;
			else if (structure.structureType === STRUCTURE_TOWER) priority = 2;
			var score = priority * 100 + creep.pos.getRangeTo(structure.pos);
			if (score < bestScore) { bestScore = score; best = structure; }
		}
		return best;
	}

	var fallback = creep.room.find(FIND_STRUCTURES, {
		filter: function (structure) {
			return (
				(structure.structureType === STRUCTURE_CONTAINER || structure.structureType === STRUCTURE_STORAGE) &&
				structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
			);
		},
	});

	if (fallback.length > 0) return creep.pos.findClosestByPath(fallback);

	return null;
}

function runMobileHarvest(creep, source) {
	if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
	if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;

	if (!creep.memory.working) {
		if (source) {
			var result = creep.harvest(source);
			metrics.recordRoleResult('harvester', 'harvest', result);
			if (result === OK) stats.recordHarvest(creep, creep.store.getUsedCapacity(RESOURCE_ENERGY));
			if (result === ERR_NOT_IN_RANGE) {
				pathing.moveTo(creep, source, 'default', { stroke: '#ffaa00' });
				stats.recordMove(creep);
			}
		}
		return;
	}

	var target = findEnergyTarget(creep);
	if (target) {
		var result = creep.transfer(target, RESOURCE_ENERGY);
		metrics.recordRoleResult('harvester', 'transfer', result);
		if (result === OK) stats.recordTransfer(creep, Math.min(creep.store[RESOURCE_ENERGY], target.store.getFreeCapacity(RESOURCE_ENERGY)));
		if (result === ERR_NOT_IN_RANGE) {
			pathing.moveTo(creep, target, 'default', { stroke: '#ffffff' });
			stats.recordMove(creep);
		}
		return;
	}

	if (creep.room.controller) {
		var result = creep.upgradeController(creep.room.controller);
		metrics.recordRoleResult('harvester', 'upgradeController', result);
		if (result === OK) stats.recordUpgrade(creep, 1);
		if (result === ERR_NOT_IN_RANGE) {
			pathing.moveTo(creep, creep.room.controller, 'default', { stroke: '#ffffff' });
			stats.recordMove(creep);
		}
	}
}

const roleHarvester = {
	run: function (creep) {
		var source = pickSource(creep);
		if (!source) return;

		var sourceContainers = source.pos.findInRange(FIND_STRUCTURES, 1, {
			filter: function (structure) {
				return structure.structureType === STRUCTURE_CONTAINER;
			},
		});

		var isMobile = !hasRoomHauler(creep) && sourceContainers.length === 0;
		if (isMobile) {
			runMobileHarvest(creep, source);
			return;
		}

		if (creep.pos.getRangeTo(source) > 1) {
			pathing.moveTo(creep, source, 'default', { stroke: '#ffaa00' });
			stats.recordMove(creep);
			return;
		}

		var harvestResult = creep.harvest(source);
		metrics.recordRoleResult('harvester', 'harvest', harvestResult);
		if (harvestResult === OK) stats.recordHarvest(creep, creep.store.getUsedCapacity(RESOURCE_ENERGY));

		var nearbyTarget = creep.pos.findInRange(FIND_STRUCTURES, 1, {
			filter: function (structure) {
				return (
					(structure.structureType === STRUCTURE_CONTAINER ||
						structure.structureType === STRUCTURE_SPAWN ||
						structure.structureType === STRUCTURE_EXTENSION) &&
					structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
				);
			},
		})[0];

		if (nearbyTarget) {
			var result = creep.transfer(nearbyTarget, RESOURCE_ENERGY);
			metrics.recordRoleResult('harvester', 'transfer', result);
			if (result === OK) stats.recordTransfer(creep, Math.min(creep.store[RESOURCE_ENERGY], nearbyTarget.store.getFreeCapacity(RESOURCE_ENERGY)));
			return;
		}

		if (creep.store.getFreeCapacity() === 0) {
			creep.drop(RESOURCE_ENERGY);
			stats.recordDrop(creep, creep.store[RESOURCE_ENERGY]);
		}
	},
};

module.exports = roleHarvester;
