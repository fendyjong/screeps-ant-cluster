# Ant Colony Behaviour — Research Reference

This document captures everything we know about how real ant colonies work,
what Screeps supports, what Overmind does well and poorly, and the design
principles for our new colony. It is the single source of truth for
architectural decisions.

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

---

## 1. Colony Lifecycle

Ant colonies go through three distinct phases, each with different energy
investment strategies. Understanding this is critical because Screeps RCL
progression maps almost perfectly onto it.

### 1.1 Founding Stage

A mated queen finds a nesting site, seals herself in (claustral founding),
and raises her first workers using only her body reserves. She does not
forage. She lays eggs, tends larvae, and metabolizes her own flight muscles
for nutrition. This is the most dangerous phase — mortality is extremely
high. Most queens die here.

**What the first workers do:** The first generation (called "nanitics") are
smaller than normal workers. They dig the nest, forage for food, tend the
queen's next brood, and defend the entrance. Once these workers take over
all labor, the queen never leaves the nest again.

**Screeps mapping:** RCL 1-2. The spawn is the queen. Energy reserves are
the queen's body reserves. The first 2 harvesters are the nanitics. Every
tick of energy income is existential — one missed harvest cycle can cascade
into colony death.

### 1.2 Ergonomic Stage

All energy is invested in producing more workers. No reproductive alates
( winged males/new queens) are produced. The colony grows exponentially:
more workers → more food gathered → more workers. This is a positive
feedback loop.

The colony expands the nest, secures territory, and builds infrastructure.
Workers begin to specialize — some become foragers, some nurses, some
defenders, some waste managers. Specialization is not fixed; workers switch
tasks based on demand (response thresholds, see Section 4).

**Key principle:** The colony does NOT invest in reproduction until it is
stable. Premature reproductive investment weakens the colony and risks
death. Growth first, reproduction later.

**Screeps mapping:** RCL 3-7. Every energy surplus should produce more
creeps. The colony scales workers proportionally to available surplus.
Construction sites, lab research, and terminal operations are all
investments in future growth.

### 1.3 Reproductive Stage

The colony is mature and stable. It now produces alates — winged males and
new queens — which fly away to mate and start new colonies. This is colony
"budding." The parent colony continues functioning but invests surplus energy
in dispersal.

**How colonies reproduce in nature:**
- **Independent founding:** A single mated queen leaves, finds a site,
  starts alone (highest risk, most common)
- **Dependent founding (budding):** A queen leaves with a group of workers
  from the parent colony (lower risk, common in army ants and fire ants)
- **Budding in polygyne colonies:** Multiple queens coexist; new nests
  form nearby by budding rather than flying away

**Screeps mapping:** RCL 8 + expansion campaigns. The ExpansionPlanner
already implements this as staged campaigns with escrow, probe, claim,
bootstrap, stabilize phases.

### 1.4 Colony Death

Colonies die when:
- Queen dies (no replacement)
- Sustained resource depletion
- Overwhelming predation/parasitism
- Disease

In Screeps terms: losing all spawns, energy starvation, or hostile takeover.

---

## 2. Communication Systems

Ants use four primary communication channels. None require a central
coordinator. All are local — an ant only knows what its immediate
environment tells it.

### 2.1 Pheromone Trails (Chemical)

The most famous ant communication method. Foragers deposit chemical
substances on the ground as they walk. Other ants detect these with their
antennae and respond.

**Types of pheromone trails:**

| Type | Purpose | Lifespan | Trigger |
|------|---------|----------|---------|
| Trail pheromone | Mark paths to food sources | Minutes to hours | Finding food, reinforced by use |
| Alarm pheromone | Alert colony to danger | Seconds (fast decay) | Threat detection |
| Recruitment pheromone | Rally workers for specific tasks | Minutes | Task demand |
| Queen pheromone | Signal queen health and fertility | Persistent | Queen's metabolic state |
| Territorial pheromone | Mark colony boundaries | Days | Patrol routes |

**Trail pheromone mechanics:**
1. Forager finds food source
2. On return trip, forager deposits trail pheromone on every tile walked
3. Other foragers encounter trail, follow it to food
4. If they find food, they reinforce the trail on their return
5. Trail concentration = number of recent trips × pheromone per trip
6. Trails evaporate over time (negative feedback)
7. Unused trails disappear; heavily-used trails strengthen

This creates automatic optimization: shorter paths accumulate more
pheromone (faster round trips = more deposits per unit time), so the
colony naturally converges on optimal routes without any ant knowing the
full path.

### 2.2 Antennal Code (Direct Communication)

Some species (notably red wood ants, Formica rufa group) communicate food
location through antenna touching — no pheromone trail needed.

**How it works:**
- A scout finds food and returns to the nest
- The scout approaches a team of ~10 followers (called "foragers")
- The scout touches antennae with each follower in sequence
- The antenna contact pattern encodes the direction and approximate
  distance to the food
- The followers then navigate to the food source independently, without
  the scout leading them
- Experiments show this works even when the scout is removed after
  communication and the maze is reconfigured to eliminate chemical trails

**This is remarkable** because it means information transfer can happen
without environmental modification. It's more like a message-passing system
than stigmergy.

**Screeps relevance:** This maps to flag-based communication. A flag says
"go to this room" — it's direct instruction, not environmental trace.
Most Screeps bots already use flags this way.

### 2.3 Quorum Sensing (Threshold-Based Decisions)

Ants don't vote. They don't have leaders making decisions. Instead, they
use quorum sensing — each ant has a response threshold for different
stimuli, and decisions emerge when enough ants have responded.

**Example (nest site selection):**
1. Scouts explore potential nest sites
2. Each scout evaluates a site and returns to the colony
3. If a scout likes a site, it recruits others by leading them there
4. As more scouts arrive at a site, the local ant density increases
5. When density crosses a threshold, scouts at that site switch to
  "commitment" behavior — they begin carrying nest material to the site
6. This attracts more ants, creating a positive feedback loop
7. The site with the fastest-growing commitment wins

**Key insight:** The threshold is not fixed. It adjusts based on colony
needs. During food scarcity, the threshold for exploring new food sources
lowers (more exploratory). During abundance, it rises (more selective).

**Screeps relevance:** This maps directly to the ExpansionPlanner's
candidate evaluation. Candidates accumulate evidence over time. When
evidence crosses thresholds (intel freshness, economic viability, route
safety, terrain quality), the campaign commits.

### 2.4 Vibrational Communication

Ants also communicate through substrate vibrations — drumming their
abdomens on the ground. This is used for alarm signals and recruitment in
some species. It travels faster than pheromone trails but has shorter
range.

**Screeps relevance:** No direct equivalent, but the concept of "local
broadcast with decay" is interesting for real-time coordination.

---

## 3. Stigmergy: The Core Principle

Stigmergy is the mechanism that makes ant colonies work without central
control. Coined by Pierre-Paul Grasse in 1959 from Greek "stigma" (mark)
and "ergon" (work): **work stimulated by marks.**

### 3.1 Definition

**Stigmergy** is indirect coordination through the environment. Agent A
modifies the shared environment (deposits pheromone, builds a structure,
drops a resource). Agent B, arriving later, perceives the modification and
changes its behavior. A and B never need to be present simultaneously.

**Contrast with direct communication:**
- **Direct:** Agent A sends message to Agent B → B receives, processes,
  responds. Information flows between agents.
- **Centralized:** Coordinator observes all agents → issues instructions.
  Information flows through central node.
- **Stigmergic:** Agent A modifies environment → Agent B perceives
  modification → B changes behavior. Information flows through the
  environment itself.

### 3.2 Properties of Stigmergic Systems

**Positive feedback:** Successful actions reinforce themselves. A forager
finding food lays pheromone → more foragers follow → more pheromone → even
more foragers. This amplifies good solutions.

**Negative feedback:** Pheromone evaporation, resource depletion, space
constraints. These prevent runaway amplification and allow the system to
adapt when conditions change.

**Fluctuation:** Random exploration by individual agents creates noise.
Some paths are explored randomly, and if they prove productive, positive
feedback locks them in. This is how ant colonies discover new food sources
they've never used before.

**Multiple interactions:** No single interaction determines the outcome.
The colony's behavior emerges from thousands of small interactions, each
one influenced by local environment state.

### 3.3 The Double-Bridge Experiment

The classic demonstration of stigmergy. Two paths connect nest to food:
one short, one long.

**Phase 1 — Exploration:** Ants explore both paths randomly. Each ant
deposits pheromone on its return trip. Initially, both paths get similar
pheromone levels.

**Phase 2 — Differentiation:** Ants on the shorter path complete round
trips faster, so they deposit pheromone more frequently per unit time.
The shorter path accumulates higher concentration.

**Phase 3 — Amplification:** More ants follow the higher-concentration
(shorter) path, depositing even more pheromone. The longer path gets
fewer visitors, its pheromone evaporates.

**Phase 4 — Convergence:** Eventually virtually all ants use the shorter
path. The colony has found the optimal solution without any ant knowing
the full layout.

**Key insight:** The system is robust to perturbation. If you place a
barrier on the short path, ants will gradually rediscover the long path
as its pheromone builds up. The colony adapts without any "replanning."

### 3.4 Why Stigmergy Works for Screeps

Screeps creeps are like ants: simple agents with limited information.
Stigmergic coordination means:
- No central path planner needed (but can be added for efficiency)
- Traffic naturally concentrates on productive routes
- Stale routes decay automatically
- The system is resilient to individual creep failures

The current Overmind has traffic heatmaps (`Memory.v1.pathing.traffic`)
but they're not used for routing. This is the biggest missed opportunity.

---

## 4. Economy — Foraging & Resource Allocation

### 4.1 Trail Reinforcement and Evaporation

**Reinforcement:** Each time an ant walks a path, it deposits pheromone.
The amount deposited is proportional to the quality of what was found
(more food = stronger deposit). This means high-value resources attract
more workers automatically.

**Evaporation:** Pheromone decays exponentially over time. The evaporation
rate determines how quickly the colony "forgets" old routes. Fast
evaporation = more adaptive but less stable. Slow evaporation = more
stable but slower to adapt.

**In Screeps terms:** The traffic heatmap should:
- Increment when a creep successfully completes a task on a tile
- Decay every tick (evaporation)
- Weight pathfinding cost matrices (high traffic = low cost = more creeps
  follow)

### 4.2 Response Threshold Task Allocation

Each ant has a **response threshold** for different task stimuli. When the
stimulus intensity exceeds the threshold, the ant performs that task.

**Stimuli and thresholds:**
- **Hunger stimulus:** Low threshold → early forager. High threshold →
  only forages when desperate.
- **Larva hunger stimulus:** Low threshold → nurse ant. High threshold →
  only feeds brood when no one else will.
- **Defense stimulus:** Low threshold → soldier. High threshold → only
  fights when colony is under direct attack.
- **Nest repair stimulus:** Low threshold → maintenance worker. High
  threshold → only repairs critical damage.

**Task switching:** When an ant is performing a task and encounters a
stimulus above its threshold for a different task, it may switch. The
probability of switching depends on the relative intensity of the two
stimuli.

**Important:** Task allocation is NOT fixed by caste (in most species).
A forager can become a nurse. A nurse can become a defender. The colony
adapts by adjusting the distribution of thresholds across the population.

**Screeps mapping:** This maps to role priority bands + body scaling.
The Queen (colony manager) computes target counts based on demand. If
demand shifts (e.g., invasion → more defenders needed), targets shift
and new creeps are spawned with the right role. Existing creeps don't
switch roles (Screeps limitation), but the spawn queue adapts.

### 4.3 Recruitment Cascades

When a forager discovers a rich food source, it doesn't just eat alone.
It recruits nestmates:

1. Discoverer returns to nest with food + trail pheromone
2. Other foragers in the nest encounter the trail and follow it
3. Each successful forager reinforces the trail
4. The trail grows stronger, attracting more foragers
5. This creates exponential growth in recruitment until the food source
   is fully exploited

**Quorum control:** The colony avoids over-recruiting to a single source.
As more ants arrive at a source, local congestion creates negative
feedback — ants bump into each other, slow down, and some turn back.
This naturally limits recruitment to the productive level.

**Screeps mapping:** This is exactly the growth scaling in the colony
manager. +1 hauler per 5k stored energy. +1 builder per 20k construction
backlog. The "recruitment cascade" is the spawn queue ramping up.

### 4.4 Resource Flow

In a mature colony, energy flows through a pipeline:

```
Sources → Foragers → Storage → Workers/Army → Tasks
                                    ↓
                              Terminals → Trade
                                    ↓
                              Labs → Compounds → Boosted creeps
```

The key insight is that **energy is not just collected — it flows through
the colony like blood through a body.** Every node in the pipeline has
capacity limits and throughput. Bottlenecks at any point slow the entire
colony.

**Screeps mapping:** This is the logistics network. Containers, storage,
terminal, links, and haulers form the energy distribution system. The
LogisticsNetwork and TransportRequestGroup handle this. The key problem
in Overmind (and most Screeps bots) is that this flow can jam — too many
creeps on the same tiles, competing for the same energy, creating traffic
that blocks everyone.

---

## 5. Movement & Pathfinding

### 5.1 Tandem Running

The simplest form of recruitment. A leader ant guides a single follower
to a food source or new nest site. The leader walks slowly, frequently
checking that the follower is still behind. The follower touches the
leader's abdomen with its antennae to signal "I'm still here."

**Advantages:** Precise guidance, no pheromone trail needed
**Disadvantages:** One-to-one, slow, doesn't scale

**Screeps relevance:** This is like a creep pathing to a specific target
with `moveTo()`. One creep, one path, no coordination.

### 5.2 Mass Recruitment

The leader lays a pheromone trail, and many followers follow simultaneously.
Much faster than tandem running, but less precise.

**Screeps relevance:** This is the main hauling pattern. Multiple haulers
follow the same route from storage to sources.

### 5.3 Swarm Movement (Army Ants)

Army ants (Eciton, Dorylus) conduct massive coordinated raids involving hundreds of thousands of individuals. Their movement patterns emerge from simple local rules:

1. **Front-line advancement**: Leading ants move outward until they encounter prey or obstacles
2. **Trail reinforcement**: Returning ants deposit pheromone, strengthening the raid column
3. **Self-organized lanes**: Ants spontaneously form inbound/outbound lanes to prevent head-on collisions
4. **Bivouac mobility**: The entire colony (including queen, brood, workers) can relocate overnight by forming a living nest structure

**Screeps mapping:**
- **Ranged escort swarms**: Multiple creeps moving in formation using shared pathfinding + relative positioning
- **Lane separation**: Assign different y-offsets for inbound vs outbound creeps on the same route
- **Mobile forward bases**: Container + spawn + tower deployments that relocate with the front

### 5.4 Stigmergic Path Optimization

The ant colony optimization (ACO) metaheuristic directly mimics trail-laying and evaporation. Applied to Screeps:

```javascript
// Pheromone map: roomName -> { [x,y]: strength }
const PHEROMONE_DECAY = 0.98;
const PHEROMONE_DEPOSIT = 1.0;

function updatePheromones(creep, success) {
  if (!success) return;
  const path = creep.memory._path || [];
  for (const step of path) {
    const key = `${step.x},${step.y}`;
    Memory.pheromones[creep.room.name][key] = 
      (Memory.pheromones[creep.room.name][key] || 0) + PHEROMONE_DEPOSIT;
  }
}

function decayPheromones(roomName) {
  const map = Memory.pheromones[roomName];
  for (const key in map) {
    map[key] *= PHEROMONE_DECAY;
    if (map[key] < 0.01) delete map[key];
  }
}

function pheromoneCostMatrix(roomName) {
  const cm = new PathFinder.CostMatrix();
  const map = Memory.pheromones[roomName] || {};
  for (const key in map) {
    const [x, y] = key.split(',').map(Number);
    // Higher pheromone = lower cost (more attractive)
    cm.set(x, y, Math.max(1, 255 - map[key] * 10));
  }
  return cm;
}
```

**Key insight**: This replaces static road planning with emergent route optimization. Roads become "frozen pheromone" — build roads where pheromone consistently exceeds a threshold.

### 5.5 Cross-Room Navigation

Ants use **edge pheromones** at territory boundaries and **inter-nest trails** between satellite colonies.

**Screeps implementation**:
- Portal-aware pathfinding with cached inter-room segments
- `Memory.strategy.routeCache` stores room-to-room paths with TTL
- Highway detection: rooms with `Memory.roomIntel[room].highway = true` get priority routing

---

## 6. Military — Raid & Defense

### 6.1 Swarm Raids (Army Ant Style)

Army ants don't send scouts; the entire worker force moves as a coordinated front. Key principles:

- **No central commander**: Each ant follows local rules (follow pheromone, attack adjacent prey, avoid collisions)
- **Mass overwhelms**: Individual weakness compensated by numbers — a single Eciton worker is weak, but 200,000 together devastate prey colonies
- **Dynamic front**: The raid front expands/contracts based on prey density
- **Bivouac defense**: The living nest structure protects queen and brood; workers form defensive layers

**Screeps translation:**
| Ant Concept | Screeps Implementation |
|-------------|------------------------|
| Raid column | Creep squad with shared `Memory.squad.id` |
| Front-line advancement | `creep.moveTo(target, {costMatrix: swarmCostMatrix})` |
| Inbound/outbound lanes | Odd/even creep IDs use different y-offsets |
| Bivouac | Forward operating base: container + spawn + tower + ramparts |
| Prey overwhelm | Focus fire: all ranged creeps target same enemy |
| Dynamic front | Squad `targetRoom` updates based on intel freshness |

### 6.2 Defense Mechanisms

**Layered defense (depth in defense):**
1. **Perimeter** (ramparts/walls) — passive, high HP, buys time
2. **Active repair** (repairer creeps) — fixes breaches in real-time
3. **Tower defense** — ranged damage + repair + heal, energy-efficient
4. **Mobile defenders** — melee/ranged creeps that intercept
5. **Counter-attack** — pursuit beyond walls to eliminate siege

**Alarm pheromone analogue:** `Memory.warPlan.threat[room]` triggers instant defender spawn + tower priority shift.

### 6.3 Ant Warfare Tactics Mapped to Screeps

| Ant Tactic | Screeps Equivalent |
|------------|---------------------|
| Major worker soldiers (large heads, strong mandibles) | `TOUGH` + `ATTACK` boosted creeps (XGHO2, XUH2O) |
| Formic acid spray (ranged chemical) | `RANGED_ATTACK` creeps with `XGH2O` boost |
| Suicide bombers (exploding workers) | `ATTACK` creeps with `HEAL` body — charge and detonate |
| Slave raiding (capture brood) | `CLAIM` creeps + `dismantle` enemy spawn |
| Territorial marking | `SignController` + room reservation |
| Nestmate recognition (cuticular hydrocarbons) | `creep.owner.username` check + `Memory.allies` list |

### 6.4 Overmind Military Gaps

1. **No swarm coordination**: Creeps act independently; no formation movement
2. **Static defense**: Towers fire at nearest; no focus-fire or target prioritization
3. **No forward bases**: All production at home room; no mobile logistics
4. **Reactive not proactive**: Responds to threats after detection, no patrol/early warning
5. **Single-room focus**: No multi-room squad operations

---

## 7. Colony Growth & Expansion

### 7.1 Reproductive Strategies

**Independent founding (claustral):** Queen seals in, raises nanitics alone. High mortality, low investment.
- Screeps: New room claim with minimal creeps (1 harvester, 1 upgrader). High risk.

**Dependent founding (budding):** Queen + worker group leave together. Lower risk, higher investment.
- Screeps: Expansion campaign with escrow energy, pre-built spawn, defender escort.

**Polygyne budding:** Multiple queens, nests connected by trails. Functional supercolony.
- Screeps: Multi-room empire with shared logistics (`Memory.strategy.empireLogistics`).

### 7.2 Temnothorax House-Hunting (Decision Making)

*Temnothorax* ants choose new nest sites through distributed consensus:
1. **Scouts** explore, evaluate sites (size, darkness, entrance size)
2. **Recruitment**: Good scouts lead tandem runs to site
3. **Quorum**: When enough ants at site, they switch to carrying brood
4. **Commitment**: Transport accelerates; colony moves

**Screeps ExpansionPlanner parallels:**
- Scouts = observer creeps / remote intel
- Evaluation = room scoring (sources, controller, terrain, neighbors)
- Recruitment = campaign phase progression (escrow → probe → claim)
- Quorum = threshold checks (intel age < 5000 ticks, energy > 500k, route safe)
- Commitment = spawn construction + defender deployment

### 7.3 Supercolony Organization (Argentine Ants)

*Linepithema humile* forms vast supercolonies — millions of nests, billions of workers, no aggression between nests. Key mechanisms:
- **Reduced aggression**: Genetic uniformity → no nestmate recognition conflicts
- **Trail sharing**: Pheromone trails connect all nests
- **Resource redistribution**: Food flows across entire network

**Screeps lesson**: Treat all owned rooms as one economic unit. `Memory.strategy.economy.totalStockpile` should drive global spawn decisions, not per-room isolation.

---

## 8. Screeps War Mechanics

### 8.1 Combat Fundamentals

| Mechanic | Details |
|----------|---------|
| `ATTACK` | Melee, 30 damage/tick, requires adjacent |
| `RANGED_ATTACK` | 10 damage at range ≤3, 4 at range ≤2, 1 at range >3 |
| `HEAL` | 12 heal/tick self, 4 at range ≤3 |
| `TOUGH` | No damage reduction, but damage hits TOUGH parts first |
| `RANGED_HEAL` (power) | Power creep only |
| Boosts | `XUH2O` (attack ×2), `XGHO2` (ranged ×2), `XZH2O` (heal ×2), `XUH2O` (tough ×1.5) |
| Tower | 600 attack, 400 heal, 800 repair at range ≤5; falloff beyond 5 |
| Rampart | Up to 300M HP (RCL 8), blocks enemy movement |
| Safe mode | 20k ticks invulnerability, 50k tick cooldown |

### 8.2 Siege Patterns

**Standard siege:**
1. Attacker builds forward base (spawn + tower + ramparts) 2-3 rooms out
2. Creeps dismantle ramparts → breach walls → target spawn/controller
3. Defender uses towers + repairers + active defenders

**Attrition siege:** Drain defender bucket via sustained pressure; force CPU timeout.

**Nuke siege:** Launch nuke → 50k tick landing → attacker hits during landing tick when defender safe mode may be down.

### 8.3 Defense-in-Depth Architecture

```
Room Edge
    │
    ▼
┌─────────────────────────────────────┐
│  Rampart Ring (300M HP at RCL 8)    │  ← Passive, buys 1000s of ticks
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Tower Ring (6× at RCL 8)           │  ← Active, energy-efficient damage
│  - Focus fire priority targets      │
│  - Auto-repair damaged ramparts     │
│  - Heal friendly creeps             │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Repairer Creeps                    │  ← Real-time breach sealing
│  - Priority: wall < rampart < tower │
│  - Use container energy buffer      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Active Defenders (melee/ranged)    │  ← Intercept, counter-attack
│  - Boosted: XUH2O / XGHO2           │
│  - Formation: tank + DPS + heal     │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Core: Spawn, Storage, Terminal     │  ← Last stand
│  - Safe mode trigger at 50% rampart │
│  - Emergency spawn: MINIMUM_CIVILIAN_FLOOR │
└─────────────────────────────────────┘
```

---

## 9. Overmind Audit

### 9.1 Strengths
- **ColonyManager**: Phase-aware economic planning, civilian scaling by RCL
- **ExpansionPlanner**: Staged campaigns with escrow, evidence-based commits
- **LogisticsNetwork**: TransportRequestGroup, link networks, terminal balancing
- **WarRoom**: Threat assessment, doctrine selection, squad templates
- **Pathing**: RouteCache, cost matrix profiles, stuck detection
- **Metrics**: CPU tracking, KPI history, debug reports

### 9.2 Critical Gaps (Ant Colony Perspective)

| Ant Principle | Overmind Status | Fix |
|---------------|-----------------|-----|
| Stigmergic routing | Heatmaps exist but unused | Wire traffic → costMatrix |
| Pheromone decay | No evaporation mechanic | Add decay tick in main loop |
| Task switching | Fixed roles only | Spawn queue adapts, but no creep reassignment |
| Alarm pheromone | WarPlan.threat exists | Broadcast to all rooms, instant defender spawn |
| Recruitment cascades | Scaling formulas exist | Make them dynamic (demand-driven) |
| Swarm coordination | No formation movement | Squad moveTo with relative offsets |
| Forward bases | Not implemented | Mobile FOB module |
| Supercolony economy | Per-room isolation | Global energy pool for spawn decisions |
| Quorum decisions | Expansion only | Apply to all major commitments |
| Lane separation | No inbound/outbound split | Odd/even creep y-offsets |

### 9.3 Architecture Smells
- **God modules**: `colony.manager.js` >3000 lines, does everything
- **Memory bloat**: `Memory.v1` + `Memory.strategy` + `Memory.warPlan` + `Memory.roomIntel` overlap
- **Circular deps**: `war.room.js` ↔ `role.defender.js` masked by safeRequire
- **CPU budget rigidity**: Hard/soft limits but no graceful degradation per role
- **No stigmergic core**: All coordination is centralized (Queen, WarRoom, LogisticsNetwork)

---

## 10. Design Principles for New Colony

### 10.1 Core Philosophy: Stigmergy First, Centralization Second

> **"The environment is the brain."** — Deborah Gordon

1. **Pheromone layer**: Every creep deposits virtual pheromone on task completion. Pathfinding uses pheromone-weighted cost matrices.
2. **Decay tick**: Every tick, all pheromone maps decay. Stale routes fade.
3. **Local rules**: Creep behavior = respond to local pheromone + immediate stimuli (energy, enemies, construction sites).
4. **Central oversight only for**: Spawn decisions (queen), war declaration, expansion commits.

### 10.2 Role Design: Response Thresholds, Not Fixed Castes

```javascript
// Instead of fixed role modules, use stimulus-response
const STIMULI = {
  energy: { source: 'room.energyAvailable', threshold: 'dynamic' },
  hauling: { source: 'storage.store[RESOURCE_ENERGY]', threshold: 5000 },
  defense: { source: 'Memory.warPlan.threat[room]', threshold: 0.3 },
  build: { source: 'room.find(FIND_CONSTRUCTION_SITES).length', threshold: 1 },
  upgrade: { source: 'controller.progressTotal - controller.progress', threshold: 0 }
};

function computeRoleDemand(room) {
  const demands = {};
  for (const [role, config] of Object.entries(ROLE_STIMULI)) {
    const stimulus = evalStimulus(config.source, room);
    demands[role] = Math.max(0, Math.floor((stimulus - config.threshold) / config.scaling));
  }
  return demands;
}
```

### 10.3 Memory Architecture: Flat, Versioned, Evictable

```
Memory = {
  v: 2,
  ticks: Game.time,
  pheromones: { [roomName]: { [xyKey]: strength } },
  rooms: { [roomName]: {
    plan: ColonyPlan,
    intel: RoomIntel,
    threats: ThreatLevel,
    logistics: { sources, sinks, flow }
  }},
  empire: {
    economy: { totalEnergy, stockpile, flowRate },
    expansion: { candidates[], activeCampaigns[] },
    war: { doctrine, squads[], threats[] },
    allies: [username]
  },
  meta: { cpuBudget, bucketTarget, version }
}
```

### 10.4 Implementation Roadmap

1. **Phase 1: Stigmergic Core**
   - Add pheromone maps to Memory
   - Implement decay tick in main loop
   - Wire traffic heatmap → cost matrix for pathfinding
   - Test with hauler routes

2. **Phase 2: Role Evolution**
   - Replace fixed role modules with stimulus-response system
   - Implement dynamic spawn queue based on demand
   - Keep role.memory for backward compatibility

3. **Phase 3: Military Upgrades**
   - Add squad system with formation movement
   - Implement forward base deployment
   - Add lane separation for inbound/outbound traffic

4. **Phase 4: Economic Integration**
   - Global energy pool for spawn decisions
   - Cross-room pheromone trails for inter-room routing
   - Highway detection and optimization

---

## 11. Traffic Heatmap Routing, Pheromone Decay & Road Building

### 11.1 Current Overmind Implementation

Overmind already collects traffic data in `Memory.v1.pathing.traffic`:
```javascript
// Structure: { "roomName": { "x,y": count } }
// Updated in utils.pathing when creeps move
```

**Problem**: This data is only used for debugging/stats, not for actual pathfinding.

### 11.2 Stigmergic Routing Implementation

**Core Algorithm**:
1. **Deposit**: When a creep successfully completes a movement segment, add pheromone
2. **Evaporate**: Every tick, multiply all pheromone values by decay factor (0.98-0.995)
3. **Threshold**: Convert pheromone density to movement cost (higher pheromone = lower cost)
4. **Pathfinding**: Use pheromone-adjusted cost matrix in `PathFinder.search`

**Code Implementation**:
```javascript
// In main loop, before tick decay
for (const roomName in Memory.pheromones) {
  decayPheromones(roomName);
}

// When creep moves successfully (in Creep.prototype.moveTo wrapper)
if (result === OK) {
  const path = this._path || [];
  for (let i = 0; i < Math.min(5, path.length); i++) { // Only recent steps
    const pos = path[i];
    const key = `${pos.x},${pos.y}`;
    const roomName = pos.roomName;
    if (!Memory.pheromones[roomName]) Memory.pheromones[roomName] = {};
    Memory.pheromones[roomName][key] = (Memory.pheromones[roomName][key] || 0) + 1;
  }
}

// PathFinder wrapper
function findPathWithPheromones(fromPos, toPos, opts = {}) {
  const roomName = fromPos.roomName;
  const costMatrix = opts.costMatrix || new PathFinder.CostMatrix();
  
  // Apply pheromone discounts
  const pheromoneMap = Memory.pheromones[roomName] || {};
  for (const key in pheromoneMap) {
    const [x, y] = key.split(',').map(Number);
    const pheromone = pheromoneMap[key];
    // Convert pheromone to cost reduction (max 80% reduction)
    const costReduction = Math.min(0.8, pheromone * 0.05); 
    const originalCost = costMatrix.get(x, y) || 1;
    costMatrix.set(x, y, Math.max(1, Math.floor(originalCost * (1 - costReduction))));
  }
  
  return PathFinder.search(fromPos, {pos: toPos, range: 1}, 
    Object.assign({}, opts, {costMatrix}));
}
```

### 11.3 Road Building from Pheromone Trails

**Concept**: Permanently build roads where pheromone concentration consistently exceeds a threshold.

**Algorithm**:
1. Every 1000 ticks, analyze pheromone maps
2. For each tile, if average pheromone over last N cycles > threshold → mark for road
3. Prioritize road construction in high-traffic corridors
4. Build roads via construction sites (like any other structure)

**Benefits**:
- Reduces movement cost by 50% (road benefit)
- Self-optimizing network: roads form where actually needed
- Maintenance: repair creeps prioritize roads with highest pheromone decay

### 11.4 Pheromone Types for Different Purposes

| Pheromone Type | Source | Decay Rate | Use Case |
|----------------|--------|------------|----------|
| **Trail** | Movement completion | 0.98/tick | Pathfinding optimization |
| **Alarm** | Creep under attack | 0.5/tick | Emergency response, defender recall |
| **Recruitment** | Successful harvest/upgrade | 0.95/tick | Spawn request amplification |
| **Territory** | Border patrols | 0.995/tick | Room ownership signaling |

### 11.5 Integration Points

- **Spawn Decisions**: High trail pheromone to sources → prioritize hauler spawning
- **Defense**: Alarm pheromone in room → boost defender priority in spawn queue
- **Construction**: High traffic corridors → auto-propose road sites
- **Mineral Routes**: Mineral harvesting paths get reinforced naturally
- **Highway Detection**: Consistently high pheromone between rooms → prioritize portal construction

### 11.6 Expected Benefits

1. **20-30% reduction in average travel time** for haulers/upgraders
2. **Automatic load balancing**: creeps naturally spread to less congested paths
3. **Emergency response**: alarm pheromones create instant evacuation routes
4. **Reduced CPU**: less need for complex path caching, more reliance on simple pheromone gradients
5. **Organic infrastructure**: roads and terminals build themselves based on actual usage

---

*This completes the ant colony behavior synthesis for Screeps AI design.*