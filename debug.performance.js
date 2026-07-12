// Real-time performance monitoring and debugging utility
const pathing = require('utils.pathing');
const metrics = require('utils.metrics');

function analyzeCreepIdlePatterns() {
    const analysis = {
        totalCreeps: Object.keys(Game.creeps).length,
        idleCreeps: 0,
        stuckCreeps: 0,
        idleByRole: {},
        lastAnalysisTick: Game.time
    };

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        
        // Check if creep is stuck (using pathing's stuck detection)
        const isStuck = creep.memory._stuckTicks > 1;
        if (isStuck) {
            analysis.stuckCreeps++;
            analysis.idleByRole[creep.memory.role] = (analysis.idleByRole[creep.memory.role] || 0) + 1;
            continue;
        }

        // Check if creep has been in same position for multiple ticks
        if (creep.memory._lastPos && 
            creep.pos.x === creep.memory._lastPos.x && 
            creep.pos.y === creep.memory._lastPos.y &&
            creep.room.name === creep.memory._lastPos.roomName) {
            
            analysis.idleCreeps++;
            analysis.idleByRole[creep.memory.role] = (analysis.idleByRole[creep.memory.role] || 0) + 1;
        }
    }

    // Store analysis in memory for long-term tracking
    if (!Memory.debug) Memory.debug = {};
    Memory.debug.creepAnalysis = analysis;
    
    return analysis;
}

function evaluateRampartStrategy(room) {
    if (!room.controller || !room.controller.my) return null;

    const analysis = {
        roomName: room.name,
        rcl: room.controller.level,
        ramparts: room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART }).length,
        controllerProtection: 0,
        spawnProtection: 0,
        extensionProtection: 0,
        strategicScore: 0,
        issues: []
    };

    // Check controller protection
    const controller = room.controller;
    const controllerRamparts = room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_RAMPART && s.pos.getRangeTo(controller) <= 3
    });
    analysis.controllerProtection = controllerRamparts.length;
    if (controllerRamparts.length === 0) {
        analysis.issues.push('❌ No ramparts protecting controller');
    }

    // Check spawn protection
    const spawns = room.find(FIND_MY_SPAWNS);
    for (const spawn of spawns) {
        const spawnRamparts = room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_RAMPART && s.pos.getRangeTo(spawn) <= 3
        });
        analysis.spawnProtection += spawnRamparts.length;
    }
    if (analysis.spawnProtection === 0 && spawns.length > 0) {
        analysis.issues.push('❌ No ramparts protecting spawns');
    }

    // Calculate strategic score
    analysis.strategicScore = analysis.ramparts * 10;
    if (analysis.controllerProtection > 0) analysis.strategicScore += 20;
    if (analysis.spawnProtection > 0) analysis.strategicScore += 15;
    
    // Add room-specific recommendations
    if (room.controller.level >= 3) {
        const extensions = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION });
        const extensionRamparts = room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_RAMPART && 
                s.pos.getRangeTo(extensions[0]) <= 3
        });
        analysis.extensionProtection = extensionRamparts.length;
        if (extensionRamparts.length === 0 && extensions.length > 0) {
            analysis.issues.push('⚠️  Consider adding ramparts around extensions');
        }
    }

    return analysis;
}

function auditCpuUtilization() {
    const audit = {
        tick: Game.time,
        cpuUsed: Game.cpu.getUsed(),
        cpuLimit: Game.cpu.limit,
        cpuBucket: Game.cpu.bucket,
        utilizationPct: (Game.cpu.getUsed() / Game.cpu.limit) * 100,
        unusedCpu: Game.cpu.limit - Game.cpu.getUsed(),
        canRunBurstWork: Game.cpu.bucket >= 3000,
        budgetAnalysis: {
            softLimit: typeof getCpuBudgets === 'function' ? getCpuBudgets().soft : 15,
            hardLimit: typeof getCpuBudgets === 'function' ? getCpuBudgets().hard : 18,
            underSoftLimit: Game.cpu.getUsed() < (typeof getCpuBudgets === 'function' ? getCpuBudgets().soft : 15),
            underHardLimit: Game.cpu.getUsed() < (typeof getCpuBudgets === 'function' ? getCpuBudgets().hard : 18)
        },
        recommendations: []
    };

    // Add CPU optimization recommendations
    if (audit.utilizationPct < 30) {
        audit.recommendations.push('✅ Enable more burst workers (links, labs, market)');
        audit.recommendations.push('✅ Increase construction site processing frequency');
        audit.recommendations.push('✅ Enable more strategic analysis');
    } else if (audit.utilizationPct > 80) {
        audit.recommendations.push('⚠️  Consider reducing non-critical tasks');
        audit.recommendations.push('⚠️  Optimize creep pathfinding logic');
        audit.recommendations.push('⚠️  Reduce memory overhead');
    }

    if (audit.canRunBurstWork) {
        audit.recommendations.push('✅ Burst work is enabled (bucket: ' + audit.cpuBucket + ')');
    } else {
        audit.recommendations.push('⚠️  Burst work disabled (bucket: ' + audit.cpuBucket + ')');
    }

    // Store in memory
    if (!Memory.debug) Memory.debug = {};
    Memory.debug.cpuAudit = audit;
    
    return audit;
}

function generatePerformanceSnapshot() {
    const snapshot = {
        tick: Game.time,
        timestamp: new Date().toISOString(),
        creepAnalysis: analyzeCreepIdlePatterns(),
        cpuAudit: auditCpuUtilization(),
        roomAnalyses: [],
        systemHealth: {
            memorySize: RawMemory.get().length,
            creepCount: Object.keys(Game.creeps).length,
            roomCount: Object.keys(Game.rooms).length,
            ownedRoomCount: _.sum(Game.rooms, r => r.controller && r.controller.my ? 1 : 0)
        }
    };

    // Analyze all owned rooms
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (room.controller && room.controller.my) {
            snapshot.roomAnalyses.push(evaluateRampartStrategy(room));
        }
    }

    return snapshot;
}

// Real-time alerts for critical issues
function checkCriticalIssues() {
    const alerts = [];
    const creepAnalysis = Memory.debug && Memory.debug.creepAnalysis;
    const cpuAudit = Memory.debug && Memory.debug.cpuAudit;

    // Check for critical idle creep levels
    if (creepAnalysis && creepAnalysis.totalCreeps > 0) {
        const idlePct = (creepAnalysis.idleCreeps / creepAnalysis.totalCreeps) * 100;
        if (idlePct > 80) {
            alerts.push({
                severity: 'CRITICAL',
                message: '🚨 ' + Math.round(idlePct) + '% of creeps are idle! (' + creepAnalysis.idleCreeps + '/' + creepAnalysis.totalCreeps + ')',
                recommendation: 'Increase spawn rate or adjust creep tasks'
            });
        } else if (idlePct > 60) {
            alerts.push({
                severity: 'HIGH',
                message: '⚠️ ' + Math.round(idlePct) + '% of creeps are idle (' + creepAnalysis.idleCreeps + '/' + creepAnalysis.totalCreeps + ')',
                recommendation: 'Review creep role distribution'
            });
        }
    }

    // Check for CPU bottlenecks
    if (cpuAudit) {
        if (cpuAudit.utilizationPct > 90) {
            alerts.push({
                severity: 'CRITICAL',
                message: '🚨 CPU utilization at ' + Math.round(cpuAudit.utilizationPct) + '% - near limit!',
                recommendation: 'Reduce non-critical tasks or optimize code'
            });
        } else if (cpuAudit.utilizationPct > 80) {
            alerts.push({
                severity: 'HIGH',
                message: '⚠️ CPU utilization at ' + Math.round(cpuAudit.utilizationPct) + '%',
                recommendation: 'Monitor for performance bottlenecks'
            });
        }
    }

    // Check memory limits
    const rawLen = RawMemory.get().length;
    const memLimit = 1850000; // 1.85MB soft limit
    const memPct = (rawLen / memLimit) * 100;
    if (memPct > 95) {
        alerts.push({
            severity: 'CRITICAL',
            message: '🚨 Memory usage at ' + Math.round(memPct) + '% - near limit!',
            recommendation: 'Implement memory pruning or optimize storage'
        });
    } else if (memPct > 90) {
        alerts.push({
            severity: 'HIGH',
            message: '⚠️ Memory usage at ' + Math.round(memPct) + '%',
            recommendation: 'Review memory retention policies'
        });
    }

    return alerts;
}

module.exports = {
    analyzeCreepIdlePatterns: analyzeCreepIdlePatterns,
    evaluateRampartStrategy: evaluateRampartStrategy,
    auditCpuUtilization: auditCpuUtilization,
    generatePerformanceSnapshot: generatePerformanceSnapshot,
    checkCriticalIssues: checkCriticalIssues
};