# Adaptive Stockpile Governor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one adaptive energy-reserve benchmark that lets colony spenders preserve stable stockpile before doing optional work.

**Architecture:** Extend `Energetics` with a cheap per-tick stockpile assessment derived from current stored energy, creep replacement cost, estimated income, emergency defense buffer, and construction backlog. Wire first consumer into `WorkerOverlord` so discretionary worker demand falls when reserve ratio is weak, without changing spawn, road, or planner behavior yet.

**Tech Stack:** TypeScript Screeps bot, Overmind colony objects, lodash globals, `npm run build` for verification.

---

### Task 1: Add Adaptive Stockpile Benchmark

**Files:**
- Modify: `src/logistics/Energetics.ts`
- Verify: `npm run build`

- [ ] **Step 1: Add state types and settings**

Add these exports above `export class Energetics`:

```ts
export type StockpileState = 'critical' | 'saving' | 'balanced' | 'surplus' | 'capped';

export interface StockpileBenchmark {
	state: StockpileState;
	stockpile: number;
	reserveFloor: number;
	ratio: number;
	spendFactor: number;
}
```

Extend `Energetics.settings` with:

```ts
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
```

- [ ] **Step 2: Implement benchmark helper**

Add this static method below `lowPowerMode()`:

```ts
	static stockpileBenchmark(colony: Colony): StockpileBenchmark {
		const storageEnergy = colony.storage ? colony.storage.store.energy || 0 : 0;
		const terminalEnergy = colony.terminal ? colony.terminal.store.energy || 0 : 0;
		const stockpile = storageEnergy + terminalEnergy;

		const creepReplacementCost = _.sum(colony.creeps, creep => _.sum(creep.body, part => BODYPART_COST[part.type] || 0));
		const estimatedIncome = _.sum(_.map(colony.miningSites, site => {
			const overlord = site.overlords.mine;
			if (overlord.isSuspended || overlord.miners.length == 0) return 0;
			const miningPowerAssigned = _.sum(overlord.miners, miner => miner.getActiveBodyparts(WORK));
			const saturation = Math.min(miningPowerAssigned / overlord.miningPowerNeeded, 1);
			return overlord.energyPerTick * saturation;
		}));
		const pipelineBuffer = estimatedIncome * Energetics.settings.stockpile.pipelineTicks;
		const emergencyRepairBuffer = colony.towers.length * Energetics.settings.stockpile.emergencyTowerEnergy;
		const constructionBacklog = _.sum(colony.constructionSites, site => Math.max(site.progressTotal - site.progress, 0));
		const maxBuildBuffer = estimatedIncome * Energetics.settings.stockpile.maxBuildBufferTicks;
		const plannedBuildBuffer = Math.min(constructionBacklog * Energetics.settings.stockpile.buildBacklogRatio, maxBuildBuffer);
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
```

- [ ] **Step 3: Build verify**

Run: `npm run build`

Expected: TypeScript compile succeeds.

### Task 2: Apply Governor To Worker Demand

**Files:**
- Modify: `src/overlords/core/worker.ts`
- Verify: `npm run build`

- [ ] **Step 1: Import `Energetics`**

Add import near other imports:

```ts
import {Energetics} from '../../logistics/Energetics';
```

- [ ] **Step 2: Scale mature worker count by stockpile**

Inside `wishlistWorkers()`, in the non-`Larva` branch after `numWorkers = $.number(...)` block and before `if (this.useBoostedRepair)`, add:

```ts
				const stockpile = Energetics.stockpileBenchmark(this.colony);
				if (this.nukeDefenseRamparts.length == 0 && this.colony.controller.ticksToDowngrade > 2000) {
					numWorkers = Math.ceil(numWorkers * stockpile.spendFactor);
					if (stockpile.state == 'saving') {
						numWorkers = Math.min(numWorkers, 1);
					} else if (stockpile.state == 'critical') {
						numWorkers = 0;
					}
				}
```

This preserves nuke defense and controller emergency work while reducing optional build/repair/fortify energy draw.

- [ ] **Step 3: Build verify**

Run: `npm run build`

Expected: TypeScript compile succeeds.

### Task 3: Review Diff And Deployment Note

**Files:**
- Inspect: `src/logistics/Energetics.ts`
- Inspect: `src/overlords/core/worker.ts`

- [ ] **Step 1: Inspect diff**

Run: `git diff -- src/logistics/Energetics.ts src/overlords/core/worker.ts`

Expected: only adaptive stockpile helper and worker scaling changed.

- [ ] **Step 2: Final build**

Run: `npm run build`

Expected: TypeScript compile succeeds and `main.js` updates in worktree.

- [ ] **Step 3: Deployment note**

Because implementation happens in isolated worktree, copy or merge changes back to `/home/jin/.config/Screeps/scripts` before relying on Screeps client auto-sync.

---

## Self-Review

- Spec coverage: plan implements adaptive benchmark and first consumer only; later road, upgrade, and room-planner consumers remain deliberate future micro-changes.
- Placeholder scan: no placeholders, no unspecified code paths.
- Type consistency: `StockpileBenchmark`, `StockpileState`, and `Energetics.stockpileBenchmark()` names match all use sites.
