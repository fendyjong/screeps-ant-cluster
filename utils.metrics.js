function ensureRoleMetrics() {
	if (!Memory.metrics) {
		Memory.metrics = {};
	}
	if (!Memory.metrics.roles) {
		Memory.metrics.roles = {};
	}
}

function recordRoleResult(role, action, result) {
	ensureRoleMetrics();
	if (typeof result !== 'number' || result >= 0) {
		return;
	}

	if (!Memory.metrics.roles[role]) {
		Memory.metrics.roles[role] = {};
	}
	if (!Memory.metrics.roles[role][action]) {
		Memory.metrics.roles[role][action] = {};
	}

	const key = String(result);
	Memory.metrics.roles[role][action][key] = (Memory.metrics.roles[role][action][key] || 0) + 1;
}

module.exports = {
	recordRoleResult: recordRoleResult,
};
