export type CampaignPhase = 'discover' | 'validate' | 'escrow' | 'probe' | 'claim'
	| 'bootstrap' | 'stabilize' | 'independent' | 'abandon' | 'cooldown';

const CAMPAIGN_PHASES: CampaignPhase[] = [
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

export type ParentStockpileState = 'critical' | 'saving' | 'balanced' | 'surplus' | 'capped';

export enum CampaignAction {
	None = 'none',
	WouldProbe = 'would_probe',
	ReserveEscrow = 'reserve_escrow',
	WouldClaim = 'would_claim',
	WouldReinforce = 'would_reinforce',
	WouldAbandon = 'would_abandon',
	WouldUnclaim = 'would_unclaim',
	Complete = 'complete',
}

export interface CampaignCooldown {
	until: number;
	failures: number;
	lastReason: string;
}

export interface CampaignMilestone {
	completedAt?: number;
	deadline?: number;
}

export interface CampaignMemory {
	phase: CampaignPhase;
	parentRoom?: string;
	targetRoom?: string;
	startedAt?: number;
	phaseStartedAt?: number;
	lastProgressAt?: number;
	attempts: number;
	escrowEnergy: number;
	escrowSpawnTicks: number;
	remainingEscrowEnergy: number;
	reinforcementUsed: boolean;
	milestones: {[name: string]: CampaignMilestone};
	failureReason?: string;
	cooldowns: {[roomName: string]: CampaignCooldown};
	dryRun: boolean;
}

export interface CampaignSnapshot {
	now: number;
	candidateAvailable: boolean;
	candidateRoom?: string;
	parentRoom?: string;
	intelFresh: boolean;
	routeFresh: boolean;
	targetValid: boolean;
	parentState: ParentStockpileState;
	reserveRatio: number;
	stockpileTrend: number;
	escrowAffordable: boolean;
	spawnUtilization: number;
	spawnCapacityAvailable: boolean;
	cpuBucket: number;
	probeComplete: boolean;
	claimed: boolean;
	firstHarvest: boolean;
	spawnSitePlaced: boolean;
	spawnComplete: boolean;
	localMinerHauler: boolean;
	netEnergyNonNegative: boolean;
	stabilizedFor: number;
	dangerousHostiles: boolean;
	routeLost: boolean;
	gclAvailable: boolean;
	cpuSupportsColony: boolean;
}

export interface CampaignTransition {
	campaign: CampaignMemory;
	actions: CampaignAction[];
}

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

export function createCampaign(dryRun = true): CampaignMemory {
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

export function isCampaignPhase(value: any): value is CampaignPhase {
	return CAMPAIGN_PHASES.includes(value);
}

function isRecord(value: any): value is {[key: string]: any} {
	return value !== null && typeof value == 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: any): value is number {
	return typeof value == 'number' && Number.isFinite(value);
}

export function campaignMemoryIsValid(value: any): value is CampaignMemory {
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

export function targetOwnershipIsValid(phase: CampaignPhase, owner: string | undefined,
										 reservation: string | undefined, username: string): boolean {
	if (phase == 'discover' || phase == 'validate' || phase == 'escrow' || phase == 'probe') {
		return owner === undefined && (reservation === undefined || reservation == username);
	}
	if (phase == 'claim' || phase == 'bootstrap' || phase == 'stabilize' || phase == 'independent') {
		return owner == username && (reservation === undefined || reservation == username);
	}
	return false;
}

export interface CampaignStockpileSample {
	tick: number;
	energy: number;
}

export function hasRecentNonNegativeTrend(samples: CampaignStockpileSample[], now: number,
										 minimumSpan = 100, maximumAge = 50): boolean {
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

export function nextStabilizingSince(previous: number | undefined, stable: boolean, now: number): number | undefined {
	if (!stable) {
		return undefined;
	}
	return previous === undefined ? now : previous;
}

export function intelTimestampIsFresh(lastVisible: number, now: number, maximumAge: number): boolean {
	return isFiniteNumber(lastVisible) && lastVisible <= now && lastVisible >= now - maximumAge;
}

export function shouldLogCampaignDecision(beforePhase: CampaignPhase, afterPhase: CampaignPhase,
										 actions: CampaignAction[]): boolean {
	return beforePhase != afterPhase || actions.some(action => action != CampaignAction.None);
}

export interface RouteDangerEvidence {
	intelFresh: boolean;
	avoid?: boolean;
	owner?: string;
	reservation?: string;
	unsafeFor?: number;
	visibleDangerousHostiles?: boolean;
	threatLevel?: number;
}

export function routeRoomIsDangerous(evidence: RouteDangerEvidence, username: string,
										 highThreatThreshold = 0.25): boolean {
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

export function spawnMilestonePlaced(spawnCount: number, spawnSiteCount: number): boolean {
	return spawnCount > 0 || spawnSiteCount > 0;
}

export function spawnCapacitySupportsEscrow(spawnCount: number, utilization: number,
										 window: number, requiredSpawnTicks: number): boolean {
	return isFiniteNumber(spawnCount) && spawnCount > 0
		&& isFiniteNumber(utilization) && utilization >= 0 && utilization <= 1
		&& isFiniteNumber(window) && window > 0
		&& isFiniteNumber(requiredSpawnTicks) && requiredSpawnTicks > 0
		&& spawnCount * window * (1 - utilization) >= requiredSpawnTicks;
}

export function conservativeEscrowEstimate(claimerCost: number, claimerParts: number,
										 pioneerCost: number, pioneerParts: number,
										 spawnTimePerPart = 3): {energy: number, spawnTicks: number} {
	const waves = 2;
	const margin = 1.25;
	const pioneers = 4;
	return {
		energy: Math.ceil((claimerCost + pioneers * pioneerCost) * waves * margin),
		spawnTicks: Math.ceil((claimerParts + pioneers * pioneerParts) * spawnTimePerPart * waves * margin),
	};
}

export function failureCooldown(failures: number): number {
	const exponent = Math.max(0, failures - 1);
	return Math.min(CAMPAIGN_POLICY.maxCooldown, CAMPAIGN_POLICY.baseCooldown * Math.pow(2, exponent));
}

function cloneCampaign(campaign: CampaignMemory): CampaignMemory {
	const milestones: {[name: string]: CampaignMilestone} = {};
	for (const name of Object.keys(campaign.milestones)) {
		milestones[name] = {...campaign.milestones[name]};
	}
	const cooldowns: {[roomName: string]: CampaignCooldown} = {};
	for (const roomName of Object.keys(campaign.cooldowns)) {
		cooldowns[roomName] = {...campaign.cooldowns[roomName]};
	}
	return {...campaign, milestones, cooldowns};
}

function transitionTo(campaign: CampaignMemory, phase: CampaignPhase, now: number): void {
	campaign.phase = phase;
	campaign.phaseStartedAt = now;
}

function abandon(campaign: CampaignMemory, snapshot: CampaignSnapshot, reason: string): CampaignTransition {
	transitionTo(campaign, 'abandon', snapshot.now);
	campaign.failureReason = reason;
	const actions = [CampaignAction.WouldAbandon];
	if (snapshot.claimed) {
		actions.push(CampaignAction.WouldUnclaim);
	}
	return {campaign, actions};
}

function initializeMilestones(campaign: CampaignMemory, now: number): void {
	let currentFound = false;
	for (const name of MILESTONES) {
		const milestone = campaign.milestones[name] || {};
		campaign.milestones[name] = milestone;
		if (milestone.completedAt !== undefined) {
			milestone.deadline = undefined;
		} else if (!currentFound) {
			if (milestone.deadline === undefined) {
				milestone.deadline = now + CAMPAIGN_POLICY.bootstrapDeadline;
			}
			currentFound = true;
		} else {
			milestone.deadline = undefined;
		}
	}
}

function updateMilestones(campaign: CampaignMemory, snapshot: CampaignSnapshot): void {
	const complete: {[name: string]: boolean} = {
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

function currentMilestone(campaign: CampaignMemory): CampaignMilestone | undefined {
	for (const name of MILESTONES) {
		if (campaign.milestones[name].completedAt === undefined) {
			return campaign.milestones[name];
		}
	}
	return undefined;
}

export function transitionCampaign(campaign: CampaignMemory, snapshot: CampaignSnapshot): CampaignTransition {
	const next = cloneCampaign(campaign);
	const none = (): CampaignTransition => ({campaign: next, actions: [CampaignAction.None]});

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
				return {campaign: next, actions: [CampaignAction.WouldProbe]};
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
			return {campaign: next, actions: [CampaignAction.ReserveEscrow]};
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
				return {campaign: next, actions: [CampaignAction.WouldProbe]};
			}
			transitionTo(next, 'claim', snapshot.now);
			return {campaign: next, actions: [CampaignAction.WouldClaim]};
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
			return {campaign: next, actions: [CampaignAction.WouldClaim]};
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
					return {campaign: next, actions: [CampaignAction.WouldReinforce]};
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
				return {campaign: next, actions: [CampaignAction.Complete]};
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
			return {campaign: next, actions};
		}
		case 'cooldown': {
			const cooldown = next.targetRoom && next.cooldowns[next.targetRoom];
			if (!cooldown || snapshot.now >= cooldown.until) {
				const reset = createCampaign(next.dryRun);
				reset.cooldowns = next.cooldowns;
				return {campaign: reset, actions: [CampaignAction.None]};
			}
			return none();
		}
	}
}
