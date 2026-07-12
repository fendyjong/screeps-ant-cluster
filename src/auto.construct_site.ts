const CONSTRUCTION_INTERVAL = 25;
const MAX_NEW_SITES_PER_RUN = 10;
const SITE_SOFT_CAP = 90;

function hasBlockingStructure(room, x, y) {
	const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
	for (const structure of structures) {
		if (structure.structureType === STRUCTURE_ROAD || structure.structureType === STRUCTURE_CONTAINER) {
			continue;
		}
		return true;
	}

	const site = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
	return site.length > 0;
}

function tryCreate(room, x, y, structureType) {
	if (hasBlockingStructure(room, x, y)) {
		return ERR_INVALID_TARGET;
	}

	const terrain = room.getTerrain();
	if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
		return ERR_INVALID_TARGET;
	}

	return room.createConstructionSite(x, y, structureType);
}

function buildRoadPath(room, fromPos, toPos, quotaState) {
	if (quotaState.created >= quotaState.maxSites) {
		return;
	}

	const path = room.findPath(fromPos, toPos, { ignoreCreeps: true, range: 1 });
	for (const step of path) {
		if (quotaState.created >= quotaState.maxSites) {
			break;
		}

		const result = tryCreate(room, step.x, step.y, STRUCTURE_ROAD);
		if (result === OK) {
			quotaState.created += 1;
		}
	}
}

function planRoads(room, spawn, quotaState) {
	const towers = room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_TOWER;
		},
	});
	for (const tower of towers) {
		buildRoadPath(room, spawn.pos, tower.pos, quotaState);
		if (quotaState.created >= quotaState.maxSites) {
			return;
		}
	}

	const sources = room.find(FIND_SOURCES);
	for (const source of sources) {
		buildRoadPath(room, spawn.pos, source.pos, quotaState);
		if (quotaState.created >= quotaState.maxSites) {
			return;
		}
	}

	if (room.controller) {
		buildRoadPath(room, spawn.pos, room.controller.pos, quotaState);
	}
}

function planControllerContainer(room, quotaState) {
	if (!room.controller || room.controller.level < 2 || quotaState.created >= quotaState.maxSites) {
		return;
	}
	const existing = room.controller.pos.findInRange(FIND_STRUCTURES, 2, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_CONTAINER;
		},
	});
	if (existing.length > 0) {
		return;
	}
	const pending = room.controller.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 2, {
		filter: function (site) {
			return site.structureType === STRUCTURE_CONTAINER;
		},
	});
	if (pending.length > 0) {
		return;
	}
	for (let dx = -1; dx <= 1; dx += 1) {
		for (let dy = -1; dy <= 1; dy += 1) {
			if (dx === 0 && dy === 0) {
				continue;
			}
			const x = room.controller.pos.x + dx;
			const y = room.controller.pos.y + dy;
			if (tryCreate(room, x, y, STRUCTURE_CONTAINER) === OK) {
				quotaState.created += 1;
				return;
			}
		}
	}
}

function planStorageAdjacency(room, quotaState) {
	if (!room.storage || quotaState.created >= quotaState.maxSites) {
		return;
	}
	const offsets = [
		{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
	];
	for (const offset of offsets) {
		if (quotaState.created >= quotaState.maxSites) {
			return;
		}
		const x = room.storage.pos.x + offset.x;
		const y = room.storage.pos.y + offset.y;
		if (tryCreate(room, x, y, STRUCTURE_ROAD) === OK) {
			quotaState.created += 1;
		}
	}
}

function planSourceContainers(room, quotaState) {
	const sources = room.find(FIND_SOURCES);
	for (const source of sources) {
		if (quotaState.created >= quotaState.maxSites) {
			return;
		}

		const nearbyContainers = source.pos.findInRange(FIND_STRUCTURES, 1, {
			filter: function (structure) {
				return structure.structureType === STRUCTURE_CONTAINER;
			},
		});
		if (nearbyContainers.length > 0) {
			continue;
		}

		const nearbySites = source.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {
			filter: function (site) {
				return site.structureType === STRUCTURE_CONTAINER;
			},
		});
		if (nearbySites.length > 0) {
			continue;
		}

		const around = source.pos.getAdjacentPositions ? source.pos.getAdjacentPositions() : null;
		if (around && around.length) {
			for (const pos of around) {
				if (quotaState.created >= quotaState.maxSites) {
					return;
				}
				if (tryCreate(room, pos.x, pos.y, STRUCTURE_CONTAINER) === OK) {
					quotaState.created += 1;
					break;
				}
			}
			continue;
		}

		for (let dx = -1; dx <= 1; dx += 1) {
			for (let dy = -1; dy <= 1; dy += 1) {
				if (dx === 0 && dy === 0) {
					continue;
				}

				const x = source.pos.x + dx;
				const y = source.pos.y + dy;
				if (x < 1 || x > 48 || y < 1 || y > 48) {
					continue;
				}

				if (tryCreate(room, x, y, STRUCTURE_CONTAINER) === OK) {
					quotaState.created += 1;
					dx = 2;
					break;
				}
			}
		}
	}
}

function planExtensions(room, spawn, quotaState) {
	if (!room.controller || room.controller.my !== true) {
		return;
	}

	const limit = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
	if (limit === 0) {
		return;
	}

	const existing = room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_EXTENSION;
		},
	}).length;

	const pending = room.find(FIND_MY_CONSTRUCTION_SITES, {
		filter: function (site) {
			return site.structureType === STRUCTURE_EXTENSION;
		},
	}).length;

	if (existing + pending >= limit) {
		return;
	}

	const layout = [
		{ x: 2, y: 1 }, { x: 2, y: -1 }, { x: -2, y: 1 }, { x: -2, y: -1 },
		{ x: 1, y: 2 }, { x: -1, y: 2 }, { x: 1, y: -2 }, { x: -1, y: -2 },
		{ x: 3, y: 0 }, { x: -3, y: 0 }, { x: 0, y: 3 }, { x: 0, y: -3 },
		{ x: 3, y: 1 }, { x: 3, y: -1 }, { x: -3, y: 1 }, { x: -3, y: -1 },
		{ x: 1, y: 3 }, { x: -1, y: 3 }, { x: 1, y: -3 }, { x: -1, y: -3 },
		{ x: 3, y: 2 }, { x: 3, y: -2 }, { x: -3, y: 2 }, { x: -3, y: -2 },
		{ x: 2, y: 3 }, { x: -2, y: 3 }, { x: 2, y: -3 }, { x: -2, y: -3 },
		{ x: 4, y: 0 }, { x: -4, y: 0 }, { x: 0, y: 4 }, { x: 0, y: -4 },
		{ x: 4, y: 1 }, { x: 4, y: -1 }, { x: -4, y: 1 }, { x: -4, y: -1 },
		{ x: 1, y: 4 }, { x: -1, y: 4 }, { x: 1, y: -4 }, { x: -1, y: -4 },
		{ x: 4, y: 2 }, { x: 4, y: -2 }, { x: -4, y: 2 }, { x: -4, y: -2 },
		{ x: 2, y: 4 }, { x: -2, y: 4 }, { x: 2, y: -4 }, { x: -2, y: -4 },
		{ x: 5, y: 0 }, { x: -5, y: 0 }, { x: 0, y: 5 }, { x: 0, y: -5 },
		{ x: 5, y: 1 }, { x: 5, y: -1 }, { x: -5, y: 1 }, { x: -5, y: -1 },
		{ x: 1, y: 5 }, { x: -1, y: 5 }, { x: 1, y: -5 }, { x: -1, y: -5 },
	];
	for (const offset of layout) {
		if (quotaState.created >= quotaState.maxSites) {
			return;
		}
		const x = spawn.pos.x + offset.x;
		const y = spawn.pos.y + offset.y;
		if (x < 2 || x > 47 || y < 2 || y > 47) {
			continue;
		}
		const result = tryCreate(room, x, y, STRUCTURE_EXTENSION);
		if (result === OK) {
			quotaState.created += 1;
			if (existing + pending + quotaState.created >= limit) {
				return;
			}
		}
	}
}

function planTower(room, spawn, quotaState) {
	if (!room.controller || room.controller.level < 3) {
		return;
	}

	const limit = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
	if (limit === 0) {
		return;
	}

	const existing = room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_TOWER;
		},
	}).length;

	const pending = room.find(FIND_MY_CONSTRUCTION_SITES, {
		filter: function (site) {
			return site.structureType === STRUCTURE_TOWER;
		},
	}).length;

	if (existing + pending >= limit || quotaState.created >= quotaState.maxSites) {
		return;
	}

	const offsets = [
		{ x: 2, y: 0 },
		{ x: -2, y: 0 },
		{ x: 0, y: 2 },
		{ x: 0, y: -2 },
	];

	for (const offset of offsets) {
		const result = tryCreate(room, spawn.pos.x + offset.x, spawn.pos.y + offset.y, STRUCTURE_TOWER);
		if (result === OK) {
			quotaState.created += 1;
			return;
		}
	}
}

function planCoreRamparts(room, spawn, quotaState) {
	if (!room.controller || room.controller.level < 2) {
		return;
	}

	if (quotaState.created >= quotaState.maxSites) {
		return;
	}

	const coreTargets = [spawn];
	const towers = room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_TOWER;
		},
	});
	for (const tower of towers) {
		coreTargets.push(tower);
	}

	for (const target of coreTargets) {
		if (quotaState.created >= quotaState.maxSites) {
			return;
		}

		const existingRampart = room.lookForAt(LOOK_STRUCTURES, target.pos.x, target.pos.y).some(function (structure) {
			return structure.structureType === STRUCTURE_RAMPART;
		});
		if (existingRampart) {
			continue;
		}

		const siteAtPos = room.lookForAt(LOOK_CONSTRUCTION_SITES, target.pos.x, target.pos.y).some(function (site) {
			return site.structureType === STRUCTURE_RAMPART;
		});
		if (siteAtPos) {
			continue;
		}

		const result = room.createConstructionSite(target.pos.x, target.pos.y, STRUCTURE_RAMPART);
		if (result === OK) {
			quotaState.created += 1;
		}
	}
}

function planDefenseAnchors(room, spawn, quotaState) {
	if (!room.controller || room.controller.level < 3 || quotaState.created >= quotaState.maxSites) {
		return;
	}

	const terrain = room.getTerrain();
	const anchorStructures = [spawn];
	if (room.controller) {
		anchorStructures.push(room.controller);
	}
	const towers = room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_TOWER;
		},
	});
	for (const tower of towers) {
		anchorStructures.push(tower);
	}

	for (const anchor of anchorStructures) {
		if (quotaState.created >= quotaState.maxSites) {
			return;
		}

		for (let dx = -1; dx <= 1; dx += 1) {
			for (let dy = -1; dy <= 1; dy += 1) {
				if (dx === 0 && dy === 0) {
					continue;
				}

				const x = anchor.pos.x + dx;
				const y = anchor.pos.y + dy;
				if (x <= 1 || x >= 48 || y <= 1 || y >= 48) {
					continue;
				}
				if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
					continue;
				}

				const structuresAt = room.lookForAt(LOOK_STRUCTURES, x, y);
				const blocked = structuresAt.some(function (structure) {
					return structure.structureType !== STRUCTURE_ROAD && structure.structureType !== STRUCTURE_RAMPART;
				});
				if (blocked) {
					continue;
				}

				const hasRampart = structuresAt.some(function (structure) {
					return structure.structureType === STRUCTURE_RAMPART;
				});
				if (hasRampart) {
					continue;
				}

				const sitesAt = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
				const hasRampartSite = sitesAt.some(function (site) {
					return site.structureType === STRUCTURE_RAMPART;
				});
				if (hasRampartSite) {
					continue;
				}

				const result = room.createConstructionSite(x, y, STRUCTURE_RAMPART);
				if (result === OK) {
					quotaState.created += 1;
					if (quotaState.created >= quotaState.maxSites) {
						return;
					}
				}
			}
		}
	}
}

function planLink(room, spawn, quotaState) {
	if (!room.controller || room.controller.level < 5 || quotaState.created >= quotaState.maxSites) {
		return;
	}
	const limit = CONTROLLER_STRUCTURES[STRUCTURE_LINK][room.controller.level] || 0;
	if (limit === 0) return;
	const built = room.find(FIND_MY_STRUCTURES, { filter: function (s) { return s.structureType === STRUCTURE_LINK; } }).length;
	const sites = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: function (s) { return s.structureType === STRUCTURE_LINK; } }).length;
	if (built + sites >= limit) return;

	const spots = [
		{ x: 3, y: 0 }, { x: -3, y: 0 }, { x: 0, y: 3 }, { x: 0, y: -3 },
		{ x: 3, y: 2 }, { x: -3, y: 2 }, { x: 2, y: 3 }, { x: -2, y: 3 },
	];
	for (const offset of spots) {
		const x = spawn.pos.x + offset.x;
		const y = spawn.pos.y + offset.y;
		if (x < 1 || x > 48 || y < 1 || y > 48) continue;
		if (tryCreate(room, x, y, STRUCTURE_LINK) === OK) {
			quotaState.created += 1;
			return;
		}
	}

	for (let range = 4; range <= 8; range += 1) {
		for (let dx = -range; dx <= range; dx += 1) {
			for (let dy = -range; dy <= range; dy += 1) {
				if (Math.abs(dx) < range && Math.abs(dy) < range) continue;
				const x = spawn.pos.x + dx;
				const y = spawn.pos.y + dy;
				if (x < 1 || x > 48 || y < 1 || y > 48) continue;
				if (tryCreate(room, x, y, STRUCTURE_LINK) === OK) {
					quotaState.created += 1;
					return;
				}
			}
		}
	}
}

function planLab(room, spawn, quotaState) {
	if (!room.controller || room.controller.level < 6 || quotaState.created >= quotaState.maxSites) {
		return;
	}
	const limit = CONTROLLER_STRUCTURES[STRUCTURE_LAB][room.controller.level] || 0;
	if (limit === 0) return;
	const built = room.find(FIND_MY_STRUCTURES, { filter: function (s) { return s.structureType === STRUCTURE_LAB; } }).length;
	const sites = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: function (s) { return s.structureType === STRUCTURE_LAB; } }).length;
	if (built + sites >= limit) return;

	for (let range = 4; range <= 10; range += 1) {
		for (let dx = -range; dx <= range; dx += 1) {
			for (let dy = -range; dy <= range; dy += 1) {
				if (Math.abs(dx) < range && Math.abs(dy) < range) continue;
				const x = spawn.pos.x + dx;
				const y = spawn.pos.y + dy;
				if (x < 1 || x > 48 || y < 1 || y > 48) continue;
				if (tryCreate(room, x, y, STRUCTURE_LAB) === OK) {
					quotaState.created += 1;
					return;
				}
			}
		}
	}
}

function planExtractor(room, quotaState) {
	if (quotaState.created >= quotaState.maxSites) return;
	const mineral = room.find(FIND_MINERALS)[0];
	if (!mineral) return;
	const existing = mineral.pos.findInRange(FIND_STRUCTURES, 1, {
		filter: function (s) { return s.structureType === STRUCTURE_EXTRACTOR; },
	});
	if (existing.length > 0) return;
	const sites = mineral.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {
		filter: function (s) { return s.structureType === STRUCTURE_EXTRACTOR; },
	});
	if (sites.length > 0) return;
	const result = tryCreate(room, mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR);
	if (result === OK) quotaState.created += 1;
}

function planGeneric(room, type, quotaState) {
	if (quotaState.created >= quotaState.maxSites) return;
	const limit = CONTROLLER_STRUCTURES[type] ? (CONTROLLER_STRUCTURES[type][room.controller.level] || 0) : 1;
	if (limit === 0) return;
	const built = room.find(FIND_MY_STRUCTURES, { filter: function (s) { return s.structureType === type; } }).length;
	const sites = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: function (s) { return s.structureType === type; } }).length;
	if (built + sites >= limit) return;

	const spawn = room.find(FIND_MY_SPAWNS)[0];
	if (!spawn) return;

	for (let range = 3; range <= 8; range += 1) {
		for (let dx = -range; dx <= range; dx += 1) {
			for (let dy = -range; dy <= range; dy += 1) {
				if (Math.abs(dx) < range && Math.abs(dy) < range) continue;
				const x = spawn.pos.x + dx;
				const y = spawn.pos.y + dy;
				if (x < 1 || x > 48 || y < 1 || y > 48) continue;
				if (tryCreate(room, x, y, type) === OK) {
					quotaState.created += 1;
					return;
				}
			}
		}
	}
}

const autoConstructSite = {
	run: function (room) {
		if (!room || !room.controller || room.controller.my !== true) return;
		if (Game.time % CONSTRUCTION_INTERVAL !== 0) return;

		var totalSites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
		if (totalSites >= SITE_SOFT_CAP) return;

		var spawn = room.find(FIND_MY_SPAWNS)[0];
		if (!spawn) return;

		var plan = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].colonyPlan;
		if (plan && plan.construction && plan.construction.enabled === false) return;
		var activeType = plan && plan.construction && plan.construction.activeType;
		var quotaMax = plan && plan.construction && plan.construction.maxNewSitesPerRun ? plan.construction.maxNewSitesPerRun : MAX_NEW_SITES_PER_RUN;
		var quotaState = { created: 0, maxSites: quotaMax };

		if (activeType) {
			if (activeType === STRUCTURE_EXTENSION) planExtensions(room, spawn, quotaState);
			else if (activeType === STRUCTURE_TOWER) planTower(room, spawn, quotaState);
			else if (activeType === STRUCTURE_LINK) planLink(room, spawn, quotaState);
			else if (activeType === STRUCTURE_LAB) planLab(room, spawn, quotaState);
			else if (activeType === STRUCTURE_EXTRACTOR) planExtractor(room, quotaState);
			else if (activeType === STRUCTURE_FACTORY) planGeneric(room, STRUCTURE_FACTORY, quotaState);
			else if (activeType === STRUCTURE_OBSERVER) planGeneric(room, STRUCTURE_OBSERVER, quotaState);
			else if (activeType === STRUCTURE_POWER_SPAWN) planGeneric(room, STRUCTURE_POWER_SPAWN, quotaState);
			else if (activeType === STRUCTURE_STORAGE) planGeneric(room, STRUCTURE_STORAGE, quotaState);
		}

		planControllerContainer(room, quotaState);
		planSourceContainers(room, quotaState);
		planRoads(room, spawn, quotaState);
		planStorageAdjacency(room, quotaState);
		planCoreRamparts(room, spawn, quotaState);
		planDefenseAnchors(room, spawn, quotaState);
	},
};

export default autoConstructSite;
