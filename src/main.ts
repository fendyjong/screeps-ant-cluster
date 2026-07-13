// src/main.ts

import { tick as queenTick } from './colony/Queen';
import { process as hatcheryProcess } from './hatchery/Hatchery';
import * as Harvester from './roles/Harvester';
import * as Hauler from './roles/Hauler';
import * as Builder from './roles/Builder';
import * as Upgrader from './roles/Upgrader';
import { ensureRoomMemory, ensureCreepMemory, ensureMemoryNs, cleanLegacyMemory, CURRENT_NS } from './lib/Memory';
import { getTerrainMatrix } from './lib/PathFinder';
import { shouldRecheck, demolishMisplaced, buildMissing } from './colony/SwapExecutor';
import { planLayout } from './colony/LayoutPlanner';
import { planSwap } from './colony/SwapPlanner';
import * as HUD from './lib/HUD';
import { trackIncome, getBudget, getHealth, trackBuild, getCpuBudgets } from './lib/Cashflow';
import { hostileWatcher, expansionWatcher } from './colony/Watchers';
import { drainPendingRoads } from './colony/RoadDrainer';
import { recheckLayout } from './colony/LayoutWatcher';

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

    const prevTotal = Memory.v1._prevTotalEnergy?.[roomName] ?? -1;
    const currentTotal = room.energyAvailable + (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0);
    if (prevTotal >= 0) {
      trackIncome(roomName, currentTotal, prevTotal);
    }
    if (!Memory.v1._prevTotalEnergy) Memory.v1._prevTotalEnergy = {};
    Memory.v1._prevTotalEnergy[roomName] = currentTotal;

    getTerrainMatrix(room.name);
    if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
      const health = getHealth(room);
      if (health !== 'red' || !room.memory.layout) {
        const layout = planLayout(room);
        const swapPlan = planSwap(room, layout);
        room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
      }
    }

    // Create construction sites from swap plan
    if (room.memory.layout && room.memory.layout.swap) {
      if (shouldRecheck(room)) {
        demolishMisplaced(room, room.memory.layout.swap);
      } else if (shouldRecheck(room, 1)) {
        buildMissing(room, room.memory.layout.swap);
      }
    }

    // Drain pending roads from traffic heatmap (up to 5 per tick)
    drainPendingRoads(room);
    recheckLayout(room);

    hostileWatcher(room);
    expansionWatcher(room);

    hatcheryProcess(room);

    runCreeps(room);

    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    let progressDelta = 0;
    for (const site of sites) {
      const prev = Memory.v1._prevProgress?.[site.id] || site.progress;
      progressDelta += Math.max(0, site.progress - prev);
      if (!Memory.v1._prevProgress) Memory.v1._prevProgress = {};
      Memory.v1._prevProgress[site.id] = site.progress;
    }
    if (progressDelta > 0) {
      trackBuild(roomName, progressDelta);
    }

    HUD.run(room);
  }
};