function run(room) {
	if (!Memory.strategy) {
		Memory.strategy = {};
	}
	if (!Memory.strategy.power) {
		Memory.strategy.power = {};
	}
	Memory.strategy.power.operatorRoadmap = {
		spawn: 'OPERATE_SPAWN',
		tower: 'OPERATE_TOWER',
		source: 'REGEN_SOURCE',
		storage: 'OPERATE_STORAGE',
		terminal: 'OPERATE_TERMINAL',
		controller: 'OPERATE_CONTROLLER',
	};
	if (room && room.name) {
		Memory.strategy.power.operatorRoom = room.name;
	}
}

export default { run: run };
