# Cashflow Priority Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate race condition between spawn and build by introducing a 3-tier energy priority queue with cashflow health tracking.

**Architecture:** New `src/lib/Cashflow.ts` module computes emergency reserve, spawn/budget/income rates, and health indicator. Hatchery and construction site creation gate on the budget. Queen adjusts targets when health is red. Architect uses buildBudget. HUD panels show cashflow instead of raw income/spend.

**Tech Stack:** Screeps TypeScript, existing Memory.v1 namespace

---

### Task 1: Add Cashflow types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add CashflowMemory type and extend Memory**

Insert after `HatcheryMemory` interface:

```ts
export type CashflowHealth = 'green' | 'yellow' | 'red';

export interface CashflowMemory {
	incomeRate: number
	spawnRate: number
	buildRate: number
}
```

Extend the `Memory.v1` interface to include `cashflow`:

```ts
declare global {
	interface Memory {
		v1: {
			hatchery: HatcheryMemory
			cashflow?: Record<string, CashflowMemory>
		}
		pathing?: PathingMemory
	}
}
```

- [ ] **Step 2: Build check**

Run: `npm run build 2>&1 | grep "error TS"` — expect no type errors for the new types.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add CashflowMemory type"
```

---

### Task 2: Create Cashflow module

**Files:**
- Create: `src/lib/Cashflow.ts`

- [ ] **Step 1: Write the module**

```ts
import { CashflowHealth } from '../types';
import { bodyCost } from '../hatchery/Body';

const ALPHA = 0.1;
const BUILD_RATE_WINDOW = 50;

function getRate(key: 'incomeRate' | 'spawnRate' | 'buildRate', roomName: string): number {
	const cf = Memory.v1.cashflow?.[roomName];
	if (!cf) return 0;
	return cf[key] || 0;
}

function setRate(key: 'incomeRate' | 'spawnRate' | 'buildRate', roomName: string, value: number): void {
	if (!Memory.v1.cashflow) Memory.v1.cashflow = {};
	if (!Memory.v1.cashflow[roomName]) Memory.v1.cashflow[roomName] = { incomeRate: 0, spawnRate: 0, buildRate: 0 };
	Memory.v1.cashflow[roomName][key] = value;
}

function ema(old: number, sample: number): number {
	return old + ALPHA * (sample - old);
}

export function computeEmergencyReserve(room: Room): number {
	let reserve = 0;
	for (const name in Game.creeps) {
		const c = Game.creeps[name];
		if (c.memory.roomName !== room.name) continue;
		if (c.ticksToLive !== undefined && c.ticksToLive < 100) {
			const parts = c.body.map(p => p.type) as BodyPartConstant[];
			reserve += bodyCost(parts);
		}
	}
	return reserve;
}

export function trackIncome(roomName: string, totalEnergy: number, prevTotalEnergy: number): void {
	const delta = totalEnergy - prevTotalEnergy;
	if (delta > 0) {
		const old = getRate('incomeRate', roomName);
		setRate('incomeRate', roomName, ema(old, delta));
	}
}

export function trackSpawn(roomName: string, cost: number): void {
	const old = getRate('spawnRate', roomName);
	setRate('spawnRate', roomName, ema(old, cost));
}

export function trackBuild(roomName: string, progressDelta: number): void {
	const old = getRate('buildRate', roomName);
	setRate('buildRate', roomName, ema(old, progressDelta));
}

export function getHealth(room: Room): CashflowHealth {
	const reserve = computeEmergencyReserve(room);
	if (room.energyAvailable < reserve) return 'red';

	const income = getRate('incomeRate', room.name);
	const spend = getRate('spawnRate', room.name) + getRate('buildRate', room.name);
	if (income > spend * 1.1) return 'green';
	return 'yellow';
}

export function getBudget(room: Room): { spawnBudget: number; buildBudget: number; reserve: number } {
	const reserve = computeEmergencyReserve(room);
	const spawnBudget = Math.max(0, room.energyAvailable - reserve);
	const spawnRate = getRate('spawnRate', room.name);
	const storageEnergy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
	const buildBudget = Math.max(0, storageEnergy - spawnRate * BUILD_RATE_WINDOW);
	return { spawnBudget, buildBudget, reserve };
}
```

- [ ] **Step 2: Build check**

Run: `npm run build 2>&1 | grep "error TS"` — fix any import errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/Cashflow.ts
git commit -m "feat: add Cashflow module with EMA rates, health, budgets"
```

---

### Task 3: Wire Cashflow into main loop

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace inline energy tracking with Cashflow calls**

Replace lines 189-206 (the energy tracking block) with:

```ts
const prevTotal = (Memory.v1 as any)._prevTotalEnergy?.[roomName] ?? -1;
const currentTotal = room.energyAvailable + (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0);
if (prevTotal >= 0) {
	trackIncome(roomName, currentTotal, prevTotal);
}
if (!(Memory.v1 as any)._prevTotalEnergy) (Memory.v1 as any)._prevTotalEnergy = {};
(Memory.v1 as any)._prevTotalEnergy[roomName] = currentTotal;
```

- [ ] **Step 2: Gate createConstructionSites on buildBudget**

Replace line 85:
```ts
if (cost > 0 && room.energyAvailable < cost * 0.5) continue;
```
With:
```ts
const { buildBudget } = getBudget(room);
if (cost > 0 && buildBudget < cost) continue;
```

- [ ] **Step 3: Gate planLayout/planSwap on cashflow health**

Replace the layout planning block (around line 210-214):
```ts
if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
  const health = getHealth(room);
  if (health !== 'red' || !room.memory.layout) {
    const layout = planLayout(room);
    const swapPlan = planSwap(room, layout);
    room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
  }
}
```

- [ ] **Step 4: Add imports at top**

```ts
import { trackIncome, getBudget, getHealth } from './lib/Cashflow';
```

- [ ] **Step 5: Build check**

Run: `npm run build 2>&1 | grep "error TS"` — fix any import issues.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire Cashflow into main loop, gate construction on buildBudget"
```

---

### Task 4: Gate Hatchery spawn on spawnBudget

**Files:**
- Modify: `src/hatchery/Hatchery.ts`

- [ ] **Step 1: Gate spawn on budget and record cost**

In `process()`:

```ts
import { getBudget, trackSpawn } from '../lib/Cashflow';
import { bodyCost } from './Body';

// At start of process():
const { spawnBudget } = getBudget(room);

// In the loop, after `const body = scaleBody(...)`:
if (!body) continue;
if (bodyCost(body) > spawnBudget) continue;

// After successful spawn:
trackSpawn(room.name, bodyCost(body));
```

- [ ] **Step 2: Build check**

Run: `npm run build 2>&1 | grep "error TS"` — verify no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hatchery/Hatchery.ts
git commit -m "feat: gate Hatchery spawn on spawnBudget, record spawn cost"
```

---

### Task 5: Queen reads cashflow health

**Files:**
- Modify: `src/hatchery/Queen.ts`

- [ ] **Step 1: Make computeTargets health-aware**

Change signature and add health parameter:

```ts
function computeTargets(room: Room, health: CashflowHealth): Record<string, number> {
	// ... existing logic ...
	for (const [role, cfg] of Object.entries(phase.scaling)) {
		let extra = 0;
		const threshold = health === 'red' ? cfg.threshold * 2 : cfg.threshold;
		if (role === 'builder') {
			extra = Math.floor(backlog / threshold) * cfg.increment;
		} else {
			extra = Math.floor(stored / threshold) * cfg.increment;
		}
		targets[role] = (targets[role] || 0) + extra;
	}
	return targets;
}
```

Update call site:
```ts
import { getHealth } from '../lib/Cashflow';
// ...
const targets = computeTargets(room, getHealth(room));
```

- [ ] **Step 2: Build check**

Run: `npm run build 2>&1 | grep "error TS"`

- [ ] **Step 3: Commit**

```bash
git add src/hatchery/Queen.ts
git commit -m "feat: Queen reads cashflow health, halves scaling thresholds on red"
```

---

### Task 6: HUD cashflow panel

**Files:**
- Modify: `src/lib/HUD.ts`

- [ ] **Step 1: Replace drawTopRight with cashflow panel**

```ts
function drawTopRight(vis: RoomVisual, room: Room): void {
	const cf = Memory.v1.cashflow?.[room.name];
	const income = cf?.incomeRate || 0;
	const spawn = cf?.spawnRate || 0;
	const build = cf?.buildRate || 0;
	const net = income - spawn - build;
	const health = getHealth(room);
	const reserve = computeEmergencyReserve(room);

	drawPanel(vis, 35, 0.5, [
		['Cashflow', ''],
		['In: +' + income.toFixed(1) + '/t', ''],
		['Spawn: -' + spawn.toFixed(1) + '/t', ''],
		['Build: -' + build.toFixed(1) + '/t', ''],
		['Net:', (net >= 0 ? '+' : '') + net.toFixed(1) + '/t'],
		['Health: ' + health.toUpperCase(), 'Rsv: ' + reserve.toLocaleString()],
	], 16);
}
```

- [ ] **Step 2: Add imports**

```ts
import { getHealth, computeEmergencyReserve } from './Cashflow';
```

- [ ] **Step 3: Build check**

Run: `npm run build 2>&1 | grep "error TS"`

- [ ] **Step 4: Commit**

```bash
git add src/lib/HUD.ts
git commit -m "feat: HUD shows cashflow panel with income/spawn/build/net rates"
```

---

### Task 7: Track build progress delta

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Track construction site progress for build rate**

Before `HUD.run(room)`, add:

```ts
import { trackBuild } from './lib/Cashflow';

// Track construction progress for build rate
const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
let progressDelta = 0;
for (const site of sites) {
	const prev = (Memory.v1 as any)._prevProgress?.[site.id] || site.progress;
	progressDelta += Math.max(0, site.progress - prev);
	if (!(Memory.v1 as any)._prevProgress) (Memory.v1 as any)._prevProgress = {};
	(Memory.v1 as any)._prevProgress[site.id] = site.progress;
}
if (progressDelta > 0) {
	trackBuild(roomName, progressDelta);
}
```

- [ ] **Step 2: Build check**

Run: `npm run build 2>&1 | grep "error TS"`

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: track construction progress delta for build rate EMA"
```

---

### Task 8: Architect uses buildBudget

**Files:**
- Modify: `src/colony/Architect.ts`

- [ ] **Step 1: Update isSafeToDestroy to use buildBudget**

Replace line 32:
```ts
return room.energyCapacityAvailable >= cost;
```
With:
```ts
const { buildBudget } = getBudget(room);
return buildBudget >= cost;
```

- [ ] **Step 2: Cap planSwap build list to buildBudget**

At the end of `planSwap()`, filter build list to affordable items:

```ts
// Sort by structure priority
build.sort((a, b) => {
  const order: Record<string, number> = {
    [STRUCTURE_SPAWN]: 0,
    [STRUCTURE_EXTENSION]: 1,
    [STRUCTURE_TOWER]: 2,
    [STRUCTURE_STORAGE]: 3,
    [STRUCTURE_TERMINAL]: 4,
    [STRUCTURE_LAB]: 5,
    [STRUCTURE_FACTORY]: 6,
  };
  return (order[a.structureType] || 99) - (order[b.structureType] || 99);
});

// Filter to affordable within buildBudget
const { buildBudget } = getBudget(room);
let totalCost = 0;
const affordable = build.filter(entry => {
  const cost = REBUILD_COSTS[entry.structureType] || 0;
  if (totalCost + cost <= buildBudget) {
    totalCost += cost;
    return true;
  }
  return false;
});

return { destroy, build: affordable };
```

- [ ] **Step 3: Add import**

```ts
import { getBudget } from '../lib/Cashflow';
```

- [ ] **Step 4: Build check**

Run: `npm run build 2>&1 | grep "error TS"`

- [ ] **Step 5: Commit**

```bash
git add src/colony/Architect.ts
git commit -m "feat: Architect gates isSafeToDestroy and caps build list on buildBudget"
```
