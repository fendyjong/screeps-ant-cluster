import {assimilationLocked} from '../assimilation/decorator';
import {Colony, getAllColonies} from '../Colony';
import {log} from '../console/log';
import {bodyCost} from '../creepSetups/CreepSetup';
import {Roles, Setups} from '../creepSetups/setups';
import {RoomIntel} from '../intel/RoomIntel';
import {Energetics} from '../logistics/Energetics';
import {Autonomy, getAutonomyLevel, Mem} from '../memory/Memory';
import {Pathing} from '../movement/Pathing';
import {profile} from '../profiler/decorator';
import {Cartographer} from '../utilities/Cartographer';
import {maxBy} from '../utilities/utils';
import {MAX_OWNED_ROOMS, MY_USERNAME, SHARD3_MAX_OWNED_ROOMS} from '../~settings';
import {
	CAMPAIGN_POLICY,
	CampaignAction,
	CampaignMemory,
	campaignMemoryIsValid,
	CampaignPhase,
	CampaignSnapshot,
	conservativeEscrowEstimate,
	createCampaign,
	hasRecentNonNegativeTrend,
	intelTimestampIsFresh,
	nextStabilizingSince,
	routeRoomIsDangerous,
	shouldLogCampaignDecision,
	spawnCapacitySupportsEscrow,
	spawnMilestonePlaced,
	targetOwnershipIsValid,
	transitionCampaign,
} from './ExpansionCampaign';
import {MIN_EXPANSION_DISTANCE} from './ExpansionEvaluator';


const CHECK_EXPANSION_FREQUENCY = 1000;
const TARGET_INTEL_FRESHNESS = 500;
const ROUTE_INTEL_FRESHNESS = 1000;
const MAX_CAMPAIGN_PATH_TILES = 250;
const MIN_COLONIZER_RCL = 3;

const UNOWNED_MINERAL_BONUS = 100;
const CATALYST_BONUS = 75;
const MAX_SCORE_BONUS = _.sum([UNOWNED_MINERAL_BONUS, CATALYST_BONUS]);

const TOO_CLOSE_PENALTY = 100;

interface ExpansionChoice {
	roomName: string;
	parentRoom: string;
	score: number;
}

interface StockpileSample {
	tick: number;
	energy: number;
}

interface ExpansionPlannerMemory {
	campaign: CampaignMemory;
	stockpileSamples: {[roomName: string]: StockpileSample[]};
	stabilizingSince?: number;
	lastDecision?: {
		tick: number;
		phase: CampaignPhase;
		actions: CampaignAction[];
		reason?: string;
	};
}

const defaultExpansionPlannerMemory: () => ExpansionPlannerMemory = () => ({
	campaign: createCampaign(true),
	stockpileSamples: {},
});

@assimilationLocked
@profile
export class ExpansionPlanner implements IExpansionPlanner {

	memory: ExpansionPlannerMemory;

	constructor() {
		this.memory = Mem.wrap(Memory, 'expansionPlanner', defaultExpansionPlannerMemory);
		this.recoverCampaignMemory();
	}

	refresh() {
		this.memory = Mem.wrap(Memory, 'expansionPlanner', defaultExpansionPlannerMemory);
		this.recoverCampaignMemory();
	}

	private recoverCampaignMemory(): void {
		if (!campaignMemoryIsValid(this.memory.campaign)) {
			this.memory.campaign = createCampaign(true);
		} else {
			this.memory.campaign.dryRun = true;
		}
		if (this.memory.stabilizingSince !== undefined
			&& (typeof this.memory.stabilizingSince != 'number' || !Number.isFinite(this.memory.stabilizingSince))) {
			this.memory.stabilizingSince = undefined;
		}
		this.sanitizeStockpileSamples();
	}

	private sanitizeStockpileSamples(): void {
		const rawSamples = (this.memory as any).stockpileSamples;
		if (!rawSamples || typeof rawSamples != 'object' || Array.isArray(rawSamples)) {
			this.memory.stockpileSamples = {};
			return;
		}
		const sanitized: {[roomName: string]: StockpileSample[]} = {};
		for (const roomName of Object.keys(rawSamples)) {
			if (!Array.isArray(rawSamples[roomName])) {
				continue;
			}
			const valid = _.filter(rawSamples[roomName], sample => sample && typeof sample == 'object'
				&& typeof sample.tick == 'number' && Number.isFinite(sample.tick)
				&& typeof sample.energy == 'number' && Number.isFinite(sample.energy)) as StockpileSample[];
			valid.sort((left, right) => left.tick - right.tick);
			const deduped: StockpileSample[] = [];
			for (const sample of valid) {
				const previous = deduped[deduped.length - 1];
				if (previous && previous.tick == sample.tick) {
					deduped[deduped.length - 1] = {tick: sample.tick, energy: sample.energy};
				} else {
					deduped.push({tick: sample.tick, energy: sample.energy});
				}
			}
			if (deduped.length > 0) {
				sanitized[roomName] = deduped;
			}
		}
		this.memory.stockpileSamples = sanitized;
	}

	private recordStockpileSamples(): void {
		if (Game.time % 25 != 0) {
			return;
		}
		for (const roomName in this.memory.stockpileSamples) {
			const samples = this.memory.stockpileSamples[roomName]
				.filter(sample => sample.tick >= Game.time - 500);
			if (samples.length == 0) {
				delete this.memory.stockpileSamples[roomName];
			} else {
				this.memory.stockpileSamples[roomName] = samples;
			}
		}
		for (const colony of getAllColonies()) {
			const roomName = colony.room.name;
			const samples = this.memory.stockpileSamples[roomName] || [];
			if (!samples.some(sample => sample.tick == Game.time)) {
				samples.push({
					tick: Game.time,
					energy: Energetics.stockpileBenchmark(colony).stockpile,
				});
			}
			this.memory.stockpileSamples[roomName] = samples;
		}
	}

	private stockpileTrend(roomName: string): number {
		const samples = this.memory.stockpileSamples[roomName] || [];
		if (samples.length < 2) {
			return 0;
		}
		const earliest = samples[0];
		const latest = samples[samples.length - 1];
		return (latest.energy - earliest.energy) / Math.max(1, latest.tick - earliest.tick);
	}

	private chooseNextColonyRoom(): ExpansionChoice | undefined {
		const possibleColonizers = _.filter(getAllColonies(), colony => colony.level >= MIN_COLONIZER_RCL);
		const possibleBestExpansions = _.compact(_.map(possibleColonizers, colony => {
			const expansion = this.getBestExpansionRoomFor(colony);
			return expansion ? {
				roomName: expansion.roomName,
				parentRoom: colony.room.name,
				score: expansion.score,
			} : undefined;
		}));
		return maxBy(possibleBestExpansions, choice => choice!.score);
	}

	private getBestExpansionRoomFor(colony: Colony): { roomName: string, score: number } | undefined {
		const allColonyRooms = _.zipObject(_.map(getAllColonies(),
												 col => [col.room.name, true])) as { [roomName: string]: boolean };
		const allOwnedMinerals = _.map(getAllColonies(), col => col.room.mineral!.mineralType) as MineralConstant[];
		let bestRoom: string = '';
		let bestScore: number = -Infinity;
		for (const roomName in colony.memory.expansionData.possibleExpansions) {
			let score = colony.memory.expansionData.possibleExpansions[roomName] as number | boolean;
			if (typeof score != 'number') continue;
			// Compute modified score
			if (score + MAX_SCORE_BONUS > bestScore) {
				// Is the room too close to an existing colony?
				const range2Rooms = Cartographer.findRoomsInRange(roomName, MIN_EXPANSION_DISTANCE);
				if (_.any(range2Rooms, roomName => allColonyRooms[roomName])) {
					continue; // too close to another colony
				}
				const range3Rooms = Cartographer.findRoomsInRange(roomName, MIN_EXPANSION_DISTANCE + 1);
				if (_.any(range3Rooms, roomName => allColonyRooms[roomName])) {
					score -= TOO_CLOSE_PENALTY;
				}
				// Are there powerful hostile rooms nearby?
				const adjacentRooms = Cartographer.findRoomsInRange(roomName, 1);
				if (_.any(adjacentRooms, roomName => Memory.rooms[roomName] && Memory.rooms[roomName][RMEM.AVOID])) {
					continue;
				}
				// Reward new minerals and catalyst rooms
				const mineralType = Memory.rooms[roomName][RMEM.MINERAL]
									? Memory.rooms[roomName][RMEM.MINERAL]![RMEM_MNRL.MINERALTYPE]
									: undefined;
				if (mineralType) {
					if (!allOwnedMinerals.includes(mineralType)) {
						score += UNOWNED_MINERAL_BONUS;
					}
					if (mineralType == RESOURCE_CATALYST) {
						score += CATALYST_BONUS;
					}
				}
				// Update best choices
				const targetStatus = Game.map.getRoomStatus(roomName).status;
				const parentStatus = Game.map.getRoomStatus(colony.room.name).status;
				if (score > bestScore && targetStatus == parentStatus) {
					bestScore = score;
					bestRoom = roomName;
				}
			}
		}
		if (bestRoom != '') {
			return {roomName: bestRoom, score: bestScore};
		}
	}

	private intelIsFresh(roomName: string, maximumAge: number): boolean {
		return intelTimestampIsFresh(RoomIntel.lastVisible(roomName), Game.time, maximumAge);
	}

	private roomIsDangerous(roomName: string, intelFresh: boolean): boolean {
		const room = Game.rooms[roomName];
		const roomMemory = Memory.rooms[roomName];
		const safety = roomMemory && roomMemory[RMEM.SAFETY];
		const controller = room && room.controller;
		const controllerInfo = !room ? RoomIntel.getControllerInfo(roomName) : undefined;
		const owner = controller && controller.owner ? controller.owner.username
			: controllerInfo && controllerInfo.owner;
		const reservation = controller && controller.reservation ? controller.reservation.username
			: controllerInfo && controllerInfo.reservation && controllerInfo.reservation.username;
		return routeRoomIsDangerous({
			intelFresh,
			avoid: !!(roomMemory && roomMemory[RMEM.AVOID]),
			owner,
			reservation,
			unsafeFor: safety && safety[RMEM_SAFETY.UNSAFE_FOR],
			visibleDangerousHostiles: !!(room && room.dangerousHostiles.length > 0),
			threatLevel: safety && safety[RMEM_SAFETY.THREAT_LEVEL],
		}, MY_USERNAME);
	}

	private targetIsValid(roomName: string, intelFresh: boolean, phase: CampaignPhase): boolean {
		if (!intelFresh || !RoomIntel.isRoomAccessible(roomName)) {
			return false;
		}
		const room = Game.rooms[roomName];
		if (room) {
			const controller = room.controller;
			const owner = controller && controller.owner ? controller.owner.username : undefined;
			const reservation = controller && controller.reservation ? controller.reservation.username : undefined;
			return !!controller && targetOwnershipIsValid(phase, owner, reservation, MY_USERNAME);
		}
		const controller = RoomIntel.getControllerInfo(roomName);
		return !!controller && targetOwnershipIsValid(phase, controller.owner,
			controller.reservation && controller.reservation.username, MY_USERNAME);
	}

	private creepHasActiveEvidence(creep: Creep, targetRoomName: string): boolean {
		if (creep.spawning || creep.memory[MEM.COLONY] != targetRoomName) {
			return false;
		}
		const overlordRef = creep.memory[MEM.OVERLORD];
		const overlord = overlordRef ? Overmind.overlords[overlordRef] : undefined;
		const activeOperation = !!(overlord && overlord.colony && overlord.colony.name == targetRoomName);
		return !!creep.memory.task || activeOperation;
	}

	private creepHasTaskInRoom(creep: Creep, taskName: string, roomName: string): boolean {
		let task = creep.memory.task;
		while (task) {
			if (task.name == taskName && task._target && task._target._pos
				&& task._target._pos.roomName == roomName) {
				return true;
			}
			task = task._parent;
		}
		return false;
	}

	private visibleMilestoneEvidence(targetRoomName: string | undefined): {
		claimed: boolean;
		firstHarvest: boolean;
		spawnSitePlaced: boolean;
		spawnComplete: boolean;
		localMinerHauler: boolean;
		netEnergyNonNegative: boolean;
	} {
		const empty = {
			claimed: false,
			firstHarvest: false,
			spawnSitePlaced: false,
			spawnComplete: false,
			localMinerHauler: false,
			netEnergyNonNegative: false,
		};
		if (!targetRoomName) {
			return empty;
		}
		const room = Game.rooms[targetRoomName];
		if (!room || !room.controller || !room.controller.my) {
			return empty;
		}
		const roomCreeps = room.find(FIND_MY_CREEPS);
		const activeMiners = _.filter(roomCreeps, creep => creep.memory.role == Roles.drone
			&& creep.getActiveBodyparts(WORK) > 0 && this.creepHasActiveEvidence(creep, targetRoomName));
		const activePioneers = _.filter(roomCreeps, creep => creep.memory.role == Roles.pioneer
			&& !creep.spawning && creep.getActiveBodyparts(WORK) > 0
			&& this.creepHasTaskInRoom(creep, 'harvest', targetRoomName));
		const activeHaulers = _.filter(roomCreeps, creep => creep.memory.role == Roles.transport
			&& creep.getActiveBodyparts(CARRY) > 0 && this.creepHasActiveEvidence(creep, targetRoomName));
		const depletedSources = _.filter(room.sources, source => source.energy < source.energyCapacity);
		const harvesters = activeMiners.concat(activePioneers);
		const firstHarvest = _.any(harvesters,
			miner => _.any(depletedSources, source => miner.pos.getRangeTo(source.pos) <= 1));
		const samples = this.memory.stockpileSamples[targetRoomName] || [];
		const spawnSites = _.filter(room.constructionSites, site => site.structureType == STRUCTURE_SPAWN);
		return {
			claimed: true,
			firstHarvest,
			spawnSitePlaced: spawnMilestonePlaced(room.spawns.length, spawnSites.length),
			spawnComplete: room.spawns.length > 0,
			localMinerHauler: activeMiners.length > 0 && activeHaulers.length > 0,
			netEnergyNonNegative: hasRecentNonNegativeTrend(samples, Game.time),
		};
	}

	private updateStabilizationEvidence(): void {
		const campaign = this.memory.campaign;
		if (campaign.phase != 'stabilize') {
			this.memory.stabilizingSince = undefined;
			return;
		}
		const evidence = this.visibleMilestoneEvidence(campaign.targetRoom);
		const room = campaign.targetRoom ? Game.rooms[campaign.targetRoom] : undefined;
		const stable = evidence.claimed && evidence.firstHarvest && evidence.spawnComplete
			&& evidence.localMinerHauler && evidence.netEnergyNonNegative
			&& !!room && room.dangerousHostiles.length == 0;
		this.memory.stabilizingSince = nextStabilizingSince(this.memory.stabilizingSince, stable, Game.time);
	}

	private ensureCampaignEscrow(parent: Colony | undefined): void {
		const campaign = this.memory.campaign;
		if (!parent || !campaign.parentRoom
			|| campaign.escrowEnergy > 0
			&& campaign.escrowSpawnTicks > 0
			&& campaign.remainingEscrowEnergy > 0) {
			return;
		}
		const claimerSetup = parent.level > 4 ? Setups.infestors.fastClaim : Setups.infestors.claim;
		const claimerBody = claimerSetup.generateBody(parent.room.energyCapacityAvailable);
		const pioneerBody = Setups.pioneer.generateBody(parent.room.energyCapacityAvailable);
		if (claimerBody.length == 0 || pioneerBody.length == 0) {
			return;
		}
		const estimate = conservativeEscrowEstimate(bodyCost(claimerBody), claimerBody.length,
			bodyCost(pioneerBody), pioneerBody.length, CREEP_SPAWN_TIME);
		campaign.escrowEnergy = estimate.energy;
		campaign.escrowSpawnTicks = estimate.spawnTicks;
		campaign.remainingEscrowEnergy = estimate.energy;
	}

	private campaignSnapshot(): CampaignSnapshot {
		const campaign = this.memory.campaign;
		const colonies = getAllColonies();
		const ownedRooms = colonies.length;
		const underConfiguredCap = ownedRooms < MAX_OWNED_ROOMS
			&& (Game.shard.name != 'shard3' || ownedRooms < SHARD3_MAX_OWNED_ROOMS);
		const gclAvailable = ownedRooms < Game.gcl.level && underConfiguredCap;
		const choice = campaign.phase == 'discover' && gclAvailable ? this.chooseNextColonyRoom() : undefined;
		const parentRoomName = campaign.parentRoom || (choice && choice.parentRoom);
		const targetRoomName = campaign.targetRoom || (choice && choice.roomName);
		const parent = _.find(colonies, colony => colony.room.name == parentRoomName);
		this.ensureCampaignEscrow(parent);

		const benchmark = parent ? Energetics.stockpileBenchmark(parent) : undefined;
		const targetRoom = targetRoomName ? Game.rooms[targetRoomName] : undefined;
		const intelFresh = !!targetRoomName && this.intelIsFresh(targetRoomName, TARGET_INTEL_FRESHNESS);
		const targetValid = !!targetRoomName && this.targetIsValid(targetRoomName, intelFresh, campaign.phase);

		let routeReachable = false;
		let routeFresh = false;
		let routeRooms: string[] = [];
		if (parent && targetRoomName && Game.cpu.bucket >= CAMPAIGN_POLICY.minimumCpuBucket) {
			const origin = parent.spawns.length > 0 ? parent.spawns[0].pos : parent.controller.pos;
			const route = Pathing.findPathToRoom(origin, targetRoomName);
			routeReachable = !route.incomplete && route.path.length <= MAX_CAMPAIGN_PATH_TILES;
			routeRooms = _.unique([parent.room.name, targetRoomName]
				.concat(_.map(route.path, pos => pos.roomName)));
			routeFresh = routeReachable
				&& _.all(routeRooms, roomName => this.intelIsFresh(roomName, ROUTE_INTEL_FRESHNESS));
		}

		let dangerousHostiles = !targetRoomName || this.roomIsDangerous(targetRoomName, intelFresh);
		if (!dangerousHostiles && routeRooms.length > 0) {
			dangerousHostiles = _.any(routeRooms, roomName => this.roomIsDangerous(roomName,
				this.intelIsFresh(roomName, ROUTE_INTEL_FRESHNESS)));
		}

		const evidence = this.visibleMilestoneEvidence(targetRoomName);
		const stabilizedFor = this.memory.stabilizingSince === undefined
			? 0
			: Game.time - this.memory.stabilizingSince;

		let spawnUtilization = 1;
		let spawnUtilizationObserved = false;
		const hatcheryUptime = parent && parent.hatchery ? parent.hatchery.memory.stats.uptime : undefined;
		const statsUptime = parentRoomName && Memory.stats.colonies && Memory.stats.colonies[parentRoomName]
			&& Memory.stats.colonies[parentRoomName].hatchery
			? Memory.stats.colonies[parentRoomName].hatchery.uptime
			: undefined;
		if (typeof hatcheryUptime == 'number' && Number.isFinite(hatcheryUptime)) {
			spawnUtilization = hatcheryUptime;
			spawnUtilizationObserved = true;
		} else if (typeof statsUptime == 'number' && Number.isFinite(statsUptime)) {
			spawnUtilization = statsUptime;
			spawnUtilizationObserved = true;
		}
		const spawnCapacityAvailable = !!parent && spawnUtilizationObserved
			&& spawnCapacitySupportsEscrow(parent.spawns.length, spawnUtilization,
				CAMPAIGN_POLICY.claimDeadline, campaign.escrowSpawnTicks);

		const remainingEscrow = campaign.remainingEscrowEnergy;
		const escrowAffordable = !!benchmark && remainingEscrow > 0
			&& benchmark.stockpile >= benchmark.reserveFloor + remainingEscrow;

		return {
			now: Game.time,
			candidateAvailable: !!choice,
			candidateRoom: choice && choice.roomName,
			parentRoom: choice && choice.parentRoom,
			intelFresh,
			routeFresh,
			targetValid,
			parentState: benchmark ? benchmark.state : 'critical',
			reserveRatio: benchmark ? benchmark.ratio : 0,
			stockpileTrend: parentRoomName ? this.stockpileTrend(parentRoomName) : 0,
			escrowAffordable,
			spawnUtilization,
			spawnCapacityAvailable,
			cpuBucket: Game.cpu.bucket,
			probeComplete: !!targetRoom && routeReachable && routeFresh,
			claimed: evidence.claimed,
			firstHarvest: evidence.firstHarvest,
			spawnSitePlaced: evidence.spawnSitePlaced,
			spawnComplete: evidence.spawnComplete,
			localMinerHauler: evidence.localMinerHauler,
			netEnergyNonNegative: evidence.netEnergyNonNegative,
			stabilizedFor,
			dangerousHostiles,
			routeLost: !routeReachable || !routeFresh,
			gclAvailable,
			cpuSupportsColony: Game.cpu.bucket >= CAMPAIGN_POLICY.minimumCpuBucket && underConfiguredCap,
		};
	}

	private runCampaignDryRun(): void {
		const before = this.memory.campaign;
		const result = transitionCampaign(before, this.campaignSnapshot());
		result.campaign.dryRun = true;
		this.memory.campaign = result.campaign;
		this.memory.lastDecision = {
			tick: Game.time,
			phase: result.campaign.phase,
			actions: result.actions,
			reason: result.campaign.failureReason,
		};
		if (shouldLogCampaignDecision(before.phase, result.campaign.phase, result.actions)) {
			log.alert(`[expansion dry-run] ${before.phase} -> ${result.campaign.phase} `
				+ `${JSON.stringify(result.actions)}`);
		}
	}

	init(): void {

	}

	run(): void {
		this.recordStockpileSamples();
		this.updateStabilizationEvidence();
		if (Game.time % CHECK_EXPANSION_FREQUENCY == 17 && getAutonomyLevel() == Autonomy.Automatic) {
			this.runCampaignDryRun();
		}
	}

}
