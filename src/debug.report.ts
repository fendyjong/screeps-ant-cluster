function repeat(char, n) {
	var s = '';
	for (var i = 0; i < n; i++) s += char;
	return s;
}

function padRight(s, n) {
	s = String(s);
	while (s.length < n) s += ' ';
	return s;
}

function progressBar(value, max, width) {
	var filled = Math.round((value / Math.max(1, max)) * width);
	return repeat('#', filled) + repeat('-', width - filled);
}

function getThreatColor(level) {
	if (level === 'extreme') return '🔴';
	if (level === 'high') return '🟠';
	if (level === 'medium') return '🟡';
	return '🟢';
}

function formatCreepCounts(room) {
	var abbr = { harvester: 'Hv', hauler: 'Hl', builder: 'Bu', upgrader: 'Up', defender: 'De', scout: 'Sc', claimer: 'Cl', attacker: 'At', healer: 'He' };
	var roles = ['harvester', 'hauler', 'builder', 'upgrader', 'defender', 'scout', 'claimer', 'attacker', 'healer'];
	var parts = [];
	for (var i = 0; i < roles.length; i++) {
		var role = roles[i];
		var count = _.filter(Game.creeps, function (c) { return c.memory && c.memory.role === role && c.memory.roomName === room.name; }).length;
		if (count > 0 || role === 'harvester' || role === 'upgrader') {
			parts.push(abbr[role] + ':' + count);
		}
	}
	return parts.join(' ');
}

function generateRoomReport(room) {
	if (!room.controller) return null;
	var isOwned = room.controller.my;
	var plan = isOwned && Memory.roomIntel && Memory.roomIntel[room.name] ? Memory.roomIntel[room.name].colonyPlan : null;
	var phase = plan ? plan.phase : null;
	var modeLabel = '---';

	if (isOwned && plan && plan.economy) {
		modeLabel = plan.economy.survival ? 'SURVIVAL' : (plan.economy.locked ? 'RECOVERY' : 'GROWTH');
	}

	var lines = [];
	lines.push('### ' + room.name);
	lines.push('');

	var statusLine = '';
	if (isOwned) {
		var rcl = room.controller.level;
		var progress = room.controller.progress + '/' + room.controller.progressTotal;
		statusLine += 'RCL ' + rcl + ' | ' + modeLabel;
		statusLine += ' | Phase: ' + (phase ? phase.label : '---');
		lines.push(statusLine);

		var spawn = room.find(FIND_MY_SPAWNS)[0];
		var spawnStatus = 'none';
		if (spawn) {
			spawnStatus = spawn.spawning ? 'spawning ' + spawn.spawning.name : 'idle';
		}
		lines.push('Spawn: ' + spawnStatus);

		var storedEnergy = 0;
		var containers = room.find(FIND_STRUCTURES, {
			filter: function (s) { return s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE; },
		});
		for (var i = 0; i < containers.length; i++) {
			storedEnergy += containers[i].store[RESOURCE_ENERGY] || 0;
		}
		var availableEnergy = room.energyAvailable;
		var capacity = room.energyCapacityAvailable;
		var totalStockpile = storedEnergy + availableEnergy;
		var sources = room.find(FIND_SOURCES);
		var depleted = 0;
		for (var i = 0; i < sources.length; i++) {
			if (sources[i].energy === 0) depleted++;
		}
		
		// Energy efficiency metrics
		var sourceEfficiency = sources.length > 0 ? (1 - (depleted / sources.length)) * 100 : 0;
		var energyEfficiency = capacity > 0 ? (availableEnergy / capacity) * 100 : 0;
		var storageEfficiency = storedEnergy > 0 ? Math.min(100, (storedEnergy / 500000) * 100) : 0; // 500k is typical storage capacity

		lines.push('Energy: ' + availableEnergy + '/' + capacity + ' | Stockpile: ' + totalStockpile + ' | Depleted: ' + depleted + '/' + sources.length);
		lines.push('Energy Efficiency: ' + energyEfficiency.toFixed(1) + '% | Source Efficiency: ' + sourceEfficiency.toFixed(1) + '% | Storage Utilization: ' + storageEfficiency.toFixed(1) + '%');
		lines.push('Creeps: ' + formatCreepCounts(room) + ' | Targets: ' + JSON.stringify(plan ? plan.civilian : 'N/A').replace(/{|}|"/g, '') );

		var roomCreeps = _.filter(Game.creeps, function (c) { return c.memory && c.memory.roomName === room.name; });
		
		// Track idle creeps
		var idleCount = 0;
		var activeCount = 0;
		
		for (var ci = 0; ci < roomCreeps.length; ci++) {
			var st = roomCreeps[ci].memory.stats;
			var creepLine = '  ' + roomCreeps[ci].memory.role + '/' + roomCreeps[ci].name;
			
			// Enhanced idle detection
			var isIdle = false;
			var activityScore = 0;
			
			if (st) {
				activityScore += (st.harvested || 0) * 0.1;
				activityScore += (st.built || 0) * 0.2;
				activityScore += (st.upgraded || 0) * 0.2;
				activityScore += (st.attacked || 0) * 0.3;
				activityScore += (st.transferred || 0) * 0.1;
				
				if (activityScore < 0.1) isIdle = true;
			}
			
			// Movement-based idle detection
			if (roomCreeps[ci].memory._lastPos && 
				roomCreeps[ci].pos.x === roomCreeps[ci].memory._lastPos.x && 
				roomCreeps[ci].pos.y === roomCreeps[ci].memory._lastPos.y) {
				isIdle = true;
			}
			
			if (isIdle) {
				idleCount++;
				creepLine += ' 🟡IDLE';
			} else {
				activeCount++;
			}
			
			if (st) {
				creepLine += ' [' + st.lastTask + ']';
				var parts = [];
				if (st.harvested > 0) parts.push('H:' + st.harvested);
				if (st.built > 0) parts.push('B:' + st.built);
				if (st.upgraded > 0) parts.push('U:' + st.upgraded);
				if (st.attacked > 0) parts.push('A:' + st.attacked);
				if (st.healed > 0) parts.push('He:' + st.healed);
				if (st.transferred > 0) parts.push('T:' + st.transferred);
				if (st.withdrawn > 0) parts.push('W:' + st.withdrawn);
				if (st.moved > 0) parts.push('M:' + st.moved);
				if (parts.length > 0) creepLine += ' ' + parts.join(' ');
			} else {
				creepLine += ' [no stats]';
			}
			lines.push(creepLine);
		}
		
		// Add creep activity summary
		lines.push('  ' + '📊 Activity: ' + activeCount + '/' + roomCreeps.length + ' active (' + Math.round((activeCount/roomCreeps.length)*100) + '%)');
		lines.push('  ' + '💤 Idle: ' + idleCount + ' creeps (' + Math.round((idleCount/roomCreeps.length)*100) + '%)');

		var sites = room.find(FIND_MY_CONSTRUCTION_SITES);
		if (sites.length > 0) {
			var backlog = 0;
			var siteTypes = {};
			for (var i = 0; i < sites.length; i++) {
				backlog += Math.max(0, sites[i].progressTotal - sites[i].progress);
				siteTypes[sites[i].structureType] = (siteTypes[sites[i].structureType] || 0) + 1;
			}
			
			// Analyze rampart placement if any
			var rampartIssues = false;
			var ramparts = room.find(FIND_STRUCTURES, {
				filter: function(s) { return s.structureType === STRUCTURE_RAMPART; }
			});
			
			if (ramparts.length > 0) {
				var controllerRamparts = 0;
				var spawnRamparts = 0;
				
				for (var r = 0; r < ramparts.length; r++) {
					if (ramparts[r].pos.getRangeTo(room.controller) <= 3) controllerRamparts++;
					var spawns = room.find(FIND_MY_SPAWNS);
					for (var s = 0; s < spawns.length; s++) {
						if (ramparts[r].pos.getRangeTo(spawns[s]) <= 3) spawnRamparts++;
					}
				}
				
				var controllerCoverage = controllerRamparts > 0 ? '✅ GOOD' : '❌ POOR';
				var spawnCoverage = spawnRamparts > 0 ? '✅ GOOD' : '❌ POOR';
				
				lines.push('Ramparts: ' + ramparts.length + ' | Controller Coverage: ' + controllerCoverage + ' | Spawn Coverage: ' + spawnCoverage);
			}
			
			// Site type breakdown
			var siteTypesStr = [];
			for (var type in siteTypes) {
				siteTypesStr.push(type + ':' + siteTypes[type]);
			}
			
			lines.push('Sites: ' + sites.length + ' | Types: ' + siteTypesStr.join(', ') + ' | Backlog: ' + backlog);
		}

		if (plan && plan.construction) {
			var c = plan.construction;
			var activeLabel = c.activeType ? c.activeType : 'none';
			var queueLen = c.queue ? c.queue.length : 0;
			if (queueLen > 0) {
				var q = c.queue;
				var parts = [];
				for (var qi = 0; qi < q.length; qi++) {
					var e = q[qi];
					parts.push(e.type + ':' + e.placed + '/' + e.target);
				}
				lines.push('Colony: ' + activeLabel + ' [' + parts.join(' ') + ']');
			} else {
				lines.push('Colony: ' + activeLabel);
			}
		}
		if (plan && plan.buildGovernor) {
			lines.push('Governor: ' + plan.buildGovernor.mode + ' | BuildEnabled: ' + (plan.buildGovernor.constructionEnabled ? 'Y' : 'N') + ' | SiteQuota: ' + plan.buildGovernor.maxNewSitesPerRun);
		}
		if (plan && plan.eta && plan.eta.phase) {
			lines.push('ETA: ' + plan.eta.phase + 't' + (plan.eta.construction ? ' (build ' + plan.eta.construction + 't)' : '') + (plan.eta.upgrade ? ' (upgrade ' + plan.eta.upgrade + 't)' : ''));
		}

		var warPlan = Memory.warPlan;
		if (warPlan && warPlan.threat && warPlan.threat[room.name]) {
			var t = warPlan.threat[room.name];
			lines.push('Threat: ' + (t.level || 'none') + ' | Power: ' + (t.totalThreat || 0));
		}

		if (warPlan && warPlan.squads) {
			var localSquads = [];
			var totalSquads = 0;
			for (var i = 0; i < warPlan.squads.length; i++) {
				var sq = warPlan.squads[i];
				if (!sq) continue;
				totalSquads++;
				if (sq.room === room.name) {
					localSquads.push(sq.type + ':' + sq.status + '(' + (sq.members ? sq.members.length : 0) + ')');
				}
			}
			if (localSquads.length > 0) lines.push('Squads: ' + localSquads.join(' '));
			if (totalSquads > 0 && localSquads.length === 0) lines.push('Squads: (remote)');
		}
		if (warPlan && warPlan.doctrine && warPlan.doctrine[room.name]) {
			var d = warPlan.doctrine[room.name];
			lines.push('Doctrine: ' + d.template + ' | Idle ' + d.idleFormationType + '/' + d.idleMovementMode + ' | Engage ' + d.engagedFormationType + '/' + d.engagedMovementMode);
			if (d.trace) {
				lines.push('Doctrine Trace: hostiles=' + d.trace.hostiles + ' threat=' + d.trace.hostileThreat + ' ranged=' + d.trace.hostileRanged + ' towerDPS=' + d.trace.towerDPS + ' -> D' + d.trace.targets.defender + ' R' + d.trace.targets.rangedEscort + ' H' + d.trace.targets.healer);
			}
		}

		if (phase && phase.status === 'critical_path' && phase.missing.length > 0) {
			var missingParts = [];
			for (var i = 0; i < phase.missing.length; i++) {
				missingParts.push(phase.missing[i].need + 'x ' + phase.missing[i].label);
			}
			lines.push('Missing: ' + missingParts.join(', '));
		}
	} else {
		var intel = Memory.roomIntel && Memory.roomIntel[room.name] ? Memory.roomIntel[room.name] : null;
		if (intel) {
			statusLine += room.name;
			statusLine += ' | Owner: ' + (intel.owner || 'unclaimed');
			statusLine += ' | Threat: ' + (intel.threatLevel || 'none');
			statusLine += ' | Power: ' + (intel.hostilePower || 0);
			lines.push(statusLine);
		} else {
			lines.push(room.name + ' | no intel');
		}
	}

	return lines.join('\n') + '\n';
}

function generate() {
	var lines = [];

	lines.push('# Screeps Status Report');
	lines.push('');
	lines.push('**Tick:** ' + Game.time + ' | **CPU:** ' + Game.cpu.getUsed().toFixed(1) + '/' + Game.cpu.limit + ' | **Bucket:** ' + Game.cpu.bucket + ' | **GCL:** ' + Game.gcl.level + '/' + Game.gcl.progressTotal);
	lines.push('');
	var rawLen = RawMemory.get().length;
	lines.push('**Memory:** ' + (rawLen / 1024).toFixed(1) + 'KB | **Creeps:** ' + Object.keys(Game.creeps).length + ' | **Rooms:** ' + Object.keys(Game.rooms).length);
	lines.push('');

	// Add memory dump when CPU allows (bucket >= 5000 to avoid overload)
	if (Game.cpu.bucket >= 5000) {
		lines.push('## Full Memory Snapshot');
		lines.push('');
		try {
			lines.push('```json');
			lines.push(JSON.stringify({
				creeps: _.mapValues(Memory.creeps, function(c) { 
					return { role: c.role, roomName: c.roomName, spawnRoom: c.spawnRoom, ticksToLive: c.ticksToLive }; 
				}),
				roomIntel: _.mapValues(Memory.roomIntel, function(ri) { 
					return { lastSeen: ri.lastSeen, threatLevel: ri.threatLevel, colonyPlan: ri.colonyPlan ? { phase: ri.colonyPlan.phase?.status, economy: ri.colonyPlan.economy?.locked } : null }; 
				}),
				strategy: _.pick(Memory.strategy, ['globalStance', 'attackTarget', 'claimTarget', 'reserveTarget', 'economy']),
				warPlan: _.pick(Memory.warPlan, ['threat', 'doctrine', 'squads']),
				metrics: _.pick(Memory.metrics, ['cpu', 'spawnIdle', 'towerStats']),
				debugReport: Memory.debugReport ? { lastGenerated: Memory.debugReport.tick } : null
			}, null, 2));
			lines.push('```');
		} catch (e) {
			lines.push('*Memory dump failed: ' + e.message + '*');
		}
		lines.push('');

	var strategy = Memory.strategy || {};
	var economy = strategy.economy;
	if (economy) {
		lines.push('## Economy');
		lines.push('');
		lines.push('| Metric | Value |');
		lines.push('|--------|-------|');
		lines.push('| Total Stockpile | ' + (economy.totalStockpile || 0) + ' |');
		lines.push('| Source Fill Ratio | ' + (economy.sourceFillRatio || 0).toFixed(2) + ' |');
		lines.push('| Depleted Sources | ' + (economy.depletedSources || 0) + ' |');
		lines.push('| Ready for Reserve | ' + (economy.readyForReserve ? 'Y' : 'N') + ' |');
		lines.push('| Ready for Expansion | ' + (economy.readyForExpansion ? 'Y' : 'N') + ' |');
		lines.push('| Ready for War | ' + (economy.readyForWar ? 'Y' : 'N') + ' |');
		var idleRatio = Memory.metrics && typeof Memory.metrics.idleSpawnRatio === 'number' ? Memory.metrics.idleSpawnRatio : null;
		lines.push('| Idle Ratio | ' + (idleRatio !== null ? idleRatio.toFixed(2) : '---') + ' |');
		lines.push('');
	}

	lines.push('## Rooms');
	lines.push('');
	
	// Add global room performance metrics
	var totalCreeps = Object.keys(Game.creeps).length;
	var totalOwnedRooms = ownedRooms.length;
	var totalSites = 0;
	
	for (var name in Game.rooms) {
		var room = Game.rooms[name];
		if (room.controller && room.controller.my) {
			totalSites += room.find(FIND_MY_CONSTRUCTION_SITES).length;
		}
	}
	
	lines.push('**Global Room Stats:**');
	lines.push('| Metric | Value |');
	lines.push('|--------|-------|');
	lines.push('| Owned Rooms | ' + totalOwnedRooms + ' |');
	lines.push('| Construction Sites | ' + totalSites + ' |');
	lines.push('| Creeps Per Room | ' + (totalOwnedRooms > 0 ? (totalCreeps / totalOwnedRooms).toFixed(1) : 'N/A') + ' |');
	lines.push('');

	var ownedRooms = [];
	var otherRooms = [];
	for (var name in Game.rooms) {
		var room = Game.rooms[name];
		if (room.controller && room.controller.my) {
			ownedRooms.push(room);
		} else if (room.controller) {
			otherRooms.push(room);
		}
	}

	ownedRooms.sort(function (a, b) { return a.controller.level - b.controller.level; });

	if (ownedRooms.length > 0) {
		for (var i = 0; i < ownedRooms.length; i++) {
			var report = generateRoomReport(ownedRooms[i]);
			if (report) lines.push(report);
		}
	} else {
		lines.push('*No owned rooms*');
		lines.push('');
	}

	if (otherRooms.length > 0) {
		lines.push('### Nearby Rooms');
		lines.push('');
		for (var i = 0; i < otherRooms.length; i++) {
			var report = generateRoomReport(otherRooms[i]);
			if (report) lines.push(report);
		}
	}

	if (strategy) {
		lines.push('## Strategy');
		lines.push('');
		lines.push('| Setting | Value |');
		lines.push('|---------|-------|');
		lines.push('| Stance | ' + (strategy.globalStance || '---') + ' |');
		lines.push('| Threat Room | ' + (strategy.threatRoom || 'none') + ' |');
		lines.push('| Attack Target | ' + (strategy.attackTarget || 'none') + ' |');
		lines.push('| Claim Target | ' + (strategy.claimTarget || 'none') + ' |');
		lines.push('| Reserve Target | ' + (strategy.reserveTarget || 'none') + ' |');
		lines.push('| Attack Ready | ' + (strategy.attackReady ? 'Y' : 'N') + ' |');
		lines.push('| Claim Ready | ' + (strategy.claimReady ? 'Y' : 'N') + ' |');
		lines.push('| Reserve Ready | ' + (strategy.reserveReady ? 'Y' : 'N') + ' |');
		lines.push('| Overextend Blocked | ' + (strategy.overextendBlocked ? 'Y' : 'N') + ' |');
		lines.push('| Bootstrap Rooms | ' + (strategy.bootstrapRooms ? Object.keys(strategy.bootstrapRooms).join(', ') : 'none') + ' |');
		lines.push('');

		if (strategy.threatRoom && Memory.roomIntel && Memory.roomIntel[strategy.threatRoom]) {
			var t = Memory.roomIntel[strategy.threatRoom];
			lines.push('### Active Threat: ' + strategy.threatRoom);
			lines.push('');
			lines.push('| Metric | Value |');
			lines.push('|--------|-------|');
			lines.push('| Level | ' + getThreatColor(t.threatLevel) + ' ' + (t.threatLevel || 'unknown') + ' |');
			lines.push('| Hostile Power | ' + (t.hostilePower || 0) + ' |');
			lines.push('| Tower Power | ' + (t.hostileTowerPower || 0) + ' |');
			lines.push('| Can Defeat | ' + (t.canDefeat ? 'Y' : 'N') + ' |');
			lines.push('| Last Seen | ' + (t.lastSeen ? (Game.time - t.lastSeen) + ' ticks ago' : 'never') + ' |');
			lines.push('');
		}
	}

	if (Game.cpu) {
		var cpuRoles = Memory.metrics && Memory.metrics.cpu && Memory.metrics.cpu.roles ? Memory.metrics.cpu.roles : null;
lines.push('## CPU');
	lines.push('');
	lines.push('| Role | Avg/Tick | % of Total |');
	lines.push('|------|----------|------------|');
	var totalCpu = Game.cpu.getUsed();
	var roleTotals = {};
	
	if (cpuRoles) {
		for (var role in cpuRoles) {
			var item = cpuRoles[role];
			var avg = item && item.samples > 0 ? (item.total / item.samples).toFixed(3) : '0.000';
			var pct = item && item.samples > 0 ? Math.round((item.total / totalCpu) * 100) : 0;
			lines.push('| ' + role + ' | ' + avg + ' | ' + pct + '% |');
			roleTotals[role] = item.total;
		}
	}
	
	// Calculate unused CPU potential
	var unused = Game.cpu.limit - totalCpu;
	var unusedPct = Math.round((unused / Game.cpu.limit) * 100);
	
	lines.push('| **Total Used** | **' + totalCpu.toFixed(1) + '** | **' + Math.round((totalCpu/Game.cpu.limit)*100) + '%** |');
	lines.push('| **Unused** | **' + unused.toFixed(1) + '** | **' + unusedPct + '%** |');
	lines.push('| **Available Bucket** | **' + Game.cpu.bucket + '** | (for burst work) |');
	lines.push('');
	
	// Add CPU budget analysis
	lines.push('### CPU Budget Analysis');
	var budgets = typeof getCpuBudgets === 'function' ? getCpuBudgets() : { soft: 15, hard: 18 };
	lines.push('| Metric | Value | Status |');
	lines.push('|--------|-------|--------|');
	lines.push('| Soft Limit | ' + budgets.soft.toFixed(1) + ' | ' + (totalCpu < budgets.soft ? '✅ OK' : '⚠️  HIGH') + ' |');
	lines.push('| Hard Limit | ' + budgets.hard.toFixed(1) + ' | ' + (totalCpu < budgets.hard ? '✅ OK' : '❌ CRITICAL') + ' |');
	lines.push('');
	
	// Spawn Demand insights (optional)
	const d = Memory.spawnDemand || {};
	lines.push('### Spawn Demand');
	lines.push('| Metric | Value |');
	lines.push('|--------|-------|');
	lines.push(`| Backlog | ${d.backlog ? d.backlog.toFixed(2) : '0'} |`);
	lines.push(`| Idle Ratio | ${d.idleRatio ? d.idleRatio.toFixed(2) : '0'} |`);
	lines.push(`| Energy Reserve | ${d.energyReserve ? d.energyReserve.toFixed(2) : '0'} |`);
	lines.push('');
	// Add performance insights from debug.performance
	if (Memory.debug && Memory.debug.lastAnalysis) {
		var perfData = Memory.debug.lastAnalysis;
		lines.push('### Real-Time Performance Insights');
		lines.push('');
		lines.push('#### CPU Utilization');
		lines.push('| Metric | Value | Status |');
		lines.push('|--------|-------|--------|');
		lines.push('| Current Utilization | ' + perfData.cpuAudit.utilizationPct.toFixed(1) + '% | ' + (perfData.cpuAudit.utilizationPct < 30 ? '✅ UNDERUTILIZED' : (perfData.cpuAudit.utilizationPct < 70 ? '✅ OPTIMAL' : '⚠️  HIGH')) + ' |');
		lines.push('| Unused CPU | ' + perfData.cpuAudit.unusedCpu.toFixed(1) + ' | 🚀 Potential for more work |');
		lines.push('| Burst Work Ready | ' + (perfData.cpuAudit.canRunBurstWork ? '✅ YES' : '❌ NO') + ' | ' + (perfData.cpuAudit.canRunBurstWork ? 'Bucket: ' + perfData.cpuAudit.cpuBucket : '') + ' |');
		lines.push('');
		
		lines.push('#### Creep Activity');
		lines.push('| Metric | Value | Status |');
		lines.push('|--------|-------|--------|');
		lines.push('| Total Creeps | ' + perfData.creepAnalysis.totalCreeps + ' |  |');
		lines.push('| Idle Creeps | ' + perfData.creepAnalysis.idleCreeps + ' | ' + Math.round((perfData.creepAnalysis.idleCreeps / perfData.creepAnalysis.totalCreeps) * 100) + '% |');
		lines.push('| Stuck Creeps | ' + perfData.creepAnalysis.stuckCreeps + ' | 🛑 Needs pathfinding fix |');
		lines.push('');
		
		// Show critical issues
		if (perfData.criticalIssues && perfData.criticalIssues.length > 0) {
			lines.push('#### Critical Alerts');
			for (var i = 0; i < Math.min(3, perfData.criticalIssues.length); i++) {
				var issue = perfData.criticalIssues[i];
				var severity = issue.severity === 'CRITICAL' ? '🚨 CRITICAL' : '⚠️  HIGH';
				lines.push('* ' + severity + ': ' + issue.message + ' → ' + issue.recommendation);
			}
			if (perfData.criticalIssues.length > 3) {
				lines.push('* ... and ' + (perfData.criticalIssues.length - 3) + ' more issues');
			}
			lines.push('');
		}
	}
	}

	// Add performance analysis summary
	lines.push('## Performance Analysis');
	lines.push('');
	lines.push('### Key Issues & Recommendations');
	lines.push('');
	
	// Analyze idle creeps
	var idleRatio = Memory.metrics && typeof Memory.metrics.idleSpawnRatio === 'number' ? Memory.metrics.idleSpawnRatio : null;
	var idleIssue = '';
	if (idleRatio !== null && idleRatio > 0.7) {
		idleIssue = '⚠️  HIGH IDLE RATIO: ' + (idleRatio * 100).toFixed(1) + '% of spawns are idle - consider increasing creep counts or adjusting spawn logic';
	} else if (idleRatio !== null) {
		idleIssue = '✅ GOOD: Idle ratio at ' + (idleRatio * 100).toFixed(1) + '%';
	}
	
	// Analyze CPU utilization
	var totalCpu = Game.cpu.getUsed();
	var cpuUtilization = (totalCpu / Game.cpu.limit) * 100;
	var cpuIssue = '';
	if (cpuUtilization < 30) {
		cpuIssue = '⚠️  LOW CPU UTILIZATION: Only ' + cpuUtilization.toFixed(1) + '% used - consider enabling more workers or increasing burst work frequency';
	} else if (cpuUtilization < 70) {
		cpuIssue = '✅ GOOD: CPU utilization at ' + cpuUtilization.toFixed(1) + '%';
	} else {
		cpuIssue = '⚠️  HIGH CPU USAGE: ' + cpuUtilization.toFixed(1) + '% - monitor for bottlenecks';
	}
	
	// Add recommendations
	lines.push('| Category | Status | Recommendation |');
	lines.push('|----------|--------|----------------|');
	lines.push('| Idle Creeps | ' + (idleRatio !== null ? (idleRatio > 0.7 ? '❌ HIGH' : (idleRatio > 0.5 ? '⚠️  MEDIUM' : '✅ LOW')) : '---') + ' | ' + (idleRatio !== null ? (idleRatio > 0.7 ? 'Increase creep counts or adjust spawn timing' : '') : '') + ' |');
	lines.push('| CPU Usage | ' + (cpuUtilization < 30 ? '⚠️  UNDERUTILIZED' : (cpuUtilization < 70 ? '✅ OPTIMAL' : '⚠️  HIGH')) + ' | ' + (cpuUtilization < 30 ? 'Enable more workers/burst tasks' : (cpuUtilization > 70 ? 'Optimize loops or reduce tasks' : '')) + ' |');
	
	// Add memory health check
	var rawLen = RawMemory.get().length;
	var memUsage = (rawLen / MEMORY_SOFT_LIMIT) * 100 || 0;
	var memIssue = '';
	if (memUsage > 90) {
		memIssue = '⚠️  HIGH MEMORY USAGE: ' + memUsage.toFixed(1) + '% - consider pruning old data';
	} else {
		memIssue = '✅ GOOD: Memory usage at ' + memUsage.toFixed(1) + '%';
	}
	lines.push('| Memory Usage | ' + (memUsage > 90 ? '❌ HIGH' : (memUsage > 70 ? '⚠️  MEDIUM' : '✅ LOW')) + ' | ' + (memUsage > 90 ? 'Prune old room intel or optimize memory storage' : '') + ' |');
	
	lines.push('');
	lines.push('### Action Items');
	lines.push('1. ' + (idleRatio !== null && idleRatio > 0.7 ? '✅ Address high idle ratio: ' + (idleRatio * 100).toFixed(1) + '%' : '✅ Idle ratio is healthy'));
	lines.push('2. ' + (cpuUtilization < 30 ? '✅ Leverage unused CPU: ' + (Game.cpu.limit - totalCpu).toFixed(1) + ' CPU available' : '✅ CPU utilization is optimal'));
	lines.push('3. ' + (memUsage > 90 ? '✅ Monitor memory usage: ' + memUsage.toFixed(1) + '%' : '✅ Memory usage is healthy'));
	
	lines.push('');
	lines.push('---');
	lines.push('*Generated at tick ' + Game.time + '*');

	return lines.join('\n');
}

var debugReport = {
	generate: generate,
};

export default debugReport;
