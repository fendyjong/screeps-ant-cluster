function run(room) {
	if (!room.controller || room.controller.level < 7 || !room.controller.my) {
		return;
	}
	if (!Memory.strategy) {
		Memory.strategy = {};
	}
	if (!Memory.strategy.factory) {
		Memory.strategy.factory = {};
	}

	const factory = room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_FACTORY;
		},
	})[0];
	if (!factory) {
		return;
	}

	const stockpile = room.storage ? room.storage.store[RESOURCE_ENERGY] || 0 : 0;
	let batteryAvgPrice = null;
	if (Game.market && typeof Game.market.getHistory === 'function') {
		const history = Game.market.getHistory(RESOURCE_BATTERY) || [];
		if (history.length > 0) {
			batteryAvgPrice = _.sum(history, function (entry) {
				return entry.avgPrice || 0;
			}) / history.length;
		}
	}
	Memory.strategy.factory[room.name] = {
		stockpile: stockpile,
		ready: stockpile >= 300000,
		profitThreshold: 300000,
		batteryAvgPrice: batteryAvgPrice,
	};

	if (factory.cooldown > 0 || stockpile < 600000) {
		return;
	}
	if ((factory.store[RESOURCE_ENERGY] || 0) >= 600 && (batteryAvgPrice === null || batteryAvgPrice >= 0.6)) {
		factory.produce(RESOURCE_BATTERY);
	}
}

export default { run: run };
