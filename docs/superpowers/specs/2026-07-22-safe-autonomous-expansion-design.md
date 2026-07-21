# Safe Autonomous Expansion Campaign Design

## Goal

Replace one-shot colonization with staged, reversible expansion campaigns that cannot endanger parent colony stability.

## Problem

Current automation periodically chooses the highest-scoring room, creates a colonization directive, then requests one claimer and four pioneers. It has no sustained readiness check, launch escrow, persistent lifecycle, milestone deadlines, reinforcement policy, rollback, abandonment, or retry cooldown. Candidate evaluation also assumes the fixed bunker planner.

## Scope

First implementation supports one global campaign at a time. Existing `DirectiveColonize` remains responsible for creep execution, but `ExpansionPlanner` owns campaign selection, phase transitions, safety decisions, pause, abort, and completion.

## Lifecycle

```text
DISCOVER -> VALIDATE -> ESCROW -> PROBE -> CLAIM
-> BOOTSTRAP -> STABILIZE -> INDEPENDENT
                    \-> ABANDON -> COOLDOWN
```

### Discover

Rank candidate rooms using:

- 35% theoretical net energy per CPU
- 20% dynamic terrain-plan quality
- 15% parent route and spawn cost
- 15% threat history
- 10% mineral diversity
- 5% strategic spacing

Discovery does not create flags, spawn creeps, reserve controllers, or claim rooms.

### Validate

A candidate is valid only when:

- room and route intel are fresh;
- controller is reachable;
- room is unowned and not hostile-reserved;
- `DynamicPlanner.plan(room)` produces a valid candidate;
- owned and nearby source economics are positive;
- route avoids unacceptable hostile rooms and source-keeper paths;
- parent can reach target within configured travel limit;
- CPU and GCL permit another colony.

Stale information keeps the campaign in `VALIDATE` and requests a scout refresh. Invalid information abandons the candidate before claim. After escrow, `PROBE` performs the final freshness check before `CLAIM`.

### Escrow

Before spending, compute campaign budget:

```text
energy escrow = claimer cost
              + initial pioneer cost
              + one replacement wave
              + expected travel-loss margin
              + emergency reinforcement margin

spawn escrow = body spawn time for the same units
```

Launch requires:

- parent stockpile ratio at least `2.0`;
- positive parent stockpile trend over a sustained observation window;
- escrow fully funded above parent reserve floor;
- parent spawn utilization below configured maximum;
- CPU bucket above configured minimum;
- no parent defense emergency;
- fresh candidate and route validation.

Escrow is accounting memory, not physically isolated energy. Every campaign spawn checks that current stockpile remains above `reserveFloor + remainingEscrow`.

### Probe

A scout refreshes target and route intel immediately before claim. Probe cancels or redirects without claiming when ownership, reservation, route safety, terrain viability, or economics changed.

### Claim

A claimer is requested only after pioneer and reinforcement spawn capacity is available. Claim completion records controller ownership and starts bootstrap deadline tracking.

### Bootstrap

Required ordered milestones:

1. controller claimed;
2. first source actively harvested;
3. spawn construction site placed at dynamic-plan location;
4. spawn completed;
5. local miner and hauler operating;
6. local energy flow non-negative.

Each milestone stores completion tick, deadline, and last progress tick. One reinforcement wave is permitted after missed progress. Missing the extended deadline abandons the target.

### Stabilize

Target must maintain all conditions for a sustained stabilization window:

- RCL 2 or higher;
- spawn operational;
- positive or neutral net energy flow;
- miner and hauler replacement coverage;
- no parent emergency support requests;
- no dangerous hostile occupation;
- controller downgrade risk outside emergency band.

### Independent

Campaign completes when stabilization window passes. Campaign metadata is archived, colonization directive is removed, and colony enters normal governor control.

### Abandon

Abort triggers:

- parent enters `critical` stockpile state;
- hostile ownership or sustained dangerous occupation;
- repeated route loss;
- controller or spawn milestone deadline missed after one reinforcement;
- bootstrap economics remain negative;
- target controller or spawn is lost;
- GCL or CPU no longer supports campaign.

Abandonment actions:

1. stop campaign spawn requests;
2. remove campaign construction sites when visible;
3. recycle or reassign useful campaign creeps when reachable;
4. unclaim target controller only when campaign owns it and target has not reached `INDEPENDENT`;
5. remove colonization directive;
6. record failure reason and increasing cooldown.

Established colonies are never unclaimed by campaign cleanup.

## Persistent State

Store campaign state in `Memory.expansionPlanner`:

```ts
interface ExpansionCampaignMemory {
	phase: 'discover' | 'validate' | 'escrow' | 'probe' | 'claim'
		| 'bootstrap' | 'stabilize' | 'independent' | 'abandon' | 'cooldown';
	parentRoom?: string;
	targetRoom?: string;
	startedAt?: number;
	phaseStartedAt?: number;
	lastProgressAt?: number;
	attempts: number;
	escrowEnergy: number;
	escrowSpawnTicks: number;
	remainingEscrowEnergy: number;
	milestones: {
		[name: string]: {
			completedAt?: number;
			deadline: number;
		};
	};
	failureReason?: string;
	cooldowns: {
		[roomName: string]: {
			until: number;
			failures: number;
			lastReason: string;
		};
	};
	dryRun: boolean;
}
```

Only one campaign may have an active phase in the first implementation.

## Default Policy

Initial defaults, configurable after dry-run observation:

- target intel freshness: `500` ticks;
- route intel freshness: `1000` ticks;
- stockpile trend window: `500` ticks;
- minimum launch stockpile ratio: `2.0`;
- maximum parent spawn utilization: `0.75` over `500` ticks;
- minimum CPU bucket: `5000`;
- maximum parent-to-target path: `250` tiles;
- probe deadline: `1500` ticks;
- claim deadline after probe: `1500` ticks;
- first harvesting deadline after claim: `750` ticks;
- spawn-site deadline after claim: `1000` ticks;
- completed-spawn deadline after claim: `2500` ticks;
- local miner/hauler deadline after spawn: `750` ticks;
- stabilization window: `1500` ticks;
- base failure cooldown: `5000` ticks;
- repeated failure cooldown: `min(100000, 5000 * 2^failures)` ticks.

A progress heartbeat extends only the current milestone deadline and never resets campaign age or reinforcement count.

## Safety Invariants

- Campaign spending never lowers parent below adaptive reserve floor.
- Parent `saving` pauses optional reinforcement.
- Parent `critical` forces abandonment.
- Claiming cannot begin before escrow and fresh probe pass.
- Every active phase has deadline and progress heartbeat.
- A room failure increases cooldown exponentially.
- Abandonment can unclaim only campaign-owned, non-independent target.
- Campaign transition code is idempotent across global resets.
- Expensive evaluation and dynamic planning run only under CPU bucket gates.

## Components

### `ExpansionPlanner`

Owns campaign memory, candidate ranking, phase transitions, deadlines, safety gates, cooldowns, and archive decisions.

### `ExpansionEvaluator`

Produces structured candidate metrics rather than one opaque score. Uses dynamic planner viability instead of fixed bunker fit.

### `DirectiveColonize`

Executes current campaign phase. Reports milestones and failure signals. It does not choose target or decide campaign continuation.

### Colonization Overlords

`ClaimingOverlord` and `PioneerOverlord` request quantities supplied by campaign policy instead of fixed counts. They report arrival, claim, harvest, build, and loss progress.

### `Energetics`

Provides parent stockpile benchmark, trend, reserve floor, and escrow affordability.

## Data Flow

```text
intel + terrain + economy + threats
  -> ExpansionEvaluator candidate metrics
  -> ExpansionPlanner campaign transition
  -> DirectiveColonize execution intent
  -> colonization overlords actions
  -> milestone/failure observations
  -> next campaign transition
```

## Error Handling

- Missing vision during validation: remain in `VALIDATE` and request scout refresh; never claim.
- Missing dynamic plan: invalidate candidate and apply short cooldown.
- Spawn starvation: pause while parent remains healthy; abandon at deadline.
- Lost creeps: spend one replacement wave from escrow.
- Memory corruption: reset campaign to `DISCOVER` without unclaiming any room.
- Global reset: reconstruct phase from memory and visible game state.

## Verification

Implement campaign decision logic as pure transition functions over synthetic snapshots. Verify:

- no claim before validation and escrow;
- saving state pauses reinforcement;
- critical state abandons;
- milestones advance in order;
- missed deadline permits one reinforcement then abandonment;
- established colony cannot be unclaimed;
- cooldown increases after repeated failure;
- dry-run mode causes no flags, spawns, claims, construction, or unclaiming.

Run `npm run build` after each implementation task. Use dry-run campaign logs in game before enabling automatic side effects.

## Rollout

1. Add memory schema and pure transition engine in dry-run mode.
2. Add structured evaluator metrics and dynamic-plan validation.
3. Connect campaign to colonization directive while keeping claim disabled.
4. Enable probe and escrow-controlled spawning.
5. Enable claiming for one campaign.
6. Enable abandonment only after dry-run logs prove ownership guards.
7. Enable full automatic campaign lifecycle.

## Non-Goals

- Multiple simultaneous expansion campaigns.
- War-driven offensive claiming.
- Cross-shard expansion.
- Automatic abandonment of established colonies.
- Full dynamic-zone planner integration beyond candidate viability and spawn position.
