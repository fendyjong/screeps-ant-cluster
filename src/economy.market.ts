function ensureMemory() {
	if (!Memory.strategy) {
		Memory.strategy = {};
	}
	if (!Memory.strategy.market) {
		Memory.strategy.market = { opportunities: [], lastRun: 0 };
	}
}

function run() {
	ensureMemory();
	if (Game.time % 100 !== 0) {
		return;
	}
	if (!Game.market) {
		return;
	}

	const terminals = _.filter(Game.structures, function (structure) {
		return structure.structureType === STRUCTURE_TERMINAL && structure.my;
	});
	if (terminals.length === 0) {
		return;
	}

	const terminal = terminals[0];
	const room = terminal.room;
	const energyReserve = room.controller && room.controller.level >= 7 ? 25000 : 15000;
	const storageReserve = room.controller && room.controller.level >= 6 ? 100000 : 50000;
	const opportunities = [];
	const historySummary = {};
	const energyLevel = terminal.store[RESOURCE_ENERGY] || 0;
	if (!Memory.strategy.economy) {
		Memory.strategy.economy = {};
	}
	Memory.strategy.economy.storageReserveFloor = storageReserve;
	Memory.strategy.economy.terminalReserveFloor = energyReserve;

	if (terminals.length > 1 && energyLevel > energyReserve + 10000) {
		const needy = _.find(terminals, function (candidate) {
			return candidate.id !== terminal.id && (candidate.store[RESOURCE_ENERGY] || 0) < energyReserve / 2 && candidate.cooldown === 0;
		});
		if (needy && terminal.cooldown === 0) {
			terminal.send(RESOURCE_ENERGY, Math.min(5000, energyLevel - energyReserve), needy.room.name, 'rebalance');
		}
	}

	if (energyLevel > energyReserve + 20000) {
		const orders = Game.market.getAllOrders(function (order) {
			return order.type === ORDER_BUY && order.resourceType === RESOURCE_ENERGY && order.amount > 1000;
		});
		let best = null;
		let bestScore = -Infinity;
		for (const order of orders) {
			const tx = Game.market.calcTransactionCost(1000, terminal.room.name, order.roomName);
			const score = order.price - tx / 1000;
			if (score > bestScore) {
				bestScore = score;
				best = { type: 'sell_energy', orderId: order.id, price: order.price, tx: tx };
			}
		}
		if (best) {
			opportunities.push(best);
		}
	}

	if (energyLevel < energyReserve) {
		const orders = Game.market.getAllOrders(function (order) {
			return order.type === ORDER_SELL && order.resourceType === RESOURCE_ENERGY && order.amount > 1000;
		});
		let best = null;
		let bestScore = Infinity;
		for (const order of orders) {
			const tx = Game.market.calcTransactionCost(1000, terminal.room.name, order.roomName);
			const score = order.price + tx / 1000;
			if (score < bestScore) {
				bestScore = score;
				best = { type: 'buy_energy', orderId: order.id, price: order.price, tx: tx };
			}
		}
		if (best) {
			opportunities.push(best);
		}
	}

	const trackedResources = [RESOURCE_ENERGY, RESOURCE_BATTERY, RESOURCE_POWER];
	for (const resourceType of trackedResources) {
		const history = Game.market.getHistory(resourceType) || [];
		if (history.length === 0) {
			continue;
		}
		historySummary[resourceType] = {
			avgPrice: Number((_.sum(history, function (entry) { return entry.avgPrice || 0; }) / history.length).toFixed(3)),
			avgVolume: Math.floor(_.sum(history, function (entry) { return entry.volume || 0; }) / history.length),
		};
	}

	Memory.strategy.market = {
		opportunities: opportunities,
		lastRun: Game.time,
		energyReserve: energyReserve,
		storageReserve: storageReserve,
		history: historySummary,
	};
}

export default { run: run };
