import {Colony, ColonyStage} from '../Colony';

/**
 * Energetics manager; makes high-level decisions based on energy amounts
 */
export type StockpileState = 'critical' | 'saving' | 'balanced' | 'surplus' | 'capped';

export interface StockpileBenchmark {
	state: StockpileState;
	stockpile: number;
	reserveFloor: number;
	ratio: number;
	spendFactor: number;
}

export class Energetics {

	static settings = {
		storage : {
			total : {
				cap      : STORAGE_CAPACITY - 100000,
				tolerance: 5000,
			},
			energy: {
				destroyTerminalThreshold: 200000	// won't rebuild terminal until you have this much energy in storage
			}
		},
		terminal: {
			total : {
				cap: TERMINAL_CAPACITY - 50000
			},
			energy: {
				sendSize    : 25000,	// Send energy in chunks of this size
				inThreshold : 25000, 	// Terminals with < this amount of energy in room actively store energy
				outThreshold: 100000,	// Terminals with more than this amount of energy in store send elsewhere
				equilibrium : 50000, 	// Try to maintain this amount; should be energyInThreshold + 2*energySendSize
				tolerance   : 5000,		// Don't care about deviation by less than this amount
				tradeAmount : 10000,	// Buy/sell energy in increments of this amount
			},
		},
		stockpile: {
			pipelineTicks       : 150,
			emergencyTowerEnergy: 1000,
			buildBacklogRatio   : 0.25,
			maxBuildBufferTicks : 1000,
			fallbackFloorByLevel: {
				1: 0,
				2: 0,
				3: 5000,
				4: 20000,
				5: 50000,
				6: 100000,
				7: 200000,
				8: 300000,
			},
		},
	};

	static lowPowerMode(colony: Colony): boolean {
		if (colony.stage == ColonyStage.Adult) {
			if (_.sum(colony.storage!.store) > this.settings.storage.total.cap &&
				colony.terminal && _.sum(colony.terminal.store) > this.settings.terminal.total.cap) {
				return true;
			}
		}
		return false;
	}

	static stockpileBenchmark(colony: Colony): StockpileBenchmark {
		const storageEnergy = colony.storage ? colony.storage.store.energy || 0 : 0;
		const terminalEnergy = colony.terminal ? colony.terminal.store.energy || 0 : 0;
		const stockpile = storageEnergy + terminalEnergy;

		const creepReplacementCost = _.sum(colony.creeps,
			creep => _.sum(creep.body, part => BODYPART_COST[part.type] || 0));
		const estimatedIncome = _.sum(_.map(colony.miningSites, site => {
			const overlord = site.overlords.mine;
			if (overlord.isSuspended || overlord.miners.length == 0) return 0;
			const miningPowerAssigned = _.sum(overlord.miners, miner => miner.getActiveBodyparts(WORK));
			const saturation = Math.min(miningPowerAssigned / overlord.miningPowerNeeded, 1);
			return overlord.energyPerTick * saturation;
		}));
		const pipelineBuffer = estimatedIncome * Energetics.settings.stockpile.pipelineTicks;
		const emergencyRepairBuffer = colony.towers.length * Energetics.settings.stockpile.emergencyTowerEnergy;
		const constructionBacklog = _.sum(colony.constructionSites,
			site => Math.max(site.progressTotal - site.progress, 0));
		const maxBuildBuffer = estimatedIncome * Energetics.settings.stockpile.maxBuildBufferTicks;
		const plannedBuildBuffer = Math.min(constructionBacklog * Energetics.settings.stockpile.buildBacklogRatio,
			maxBuildBuffer);
		const adaptiveFloor = creepReplacementCost + pipelineBuffer + emergencyRepairBuffer + plannedBuildBuffer;
		const fallbackFloor = Energetics.settings.stockpile.fallbackFloorByLevel[colony.level];
		const reserveFloor = Math.max(adaptiveFloor, fallbackFloor);
		const ratio = reserveFloor > 0 ? stockpile / reserveFloor : Infinity;

		let state: StockpileState;
		let spendFactor: number;
		if (stockpile >= Energetics.settings.storage.total.cap) {
			state = 'capped';
			spendFactor = 1.5;
		} else if (ratio < 0.5) {
			state = 'critical';
			spendFactor = 0;
		} else if (ratio < 1) {
			state = 'saving';
			spendFactor = 0.35;
		} else if (ratio < 2) {
			state = 'balanced';
			spendFactor = 1;
		} else {
			state = 'surplus';
			spendFactor = 1.2;
		}

		return {state, stockpile, reserveFloor, ratio, spendFactor};
	}

}
