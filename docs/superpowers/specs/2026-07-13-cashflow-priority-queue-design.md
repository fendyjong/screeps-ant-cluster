# Cashflow Priority Queue

**Date:** 2026-07-13
**Status:** Draft

## Problem

Spawn and build compete for the same energy pool (`energyAvailable` + `storage`). No priority between them. This causes a race condition where a big spawn can starve building, or building can drain energy needed for critical creep replacement. No concept of "healthy cashflow" exists.

## Design

### Allocation Model — 3-Tier Priority Queue

Every tick, for each owned room:

1. **Emergency Spawn Reserve** — Sum of ideal body cost for all dying creeps with TTL < 100. This float must remain in `energyAvailable` at all times.
2. **Normal Spawn Budget** — `max(0, energyAvailable - emergencyReserve)`. Hatchery scales bodies within this budget. If budget < min body cost, skip spawn.
3. **Build Budget** — `max(0, storage.energy - buffer)`. Construction sites only created when spawn is satisfied and storage has surplus. Buffer = 50 ticks of spawn rate.

No saving. Emergency reserve is just a float, not a growing stockpile. When colony is healthy, all surplus energy goes to building.

### Cashflow Rates (EMA, alpha=0.1, per room)

| Rate | Measurement |
|------|-------------|
| **Spawn rate** | Energy cost of each spawned creep, recorded by Hatchery |
| **Build rate** | Total progress delta on construction sites this tick |
| **Income rate** | EMA of `totalEnergyDelta` when positive (energy entering spawn pool). Negative deltas are spend, not negative income. |

### Health Indicator

| Health | Condition |
|--------|-----------|
| **Green** | income > spawn + build AND reserve is full |
| **Yellow** | income ≈ spawn + build (net near zero) |
| **Red** | reserve depleting (energyAvailable < emergencyReserve) |

### Implementation

**New file: `src/lib/Cashflow.ts`**
- `computeEmergencyReserve(room)` — sums ideal body costs of dying creeps
- `trackSpend(room, spawnCost, buildProgress)` — updates EMA rates
- `getHealth(room)` — returns green/yellow/red
- `getBudget(room)` — returns { spawnBudget, buildBudget, reserve }

**Changes to existing files:**

| File | Change |
|------|--------|
| `src/hatchery/Hatchery.ts` | Record spawn cost after each spawn. Gate on spawnBudget. |
| `src/main.ts` | Replace inline energy tracking (lines 189-206) with Cashflow call. Gate `createConstructionSites` on buildBudget. Gate `planLayout`/`planSwap`: skip when health is red (waste of CPU). |
| `src/colony/Architect.ts` | `isSafeToDestroy` uses buildBudget instead of `energyCapacityAvailable`. `planSwap` caps build list to items affordable within buildBudget. |
| `src/hatchery/Queen.ts` | Read cashflow health. If health is red: cap upgrader target to 1, reduce builder scaling threshold 2x. If health is green: restore normal targets. |
| `src/lib/HUD.ts` | Replace income/spend panel with cashflow panel: income/t, spawn/t, build/t, net/t, health color, reserve bar. |

### Data in Memory

```ts
Memory.v1.cashflow[roomName] = {
  incomeRate: number,    // EMA of income per tick
  spawnRate: number,     // EMA of spawn cost per tick
  buildRate: number,     // EMA of build energy per tick
  health: 'green' | 'yellow' | 'red'
}
```

### Non-Goals

- No tracking of upgrade, tower, or repair spend (too fine-grained, not actionable)
- No saving or stockpiling target (ant colony spends everything)
- No market/terminal tracking (future concern)