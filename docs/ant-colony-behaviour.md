# Ant Colony Behaviour — Research Reference

This document captures everything we know about how real ant colonies work, what Screeps supports, what Overmind does well and poorly, and the design principles for our new colony. It is the single source of truth for architectural decisions.

--- 

## Table of Contents
1. [Colony Lifecycle](#1-colony-lifecycle)
2. [Communication Systems](#2-communication-systems)
3. [Stigmergy: The Core Principle](#3-stigmergy-the-core-principle)
4. [Economy — Foraging & Resource Allocation](#4-economy--foraging--resource-allocation)
5. [Movement & Pathfinding](#5-movement--pathfinding)
6. [Military — Raid & Defense](#6-military--raid--defense)
7. [Colony Growth & Expansion](#7-colony-growth--expansion)
8. [Screeps War Mechanics](#8-screeps-war-mechanics)
9. [Overmind Audit](#9-overmind-audit)
10. [Design Principles for New Colony](#10-design-principles-for-new-colony)
11. [Traffic Heatmap Routing, Pheromone Decay & Road Building](#11-traffic-heatmap-routing-pheromone-decay--road-building)


\n
--- 

## 1. Colony Lifecycle
Ant colonies progress through distinct phases, each with different energy investment trade-offs. Our bot mirrors this lifecycle with emphasis on **polygyne budding** — multiple queens, colonies reproduce by fission. | Phase | Biology | Screeps | Key Principle | |--------------|--|---------|---------------||  Founding | Queen + nanitics, >90% mortality | RCL 1-2, spawn + 2 harvesters | Survival is existential | | Ergonomic | Exponential growth, zero reproduction | RCL 3-7, scale workers proportionally | Growth before reproduction | | Reproductive | Budding/fission, queen dispersal | RCL 8+, ExpansionPlanner campaigns | Polygyne = rapid deployment | | Death | Queen loss, resource exhaustion | Spawn loss, energy starvation | Design for graceful degradation | 

## 1.1 Founding Stage
A single mated queen (claustral founding) or multiple cooperating queens (pleometrosis) raise the first workers from metabolic reserves alone — no foraging. First-generation "nanitics" are small, cheap, generalists. Transition to normal workers happens when resource flow stabilizes. **Key insight**: In polygyne colonies there is no claustral phase. New colonies **bud** — queen cohort + workers + brood split from the parent. Founding mortality drops from >99% to ~10-30%. Our architecture principle: **every new room should be a bud, not an independent founding event**. **Screeps mapping**: RCL 1-2. The spawn is the queen. First 2 harvesters are the nanitics — small generalist bodies (`[WORK, CARRY, MOVE]` = 200 energy). Every tick is existential. `MINIMUM_CIVILIAN_FLOOR` enforces critical colony size. ```javascript // Minimum viable colony: 2 harvesters + 1 upgrader, nanitic bodies const NANITIC_BODY = [WORK, CARRY, MOVE]; const MINIMUM_COLONY = { harvesters: 2, upgraders: 1, body: NANITIC_BODY }; ```

Colony size drives specialization. Below ~50 creeps every creep is a generalist. Above that, specialization emerges through response thresholds (see Section 4) — creeps self-select tasks based on local stimulus intensity vs their internal thresholds.

This self-organizes without central control or a scheduler.

--- 

## 1.2 Ergonomic Stage
All energy into workers. Zero reproduction. Positive feedback loop: more workers ’’’ more energy ’’’ more workers. The colony does NOT invest in reproduction until stable. Premature expansion weakens the colony and risks collapse. **How ant colonies handle disruption (applies to Screeps):** - Worker loss → remaining workers switch tasks within hours (threshold plasticity) - Food discovery → pheromone cascade recruits foragers in seconds - Nest damage → damage signal triggers generalist recruitment - Queen loss → polygyne colonies survive (other queens take over); monogyne colonies die **Entropy is intentional**: Exploration (scouts, random walks) prevents convergence on local optima. Exploitation (specialists, trail reinforcement) optimizes throughput. Young colonies explore more; mature ones exploit more. Perturbations should spike exploration. This is the exploration/exploitation tradeoff familiar from ML. **Screeps mapping**: RCL 3-7. Scale creeps to energy surplus. Development (labs, terminal, factory) is investment in future growth, not consumption. ```javascript // Demand-driven spawn: thresholds adjust based on room stimuli 
function computeRoleDemand(room) {
  const stimulus = {
    harvest: 1 - room.energyAvailable / room.energyCapacityAvailable,
    haul: (room.storage?.store[RESOURCE_ENERGY] ?? 0) < 5000 ? 1 : 0,
    build: Math.min(room.find(FIND_CONSTRUCTION_SITES).length / 5, 1),
    defend: Memory.warPlan?.threat?.[room.name] || 0,
  };
  // Scale demand into target creep counts
  return Object.fromEntries(
    Object.entries(stimulus).map(([r, s]) => [r, Math.floor(s * MAX_PER_ROLE[r])
  };
} 
```

--- 

## 1.3 Reproductive Stage (Budding)
Mature colonies reproduce by **budding** — queen cohorts + workers + brood split off to form daughter colonies. This is the core of our architecture. **Budding vs alternatives**: | Strategy | Founder mortality | Time to maturity | Screeps equivalent | |----------|-------------------|------------------|-------------------||  Independent founding | >99% | Years | Claim room with 0 infrastructure | | Swarming | <10% | Months | Send creeps in waves | | **Budding** | **10-30%** | **Weeks** | **Claim + pre-built spawn + escrow energy** | 

**When to bud** (trigger conditions from biology):
1. Colony size threshold reached (energy stockpile > reserve floor)
2. Resource saturation (sources consistently full, storage capped)
3. Viable target identified (intel: safe route, good sources, no hostiles)
4. Queen cohort ready (GCL slot available) **The supergene analogy**: Fire ants use a single ~13 Mb chromosome region (Gp-9) that locks together queen morphology, worker tolerance, and aggression as a co-adapted unit. Our equivalent: expansion flags. When `Memory.empire.expansion.candidates` crosses thresholds (source count, terrain safety, threat level), it triggers budding with locked-in role compositions, body templates, and defense posture. **Screeps mapping — ExpansionPlanner phases**: | Phase | Action |
L | Scout | `Game.map.findRoute`, evaluate room |
M | Reserve | Reserve controller, prevent counter-claim |
N | Outpost | Remote miner/hauler pair, container |
O | Claim | `claimController` + pioneer creeps |
P | Bootstrap | Spawn, extensions, storage, RCL 1→3 |
Q | Integrate | Link to terminal network, shared logistics |
R</think>