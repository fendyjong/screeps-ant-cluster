import { isSafeToDestroy, REBUILD_COSTS, sortByPriority } from './BuildCosts';
import { getBudget } from '../lib/Cashflow';
import { BunkerLayout } from './LayoutPlanner';

export interface SwapPlan {
  destroy: string[];
  build: { pos: RoomPosition; structureType: StructureConstant }[];
  state: 'idle' | 'destroying' | 'building';
}

function isWalkablePos(pos: RoomPosition): boolean {
  return pos !== undefined && pos.x >= 0 && pos.x < 50 && pos.y >= 0 && pos.y < 50;
}

export function planSwap(room: Room, layout: BunkerLayout): SwapPlan {
  const destroy: string[] = [];
  const build: { pos: RoomPosition; structureType: StructureConstant }[] = [];

  const existingSpawn = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_SPAWN
  })[0];

  if (existingSpawn && !existingSpawn.pos.isEqualTo(layout.spawn)) {
    if (isSafeToDestroy(room, existingSpawn)) {
      destroy.push(existingSpawn.id);
      build.push({ pos: layout.spawn, structureType: STRUCTURE_SPAWN });
    }
  }

  const existingStorage = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_STORAGE
  })[0];

  if (existingStorage && !existingStorage.pos.isEqualTo(layout.storage)) {
    if (isSafeToDestroy(room, existingStorage)) {
      destroy.push(existingStorage.id);
      build.push({ pos: layout.storage, structureType: STRUCTURE_STORAGE });
    }
  }

  const existingTowers = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TOWER
  });

  for (const tower of existingTowers) {
    const inLayout = layout.towers.some(t => t.isEqualTo(tower.pos));
    if (!inLayout && isSafeToDestroy(room, tower)) {
      destroy.push(tower.id);
    }
  }

	for (const towerPos of layout.towers) {
    const exists = existingTowers.some(t => t.pos.isEqualTo(towerPos));
    if (!exists) {
      build.push({ pos: towerPos, structureType: STRUCTURE_TOWER });
    }
  }

  const existingTerminal = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TERMINAL
  })[0];
  if (existingTerminal && !existingTerminal.pos.isEqualTo(layout.terminal)) {
    if (isSafeToDestroy(room, existingTerminal)) {
      destroy.push(existingTerminal.id);
      build.push({ pos: layout.terminal, structureType: STRUCTURE_TERMINAL });
    }
  }

  const existingFactory = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_FACTORY
  })[0];
  if (existingFactory && !existingFactory.pos.isEqualTo(layout.factory)) {
    if (isSafeToDestroy(room, existingFactory)) {
      destroy.push(existingFactory.id);
      build.push({ pos: layout.factory, structureType: STRUCTURE_FACTORY });
    }
  }

  const existingPowerSpawn = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_POWER_SPAWN
  })[0];
  if (existingPowerSpawn && !existingPowerSpawn.pos.isEqualTo(layout.powerSpawn)) {
    if (isSafeToDestroy(room, existingPowerSpawn)) {
      destroy.push(existingPowerSpawn.id);
      build.push({ pos: layout.powerSpawn, structureType: STRUCTURE_POWER_SPAWN });
    }
  }

  const existingNuker = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_NUKER
  })[0];
  if (existingNuker && !existingNuker.pos.isEqualTo(layout.nuker)) {
    if (isSafeToDestroy(room, existingNuker)) {
      destroy.push(existingNuker.id);
      build.push({ pos: layout.nuker, structureType: STRUCTURE_NUKER });
    }
  }

  const existingObserver = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_OBSERVER
  })[0];
  if (existingObserver && !existingObserver.pos.isEqualTo(layout.observer)) {
    if (isSafeToDestroy(room, existingObserver)) {
      destroy.push(existingObserver.id);
      build.push({ pos: layout.observer, structureType: STRUCTURE_OBSERVER });
    }
  }

  const roomName = room.name;

  const existingLabs = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_LAB
  });
  const labPosSet = new Set(layout.labs.map(p => p.x + ',' + p.y + ',' + roomName));
  for (const lab of existingLabs) {
    if (!labPosSet.has(lab.pos.x + ',' + lab.pos.y + ',' + roomName)) {
      if (isSafeToDestroy(room, lab)) {
        destroy.push(lab.id);
      }
    }
  }
  for (const labPos of layout.labs) {
    const exists = existingLabs.some(l => l.pos.isEqualTo(labPos));
    if (!exists) {
      build.push({ pos: labPos, structureType: STRUCTURE_LAB });
    }
  }

  const existingLinks = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_LINK
  });
  const linkPositions = [layout.linkSpawn, layout.linkController, layout.linkLab].filter(isWalkablePos);
  const linkPosSet = new Set(linkPositions.map(p => p.x + ',' + p.y + ',' + roomName));
  for (const link of existingLinks) {
    if (!linkPosSet.has(link.pos.x + ',' + link.pos.y + ',' + roomName)) {
      if (isSafeToDestroy(room, link)) {
        destroy.push(link.id);
      }
    }
  }
  for (const linkPos of linkPositions) {
    const exists = existingLinks.some(l => l.pos.isEqualTo(linkPos));
    if (!exists) {
      build.push({ pos: linkPos, structureType: STRUCTURE_LINK });
    }
  }

	const existingExtensions = room.find(FIND_MY_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_EXTENSION
	});
	const extPosSet = new Set(layout.extensions.map(p => p.x + ',' + p.y + ',' + roomName));
	for (const ext of existingExtensions) {
		if (!extPosSet.has(ext.pos.x + ',' + ext.pos.y + ',' + roomName)) {
			if (isSafeToDestroy(room, ext)) {
				destroy.push(ext.id);
			}
		}
	}
	for (const extPos of layout.extensions) {
		const exists = existingExtensions.some(e => e.pos.isEqualTo(extPos));
		if (!exists) {
			build.push({ pos: extPos, structureType: STRUCTURE_EXTENSION });
		}
	}

	const existingRoads = room.find(FIND_MY_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_ROAD
	});
	const roadPosSet = new Set(layout.roads.map(p => p.x + ',' + p.y + ',' + roomName));
	for (const road of existingRoads) {
		if (!roadPosSet.has(road.pos.x + ',' + road.pos.y + ',' + roomName)) {
			if (isSafeToDestroy(room, road)) {
				destroy.push(road.id);
			}
		}
	}
	for (const roadPos of layout.roads) {
		const exists = existingRoads.some(r => r.pos.isEqualTo(roadPos));
		if (!exists) {
			build.push({ pos: roadPos, structureType: STRUCTURE_ROAD });
		}
	}

	const existingRamparts = room.find(FIND_MY_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_RAMPART
	});
	const rampartPosSet = new Set(layout.ramparts.map(p => p.x + ',' + p.y + ',' + roomName));
	for (const r of existingRamparts) {
		if (!rampartPosSet.has(r.pos.x + ',' + r.pos.y + ',' + roomName)) {
			if (isSafeToDestroy(room, r)) {
				destroy.push(r.id);
			}
		}
	}
	for (const rPos of layout.ramparts) {
		const exists = existingRamparts.some(r => r.pos.isEqualTo(rPos));
		if (!exists) {
			build.push({ pos: rPos, structureType: STRUCTURE_RAMPART });
		}
	}

	const existingWalls = room.find(FIND_MY_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_WALL
	});
	const wallPosSet = new Set(layout.walls.map(p => p.x + ',' + p.y + ',' + roomName));
	for (const w of existingWalls) {
		if (!wallPosSet.has(w.pos.x + ',' + w.pos.y + ',' + roomName)) {
			if (isSafeToDestroy(room, w)) {
				destroy.push(w.id);
			}
		}
	}
	for (const wPos of layout.walls) {
		const exists = existingWalls.some(w => w.pos.isEqualTo(wPos));
		if (!exists) {
			build.push({ pos: wPos, structureType: STRUCTURE_WALL });
		}
	}

  const sortedBuild = sortByPriority(build);

  const { buildBudget } = getBudget(room);
  let totalCost = 0;
  const affordable = sortedBuild.filter(entry => {
    const cost = REBUILD_COSTS[entry.structureType] || 0;
    if (totalCost + cost <= buildBudget) {
      totalCost += cost;
      return true;
    }
    return false;
  });

  return {
    destroy,
    build: affordable,
    state: 'idle',
  };
}