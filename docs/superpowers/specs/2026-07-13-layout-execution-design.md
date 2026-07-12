# Layout Execution Design

## Overview

Execute the swap plan: Builder creeps destroy misplaced structures and build new ones at planned positions. Adds safety checks, build priorities, and periodic rechecking.

## Architecture

```
Architect (code)              Main Loop               Builder (creep)
     |                            |                        |
 planLayout()          creates construction sites    reads swap plan
 planSwap()            from build list               destroys structures
     |                        |                       builds sites
     v                        v                        v
  Memory.layout    room.createConstructionSite()    creep.dismantle()
                   for each build entry             creep.build()
```

## Components

### 1. Architect (renamed from LayoutPlanner)

**File:** `src/colony/Architect.ts` (rename from `src/colony/LayoutPlanner.ts`)

No logic changes, just filename rename. Exports:
- `planLayout(room): BunkerLayout`
- `planSwap(room, layout): SwapPlan`

### 2. Builder Execution

**File:** `src/roles/Builder.ts`

Builder now handles both demolition and construction:

```
if swapPlan exists and swapPlan.destroy.length > 0:
  state = 'destroying'
  find first structure in destroy list
  if structure exists and safe to destroy:
    dismantle it
  else:
    remove from destroy list (skip)

else if swapPlan exists and swapPlan.build.length > 0:
  state = 'building'
  find first construction site for build list
  if site exists:
    build it
  else:
    create construction site (or skip if blocked)

else:
  state = 'idle'
  fall back to: build existing sites, repair damaged structures
```

### 3. Construction Site Creation

**File:** `src/main.ts`

Main loop creates construction sites from build list:

```
if Game.time % 100 === 0 and swapPlan.build.length > 0:
  for each entry in swapPlan.build:
    if no construction site at that position:
      room.createConstructionSite(pos, structureType)
```

### 4. Safety Checks

**File:** `src/colony/Architect.ts`

Before marking a structure for destruction, check:

1. **Spawn safety** — Don't destroy spawn unless:
   - Room has enough energy (15,000+) to rebuild
   - Or another spawn exists

2. **Terminal/Storage safety** — Don't destroy until:
   - RCL >= 4 (safe to relocate)
   - Storage exists before destroying terminal
   - Terminal has no non-energy resources (> 1000 minerals)

3. **Max destruction per tick** — Builder limits to 3 structures destroyed per tick (enforced in Builder.ts)

4. **Energy availability** — Main loop only creates construction site if room energy >= 50% of structure cost

### 5. Build Priorities

**File:** `src/colony/Architect.ts`

Order structures by importance:

```ts
const BUILD_PRIORITIES: StructureConstant[] = [
  STRUCTURE_SPAWN,      // First: need spawning
  STRUCTURE_STORAGE,    // Second: need energy storage
  STRUCTURE_TOWER,      // Third: need defense
  STRUCTURE_LINK,       // Fourth: need logistics
  STRUCTURE_TERMINAL,   // Fifth: need trading
  STRUCTURE_LAB,        // Sixth: need research
  STRUCTURE_FACTORY,    // Seventh: need production
  STRUCTURE_OBSERVER,   // Eighth: need scouting
  STRUCTURE_NUKER,      // Ninth: need nukes
  STRUCTURE_POWER_SPAWN, // Tenth: need power
  STRUCTURE_EXTRACTOR,  // Eleventh: need minerals
  STRUCTURE_ROAD,       // Twelfth: need paths
  STRUCTURE_WALL,       // Thirteenth: need barriers
  STRUCTURE_RAMPART,    // Fourteenth: need ramparts
  STRUCTURE_CONTAINER,  // Fifteenth: need containers
  STRUCTURE_EXTENSION,  // Last: need extensions
];
```

### 6. Periodic Rechecking

**File:** `src/main.ts`

Every N ticks, verify layout is still valid:

```
if Game.time % 200 === 0:
  verify all planned positions are still valid
  if structures moved or destroyed:
    re-run planSwap()
```

## SwapPlan State Machine

```
idle → destroying → building → idle
```

- `idle`: No active swap, or swap complete
- `destroying`: Builder is dismantling structures
- `building`: All destroy done, Builder is constructing

## Files Changed

| File | Change |
|------|--------|
| `src/colony/LayoutPlanner.ts` | Rename to `src/colony/Architect.ts` |
| `src/colony/Architect.ts` | Add safety checks, build priorities |
| `src/roles/Builder.ts` | Add swap plan execution (dismantle + build) |
| `src/main.ts` | Add construction site creation, periodic rechecking |
| `src/types/index.ts` | Update import paths |

## Edge Cases

1. **No energy to rebuild** — Don't destroy if energy < structure cost
2. **Construction site blocked** — Skip and try next position
3. **Structure already at target** — Skip build, remove from list
4. **Swap plan changes mid-execution** — Re-plan if layout changes
5. **Builder dies mid-swap** — Next Builder continues from memory
6. **Room under attack** — Pause swap execution, focus on defense

## Success Criteria

- Builder correctly destroys misplaced structures
- Builder correctly builds new structures at planned positions
- Safety checks prevent destroying critical structures without backup
- Build priorities ensure most important structures built first
- Periodic rechecking catches layout drift
- No CPU spikes from excessive demolition/construction
