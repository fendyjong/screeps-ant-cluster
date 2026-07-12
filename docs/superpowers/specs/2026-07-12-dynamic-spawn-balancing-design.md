# Dynamic Spawn‑Balancing Design (Hybrid)

**Date:** 2026‑07‑12
**Author:** OpenCode (AI)

---

## 1. Overview
This design introduces a hybrid, adaptive spawn‑balancing system for the Screeps colony. It combines a **sliding‑window baseline** that smooths demand metrics over 25‑tick intervals with **per‑tick urgent triggers** to react instantly to spikes (construction backlog, idle‑creep surge, energy emergencies). The goal is to dramatically reduce the idle‑creep ratio (currently ~93 %), make better use of the abundant CPU headroom, and keep the economy responsive to changing conditions.

---

## 2. Architecture
```
+---------------------------+        +------------------------+
|  main.js (main loop)      |  →     |  auto.spawn.js (spawner) |
|  – after role dispatch    |        |  – decides which creep  |
|  – runs every tick        |        |    to spawn next        |
+---------------------------+        +------------------------+
        |                                     |
        |                                     |
        v                                     v
+---------------------------+   +---------------------------+
|  debug.performance (optional) |   |  role modules (harvester, |
|  – provides sliding‑window   |   |    builder, etc.)          |
|    metrics (backlog, idle)  |   +---------------------------+
+---------------------------+
```
* `debug.performance` updates `Memory.spawnDemand` with smoothed metrics every 25 ticks.
* `auto.spawn.js` reads `Memory.spawnDemand`, computes a **baseline** desired count per role, then applies **triggers** each tick before spawning.
* No changes to existing role modules, keeping them untouched.

---

## 3. Algorithms & Data Flow
### 3.1 Demand Tracker (Every 25 ticks)
```js
function updateDemandTracker(room) {
    const plan = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].colonyPlan;
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const backlog = _.sum(sites, s => Math.max(0, s.progressTotal - s.progress));
    const idleRatio = (Memory.debug && Memory.debug.creepAnalysis &&
                       Memory.debug.creepAnalysis.idleCreeps / Object.keys(Game.creeps).length) || 0;
    const energyReserve = Memory.strategy && Memory.strategy.economy &&
                          Memory.strategy.economy.stockpile || 0;
    // exponential smoothing (alpha = 0.2)
    const prev = Memory.spawnDemand || {};
    Memory.spawnDemand = {
        backlog: (prev.backlog || backlog) * 0.8 + backlog * 0.2,
        idleRatio: (prev.idleRatio || idleRatio) * 0.8 + idleRatio * 0.2,
        energyReserve: (prev.energyReserve || energyReserve) * 0.8 + energyReserve * 0.2,
    };
}
```
### 3.2 Baseline Desired Counts (Derived from smoothed demand)
```js
function computeBaseline(room) {
    const d = Memory.spawnDemand || {};
    const desired = {};
    // Harvesters – keep enough to feed the economy, scale with idle ratio
    desired.harvester = Math.max(2, Math.ceil((1 - (d.idleRatio || 0)) * 4));
    // Haulers – proportional to stored energy
    desired.hauler    = Math.max(1, Math.ceil((d.energyReserve || 0) / 5000));
    // Builders – based on backlog (each builder handles ~15k work)
    desired.builder   = Math.max(1, Math.ceil((d.backlog || 0) / 15000));
    // Upgraders – extra when controller is close to downgrade
    const ctrl = room.controller;
    desired.upgrader = (ctrl && ctrl.ticksToDowngrade < 8000) ? 2 : 1;
    // Defenders, scouts, etc. keep existing minimums (unchanged)
    desired.defender = 0; // keep as before, could be set by war logic
    desired.scout    = 0;
    desired.claimer   = 0;
    desired.attacker  = 0;
    desired.healer    = 0;
    return desired;
}
```
### 3.3 Per‑Tick Triggers (Evaluated right before spawning)
```js
function applyTriggers(room, baseline) {
    const d = Memory.spawnDemand || {};
    // Backlog spike → ensure at least one extra builder
    if ((d.backlog || 0) > 2 * (baseline.builder || 0) * 15000) {
        baseline.builder = (baseline.builder || 0) + 1;
    }
    // Idle‑creep surge → push missing roles up to baseline+1
    if ((d.idleRatio || 0) > 0.6) {
        Object.keys(baseline).forEach(r => {
            baseline[r] = (baseline[r] || 0) + 1; // give a little extra capacity
        });
    }
    // Energy emergency → guarantee a harvester
    const plan = Memory.roomIntel && Memory.roomIntel[room.name] && Memory.roomIntel[room.name].colonyPlan;
    if (plan && plan.economy && plan.economy.stockpile < plan.economy.reserveFloor) {
        baseline.harvester = Math.max(baseline.harvester, 2);
    }
    return baseline;
}
```
### 3.4 Spawn Decision (inside `auto.spawn.run`)
```js
function run() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (!room.controller || !room.controller.my) continue;

        // 1) every 25 ticks – update demand tracker
        if (Game.time % 25 === 0) updateDemandTracker(room);

        // 2) compute baseline & apply triggers
        let desired = computeBaseline(room);
        desired = applyTriggers(room, desired);

        // 3) current counts
        const snapshot = buildRoleSnapshot(roomName);
        const cur = snapshot.counts;

        // 4) pick first role that is below desired
        for (const role of ROLE_LIST) {
            const need = (desired[role] || 0) - (cur[role] || 0);
            if (need > 0) {
                const body = getBodyForRole(role, room);
                if (!body) continue; // not enough energy, skip
                const spawn = getAvailableSpawn();
                if (!spawn) break; // no idle spawn
                const name = `${role}_${roomName}_${Game.time}`;
                spawn.spawnCreep(body, name, {memory:{role,roomName,stats:{}}});
                recordSpawnState(room, plan, role);
                break; // spawn only one creep per tick (conservative)
            }
        }
    }
}
```
The existing `autoSpawn.run` already follows a similar pattern; the above snippet replaces its body with the hybrid logic while preserving the original helper functions.

---

## 4. Integration Points
| File | Change | Reason |
|------|--------|--------|
| `auto.spawn.js` | Add `Memory.spawnDemand` handling, `updateDemandTracker`, `computeBaseline`, `applyTriggers` and adjust `run()` to use them. | Implements the hybrid algorithm. |
| `debug.report.js` (optional) | Show `Memory.spawnDemand` values in the **Performance Insights** section. | Gives visibility for tuning. |
| `main.js` | No direct changes – it already calls `autoSpawn.run()` each tick. | Keeps integration frictionless. |
| `role.*.js` | No modifications required – roles stay unchanged. | Guarantees backward compatibility. |

---

## 5. Error Handling & Fallbacks
* **Missing role module** – `safeRequireRole` returns a `noopRun`; the spawner will still try to spawn the role, but the bot will treat it as a harvester fallback (existing behaviour). |
* **Insufficient energy** – `getBodyForRole` already returns `null` if `room.energyAvailable` < body cost. The spawner simply skips that role for the current tick.
* **CPU over‑run** – All demand‑tracker updates occur only when `Game.cpu.getUsed() < getCpuBudgets().soft`. If the soft limit is hit, the baseline simply stays at the last known values, avoiding extra CPU.
* **Corrupted `Memory.spawnDemand`** – If any field is `NaN` or missing, the algorithm falls back to static minimums (`harvester ≥2, builder ≥1, hauler ≥1`). This mirrors the previous static `MINIMUM_CIVILIAN_FLOOR`.

---

## 6. Testing & Validation Plan
| Test | Goal | How to verify |
|------|------|----------------|
| **Baseline unit test** | Ensure `computeBaseline` returns reasonable numbers for edge cases. | In the console: set `Memory.spawnDemand` manually, call `computeBaseline(room)`, inspect returned object. |
| **Backlog spike** | Verify an extra builder is spawned instantly when backlog > 2×baseline. | Create many construction sites at once; watch the console for a spawn log and check `Memory.debug.lastAnalysis.criticalIssues` for a “Backlog spike” entry. |
| **Idle‑creep reduction** | Confirm idle‑creep ratio drops below 30 % after a few ticks. | After deployment, monitor `Memory.debug.creepAnalysis.idleCreeps` via `debug.performance.generatePerformanceSnapshot()`. |
| **CPU budget** | Ensure added logic stays < 5 CPU per tick. | Observe `Game.cpu.getUsed()` after implementation; it should stay well under the soft limit (≈ 15). |
| **Energy emergency** | Only harvesters spawn when `room.energyAvailable` is low. | Manually set `room.energyAvailable = 100` and trigger a spawn; verify the spawned creep’s role is `harvester`. |
| **Fallback when role module missing** | Confirm fallback to harvester doesn’t crash the loop. | Temporarily rename `role.builder.js` → `role.builder.bak`, run the game, ensure the bot continues without errors. |

---

## 7. Self‑Review (no placeholders, consistent, scoped)
- All sections are filled – no "TODO" markers.
- No contradictory statements: baseline and triggers are clearly defined and merged.
- Scope is limited to spawn‑balancing; no unrelated refactoring is introduced.
- Ambiguities (e.g., exact multiplier for backlog) are documented; values can be tuned later.

---

## 8. Next Steps
1. **Commit this spec** to the repository (`git add` & `git commit`).
2. **User review** – please open the file at `docs/superpowers/specs/2026-07-12-dynamic-spawn-balancing-design.md` and let me know if any changes are needed.
3. After approval, we will move to the **implementation plan** by invoking the `writing-plans` skill.

---

*Generated by OpenCode (AI) on 2026‑07‑12.*
