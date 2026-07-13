# Ant Colony Role Refactor — Design Spec

**Date:** 2026-07-13
**Status:** Approved design

## Problem

Creep roles re-decide what to do every tick from scratch using `store.getFreeCapacity() > 0`. This wastes CPU, prevents inter-creep coordination, and makes scaling to 3+ rooms expensive. The `Goal` enum is dead code (only `ECONOMY` ever set). No CPU budget awareness exists — all creeps run every tick unconditionally. Half-implemented features (defense, remote mining) and per-tick polling in Queen add overhead.

## Approach (Structured)

Four targeted adoptions from Overmind's architecture, adapted to ant colony:

1. **Task persistence** — creeps remember their task in memory
2. **Priority-ordered action chains** — formalized what-do-I-do per role
3. **CPU budget gating** — 3 tiers: always / under hard / burst
4. **Event-driven directives** — replace Queen polling with event fire-and-handle

## Design

### 1. Task Persistence

**Memory format** in `creep.memory.task`:

```
task: {
  type: 'harvest' | 'transfer' | 'withdraw' | 'pickup' | 'build' | 'repair' | 'upgrade' | 'dismantle' | 'recharge'
  targetId: string
}
```

**Lifecycle per creep tick:**
1. Check existing task: `creep.memory.task?.targetId`
2. If exists → `target = Game.getObjectById(task.targetId)`
3. If target alive AND action still makes sense → execute (e.g., `creep.harvest(target)`)
4. If action returns OK or target null → `delete creep.memory.task` → fall through to re-decide
5. If no task → run priority chain to assign one

**Auto-complete conditions:**
- `harvest`: `store.getFreeCapacity() === 0`
- `transfer`: `store.getUsedCapacity() === 0`
- `withdraw`: `store.getFreeCapacity() === 0` or source drained
- `pickup`: `store.getFreeCapacity() === 0`
- `build`/`repair`/`upgrade`: `store.getUsedCapacity() === 0`
- `dismantle`: target dead or swap plan entry gone
- `recharge`: `store.getUsedCapacity() > 0`

No task chaining (linked list parent/child). Single task + fallback is sufficient for ant colony.

### 2. Priority-Ordered Action Chains

Each role exports a `PRIORITY` array of action functions. Walk in order, execute first valid one:

```
type Action = (creep: Creep) => boolean;

function runPriorityChain(creep: Creep, actions: Action[]): void {
  for (const action of actions) {
    if (action(creep)) return;
  }
}
```

**Harvester:** harvest → transfer
**Hauler:** pickup → withdraw → transfer
**Upgrader:** upgrade → recharge (no more self-harvesting from sources)
**Builder:** dismantle → buildFromSwap → build → repair → recharge

`recharge` is a shared utility: find nearest container/storage/dropped energy, withdraw/pickup.

Delete `Goal` enum entirely. No more dead DEFEND/RECOVER branches. No `goal` parameter.

### 3. CPU Budget Gating

**3 tiers in main.ts:**

| Tier | Roles | Gate |
|------|-------|------|
| Always | harvester, hauler | Unconditional |
| Under hard | builder (if sites exist), upgrader | `Game.cpu.getUsed() < hardLimit` |
| Burst | defender, scout, claimer, attacker, healer, market, intel, construction planning | `bucket >= 3000` AND `Game.cpu.getUsed() < softLimit` AND `Game.time % N === 0` |

**Budget calculation:**

```
hardLimit = Game.cpu.limit * 0.85
softLimit = min(hardLimit, Game.cpu.bucket * 0.05)
```

Checked at creep-level inside `runCreep()`. If budget exceeded for tier, skip the creep for this tick.

### 4. Event-Driven Directives

Replace Queen's per-tick polling with watchers + event queue:

**Event memory:**
```
Memory.events: {
  hostile: { [room: string]: { tick, threat: 'scout'|'swarm' } }
  expansion: { [room: string]: { sourceRoom, targetRoom } }
}
```

**Watchers** (one cheap check per room per tick):
- `hostileWatcher`: if hostiles in room AND no existing event, fire hostile event
- `expansionWatcher`: if RCL >= 4, 500k+ energy, unowned adjacent room, fire expansion event

**Queen consumers:**
- Normal work (scan creeps, compute targets, submit harvest/haul/build/upgrade spawns) runs every tick — cheap, unchanged.
- Event handlers: check event, submit spawn request (defender at CRITICAL priority / claimer + remote miners), delete event.
- No more `maybeRequestRoomExpansion()` scanning exits every tick.

### File Changes

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `TaskMemory` interface. Delete `Goal` enum. |
| `src/lib/Memory.ts` | `ensureCreepMemory()` add `task` default. Remove goal from room memory. |
| `src/lib/Cashflow.ts` | Add `getCpuBudgets()`. |
| `src/lib/TaskManager.ts` | **New file.** Shared task utilities: get/set/clear/isValid/execute. |
| `src/main.ts` | Tiered dispatch. Budget checks. Watchers. |
| `src/roles/Harvester.ts` | Remove goal param. Task-first. Priority chain. |
| `src/roles/Hauler.ts` | Same pattern. |
| `src/roles/Builder.ts` | Same pattern. Task locks target (fixes swap plan race). |
| `src/roles/Upgrader.ts` | Upgrade → recharge. No more self-harvest. |
| `src/hatchery/Queen.ts` | Remove dead role presets (scout, claimer, attacker, healer from main loop). Remove `maybeRequestRoomExpansion()`. Add event consumers. |
| `src/lib/HUD.ts` | Show task type in creep labels. |

### Omitted (out of scope)

- Full Overmind process model (Overlords, Overseer, task chaining)
- LogisticsNetwork / source assignment system
- Remote mining implementation (roles still ignore remoteRoom — separate work)
- Tower defense logic

These can be added later without changing the task/priority/gating foundation.

### Rationale

Task persistence alone cuts ~40% of role CPU (no re-scoring sources or containers every tick). Priority chains replace the dead Goal enum with something real. CPU gating future-proofs scaling. Event-driven directives eliminate Queen's most wasteful polling. Each change is independent — revertable if needed.