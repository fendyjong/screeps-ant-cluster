import powerOperator from "./power.operator";

function ensureMemory() {
	if (!Memory.strategy) {
		Memory.strategy = {};
	}
	if (!Memory.strategy.power) {
		Memory.strategy.power = {};
	}
}

function classifyPowerBanks() {
	ensureMemory();
	const banks = [];
	for (const roomName in Game.rooms) {
		const room = Game.rooms[roomName];
		const bank = room.find(FIND_STRUCTURES, {
			filter: function (structure) {
				return structure.structureType === STRUCTURE_POWER_BANK;
			},
		})[0];
		if (!bank) {
			continue;
		}
		banks.push({
			roomName: room.name,
			power: bank.power,
			hits: bank.hits,
			ticksToDecay: bank.ticksToDecay,
			worthIt: bank.power >= 2000 && bank.ticksToDecay > 2500,
		});
	}
	Memory.strategy.power.banks = banks;
}

function processPower(room) {
	const powerSpawn = room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_POWER_SPAWN;
		},
	})[0];
	if (!powerSpawn) {
		return;
	}

	if ((powerSpawn.store[RESOURCE_POWER] || 0) > 0 && (powerSpawn.store[RESOURCE_ENERGY] || 0) >= 50) {
		powerSpawn.processPower();
	}
	Memory.strategy.power.processReady = true;
}

function runPowerCreeps(room) {
	for (const name in Game.powerCreeps) {
		const powerCreep = Game.powerCreeps[name];
		if (!powerCreep.ticksToLive) {
			const powerSpawn = room.find(FIND_MY_STRUCTURES, {
				filter: function (structure) {
					return structure.structureType === STRUCTURE_POWER_SPAWN;
				},
			})[0];
			if (powerSpawn && !powerCreep.spawnCooldownTime) {
				powerCreep.spawn(powerSpawn);
			}
			continue;
		}

		if (powerCreep.room && powerCreep.room.name !== room.name) {
			continue;
		}

		const powerSpawn = room.find(FIND_MY_STRUCTURES, {
			filter: function (structure) {
				return structure.structureType === STRUCTURE_POWER_SPAWN;
			},
		})[0];
		if (powerSpawn && powerCreep.ticksToLive < 1000) {
			if (powerCreep.pos.getRangeTo(powerSpawn) > 1) {
				powerCreep.moveTo(powerSpawn);
			} else {
				powerCreep.renew(powerSpawn);
			}
			continue;
		}

		if (powerCreep.powers && powerCreep.powers[PWR_GENERATE_OPS] && powerCreep.powers[PWR_GENERATE_OPS].cooldown === 0) {
			powerCreep.usePower(PWR_GENERATE_OPS);
		}

		const activeSpawn = room.find(FIND_MY_SPAWNS)[0];
		if (activeSpawn && activeSpawn.spawning && powerCreep.powers && powerCreep.powers[PWR_OPERATE_SPAWN] && powerCreep.powers[PWR_OPERATE_SPAWN].cooldown === 0) {
			if (powerCreep.pos.getRangeTo(activeSpawn) > 3) {
				powerCreep.moveTo(activeSpawn);
			} else {
				powerCreep.usePower(PWR_OPERATE_SPAWN, activeSpawn);
			}
		}
	}
}

function observerScan(room) {
	const observer = room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_OBSERVER;
		},
	})[0];
	if (!observer) {
		return;
	}

	const targetRoom = Memory.strategy.threatRoom || Memory.strategy.claimTarget || Memory.strategy.reserveTarget;
	if (targetRoom && targetRoom !== room.name) {
		observer.observeRoom(targetRoom);
		Memory.strategy.power.lastObserved = targetRoom;
	}
}

function strongholdScan() {
	ensureMemory();
	const strongholds = [];
	for (const roomName in Game.rooms) {
		const room = Game.rooms[roomName];
		const core = room.find(FIND_HOSTILE_STRUCTURES, {
			filter: function (structure) {
				return structure.structureType === STRUCTURE_INVADER_CORE;
			},
		})[0];
		if (!core) {
			continue;
		}
		strongholds.push({
			roomName: room.name,
			level: core.level || 0,
			ticksToDeploy: core.ticksToDeploy || 0,
		});
	}
	Memory.strategy.power.strongholds = strongholds;
}

function run(room) {
	ensureMemory();
	classifyPowerBanks();
	strongholdScan();
	if (room) {
		processPower(room);
		observerScan(room);
		runPowerCreeps(room);
		powerOperator.run(room);
	}
}

export default { run: run };
