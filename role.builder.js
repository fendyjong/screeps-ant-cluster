const pathing = require('utils.pathing');
const metrics = require('utils.metrics');
const stats = require('utils.stats');

function getBuildPriority(site, room) {
	var plan = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].colonyPlan;
	if (plan && plan.buildPriority && plan.buildPriority[site.structureType] !== undefined) {
		return plan.buildPriority[site.structureType];
	}
	var fallback = {
		[STRUCTURE_SPAWN]: 10,
		[STRUCTURE_EXTENSION]: 20,
		[STRUCTURE_TOWER]: 20,
		[STRUCTURE_CONTAINER]: 30,
		[STRUCTURE_STORAGE]: 40,
		[STRUCTURE_ROAD]: 50,
		[STRUCTURE_RAMPART]: 130,
		[STRUCTURE_WALL]: 140,
	};
	return fallback[site.structureType] || 99;
}

function getBarrierFloor(room) {
	var byRcl = { 1: 0, 2: 5000, 3: 15000, 4: 50000, 5: 150000, 6: 400000, 7: 1000000, 8: 3000000 };
	return byRcl[(room.controller && room.controller.level) || 1] || 10000;
}

function findBuildRoomTarget(fromRoomName) {
	var bestRoomName = null;
	var bestDistance = Infinity;
	for (var roomName in Game.rooms) {
		var room = Game.rooms[roomName];
		if (!room.controller || !room.controller.my) continue;
		var sites = room.find(FIND_MY_CONSTRUCTION_SITES);
		if (sites.length > 0) {
			var distance = Game.map.getRoomLinearDistance(fromRoomName, room.name);
			if (distance < bestDistance) { bestDistance = distance; bestRoomName = room.name; }
		}
	}
	return bestRoomName;
}

function pickSwarmSite(creep, sites) {
	var hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
	if (hostiles.length > 0) {
		var defensive = [];
		for (var i = 0; i < sites.length; i++) {
			var s = sites[i];
			if (s.structureType === STRUCTURE_TOWER || s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) {
				defensive.push(s);
			}
		}
		if (defensive.length > 0) sites = defensive;
	}

	sites.sort(function (a, b) {
		var pa = getBuildPriority(a, creep.room), pb = getBuildPriority(b, creep.room);
		if (pa !== pb) return pa - pb;
		return (a.progressTotal - a.progress) - (b.progressTotal - b.progress);
	});

	return sites[0];
}

function findReturnTarget(creep) {
	var urgent = creep.room.find(FIND_MY_STRUCTURES, {
		filter: function (s) { return (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_TOWER) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0; },
	});
	if (urgent.length > 0) return creep.pos.findClosestByPath(urgent);
	var reserve = creep.room.find(FIND_STRUCTURES, {
		filter: function (s) { return (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0; },
	});
	if (reserve.length > 0) return creep.pos.findClosestByPath(reserve);
	return null;
}

function findEnergySource(creep) {
	var best = null;
	var bestScore = -Infinity;

	var structures = creep.room.find(FIND_MY_STRUCTURES, {
		filter: function (s) {
			if (s.structureType === STRUCTURE_SPAWN) return s.store[RESOURCE_ENERGY] > 200;
			if (s.structureType === STRUCTURE_EXTENSION) return s.store[RESOURCE_ENERGY] > 50;
			return false;
		},
	});
	for (var i = 0; i < structures.length; i++) {
		var s = structures[i];
		var available = s.store[RESOURCE_ENERGY] - (s.structureType === STRUCTURE_SPAWN ? 200 : 50);
		var dist = Math.max(1, creep.pos.getRangeTo(s));
		var score = available * 2 / dist;
		if (score > bestScore) { bestScore = score; best = s; }
	}

	if (creep.room.storage) {
		var store = creep.room.storage;
		var avail = (store.store[RESOURCE_ENERGY] || 0) - 500;
		if (avail > 0) {
			var dist = Math.max(1, creep.pos.getRangeTo(store));
			var score = avail * 1.5 / dist;
			if (score > bestScore) { bestScore = score; best = store; }
		}
	}

	var dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
		filter: function (r) { return r.resourceType === RESOURCE_ENERGY && r.amount >= 20; },
	});
	for (var i = 0; i < dropped.length; i++) {
		var d = dropped[i];
		var dist = Math.max(1, creep.pos.getRangeTo(d));
		var score = d.amount * 1.2 / dist;
		if (score > bestScore) { bestScore = score; best = d; }
	}

	var tombstones = creep.room.find(FIND_TOMBSTONES, {
		filter: function (t) { return t.store[RESOURCE_ENERGY] > 0; },
	});
	for (var i = 0; i < tombstones.length; i++) {
		var t = tombstones[i];
		var dist = Math.max(1, creep.pos.getRangeTo(t));
		var score = (t.store[RESOURCE_ENERGY] || 0) / dist;
		if (score > bestScore) { bestScore = score; best = t; }
	}

	var sources = creep.room.find(FIND_SOURCES_ACTIVE);
	for (var i = 0; i < sources.length; i++) {
		var src = sources[i];
		var dist = Math.max(1, creep.pos.getRangeTo(src));
		var score = src.energy * 0.3 / dist;
		if (score > bestScore) { bestScore = score; best = src; }
	}

	return best;
}

var roleBuilder = {
	run: function (creep) {
		if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
		if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;

		if (creep.memory.working) {
			var sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
			if (sites.length > 0) {
				var site = pickSwarmSite(creep, sites);
				if (site && !creep.pos.isEqualTo(site.pos)) {
					var result = creep.build(site);
					metrics.recordRoleResult('builder', 'build', result);
					if (result === OK) stats.recordBuild(creep, Math.min(creep.store[RESOURCE_ENERGY], BUILD_POWER * (creep.body.filter(function (p) { return p.type === WORK; }).length || 1)));
					if (result === ERR_NOT_IN_RANGE) {
						pathing.moveTo(creep, site, 'builder', { stroke: '#ffffff' });
						stats.recordMove(creep);
					}
				}
				return;
			}

			var buildRoom = findBuildRoomTarget(creep.room.name);
			if (buildRoom && buildRoom !== creep.room.name) {
				pathing.moveTo(creep, new RoomPosition(25, 25, buildRoom), 'builder', { stroke: '#ffffff' });
				return;
			}

			var damaged = creep.room.find(FIND_STRUCTURES, {
				filter: function (s) {
					if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) return s.hits < getBarrierFloor(creep.room);
					return s.hits < s.hitsMax;
				},
			});
			if (damaged.length > 0) {
				var target = creep.pos.findClosestByPath(damaged) || damaged[0];
				var result = creep.repair(target);
				metrics.recordRoleResult('builder', 'repair', result);
				if (result === OK) stats.recordRepair(creep, Math.min(creep.store[RESOURCE_ENERGY], REPAIR_POWER * (creep.body.filter(function (p) { return p.type === WORK; }).length || 1)));
				if (result === ERR_NOT_IN_RANGE) {
					pathing.moveTo(creep, target, 'builder', { stroke: '#ffffff' });
					stats.recordMove(creep);
				}
				return;
			}

			if (creep.room.controller) {
				var result = creep.upgradeController(creep.room.controller);
				metrics.recordRoleResult('builder', 'upgradeController', result);
				if (result === OK) stats.recordUpgrade(creep, 1);
				if (result === ERR_NOT_IN_RANGE) {
					pathing.moveTo(creep, creep.room.controller, 'builder', { stroke: '#ffffff' });
					stats.recordMove(creep);
				}
				return;
			}

			var returnTarget = findReturnTarget(creep);
			if (returnTarget) {
				var result = creep.transfer(returnTarget, RESOURCE_ENERGY);
				metrics.recordRoleResult('builder', 'transfer', result);
				if (result === OK) stats.recordTransfer(creep, creep.store[RESOURCE_ENERGY]);
				if (result === ERR_NOT_IN_RANGE) {
					pathing.moveTo(creep, returnTarget, 'builder', { stroke: '#ffffff' });
					stats.recordMove(creep);
				}
			}
			return;
		}

		var source = findEnergySource(creep);
		if (!source) return;

		if (source.resourceType === RESOURCE_ENERGY) {
			var result = creep.pickup(source);
			metrics.recordRoleResult('builder', 'pickup', result);
			if (result === OK) stats.recordHarvest(creep, source.amount);
			if (result === ERR_NOT_IN_RANGE) {
				pathing.moveTo(creep, source, 'builder', { stroke: '#ffaa00' });
				stats.recordMove(creep);
			}
			return;
		}

		if (source.structureType) {
			var result = creep.withdraw(source, RESOURCE_ENERGY);
			metrics.recordRoleResult('builder', 'withdraw', result);
			if (result === OK) stats.recordWithdraw(creep, Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), source.store[RESOURCE_ENERGY]));
			if (result === ERR_NOT_IN_RANGE) {
				pathing.moveTo(creep, source, 'builder', { stroke: '#ffaa00' });
				stats.recordMove(creep);
			}
			return;
		}

		var result = creep.harvest(source);
		metrics.recordRoleResult('builder', 'harvest', result);
		if (result === OK) stats.recordHarvest(creep, creep.store.getUsedCapacity(RESOURCE_ENERGY));
		if (result === ERR_NOT_IN_RANGE) {
			pathing.moveTo(creep, source, 'builder', { stroke: '#ffaa00' });
			stats.recordMove(creep);
		}
	},
};

module.exports = roleBuilder;
