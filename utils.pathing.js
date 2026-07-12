function getAnchorPos(room) {
	const spawn = room.find(FIND_MY_SPAWNS)[0];
	if (spawn) {
		return spawn.pos;
	}
	if (room.controller) {
		return room.controller.pos;
	}
	return new RoomPosition(25, 25, room.name);
}

function ensureRouteMemory() {
	if (!Memory.strategy) {
		Memory.strategy = {};
	}
	if (!Memory.strategy.routeCache) {
		Memory.strategy.routeCache = {};
	}
}

function getRouteKey(fromRoom, toRoom) {
	return fromRoom + '->' + toRoom;
}

function getCachedRoute(fromRoom, toRoom) {
	ensureRouteMemory();
	const key = getRouteKey(fromRoom, toRoom);
	const cached = Memory.strategy.routeCache[key];
	if (cached && cached.expires > Game.time) {
		return cached.route;
	}

	const route = Game.map.findRoute(fromRoom, toRoom);
	if (route === ERR_NO_PATH || route === ERR_INVALID_ARGS) {
		return null;
	}

	Memory.strategy.routeCache[key] = {
		route: route,
		expires: Game.time + 250,
	};
	return route;
}

function buildCostMatrix(room, profile) {
	const costs = new PathFinder.CostMatrix();
	const profileName = profile || 'default';
	const anchor = getAnchorPos(room);

	const structures = room.find(FIND_STRUCTURES);
	for (const structure of structures) {
		if (structure.structureType === STRUCTURE_ROAD) {
			costs.set(structure.pos.x, structure.pos.y, 1);
			continue;
		}

		if (structure.structureType === STRUCTURE_CONTAINER || structure.structureType === STRUCTURE_RAMPART) {
			continue;
		}

		costs.set(structure.pos.x, structure.pos.y, 255);
	}

	const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
	for (const site of constructionSites) {
		if (site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER || site.structureType === STRUCTURE_RAMPART) {
			continue;
		}
		costs.set(site.pos.x, site.pos.y, 255);
	}

	const creeps = room.find(FIND_CREEPS);
	for (const creep of creeps) {
		if (creep.my) {
			costs.set(creep.pos.x, creep.pos.y, 8);
			continue;
		}
		costs.set(creep.pos.x, creep.pos.y, 15);
	}

	if (profileName === 'hauler') {
		const dropped = room.find(FIND_DROPPED_RESOURCES);
		for (const resource of dropped) {
			costs.set(resource.pos.x, resource.pos.y, 3);
		}
	}

	if (profileName === 'builder') {
		for (let x = Math.max(1, anchor.x - 8); x <= Math.min(48, anchor.x + 8); x += 1) {
			for (let y = Math.max(1, anchor.y - 8); y <= Math.min(48, anchor.y + 8); y += 1) {
				const current = costs.get(x, y);
				if (current === 0) {
					costs.set(x, y, 4);
				}
			}
		}
	}

	if (profileName === 'defender') {
		const exits = room.find(FIND_EXIT);
		for (const exitPos of exits) {
			const current = costs.get(exitPos.x, exitPos.y);
			if (current !== 255) {
				costs.set(exitPos.x, exitPos.y, 12);
			}
		}
	}

	return costs;
}

function isCreepStuck(creep) {
	if (!creep.memory._lastPos) {
		return false;
	}
	if (creep.pos.x === creep.memory._lastPos.x && creep.pos.y === creep.memory._lastPos.y && creep.room.name === creep.memory._lastPos.roomName) {
		if (!creep.memory._stuckTicks) creep.memory._stuckTicks = 0;
		creep.memory._stuckTicks += 1;
	} else {
		creep.memory._stuckTicks = 0;
	}
	creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
	return creep.memory._stuckTicks > 1;
}

function moveTo(creep, target, profile, style) {
	if (!target) {
		return ERR_INVALID_TARGET;
	}

	var stuck = isCreepStuck(creep);
	var reuse = stuck ? 0 : 10;

	return creep.moveTo(target, {
		visualizePathStyle: style || { stroke: '#ffffff' },
		reusePath: reuse,
		maxOps: stuck ? 2000 : 1200,
		ignoreCreeps: false,
		costCallback: function (roomName, matrix) {
			if (roomName !== creep.room.name) {
				return matrix;
			}
			return buildCostMatrix(creep.room, profile);
		},
	});
}

function moveToRoom(creep, targetRoom, profile, style) {
	if (!targetRoom) {
		return ERR_INVALID_TARGET;
	}

	if (creep.room.name === targetRoom) {
		return moveTo(creep, new RoomPosition(25, 25, targetRoom), profile, style);
	}

	const route = getCachedRoute(creep.room.name, targetRoom);
	if (!route || route.length === 0) {
		return moveTo(creep, new RoomPosition(25, 25, targetRoom), profile, style);
	}

	const nextHop = route[0].room;
	return moveTo(creep, new RoomPosition(25, 25, nextHop), profile, style);
}

module.exports = {
	buildCostMatrix: buildCostMatrix,
	moveTo: moveTo,
	moveToRoom: moveToRoom,
};
