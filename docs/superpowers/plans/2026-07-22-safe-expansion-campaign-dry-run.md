# Safe Expansion Campaign Dry-Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-shot expansion decisions with a persistent, testable campaign state machine running in dry-run mode without creating flags, spawning, claiming, constructing, or unclaiming.

**Architecture:** Add a pure `ExpansionCampaign` transition engine with no Screeps globals, then adapt `ExpansionPlanner` game state into immutable snapshots. Persist campaign state in `Memory.expansionPlanner`, record stockpile trend samples, and log proposed actions while `dryRun` remains true. Existing colonization side effects are disabled during this rollout stage.

**Tech Stack:** TypeScript 5.3, Screeps globals, existing `Mem`, `Energetics`, `ExpansionPlanner`, Node built-in `assert`, direct TypeScript compilation for pure tests, `npm run build`, `npm run lint`.

---

## File Structure

- Create `src/strategy/ExpansionCampaign.ts`: pure campaign types, policy, transition function, cooldown calculation.
- Create `tests/ExpansionCampaign.test.ts`: executable Node assertions for safety invariants.
- Modify `src/strategy/ExpansionPlanner.ts`: campaign memory defaults, snapshot adapter, stockpile trend sampling, dry-run execution and logging.
- Modify `src/declarations/memory.d.ts`: typed `expansionPlanner` memory entry.
- Modify `docs/superpowers/specs/2026-07-22-safe-autonomous-expansion-design.md`: record stage-1 implementation boundary if implementation reveals changed constraints.

### Task 1: Pure Campaign State Machine

**Files:**
- Create: `src/strategy/ExpansionCampaign.ts`
- Create: `tests/ExpansionCampaign.test.ts`

- [ ] **Step 1: Write failing transition tests**

Create `tests/ExpansionCampaign.test.ts`:

```ts
import * as assert from 'assert';
import {
	CampaignAction,
	CampaignMemory,
	CampaignSnapshot,
	createCampaign,
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

let campaign = createCampaign(true);
let result = transitionCampaign(campaign, snapshot());
assert.strictEqual(result.campaign.phase, 'validate');
assert.deepStrictEqual(result.actions, [CampaignAction.None]);

campaign = {...result.campaign, phase: 'escrow'};
result = transitionCampaign(campaign, snapshot({reserveRatio: 0.4, parentState: 'critical'}));
assert.strictEqual(result.campaign.phase, 'abandon');
assert.ok(result.actions.includes(CampaignAction.WouldAbandon));

campaign = {...createCampaign(true), phase: 'validate', targetRoom: 'W1N1', parentRoom: 'W0N0'};
result = transitionCampaign(campaign, snapshot({intelFresh: false}));
assert.strictEqual(result.campaign.phase, 'validate');
assert.ok(result.actions.includes(CampaignAction.WouldProbe));

campaign = {...createCampaign(true), phase: 'escrow', targetRoom: 'W1N1', parentRoom: 'W0N0'};
result = transitionCampaign(campaign, snapshot());
assert.strictEqual(result.campaign.phase, 'probe');
assert.ok(result.actions.includes(CampaignAction.ReserveEscrow));

campaign = {...createCampaign(true), phase: 'probe', targetRoom: 'W1N1', parentRoom: 'W0N0'};
result = transitionCampaign(campaign, snapshot({probeComplete: true}));
assert.strictEqual(result.campaign.phase, 'claim');
assert.ok(result.actions.includes(CampaignAction.WouldClaim));

campaign = {
	...createCampaign(true),
	phase: 'bootstrap',
	targetRoom: 'W1N1',
	parentRoom: 'W0N0',
	phaseStartedAt: 0,
	lastProgressAt: 0,
	reinforcementUsed: true,
};
result = transitionCampaign(campaign, snapshot({now: 3000}));
assert.strictEqual(result.campaign.phase, 'abandon');
assert.ok(result.actions.includes(CampaignAction.WouldAbandon));

campaign = {
	...createCampaign(true),
	phase: 'stabilize',
	targetRoom: 'W1N1',
	parentRoom: 'W0N0',
};
result = transitionCampaign(campaign, snapshot({stabilizedFor: 1500}));
assert.strictEqual(result.campaign.phase, 'independent');
assert.ok(result.actions.includes(CampaignAction.Complete));

const established: CampaignMemory = {
	...createCampaign(true),
	phase: 'independent',
	targetRoom: 'W1N1',
	parentRoom: 'W0N0',
};
result = transitionCampaign(established, snapshot({parentState: 'critical'}));
assert.strictEqual(result.campaign.phase, 'independent');
assert.ok(!result.actions.includes(CampaignAction.WouldUnclaim));

console.log('ExpansionCampaign tests passed');
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
rm -rf /tmp/opencode/expansion-campaign-test && npx tsc tests/ExpansionCampaign.test.ts src/strategy/ExpansionCampaign.ts --module commonjs --target es2017 --strict --esModuleInterop --outDir /tmp/opencode/expansion-campaign-test && node /tmp/opencode/expansion-campaign-test/tests/ExpansionCampaign.test.js
```

Expected: FAIL because `src/strategy/ExpansionCampaign.ts` does not exist.

- [ ] **Step 3: Implement pure campaign engine**

Create `src/strategy/ExpansionCampaign.ts` with these public contracts:

```ts
export type CampaignPhase = 'discover' | 'validate' | 'escrow' | 'probe' | 'claim'
	| 'bootstrap' | 'stabilize' | 'independent' | 'abandon' | 'cooldown';

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
	deadline: number;
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
```

Implement these functions without reading Screeps globals:

```ts
export function createCampaign(dryRun = true): CampaignMemory;
export function failureCooldown(failures: number): number;
export function transitionCampaign(campaign: CampaignMemory, snapshot: CampaignSnapshot): CampaignTransition;
```

Transition rules:

```text
independent: remain independent; never emit WouldAbandon or WouldUnclaim
discover: candidate -> validate and copy parent/target; otherwise remain
validate: stale intel/route -> WouldProbe and remain; invalid -> abandon; valid -> escrow
escrow: critical parent -> abandon; saving/weak trend/unfunded/high spawn/low CPU -> remain; ready -> probe + ReserveEscrow
probe: changed danger/route/validity -> abandon; incomplete -> WouldProbe; complete -> claim + WouldClaim
claim: critical parent/deadline -> abandon; claimed -> bootstrap; otherwise WouldClaim
bootstrap: update milestone progress; critical/danger/route loss -> abandon; complete local flow -> stabilize; deadline -> one WouldReinforce then abandon after extension
stabilize: critical/danger/route loss -> abandon; stable window -> independent + Complete
abandon: emit WouldAbandon and WouldUnclaim only when target is claimed and campaign never reached independent; then cooldown
cooldown: after room cooldown expires reset to discover
```

`transitionCampaign` must clone the campaign object before modification so callers can compare old and new state.

- [ ] **Step 4: Run tests to verify pass**

Run the direct compile-and-test command from Step 2.

Expected: `ExpansionCampaign tests passed`.

- [ ] **Step 5: Run project build**

Run: `npm run build`

Expected: TypeScript compile succeeds.

### Task 2: Persistent Campaign Memory And Stockpile Trend

**Files:**
- Modify: `src/strategy/ExpansionPlanner.ts`
- Modify: `src/declarations/memory.d.ts`
- Test: `tests/ExpansionCampaign.test.ts`

- [ ] **Step 1: Add trend assertions**

Extend `tests/ExpansionCampaign.test.ts` to assert escrow does not advance with zero or negative trend:

```ts
campaign = {...createCampaign(true), phase: 'escrow', targetRoom: 'W1N1', parentRoom: 'W0N0'};
result = transitionCampaign(campaign, snapshot({stockpileTrend: 0}));
assert.strictEqual(result.campaign.phase, 'escrow');
assert.deepStrictEqual(result.actions, [CampaignAction.None]);
```

Run direct test command.

Expected: PASS because pure engine already enforces positive trend; if it fails, fix `transitionCampaign` before integration.

- [ ] **Step 2: Define planner memory**

In `ExpansionPlanner.ts`, replace empty `ExpansionPlannerMemory` with:

```ts
interface StockpileSample {
	tick: number;
	energy: number;
}

interface ExpansionPlannerMemory {
	campaign: CampaignMemory;
	stockpileSamples: {[roomName: string]: StockpileSample[]};
	lastDecision?: {
		tick: number;
		phase: CampaignPhase;
		actions: CampaignAction[];
		reason?: string;
	};
}
```

Update default memory:

```ts
const defaultExpansionPlannerMemory: () => ExpansionPlannerMemory = () => ({
	campaign: createCampaign(true),
	stockpileSamples: {},
});
```

Add the campaign imports from `./ExpansionCampaign`.

- [ ] **Step 3: Type global memory**

Add to `Memory` in `src/declarations/memory.d.ts`:

```ts
	expansionPlanner: any;
```

Use `any` here to match existing global manager memory declarations; keep strong typing inside `ExpansionPlanner.ts`.

- [ ] **Step 4: Add trend sampling**

Add methods to `ExpansionPlanner`:

```ts
private recordStockpileSamples(): void;
private stockpileTrend(roomName: string): number;
```

Behavior:

- Record every `25` ticks.
- Keep samples from last `500` ticks.
- Energy comes from `Energetics.stockpileBenchmark(colony).stockpile`.
- Trend is `(latest.energy - earliest.energy) / max(1, latest.tick - earliest.tick)`.
- Fewer than two samples returns `0`.

Call `recordStockpileSamples()` from `run()` before campaign cadence check.

- [ ] **Step 5: Build and lint**

Run:

```bash
npm run build && npx tslint "src/strategy/ExpansionCampaign.ts" "src/strategy/ExpansionPlanner.ts" --format stylish
```

Expected: build succeeds and targeted lint reports no violations.

### Task 3: Dry-Run Snapshot Adapter

**Files:**
- Modify: `src/strategy/ExpansionPlanner.ts`

- [ ] **Step 1: Add candidate selection without side effects**

Refactor existing `chooseNextColonyRoom()` to return:

```ts
interface ExpansionChoice {
	roomName: string;
	parentRoom: string;
	score: number;
}
```

`getBestExpansionRoomFor()` remains score source. The refactor must not call `DirectiveColonize.createIfNotPresent`.

- [ ] **Step 2: Add snapshot builder**

Add:

```ts
private campaignSnapshot(): CampaignSnapshot;
```

Populate snapshot using current game state:

- candidate from side-effect-free selection;
- parent benchmark from `Energetics.stockpileBenchmark(parent)`;
- trend from stored samples;
- intel freshness from `RoomIntel` memory timestamps when available;
- target validity from controller ownership/reservation and `RoomIntel.isRoomAccessible`;
- route freshness/reachability from `Pathing.findPathToRoom` only under CPU bucket gate;
- `probeComplete` true only with visible target and current route validation;
- claim/bootstrap fields from visible target room and campaign creeps;
- spawn utilization from parent hatchery uptime metric when present, otherwise `1` to fail closed;
- `gclAvailable` from owned room count versus `Game.gcl.level` and configured room cap;
- `cpuSupportsColony` from bucket and shard room cap;
- `escrowAffordable` from `stockpile >= reserveFloor + remainingEscrowEnergy`;
- dangerous hostiles and route loss fail closed when intel is stale.

No snapshot code may create flags, construction sites, spawn requests, claims, or unclaims.

- [ ] **Step 3: Replace one-shot expansion call**

Replace `handleExpansion()` side effects with:

```ts
private runCampaignDryRun(): void {
	const before = this.memory.campaign;
	const result = transitionCampaign(before, this.campaignSnapshot());
	this.memory.campaign = result.campaign;
	this.memory.lastDecision = {
		tick: Game.time,
		phase: result.campaign.phase,
		actions: result.actions,
		reason: result.campaign.failureReason,
	};
	if (before.phase != result.campaign.phase || _.any(result.actions, action => action != CampaignAction.None)) {
		log.alert(`[expansion dry-run] ${before.phase} -> ${result.campaign.phase} ${JSON.stringify(result.actions)}`);
	}
}
```

Keep campaign execution cadence at `CHECK_EXPANSION_FREQUENCY`, but run stockpile sampling every `25` ticks.

Remove the automatic call to `DirectiveColonize.createIfNotPresent` from this stage. Remove now-unused `DirectiveColonize` import only after build confirms no remaining use.

- [ ] **Step 4: Add corruption recovery**

During constructor and refresh, if campaign memory lacks a valid phase, replace only `memory.campaign` with `createCampaign(true)`. Do not remove directives, flags, colonies, or controllers.

- [ ] **Step 5: Build and lint**

Run:

```bash
npm run build && npx tslint "src/strategy/ExpansionCampaign.ts" "src/strategy/ExpansionPlanner.ts" --format stylish
```

Expected: build succeeds and targeted lint reports no violations.

### Task 4: Dry-Run Safety Verification

**Files:**
- Inspect: `src/strategy/ExpansionCampaign.ts`
- Inspect: `src/strategy/ExpansionPlanner.ts`
- Inspect: `tests/ExpansionCampaign.test.ts`
- Inspect: `src/declarations/memory.d.ts`

- [ ] **Step 1: Run pure transition tests**

Run:

```bash
rm -rf /tmp/opencode/expansion-campaign-test && npx tsc tests/ExpansionCampaign.test.ts src/strategy/ExpansionCampaign.ts --module commonjs --target es2017 --strict --esModuleInterop --outDir /tmp/opencode/expansion-campaign-test && node /tmp/opencode/expansion-campaign-test/tests/ExpansionCampaign.test.js
```

Expected: `ExpansionCampaign tests passed`.

- [ ] **Step 2: Verify forbidden side effects are absent**

Search changed campaign files for:

```text
createIfNotPresent
createConstructionSite
spawnCreep
claimController
unclaim
suicide
```

Expected: no matches in `ExpansionCampaign.ts`; no active side-effect calls in the dry-run path of `ExpansionPlanner.ts`.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run build && npx tslint "src/strategy/ExpansionCampaign.ts" "src/strategy/ExpansionPlanner.ts" --format stylish
```

Expected: build succeeds and targeted lint reports no violations.

Run: `npm run lint`

Expected baseline: command exits non-zero because TSLint 5 rules call removed TypeScript 5 APIs and existing violations remain in `upgradeSite.ts`, `DynamicPlanner.ts`, and `withdraw.ts`. Confirm output contains no new `ERROR` entry for `ExpansionCampaign.ts` or `ExpansionPlanner.ts`.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff -- src/strategy/ExpansionCampaign.ts src/strategy/ExpansionPlanner.ts src/declarations/memory.d.ts tests/ExpansionCampaign.test.ts docs/superpowers/specs/2026-07-22-safe-autonomous-expansion-design.md docs/superpowers/plans/2026-07-22-safe-expansion-campaign-dry-run.md
```

Expected: pure state engine, dry-run adapter, memory typing, tests, and approved spec only. No colonization executor or creep behavior changes.

---

## Follow-Up Plans

After dry-run decisions are observed in game:

1. Structured candidate metrics and dynamic-plan viability.
2. Scout probe execution and escrow-controlled spawn requests.
3. Claim and bootstrap milestone execution.
4. Stabilization and independence handoff.
5. Guarded abandonment and unclaiming.

Each follow-up requires its own reviewed plan because it introduces irreversible game actions.

## Self-Review

- Spec coverage: stage 1 covers persistent lifecycle, parent safety policy, trend, deadlines, cooldown model, pure transitions, corruption recovery, and dry-run verification. Side-effect phases remain explicit follow-up plans.
- Placeholder scan: no placeholder implementation steps; every stage-1 behavior has concrete contracts and verification commands.
- Type consistency: `CampaignMemory`, `CampaignSnapshot`, `CampaignAction`, `CampaignPhase`, `createCampaign`, and `transitionCampaign` names match across implementation and tests.
