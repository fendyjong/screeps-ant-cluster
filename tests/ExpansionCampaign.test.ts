import * as assert from 'assert';
import {
	CAMPAIGN_POLICY,
	CampaignAction,
	CampaignMemory,
	CampaignSnapshot,
	campaignMemoryIsValid,
	conservativeEscrowEstimate,
	createCampaign,
	failureCooldown,
	hasRecentNonNegativeTrend,
	intelTimestampIsFresh,
	isCampaignPhase,
	nextStabilizingSince,
	routeRoomIsDangerous,
	shouldLogCampaignDecision,
	spawnCapacitySupportsEscrow,
	spawnMilestonePlaced,
	targetOwnershipIsValid,
	transitionCampaign,
} from '../src/strategy/ExpansionCampaign';

const snapshot = (overrides: Partial<CampaignSnapshot> = {}): CampaignSnapshot => ({
	now: 1000,
	candidateAvailable: true,
	candidateRoom: 'W1N1',
	parentRoom: 'W0N0',
	intelFresh: true,
	routeFresh: true,
	targetValid: true,
	parentState: 'surplus',
	reserveRatio: 2.5,
	stockpileTrend: 1,
	escrowAffordable: true,
	spawnUtilization: 0.5,
	spawnCapacityAvailable: true,
	cpuBucket: 8000,
	probeComplete: false,
	claimed: false,
	firstHarvest: false,
	spawnSitePlaced: false,
	spawnComplete: false,
	localMinerHauler: false,
	netEnergyNonNegative: false,
	stabilizedFor: 0,
	dangerousHostiles: false,
	routeLost: false,
	gclAvailable: true,
	cpuSupportsColony: true,
	...overrides,
});

function testDiscoverSelectsCandidate(): void {
	const campaign = createCampaign(true);
	const result = transitionCampaign(campaign, snapshot());
	assert.strictEqual(result.campaign.phase, 'validate');
	assert.strictEqual(result.campaign.targetRoom, 'W1N1');
	assert.strictEqual(result.campaign.parentRoom, 'W0N0');
	assert.deepStrictEqual(result.actions, [CampaignAction.None]);
}

function testCriticalParentAbortsEscrow(): void {
	const campaign: CampaignMemory = {...createCampaign(true), phase: 'escrow'};
	const result = transitionCampaign(campaign, snapshot({reserveRatio: 0.4, parentState: 'critical'}));
	assert.strictEqual(result.campaign.phase, 'abandon');
	assert.ok(result.actions.includes(CampaignAction.WouldAbandon));
}

function testStaleValidationRequestsProbe(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'validate',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
	};
	const result = transitionCampaign(campaign, snapshot({intelFresh: false}));
	assert.strictEqual(result.campaign.phase, 'validate');
	assert.deepStrictEqual(result.actions, [CampaignAction.WouldProbe]);
}

function testReadyEscrowAdvancesToProbe(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'escrow',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
	};
	const result = transitionCampaign(campaign, snapshot());
	assert.strictEqual(result.campaign.phase, 'probe');
	assert.ok(result.actions.includes(CampaignAction.ReserveEscrow));
}

function testEscrowWaitsForSpawnCapacity(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'escrow',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
	};
	const result = transitionCampaign(campaign, snapshot({spawnCapacityAvailable: false}));
	assert.strictEqual(result.campaign.phase, 'escrow');
	assert.deepStrictEqual(result.actions, [CampaignAction.None]);
}

function testFlatStockpilePausesEscrow(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'escrow',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
	};
	const result = transitionCampaign(campaign, snapshot({stockpileTrend: 0}));
	assert.strictEqual(result.campaign.phase, 'escrow');
	assert.deepStrictEqual(result.actions, [CampaignAction.None]);
}

function testDecliningStockpilePausesEscrow(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'escrow',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
	};
	const result = transitionCampaign(campaign, snapshot({stockpileTrend: -1}));
	assert.strictEqual(result.campaign.phase, 'escrow');
	assert.deepStrictEqual(result.actions, [CampaignAction.None]);
}

function testStaleProbeRequestsRefresh(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'probe',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
	};
	const result = transitionCampaign(campaign, snapshot({intelFresh: false}));
	assert.strictEqual(result.campaign.phase, 'probe');
	assert.deepStrictEqual(result.actions, [CampaignAction.WouldProbe]);
}

function testIncompleteProbeRequestsRefresh(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'probe',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
		phaseStartedAt: 1000,
	};
	const result = transitionCampaign(campaign, snapshot({now: 1100, probeComplete: false}));
	assert.strictEqual(result.campaign.phase, 'probe');
	assert.deepStrictEqual(result.actions, [CampaignAction.WouldProbe]);
}

function testCriticalParentAbortsProbe(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'probe',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
		phaseStartedAt: 1000,
	};
	const result = transitionCampaign(campaign, snapshot({parentState: 'critical'}));
	assert.strictEqual(result.campaign.phase, 'abandon');
	assert.ok(result.actions.includes(CampaignAction.WouldAbandon));
}

function testProbeExpiresAtExactDeadline(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'probe',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
		phaseStartedAt: 1000,
	};
	const result = transitionCampaign(campaign, snapshot({now: 1000 + CAMPAIGN_POLICY.probeDeadline}));
	assert.strictEqual(result.campaign.phase, 'abandon');
	assert.strictEqual(result.campaign.failureReason, 'probe_deadline');
}

function testCompleteProbeAdvancesToClaim(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'probe',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
	};
	const result = transitionCampaign(campaign, snapshot({probeComplete: true}));
	assert.strictEqual(result.campaign.phase, 'claim');
	assert.ok(result.actions.includes(CampaignAction.WouldClaim));
}

function testClaimExpiresAtExactDeadline(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'claim',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
		phaseStartedAt: 1000,
	};
	const result = transitionCampaign(campaign, snapshot({now: 1000 + CAMPAIGN_POLICY.claimDeadline}));
	assert.strictEqual(result.campaign.phase, 'abandon');
	assert.strictEqual(result.campaign.failureReason, 'claim_deadline');
}

function testMilestoneDeadlinesStartWhenPredecessorCompletes(): void {
	const claimCampaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'claim',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
		phaseStartedAt: 900,
	};
	const bootstrap = transitionCampaign(claimCampaign, snapshot({now: 1000, claimed: true}));
	assert.strictEqual(bootstrap.campaign.milestones.claimed.completedAt, 1000);
	assert.strictEqual(bootstrap.campaign.milestones.claimed.deadline, undefined);
	assert.strictEqual(bootstrap.campaign.milestones.firstHarvest.deadline,
		1000 + CAMPAIGN_POLICY.bootstrapDeadline);
	assert.strictEqual(bootstrap.campaign.milestones.spawnSitePlaced.deadline, undefined);

	const harvested = transitionCampaign(bootstrap.campaign, snapshot({
		now: 1200,
		claimed: true,
		firstHarvest: true,
	}));
	assert.strictEqual(harvested.campaign.milestones.firstHarvest.completedAt, 1200);
	assert.strictEqual(harvested.campaign.milestones.firstHarvest.deadline, undefined);
	assert.strictEqual(harvested.campaign.milestones.spawnSitePlaced.deadline,
		1200 + CAMPAIGN_POLICY.bootstrapDeadline);
	assert.strictEqual(harvested.campaign.milestones.spawnComplete.deadline, undefined);

	const beforeDeadline = transitionCampaign(harvested.campaign, snapshot({
		now: 3600,
		claimed: true,
		firstHarvest: true,
	}));
	assert.strictEqual(beforeDeadline.campaign.phase, 'bootstrap');
	assert.strictEqual(beforeDeadline.campaign.reinforcementUsed, false);
}

function testSavingParentPausesBootstrapReinforcementAtDeadline(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'bootstrap',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
		phaseStartedAt: 1000,
		lastProgressAt: 1000,
		milestones: {
			claimed: {completedAt: 1000},
			firstHarvest: {deadline: 1000 + CAMPAIGN_POLICY.bootstrapDeadline},
		},
	};
	const result = transitionCampaign(campaign, snapshot({
		now: 1000 + CAMPAIGN_POLICY.bootstrapDeadline,
		claimed: true,
		parentState: 'saving',
	}));
	assert.strictEqual(result.campaign.phase, 'bootstrap');
	assert.strictEqual(result.campaign.reinforcementUsed, false);
	assert.deepStrictEqual(result.actions, [CampaignAction.None]);
}

function testBootstrapReinforcesThenAbandonsAtExactDeadlines(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'bootstrap',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
		phaseStartedAt: 1000,
		lastProgressAt: 1000,
		milestones: {
			claimed: {completedAt: 1000},
			firstHarvest: {deadline: 1000 + CAMPAIGN_POLICY.bootstrapDeadline},
		},
	};
	const reinforced = transitionCampaign(campaign, snapshot({
		now: 1000 + CAMPAIGN_POLICY.bootstrapDeadline,
		claimed: true,
	}));
	assert.strictEqual(reinforced.campaign.phase, 'bootstrap');
	assert.strictEqual(reinforced.campaign.reinforcementUsed, true);
	assert.ok(reinforced.actions.includes(CampaignAction.WouldReinforce));
	const abandoned = transitionCampaign(reinforced.campaign, snapshot({
		now: 1000 + 2 * CAMPAIGN_POLICY.bootstrapDeadline,
		claimed: true,
	}));
	assert.strictEqual(abandoned.campaign.phase, 'abandon');
	assert.ok(abandoned.actions.includes(CampaignAction.WouldAbandon));
}

function testStabilizationCompletesCampaign(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'stabilize',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
	};
	const result = transitionCampaign(campaign, snapshot({
		stabilizedFor: CAMPAIGN_POLICY.stabilizationWindow,
	}));
	assert.strictEqual(result.campaign.phase, 'independent');
	assert.ok(result.actions.includes(CampaignAction.Complete));
}

function testEstablishedColonyIsNeverUnclaimed(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'independent',
		targetRoom: 'W1N1',
		parentRoom: 'W0N0',
	};
	const result = transitionCampaign(campaign, snapshot({claimed: true, parentState: 'critical'}));
	assert.strictEqual(result.campaign.phase, 'independent');
	assert.ok(!result.actions.includes(CampaignAction.WouldAbandon));
	assert.ok(!result.actions.includes(CampaignAction.WouldUnclaim));
}

function testFailureCooldownIsExponentialAndCapped(): void {
	assert.strictEqual(failureCooldown(0), 5000);
	assert.strictEqual(failureCooldown(1), 5000);
	assert.strictEqual(failureCooldown(2), 10000);
	assert.strictEqual(failureCooldown(20), 100000);
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'abandon',
		targetRoom: 'W1N1',
		failureReason: 'dangerous_hostiles',
		cooldowns: {
			W1N1: {until: 900, failures: 1, lastReason: 'route_lost'},
		},
	};
	const result = transitionCampaign(campaign, snapshot({claimed: true}));
	assert.strictEqual(result.campaign.phase, 'cooldown');
	assert.deepStrictEqual(result.actions, [CampaignAction.WouldAbandon, CampaignAction.WouldUnclaim]);
	assert.deepStrictEqual(result.campaign.cooldowns.W1N1, {
		until: 11000,
		failures: 2,
		lastReason: 'dangerous_hostiles',
	});
}

function testCooldownWaitsThenResets(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'cooldown',
		targetRoom: 'W1N1',
		cooldowns: {
			W1N1: {until: 21000, failures: 2, lastReason: 'dangerous_hostiles'},
		},
	};
	const waiting = transitionCampaign(campaign, snapshot({now: 20999}));
	assert.strictEqual(waiting.campaign.phase, 'cooldown');
	assert.deepStrictEqual(waiting.actions, [CampaignAction.None]);
	const reset = transitionCampaign(campaign, snapshot({now: 21000}));
	assert.strictEqual(reset.campaign.phase, 'discover');
	assert.deepStrictEqual(reset.actions, [CampaignAction.None]);
	assert.deepStrictEqual(reset.campaign.cooldowns.W1N1, campaign.cooldowns.W1N1);
}

function testTransitionDoesNotMutateInput(): void {
	const campaign: CampaignMemory = {
		...createCampaign(true),
		phase: 'bootstrap',
		targetRoom: 'W1N1',
		milestones: {claimed: {completedAt: 500, deadline: 2000}},
		cooldowns: {W2N2: {until: 4000, failures: 1, lastReason: 'invalid_target'}},
	};
	const original = JSON.parse(JSON.stringify(campaign));
	const result = transitionCampaign(campaign, snapshot({claimed: true, firstHarvest: true}));
	assert.deepStrictEqual(campaign, original);
	assert.notStrictEqual(result.campaign, campaign);
	assert.notStrictEqual(result.campaign.milestones, campaign.milestones);
	assert.notStrictEqual(result.campaign.cooldowns, campaign.cooldowns);
	assert.notStrictEqual(result.campaign.cooldowns.W2N2, campaign.cooldowns.W2N2);
}

function testCampaignPhaseValidationRejectsCorruption(): void {
	assert.strictEqual(isCampaignPhase('discover'), true);
	assert.strictEqual(isCampaignPhase('independent'), true);
	assert.strictEqual(isCampaignPhase('launch'), false);
	assert.strictEqual(isCampaignPhase(undefined), false);
}

function testEscrowEstimateIncludesReplacementWaveAndMargin(): void {
	assert.deepStrictEqual(conservativeEscrowEstimate(650, 6, 800, 12), {
		energy: 9625,
		spawnTicks: 405,
	});
}

function testTargetOwnershipValidityIsPhaseAware(): void {
	assert.strictEqual(targetOwnershipIsValid('validate', undefined, undefined, 'me'), true);
	assert.strictEqual(targetOwnershipIsValid('validate', 'me', undefined, 'me'), false);
	assert.strictEqual(targetOwnershipIsValid('validate', undefined, 'enemy', 'me'), false);
	assert.strictEqual(targetOwnershipIsValid('claim', 'me', undefined, 'me'), true);
	assert.strictEqual(targetOwnershipIsValid('bootstrap', 'enemy', undefined, 'me'), false);
}

function testCampaignMemoryValidationChecksNestedData(): void {
	assert.strictEqual(campaignMemoryIsValid(createCampaign(true)), true);
	assert.strictEqual(campaignMemoryIsValid({...createCampaign(true), reinforcementUsed: 0}), false);
	assert.strictEqual(campaignMemoryIsValid({...createCampaign(true), milestones: {claimed: {deadline: 'soon'}}}), false);
	assert.strictEqual(campaignMemoryIsValid({...createCampaign(true), cooldowns: {
		W1N1: {until: 100, failures: 1, lastReason: 7},
	}}), false);
}

function testRecentTrendRequiresFreshMeaningfulWindow(): void {
	const samples = [{tick: 900, energy: 1000}, {tick: 1000, energy: 1100}];
	assert.strictEqual(hasRecentNonNegativeTrend(samples, 1000), true);
	assert.strictEqual(hasRecentNonNegativeTrend(samples, 1100), false);
	assert.strictEqual(hasRecentNonNegativeTrend([{tick: 975, energy: 1000}, {tick: 1000, energy: 1100}], 1000), false);
	assert.strictEqual(hasRecentNonNegativeTrend([{tick: 900, energy: 1100}, {tick: 1000, energy: 1000}], 1000), false);
}

function testStabilizationStartTracksContiguousEvidence(): void {
	assert.strictEqual(nextStabilizingSince(undefined, true, 1000), 1000);
	assert.strictEqual(nextStabilizingSince(1000, true, 1100), 1000);
	assert.strictEqual(nextStabilizingSince(1000, false, 1101), undefined);
	assert.strictEqual(nextStabilizingSince(undefined, true, 1102), 1102);
}

function testTargetAndRouteIntelUseSeparateFreshnessWindows(): void {
	assert.strictEqual(intelTimestampIsFresh(500, 1000, 500), true);
	assert.strictEqual(intelTimestampIsFresh(400, 1000, 500), false);
	assert.strictEqual(intelTimestampIsFresh(400, 1000, 1000), true);
}

function testCampaignLoggingRepeatsNonNoneProposals(): void {
	assert.strictEqual(shouldLogCampaignDecision('probe', 'probe', [CampaignAction.None]), false);
	assert.strictEqual(shouldLogCampaignDecision('validate', 'escrow', [CampaignAction.None]), true);
	assert.strictEqual(shouldLogCampaignDecision('probe', 'probe', [CampaignAction.WouldProbe]), true);
}

function testRouteDangerRequiresConcreteEvidence(): void {
	assert.strictEqual(routeRoomIsDangerous({intelFresh: false}, 'me'), true);
	assert.strictEqual(routeRoomIsDangerous({intelFresh: true, threatLevel: 0.1}, 'me'), false);
	assert.strictEqual(routeRoomIsDangerous({intelFresh: true, avoid: true}, 'me'), true);
	assert.strictEqual(routeRoomIsDangerous({intelFresh: true, unsafeFor: 1}, 'me'), true);
	assert.strictEqual(routeRoomIsDangerous({intelFresh: true, owner: 'enemy'}, 'me'), true);
	assert.strictEqual(routeRoomIsDangerous({intelFresh: true, reservation: 'enemy'}, 'me'), true);
	assert.strictEqual(routeRoomIsDangerous({intelFresh: true, visibleDangerousHostiles: true}, 'me'), true);
	assert.strictEqual(routeRoomIsDangerous({intelFresh: true, threatLevel: 0.3}, 'me'), true);
}

function testSpawnMilestoneIncludesCompletedSpawn(): void {
	assert.strictEqual(spawnMilestonePlaced(0, 0), false);
	assert.strictEqual(spawnMilestonePlaced(0, 1), true);
	assert.strictEqual(spawnMilestonePlaced(1, 0), true);
}

function testSpawnCapacityUsesObservedFreeSpawnTicks(): void {
	assert.strictEqual(spawnCapacitySupportsEscrow(2, 0.5, 1500, 1400), true);
	assert.strictEqual(spawnCapacitySupportsEscrow(2, 0.5, 1500, 1600), false);
	assert.strictEqual(spawnCapacitySupportsEscrow(2, NaN, 1500, 100), false);
	assert.strictEqual(spawnCapacitySupportsEscrow(0, 0, 1500, 100), false);
}

testDiscoverSelectsCandidate();
testCriticalParentAbortsEscrow();
testStaleValidationRequestsProbe();
testReadyEscrowAdvancesToProbe();
testEscrowWaitsForSpawnCapacity();
testFlatStockpilePausesEscrow();
testDecliningStockpilePausesEscrow();
testStaleProbeRequestsRefresh();
testIncompleteProbeRequestsRefresh();
testCriticalParentAbortsProbe();
testProbeExpiresAtExactDeadline();
testCompleteProbeAdvancesToClaim();
testClaimExpiresAtExactDeadline();
testMilestoneDeadlinesStartWhenPredecessorCompletes();
testSavingParentPausesBootstrapReinforcementAtDeadline();
testBootstrapReinforcesThenAbandonsAtExactDeadlines();
testStabilizationCompletesCampaign();
testEstablishedColonyIsNeverUnclaimed();
testFailureCooldownIsExponentialAndCapped();
testCooldownWaitsThenResets();
testTransitionDoesNotMutateInput();
testCampaignPhaseValidationRejectsCorruption();
testEscrowEstimateIncludesReplacementWaveAndMargin();
testTargetOwnershipValidityIsPhaseAware();
testCampaignMemoryValidationChecksNestedData();
testRecentTrendRequiresFreshMeaningfulWindow();
testStabilizationStartTracksContiguousEvidence();
testTargetAndRouteIntelUseSeparateFreshnessWindows();
testCampaignLoggingRepeatsNonNoneProposals();
testRouteDangerRequiresConcreteEvidence();
testSpawnMilestoneIncludesCompletedSpawn();
testSpawnCapacityUsesObservedFreeSpawnTicks();

console.log('ExpansionCampaign tests passed');
