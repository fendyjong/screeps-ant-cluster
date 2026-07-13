// src/main.ts

import { tick as queenTick } from './hatchery/Queen';
import { process as hatcheryProcess } from './hatchery/Hatchery';
import * as Harvester from './roles/Harvester';
import * as Hauler from './roles/Hauler';
import * as Builder from './roles/Builder';
import * as Upgrader from './roles/Upgrader';
import { ensureRoomMemory, ensureCreepMemory, ensureMemoryNs, cleanLegacyMemory, CURRENT_NS } from './lib/Memory';
import { getTerrainMatrix } from './lib/PathFinder';
import { planLayout, planSwap } from './colony/Architect';
import * as HUD from './lib/HUD';
import { trackIncome, getBudget, getHealth, trackBuild, getCpuBudgets } from './lib/Cashflow';

const ALWAYS_RUN_ROLES = new Set(['harvester', 'hauler']);
const PRODUCTION_ROLES = new Set(['builder', 'upgrader']);

function runCreep(creep: Creep, budgetHard: number): void {
	const role = creep.memory.role;

	if (ALWAYS_RUN_ROLES.has(role)) {
		// Tier 1: always run
	} else if (PRODUCTION_ROLES.has(role)) {
		if (Game.cpu.getUsed() >= budgetHard) return;
	} else {
		if (Game.cpu.getUsed() >= budgetHard) return;
	}

	switch (role) {
		case 'harvester': Harvester.run(creep); break;
		case 'hauler':    Hauler.run(creep);    break;
		case 'builder':   Builder.run(creep);   break;
		case 'upgrader':  Upgrader.run(creep);  break;
	}
}

function runCreeps(room: Room): void {
	const { hard: budgetHard } = getCpuBudgets();

	for (const name in Game.creeps) {
		const creep = Game.creeps[name];
		if (creep.memory.roomName !== room.name) continue;

		ensureCreepMemory(creep);
		runCreep(creep, budgetHard);
	}
}

function hostileWatcher(room: Room): void {
	const hostiles = room.find(FIND_HOSTILE_CREEPS);
	if (hostiles.length === 0) return;

	const events = Memory.v1.events;
	if (!events) return;
	if (events.hostile?.[room.name]) return;

	if (!events.hostile) events.hostile = {};
	events.hostile[room.name] = {
		tick: Game.time,
		room: room.name,
		threat: hostiles.length > 3 ? 'swarm' : 'scout',
	};
}

function expansionWatcher(room: Room): void {
	const rcl = room.controller?.level || 1;
	if (rcl < 4) return;

	const storage = room.storage;
	if (!storage) return;
	if ((storage.store[RESOURCE_ENERGY] || 0) < 500000) return;

	const events = Memory.v1.events;
	if (!events) return;
	if (events.expansion?.[room.name]) return;

	const exits = Game.map.describeExits(room.name);
	for (const exitKey in exits) {
		const exitRoom = exits[exitKey as unknown as ExitKey];
		if (!Game.rooms[exitRoom] || !Game.rooms[exitRoom].controller?.my) {
			if (!events.expansion) events.expansion = {};
			events.expansion[room.name] = {
				sourceRoom: room.name,
				targetRoom: exitRoom,
				tick: Game.time,
			};
			return;
		}
	}
}

const STRUCTURE_COSTS: Record<string, number> = {
  [STRUCTURE_SPAWN]: 15000,
  [STRUCTURE_STORAGE]: 100000,
  [STRUCTURE_TOWER]: 5000,
  [STRUCTURE_LINK]: 5000,
  [STRUCTURE_TERMINAL]: 100000,
  [STRUCTURE_LAB]: 50000,
  [STRUCTURE_FACTORY]: 100000,
  [STRUCTURE_OBSERVER]: 8000,
  [STRUCTURE_NUKER]: 100000,
  [STRUCTURE_POWER_SPAWN]: 200000,
  [STRUCTURE_EXTRACTOR]: 5000,
  [STRUCTURE_ROAD]: 300,
  [STRUCTURE_WALL]: 10000,
  [STRUCTURE_RAMPART]: 10000,
  [STRUCTURE_CONTAINER]: 5000,
  [STRUCTURE_EXTENSION]: 3000,
};

function createConstructionSites(room: Room): void {
  const { buildBudget } = getBudget(room);
  if (buildBudget <= 0) return;

  const layout = room.memory.layout;
  if (!layout || !layout.swap || layout.swap.build.length === 0) return;

  if (Game.time % 100 !== 0) return;

  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const sitesPerRun = 5;
  let sitesCreated = 0;

  for (const entry of layout.swap.build) {
    const existingSite = sites.find(s => 
      s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType
    );
    if (existingSite) continue;

    const existingStructure = room.lookForAt(LOOK_STRUCTURES, entry.pos.x, entry.pos.y)
      .find(s => s.structureType === entry.structureType);
    if (existingStructure) continue;

    const result = room.createConstructionSite(entry.pos, entry.structureType);
    if (result === OK) {
      sitesCreated++;
      if (sitesCreated >= sitesPerRun) break;
    }
  }
}

const MAX_ROADS_PER_TICK = 5;

function drainPendingRoads(room: Room): void {
  const ns = Memory[CURRENT_NS];
  if (!ns.pathing || !ns.pathing.pendingRoads) return;

  const pending = ns.pathing.pendingRoads;
  let placed = 0;

  for (let i = pending.length - 1; i >= 0 && placed < MAX_ROADS_PER_TICK; i--) {
    const entry = pending[i];
    if (entry.roomName !== room.name) continue;

    const result = room.createConstructionSite(entry.x, entry.y, STRUCTURE_ROAD);
    if (result === OK || result === ERR_INVALID_TARGET) {
      pending.splice(i, 1);
      if (result === OK) placed++;
    }
  }
}

function recheckLayout(room: Room): void {
  if (Game.time % 200 !== 0) return;

  const layout = room.memory.layout;
  if (!layout || !layout.bunker) return;

  let needsReplan = false;

  for (const towerPos of layout.bunker.towers) {
    const tower = room.lookForAt(LOOK_STRUCTURES, towerPos.x, towerPos.y)
      .find(s => s.structureType === STRUCTURE_TOWER);
    if (!tower) {
      needsReplan = true;
      break;
    }
  }

  const existingSpawns = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_SPAWN
  });

  if (existingSpawns.length > 0) {
    const spawn = existingSpawns[0];
    if (!spawn.pos.isEqualTo(layout.bunker.spawn)) {
      needsReplan = true;
    }
  }

  if (needsReplan) {
    const newLayout = planLayout(room);
    const newSwapPlan = planSwap(room, newLayout);
    room.memory.layout = { bunker: newLayout, swap: newSwapPlan, lastUpdated: Game.time };
  }
}

export const loop = (): void => {
  if (Memory.v1 && !Memory[CURRENT_NS]) {
    Memory[CURRENT_NS] = Memory.v1;
    delete Memory.v1;
  }

  ensureMemoryNs();

  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) {
      delete Memory.creeps[name];
    }
  }

  if (Game.time % 100 === 0) {
    cleanLegacyMemory();
  }

  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room.controller || !room.controller.my) continue;

    ensureRoomMemory(room);

    queenTick(room);

    const prevTotal = (Memory.v1 as any)._prevTotalEnergy?.[roomName] ?? -1;
    const currentTotal = room.energyAvailable + (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0);
    if (prevTotal >= 0) {
      trackIncome(roomName, currentTotal, prevTotal);
    }
    if (!(Memory.v1 as any)._prevTotalEnergy) (Memory.v1 as any)._prevTotalEnergy = {};
    (Memory.v1 as any)._prevTotalEnergy[roomName] = currentTotal;

    getTerrainMatrix(room.name);
    if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
      const health = getHealth(room);
      if (health !== 'red' || !room.memory.layout) {
        const layout = planLayout(room);
        const swapPlan = planSwap(room, layout);
        room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
      }
    }

    createConstructionSites(room);
    drainPendingRoads(room);
    recheckLayout(room);

    hostileWatcher(room);
    expansionWatcher(room);

    hatcheryProcess(room);

    runCreeps(room);

    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    let progressDelta = 0;
    for (const site of sites) {
      const prev = (Memory.v1 as any)._prevProgress?.[site.id] || site.progress;
      progressDelta += Math.max(0, site.progress - prev);
      if (!(Memory.v1 as any)._prevProgress) (Memory.v1 as any)._prevProgress = {};
      (Memory.v1 as any)._prevProgress[site.id] = site.progress;
    }
    if (progressDelta > 0) {
      trackBuild(roomName, progressDelta);
    }

    HUD.run(room);
  }
};