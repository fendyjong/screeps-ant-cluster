const CAMPAIGN_PHASES = [
    'discover',
    'validate',
    'escrow',
    'probe',
    'claim',
    'bootstrap',
    'stabilize',
    'independent',
    'abandon',
    'cooldown',
];
export var CampaignAction;
(function (CampaignAction) {
    CampaignAction["None"] = "none";
    CampaignAction["WouldProbe"] = "would_probe";
    CampaignAction["ReserveEscrow"] = "reserve_escrow";
    CampaignAction["WouldClaim"] = "would_claim";
    CampaignAction["WouldReinforce"] = "would_reinforce";
    CampaignAction["WouldAbandon"] = "would_abandon";
    CampaignAction["WouldUnclaim"] = "would_unclaim";
    CampaignAction["Complete"] = "complete";
})(CampaignAction || (CampaignAction = {}));
export const CAMPAIGN_POLICY = {
    minimumReserveRatio: 2,
    maximumSpawnUtilization: 0.75,
    minimumCpuBucket: 5000,
    probeDeadline: 1500,
    claimDeadline: 1500,
    bootstrapDeadline: 2500,
    stabilizationWindow: 1500,
    baseCooldown: 5000,
    maxCooldown: 100000,
};
const MILESTONES = [
    'claimed',
    'firstHarvest',
    'spawnSitePlaced',
    'spawnComplete',
    'localMinerHauler',
    'netEnergyNonNegative',
];
export function createCampaign(dryRun = true) {
    return {
        phase: 'discover',
        attempts: 0,
        escrowEnergy: 0,
        escrowSpawnTicks: 0,
        remainingEscrowEnergy: 0,
        reinforcementUsed: false,
        milestones: {},
        cooldowns: {},
        dryRun,
    };
}
export function isCampaignPhase(value) {
    return CAMPAIGN_PHASES.includes(value);
}
function isRecord(value) {
    return value !== null && typeof value == 'object' && !Array.isArray(value);
}
function isFiniteNumber(value) {
    return typeof value == 'number' && Number.isFinite(value);
}
export function campaignMemoryIsValid(value) {
    if (!isRecord(value) || !isCampaignPhase(value.phase)
        || !isFiniteNumber(value.attempts)
        || !isFiniteNumber(value.escrowEnergy)
        || !isFiniteNumber(value.escrowSpawnTicks)
        || !isFiniteNumber(value.remainingEscrowEnergy)
        || typeof value.reinforcementUsed != 'boolean'
        || typeof value.dryRun != 'boolean'
        || !isRecord(value.milestones)
        || !isRecord(value.cooldowns)) {
        return false;
    }
    const optionalNumbers = ['startedAt', 'phaseStartedAt', 'lastProgressAt'];
    for (const key of optionalNumbers) {
        if (value[key] !== undefined && !isFiniteNumber(value[key])) {
            return false;
        }
    }
    if (value.parentRoom !== undefined && typeof value.parentRoom != 'string'
        || value.targetRoom !== undefined && typeof value.targetRoom != 'string'
        || value.failureReason !== undefined && typeof value.failureReason != 'string') {
        return false;
    }
    for (const name of Object.keys(value.milestones)) {
        const milestone = value.milestones[name];
        if (!isRecord(milestone)
            || milestone.deadline !== undefined && !isFiniteNumber(milestone.deadline)
            || milestone.completedAt !== undefined && !isFiniteNumber(milestone.completedAt)) {
            return false;
        }
    }
    for (const roomName of Object.keys(value.cooldowns)) {
        const cooldown = value.cooldowns[roomName];
        if (!isRecord(cooldown) || !isFiniteNumber(cooldown.until) || !isFiniteNumber(cooldown.failures)
            || typeof cooldown.lastReason != 'string') {
            return false;
        }
    }
    return true;
}
export function targetOwnershipIsValid(phase, owner, reservation, username) {
    if (phase == 'discover' || phase == 'validate' || phase == 'escrow' || phase == 'probe') {
        return owner === undefined && (reservation === undefined || reservation == username);
    }
    if (phase == 'claim' || phase == 'bootstrap' || phase == 'stabilize' || phase == 'independent') {
        return owner == username && (reservation === undefined || reservation == username);
    }
    return false;
}
export function hasRecentNonNegativeTrend(samples, now, minimumSpan = 100, maximumAge = 50) {
    if (samples.length < 2) {
        return false;
    }
    const earliest = samples[0];
    const latest = samples[samples.length - 1];
    return isFiniteNumber(earliest.tick) && isFiniteNumber(earliest.energy)
        && isFiniteNumber(latest.tick) && isFiniteNumber(latest.energy)
        && latest.tick <= now && latest.tick >= now - maximumAge
        && latest.tick - earliest.tick >= minimumSpan
        && latest.energy >= earliest.energy;
}
export function nextStabilizingSince(previous, stable, now) {
    if (!stable) {
        return undefined;
    }
    return previous === undefined ? now : previous;
}
export function intelTimestampIsFresh(lastVisible, now, maximumAge) {
    return isFiniteNumber(lastVisible) && lastVisible <= now && lastVisible >= now - maximumAge;
}
export function shouldLogCampaignDecision(beforePhase, afterPhase, actions) {
    return beforePhase != afterPhase || actions.some(action => action != CampaignAction.None);
}
export function routeRoomIsDangerous(evidence, username, highThreatThreshold = 0.25) {
    if (!evidence.intelFresh) {
        return true;
    }
    return evidence.avoid === true
        || isFiniteNumber(evidence.unsafeFor) && evidence.unsafeFor > 0
        || evidence.visibleDangerousHostiles === true
        || evidence.owner !== undefined && evidence.owner != username
        || evidence.reservation !== undefined && evidence.reservation != username
        || isFiniteNumber(evidence.threatLevel) && evidence.threatLevel > highThreatThreshold;
}
export function spawnMilestonePlaced(spawnCount, spawnSiteCount) {
    return spawnCount > 0 || spawnSiteCount > 0;
}
export function spawnCapacitySupportsEscrow(spawnCount, utilization, window, requiredSpawnTicks) {
    return isFiniteNumber(spawnCount) && spawnCount > 0
        && isFiniteNumber(utilization) && utilization >= 0 && utilization <= 1
        && isFiniteNumber(window) && window > 0
        && isFiniteNumber(requiredSpawnTicks) && requiredSpawnTicks > 0
        && spawnCount * window * (1 - utilization) >= requiredSpawnTicks;
}
export function conservativeEscrowEstimate(claimerCost, claimerParts, pioneerCost, pioneerParts, spawnTimePerPart = 3) {
    const waves = 2;
    const margin = 1.25;
    const pioneers = 4;
    return {
        energy: Math.ceil((claimerCost + pioneers * pioneerCost) * waves * margin),
        spawnTicks: Math.ceil((claimerParts + pioneers * pioneerParts) * spawnTimePerPart * waves * margin),
    };
}
export function failureCooldown(failures) {
    const exponent = Math.max(0, failures - 1);
    return Math.min(CAMPAIGN_POLICY.maxCooldown, CAMPAIGN_POLICY.baseCooldown * Math.pow(2, exponent));
}
function cloneCampaign(campaign) {
    const milestones = {};
    for (const name of Object.keys(campaign.milestones)) {
        milestones[name] = Object.assign({}, campaign.milestones[name]);
    }
    const cooldowns = {};
    for (const roomName of Object.keys(campaign.cooldowns)) {
        cooldowns[roomName] = Object.assign({}, campaign.cooldowns[roomName]);
    }
    return Object.assign(Object.assign({}, campaign), { milestones, cooldowns });
}
function transitionTo(campaign, phase, now) {
    campaign.phase = phase;
    campaign.phaseStartedAt = now;
}
function abandon(campaign, snapshot, reason) {
    transitionTo(campaign, 'abandon', snapshot.now);
    campaign.failureReason = reason;
    const actions = [CampaignAction.WouldAbandon];
    if (snapshot.claimed) {
        actions.push(CampaignAction.WouldUnclaim);
    }
    return { campaign, actions };
}
function initializeMilestones(campaign, now) {
    let currentFound = false;
    for (const name of MILESTONES) {
        const milestone = campaign.milestones[name] || {};
        campaign.milestones[name] = milestone;
        if (milestone.completedAt !== undefined) {
            milestone.deadline = undefined;
        }
        else if (!currentFound) {
            if (milestone.deadline === undefined) {
                milestone.deadline = now + CAMPAIGN_POLICY.bootstrapDeadline;
            }
            currentFound = true;
        }
        else {
            milestone.deadline = undefined;
        }
    }
}
function updateMilestones(campaign, snapshot) {
    const complete = {
        claimed: snapshot.claimed,
        firstHarvest: snapshot.firstHarvest,
        spawnSitePlaced: snapshot.spawnSitePlaced,
        spawnComplete: snapshot.spawnComplete,
        localMinerHauler: snapshot.localMinerHauler,
        netEnergyNonNegative: snapshot.netEnergyNonNegative,
    };
    for (const name of MILESTONES) {
        const milestone = campaign.milestones[name];
        if (milestone.completedAt === undefined) {
            if (!complete[name]) {
                break;
            }
            milestone.completedAt = snapshot.now;
            milestone.deadline = undefined;
            campaign.lastProgressAt = snapshot.now;
        }
    }
    initializeMilestones(campaign, snapshot.now);
}
function currentMilestone(campaign) {
    for (const name of MILESTONES) {
        if (campaign.milestones[name].completedAt === undefined) {
            return campaign.milestones[name];
        }
    }
    return undefined;
}
export function transitionCampaign(campaign, snapshot) {
    const next = cloneCampaign(campaign);
    const none = () => ({ campaign: next, actions: [CampaignAction.None] });
    switch (next.phase) {
        case 'independent':
            return none();
        case 'discover':
            if (snapshot.candidateAvailable && snapshot.candidateRoom && snapshot.parentRoom) {
                next.targetRoom = snapshot.candidateRoom;
                next.parentRoom = snapshot.parentRoom;
                next.startedAt = snapshot.now;
                next.attempts += 1;
                next.failureReason = undefined;
                transitionTo(next, 'validate', snapshot.now);
            }
            return none();
        case 'validate':
            if (!snapshot.intelFresh || !snapshot.routeFresh) {
                return { campaign: next, actions: [CampaignAction.WouldProbe] };
            }
            if (!snapshot.targetValid) {
                return abandon(next, snapshot, 'invalid_target');
            }
            if (!snapshot.gclAvailable) {
                return abandon(next, snapshot, 'gcl_unavailable');
            }
            if (!snapshot.cpuSupportsColony) {
                return abandon(next, snapshot, 'cpu_unsupported');
            }
            transitionTo(next, 'escrow', snapshot.now);
            return none();
        case 'escrow':
            if (snapshot.parentState === 'critical') {
                return abandon(next, snapshot, 'parent_critical');
            }
            if (snapshot.parentState === 'saving'
                || snapshot.reserveRatio < CAMPAIGN_POLICY.minimumReserveRatio
                || snapshot.stockpileTrend <= 0
                || !snapshot.escrowAffordable
                || !snapshot.spawnCapacityAvailable
                || snapshot.spawnUtilization > CAMPAIGN_POLICY.maximumSpawnUtilization
                || snapshot.cpuBucket < CAMPAIGN_POLICY.minimumCpuBucket) {
                return none();
            }
            transitionTo(next, 'probe', snapshot.now);
            return { campaign: next, actions: [CampaignAction.ReserveEscrow] };
        case 'probe':
            if (snapshot.parentState === 'critical') {
                return abandon(next, snapshot, 'parent_critical');
            }
            if (!snapshot.targetValid) {
                return abandon(next, snapshot, 'invalid_target');
            }
            if (snapshot.dangerousHostiles) {
                return abandon(next, snapshot, 'dangerous_hostiles');
            }
            if (snapshot.routeLost) {
                return abandon(next, snapshot, 'route_lost');
            }
            if (next.phaseStartedAt !== undefined
                && snapshot.now - next.phaseStartedAt >= CAMPAIGN_POLICY.probeDeadline) {
                return abandon(next, snapshot, 'probe_deadline');
            }
            if (!snapshot.intelFresh || !snapshot.routeFresh || !snapshot.probeComplete) {
                return { campaign: next, actions: [CampaignAction.WouldProbe] };
            }
            transitionTo(next, 'claim', snapshot.now);
            return { campaign: next, actions: [CampaignAction.WouldClaim] };
        case 'claim':
            if (snapshot.parentState === 'critical') {
                return abandon(next, snapshot, 'parent_critical');
            }
            if (snapshot.claimed) {
                transitionTo(next, 'bootstrap', snapshot.now);
                next.lastProgressAt = snapshot.now;
                initializeMilestones(next, snapshot.now);
                updateMilestones(next, snapshot);
                return none();
            }
            if (next.phaseStartedAt !== undefined
                && snapshot.now - next.phaseStartedAt >= CAMPAIGN_POLICY.claimDeadline) {
                return abandon(next, snapshot, 'claim_deadline');
            }
            return { campaign: next, actions: [CampaignAction.WouldClaim] };
        case 'bootstrap': {
            if (snapshot.parentState === 'critical') {
                return abandon(next, snapshot, 'parent_critical');
            }
            if (snapshot.dangerousHostiles) {
                return abandon(next, snapshot, 'dangerous_hostiles');
            }
            if (snapshot.routeLost) {
                return abandon(next, snapshot, 'route_lost');
            }
            initializeMilestones(next, next.phaseStartedAt === undefined ? snapshot.now : next.phaseStartedAt);
            updateMilestones(next, snapshot);
            const milestone = currentMilestone(next);
            if (!milestone) {
                transitionTo(next, 'stabilize', snapshot.now);
                return none();
            }
            if (milestone.deadline !== undefined && snapshot.now >= milestone.deadline) {
                if (snapshot.parentState === 'saving') {
                    return none();
                }
                if (!next.reinforcementUsed) {
                    next.reinforcementUsed = true;
                    milestone.deadline += CAMPAIGN_POLICY.bootstrapDeadline;
                    return { campaign: next, actions: [CampaignAction.WouldReinforce] };
                }
                return abandon(next, snapshot, 'bootstrap_deadline');
            }
            return none();
        }
        case 'stabilize':
            if (snapshot.parentState === 'critical') {
                return abandon(next, snapshot, 'parent_critical');
            }
            if (snapshot.dangerousHostiles) {
                return abandon(next, snapshot, 'dangerous_hostiles');
            }
            if (snapshot.routeLost) {
                return abandon(next, snapshot, 'route_lost');
            }
            if (snapshot.stabilizedFor >= CAMPAIGN_POLICY.stabilizationWindow) {
                transitionTo(next, 'independent', snapshot.now);
                return { campaign: next, actions: [CampaignAction.Complete] };
            }
            return none();
        case 'abandon': {
            const actions = [CampaignAction.WouldAbandon];
            if (snapshot.claimed) {
                actions.push(CampaignAction.WouldUnclaim);
            }
            if (next.targetRoom) {
                const previous = next.cooldowns[next.targetRoom];
                const failures = (previous ? previous.failures : 0) + 1;
                next.cooldowns[next.targetRoom] = {
                    until: snapshot.now + failureCooldown(failures),
                    failures,
                    lastReason: next.failureReason || 'unknown',
                };
            }
            transitionTo(next, 'cooldown', snapshot.now);
            return { campaign: next, actions };
        }
        case 'cooldown': {
            const cooldown = next.targetRoom && next.cooldowns[next.targetRoom];
            if (!cooldown || snapshot.now >= cooldown.until) {
                const reset = createCampaign(next.dryRun);
                reset.cooldowns = next.cooldowns;
                return { campaign: reset, actions: [CampaignAction.None] };
            }
            return none();
        }
    }
}
