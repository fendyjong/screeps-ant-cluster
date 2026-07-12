function ensureStats(creep) {
	if (!creep.memory.stats) {
		creep.memory.stats = {
			harvested: 0,
			built: 0,
			upgraded: 0,
			attacked: 0,
			healed: 0,
			repaired: 0,
			transferred: 0,
			withdrawn: 0,
			dropped: 0,
			ticksWork: 0,
			ticksMove: 0,
			ticksIdle: 0,
			lastTask: '',
		};
	}
	return creep.memory.stats;
}

function recordTask(creep, task) {
	var stats = ensureStats(creep);
	stats.lastTask = task;
}

function recordHarvest(creep, amount) {
	var stats = ensureStats(creep);
	stats.harvested += amount || 0;
	stats.ticksWork += 1;
	stats.lastTask = 'harvest';
}

function recordBuild(creep, amount) {
	var stats = ensureStats(creep);
	stats.built += amount || 0;
	stats.ticksWork += 1;
	stats.lastTask = 'build';
}

function recordUpgrade(creep, amount) {
	var stats = ensureStats(creep);
	stats.upgraded += amount || 0;
	stats.ticksWork += 1;
	stats.lastTask = 'upgrade';
}

function recordAttack(creep, amount) {
	var stats = ensureStats(creep);
	stats.attacked += amount || 0;
	stats.ticksWork += 1;
	stats.lastTask = 'attack';
}

function recordHeal(creep, amount) {
	var stats = ensureStats(creep);
	stats.healed += amount || 0;
	stats.ticksWork += 1;
	stats.lastTask = 'heal';
}

function recordRepair(creep, amount) {
	var stats = ensureStats(creep);
	stats.repaired += amount || 0;
	stats.ticksWork += 1;
	stats.lastTask = 'repair';
}

function recordTransfer(creep, amount) {
	var stats = ensureStats(creep);
	stats.transferred += amount || 0;
	stats.ticksWork += 1;
	stats.lastTask = 'transfer';
}

function recordWithdraw(creep, amount) {
	var stats = ensureStats(creep);
	stats.withdrawn += amount || 0;
	stats.ticksWork += 1;
	stats.lastTask = 'withdraw';
}

function recordDrop(creep, amount) {
	var stats = ensureStats(creep);
	stats.dropped += amount || 0;
	stats.ticksWork += 1;
	stats.lastTask = 'drop';
}

function recordMove(creep) {
	var stats = ensureStats(creep);
	stats.ticksMove += 1;
	stats.lastTask = 'move';
}

function recordIdle(creep) {
	var stats = ensureStats(creep);
	stats.ticksIdle += 1;
	stats.lastTask = 'idle';
}

function getStatsLine(creep) {
	var stats = ensureStats(creep);
	var parts = [];
	parts.push(stats.lastTask);
	if (stats.harvested > 0) parts.push('H:' + stats.harvested);
	if (stats.built > 0) parts.push('B:' + stats.built);
	if (stats.upgraded > 0) parts.push('U:' + stats.upgraded);
	if (stats.attacked > 0) parts.push('A:' + stats.attacked);
	if (stats.healed > 0) parts.push('He:' + stats.healed);
	if (stats.transferred > 0) parts.push('T:' + stats.transferred);
	if (stats.withdrawn > 0) parts.push('W:' + stats.withdrawn);
	if (stats.repaired > 0) parts.push('R:' + stats.repaired);
	return parts.join(' ');
}

var utilsStats = {
	recordTask: recordTask,
	recordHarvest: recordHarvest,
	recordBuild: recordBuild,
	recordUpgrade: recordUpgrade,
	recordAttack: recordAttack,
	recordHeal: recordHeal,
	recordRepair: recordRepair,
	recordTransfer: recordTransfer,
	recordWithdraw: recordWithdraw,
	recordDrop: recordDrop,
	recordMove: recordMove,
	recordIdle: recordIdle,
	getStatsLine: getStatsLine,
};

module.exports = utilsStats;
