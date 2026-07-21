# Pathing Stuck Creeps Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 60% stuck creep rate in room W4N8 by improving traffic detection, stuck detection, and path recalculation.

**Architecture:** Four targeted fixes to `src/lib/Pathing.ts` that address the root causes: delayed road construction, slow stuck detection, and probabilistic path clearing.

**Tech Stack:** TypeScript, Screeps game API

---

## File Structure

**Modify:**
- `src/lib/Pathing.ts` - All four fixes are in this single file

**No new files required.**

---

## Task 1: Lower Traffic Threshold

**Files:**
- Modify: `src/lib/Pathing.ts:16`

- [ ] **Step 1: Change TRAFFIC_THRESHOLD from 100 to 50**

```typescript
// Line 16 in src/lib/Pathing.ts
const TRAFFIC_THRESHOLD = 50;
```

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Build completes with no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/Pathing.ts
git commit -m "fix: lower traffic threshold from 100 to 50 for faster road construction"
```

---

## Task 2: Remove Probabilistic Path Clearing

**Files:**
- Modify: `src/lib/Pathing.ts:153-162`

- [ ] **Step 1: Modify isStuck() to always clear path when stuck**

Replace the `isStuck` function (lines 49-62) with:

```typescript
function isStuck(creep: Creep): boolean {
	const last = creep.memory._lastPos as { x: number; y: number; roomName: string } | undefined;
	if (!last) {
		creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
		return false;
	}
	if (creep.pos.x === last.x && creep.pos.y === last.y && creep.room.name === last.roomName) {
		creep.memory._stuckTicks = (creep.memory._stuckTicks || 0) + 1;
	} else {
		creep.memory._stuckTicks = 0;
	}
	creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
	return (creep.memory._stuckTicks || 0) > STUCK_THRESHOLD;
}
```

- [ ] **Step 2: Modify moveTo() to always clear path when stuck**

Find the stuck handling in `moveTo()` (around line 153-162):

```typescript
	// Current code (lines 153-162):
	if (isStuck(creep)) {
		if (Math.random() > 0.5) {
			creep.memory._path = undefined;
			creep.memory._pathTick = undefined;
		}
	}
```

Replace with:

```typescript
	if (isStuck(creep)) {
		creep.memory._path = undefined;
		creep.memory._pathTick = undefined;
	}
```

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: Build completes with no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/Pathing.ts
git commit -m "fix: always clear path when creep is stuck instead of 50% chance"
```

---

## Task 3: Reduce Stuck Threshold

**Files:**
- Modify: `src/lib/Pathing.ts:15`

- [ ] **Step 1: Change STUCK_THRESHOLD from 2 to 1**

```typescript
// Line 15 in src/lib/Pathing.ts
const STUCK_THRESHOLD = 1;
```

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Build completes with no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/Pathing.ts
git commit -m "fix: reduce stuck threshold from 2 to 1 for faster detection"
```

---

## Task 4: Record Failed Movement Attempts

**Files:**
- Modify: `src/lib/Pathing.ts:98-115` (recordTraffic function)

- [ ] **Step 1: Add a new function to record blocked attempts**

Add this function after the existing `recordTraffic` function (after line 115):

```typescript
function recordBlockedAttempt(creep: Creep): void {
	const roomName = creep.room.name;
	if (!Memory.v1) return;
	const ns = Memory.v1;
	if (!ns.pathing) ns.pathing = {} as PathingMemory;
	if (!ns.pathing.traffic) ns.pathing.traffic = {};
	if (!ns.pathing.traffic[roomName]) ns.pathing.traffic[roomName] = {};

	// Record at the creep's current position (where it's trying to move from)
	const key = creep.pos.x + ',' + creep.pos.y;
	const heatmap = ns.pathing.traffic[roomName];
	heatmap[key] = (heatmap[key] || 0) + 1;

	if (heatmap[key] >= TRAFFIC_THRESHOLD) {
		if (!ns.pathing.pendingRoads) ns.pathing.pendingRoads = [];
		ns.pathing.pendingRoads.push({ roomName, x: creep.pos.x, y: creep.pos.y });
		heatmap[key] = 0;
	}
}
```

- [ ] **Step 2: Modify tryPush() to record blocked attempts**

Find the `tryPush` function (lines 64-96). Add a call to `recordBlockedAttempt` when push fails:

```typescript
function tryPush(creep: Creep, dir: DirectionConstant): boolean {
	const offset = DIR_OFFSETS[dir];
	if (!offset) return false;
	const x = creep.pos.x + offset.dx;
	const y = creep.pos.y + offset.dy;
	if (x < 0 || x > 49 || y < 0 || y > 49) return true;

	const blocking = creep.room.lookForAt(LOOK_CREEPS, x, y)[0];
	if (!blocking) return true;

	if (getPushPriority(creep) >= getPushPriority(blocking)) {
		recordBlockedAttempt(creep);
		return false;
	}

	const dirs: DirectionConstant[] = [1, 2, 3, 4, 5, 6, 7, 8];
	for (const d of dirs) {
		const off = DIR_OFFSETS[d];
		const nx = blocking.pos.x + off.dx;
		const ny = blocking.pos.y + off.dy;
		if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
		const terrain = blocking.room.lookForAt(LOOK_TERRAIN, nx, ny)[0];
		if (terrain === 'wall') continue;
		if (blocking.room.lookForAt(LOOK_CREEPS, nx, ny).length > 0) continue;
		if (blocking.room.lookForAt(LOOK_STRUCTURES, nx, ny).some(s => !(s as any).isWalkable)) continue;

		const result = blocking.move(d);
		if (result === OK) {
			if (blocking.memory._path) {
				blocking.memory._path = oppositeDir(d) + blocking.memory._path;
			}
			return true;
		}
	}
	
	// If we get here, push failed - record blocked attempt
	recordBlockedAttempt(creep);
	return false;
}
```

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: Build completes with no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/Pathing.ts
git commit -m "fix: record blocked movement attempts in traffic heatmap"
```

---

## Verification

After all tasks are complete:

1. **Run build one final time:**
   ```bash
   npm run build
   ```
   Expected: Clean build with no errors

2. **Check the compiled output:**
   ```bash
   grep -n "TRAFFIC_THRESHOLD\|STUCK_THRESHOLD" screeps.com/default/main.js
   ```
   Expected: Shows `TRAFFIC_THRESHOLD=50` and `STUCK_THRESHOLD=1`

3. **Deploy to Screeps and monitor:**
   - Watch debug logs for reduced stuck counts
   - Monitor traffic heatmap in HUD for earlier road construction
   - Verify creeps are moving more fluidly

---

## Expected Impact

- **Faster road construction:** Roads built at 50 traffic instead of 100
- **Faster stuck detection:** Stuck detected after 1 tick instead of 2
- **Immediate path recalculation:** No more 50% chance of ignoring stuck state
- **Better diagnostics:** Failed movement attempts now show in traffic heatmap

These changes should significantly reduce the 60% stuck rate in room W4N8.
