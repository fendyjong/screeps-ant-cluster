# Progressive Ant Supercolony — Research Reference

This document captures everything we know about how real ant colonies work,
what Screeps supports, what the current codebase does well and poorly, and
the design principles for a **progressive ant supercolony** — connected,
self-sufficient, exponentially growing, and eventually decentralized down
to per-creep quorum decisions. It is the single source of truth for
architectural decisions. Companion doc:
[`peaceful-strategy-analysis.md`](../peaceful-strategy-analysis.md) covers
the economic-denial ("starve rivals") side of military doctrine that §6
below doesn't.

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

Ant colonies progress through distinct phases, each with different energy
investment trade-offs. Our bot mirrors this lifecycle with emphasis on
**polygyne budding** — multiple queens, colonies reproduce by fission.

| Phase | Biology | Screeps | Key Principle |
|-------|---------|---------|---------------|
| Founding | Queen + nanitics, >90% mortality | RCL 1-2, spawn + 2 harvesters | Survival is existential |
| Ergonomic | Exponential growth, zero reproduction | RCL 3-7, scale workers proportionally | Growth before reproduction |
| Reproductive | Budding/fission, queen dispersal | RCL 8+, ExpansionPlanner campaigns | Polygyne = rapid deployment |
| Death | Queen loss, resource exhaustion | Spawn loss, energy starvation | Design for graceful degradation |

### 1.1 Founding Stage

A single mated queen (claustral founding) or multiple cooperating queens
(pleometrosis) raise the first workers from metabolic reserves alone — no
foraging. First-generation "nanitics" are small, cheap, generalists.
Transition to normal workers happens when resource flow stabilizes.

**Key insight**: In polygyne colonies there is no claustral phase. New
colonies **bud** — queen cohort + workers + brood split from the parent.
Founding mortality drops from >99% to ~10-30%. Our architecture principle:
**every new room should be a bud, not an independent founding event**.

**Screeps mapping**: RCL 1-2. The spawn is the queen. First 2 harvesters
are the nanitics — small generalist bodies (`[WORK, CARRY, MOVE]` = 200
energy). Every tick is existential. `MINIMUM_CIVILIAN_FLOOR` enforces
critical colony size.

```javascript
// Minimum viable colony: 2 harvesters + 1 upgrader, nanitic bodies
const NANITIC_BODY = [WORK, CARRY, MOVE];
const MINIMUM_COLONY = { harvesters: 2, upgraders: 1, body: NANITIC_BODY };
```

Colony size drives specialization. Below ~50 creeps every creep is a
generalist. Above that, specialization emerges through response thresholds
(see Section 4) — creeps self-select tasks based on local stimulus
intensity vs their internal thresholds. This self-organizes without
central control or a scheduler.

---

### 1.2 Ergonomic Stage

All energy into workers. Zero reproduction. Positive feedback loop: more
workers → more energy → more workers. The colony does NOT invest in
reproduction until stable. Premature expansion weakens the colony and
risks collapse.

**How ant colonies handle disruption (applies to Screeps):**
- Worker loss → remaining workers switch tasks within hours (threshold plasticity)
- Food discovery → pheromone cascade recruits foragers in seconds
- Nest damage → damage signal triggers generalist recruitment
- Queen loss → polygyne colonies survive (other queens take over); monogyne colonies die

**Entropy is intentional**: Exploration (scouts, random walks) prevents
convergence on local optima. Exploitation (specialists, trail reinforcement)
optimizes throughput. Young colonies explore more; mature ones exploit more.
Perturbations should spike exploration. This is the exploration/exploitation
tradeoff familiar from ML.

**Screeps mapping**: RCL 3-7. Scale creeps to energy surplus. Development
(labs, terminal, factory) is investment in future growth, not consumption.

```javascript
// Demand-driven spawn: thresholds adjust based on room stimuli
function computeRoleDemand(room) {
  const stimulus = {
    harvest: 1 - room.energyAvailable / room.energyCapacityAvailable,
    haul: (room.storage?.store[RESOURCE_ENERGY] ?? 0) < 5000 ? 1 : 0,
    build: Math.min(room.find(FIND_CONSTRUCTION_SITES).length / 5, 1),
    defend: Memory.warPlan?.threat?.[room.name] || 0,
  };
  // Scale demand into target creep counts
  return Object.fromEntries(
    Object.entries(stimulus).map(([r, s]) => [r, Math.floor(s * MAX_PER_ROLE[r])])
  );
}
```

---

### 1.3 Reproductive Stage (Budding)

Mature colonies reproduce by **budding** — queen cohorts + workers + brood
split off to form daughter colonies. This is the core of our architecture.

**Budding vs alternatives**:

| Strategy | Founder mortality | Time to maturity | Screeps equivalent |
|----------|-------------------|------------------|-------------------|
| Independent founding | >99% | Years | Claim room with 0 infrastructure |
| Swarming | <10% | Months | Send creeps in waves |
| **Budding** | **10-30%** | **Weeks** | **Claim + pre-built spawn + escrow energy** |

**When to bud** (trigger conditions from biology):
1. Colony size threshold reached (energy stockpile > reserve floor)
2. Resource saturation (sources consistently full, storage capped)
3. Viable target identified (intel: safe route, good sources, no hostiles)
4. Queen cohort ready (GCL slot available)

**The supergene analogy**: Fire ants use a single ~13 Mb chromosome region
(Gp-9) that locks together queen morphology, worker tolerance, and
aggression as a co-adapted unit. Our equivalent: expansion flags. When
`Memory.empire.expansion.candidates` crosses thresholds (source count,
terrain safety, threat level), it triggers budding with locked-in role
compositions, body templates, and defense posture.

**Screeps mapping — ExpansionPlanner phases**:
| Phase | Action |
|-------|--------|
| Scout | `Game.map.findRoute`, evaluate room |
| Reserve | Reserve controller, prevent counter-claim |
| Outpost | Remote miner/hauler pair, container |
| Claim | `claimController` + pioneer creeps |
| Bootstrap | Spawn, extensions, storage, RCL 1→3 |
| Integrate | Link to terminal network, shared logistics |
| Specialize | Assign room role (mineral, power, military) |

---

### 1.4 Colony Death

| Mode | Screeps Equivalent | Recovery |
|------|-------------------|----------|
| Queen death (senescence/predation) | Spawn destroyed | In polygyne: other rooms continue. Rebuild if possible. |
| Worker collapse | Mass creep death, zero income | Emergency spawn from reserves. Cut non-essential roles. |
| Resource exhaustion | Sources depleted, no expansion | Trigger scout allocation for new rooms. |
| Overwhelming attack | Hostile takeover | Safe mode. Request reinforcement from neighbor rooms. |

**Polygyne advantage**: Losing one room (nest) doesn't kill the colony.
`colony.manager.plan.economy.survival` triggers: cut non-essential roles,
funnel energy to spawn reconstruction, request reinforcements. The empire
continues through the polydomous network. This is our graceful degradation
model.

---

### 1.5 Design Implications

| # | Principle | Implementation |
|---|-----------|----------------|
| 1 | **Budding, not founding** | New rooms deploy with starter kit: pioneer creeps + escrow energy + blueprint |
| 2 | **Response thresholds drive spawn** | `colony.manager` computes role demand from room-level stimuli, not static ratios |
| 3 | **Graceful degradation** | Losing one room triggers survival mode, not cascade failure. Rest of empire continues. |
| 4 | **Expansion = budding** | ExpansionPlanner phases mirror biology: scout → reserve → claim → bootstrap → integrate |
| 5 | **Exploration/exploitation balance** | Young colonies explore (scouts, generalists). Mature colonies exploit (specialists, trails). Perturbations spike exploration. |

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

**Territory marking is cheap compared to occupation, and that asymmetry decides
strategy.** Marking a boundary costs patrol effort; occupying and defending a
site costs a nest. Colonies therefore hold far more *territory* than they hold
*nests* — the marked range is the foraging range, not the built range.

**Measured here (2026-07-30).** Screeps reproduces the asymmetry almost exactly,
verified on disk against `@screeps/common/lib/constants.js`:

| | reserving a room | claiming a room |
|---|---|---|
| source yield | 3000 cap → 10 energy/tick each | identical |
| cost | one 650-energy `[CLAIM, MOVE]` creep, ~1.1 energy/tick amortised | a **15000-energy** spawn built remotely |
| ongoing obligation | none; lapses harmlessly | controller **downgrades** in 20000 ticks (`CONTROLLER_DOWNGRADE` at RCL 1) unless continuously upgraded |
| requires GCL | no | yes |

Reservation buys the *entire* energy benefit of a room for ~1/700th of the
capital cost and no standing obligation. Claiming buys the same energy plus a
second controller for GCL growth and eventual independence — genuinely valuable,
but a different kind of investment rather than a bigger version of the same one.

The colony consequently does what ants do: **mark wide, build narrow.** It
forages and reserves its whole neighbourhood while maintaining one nest, and
claiming becomes worthwhile only when the goal shifts from income to
independence.

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

**Switching is a rate, not a step change — and this matters enormously.** A
threshold model alone implies that when a stimulus crosses the whole
population's thresholds at once, the whole population switches at once. Real
colonies cannot do that: recruitment costs travel time and physical contact, and
workers *accelerate a transition* toward a task rather than teleporting into it.
Reallocation plays out over many time steps.

**Observed here, and it was destructive.** With instantaneous switching, a
saturating stimulus repeatedly moved nearly the entire colony in a single tick —
23 of 24 creeps onto `supply` (tick 222500, 18 simultaneous `abandon` switches),
24 of 25 onto `build` (tick 222800). Congestion damping could not stop it: since
occupancy is sampled from the previous tick, every creep evaluated against a
near-empty task and committed before any of them counted as crowding. The colony
oscillated between monocultures instead of maintaining a division of labor.

Capping how many creeps may *join* a task per tick removes the pathology
entirely — stampedes went from six occurrences to zero, and the distribution
settled into a stable mix. The rate limit only binds during surges; a
`deferred` counter in the snapshot shows it refusing 3 recruits during a spike
and 0 otherwise.

Note this is a *different* mechanism from congestion damping, and both are
needed. Congestion answers "is this task already crowded?"; the rate limit
answers "how fast can labor physically move?" The first is about equilibrium, the
second about the path taken to reach it.

Source: [Scientific Reports — Task allocation in a cooperative society](https://www.nature.com/articles/s41598-020-59920-5)
(worth noting: a search for quantitative recruitment-kinetics measurements did
not turn up usable numbers, so the rate limit's value is tuned from observed
behavior rather than derived from a published figure)

**Important:** Task allocation is NOT fixed by caste (in most species).
A forager can become a nurse. A nurse can become a defender. The colony
adapts by adjusting the distribution of thresholds across the population.

### 4.2.2 The colony tunes its own constants

Response thresholds are not the only heritable thing worth evolving. Individual
ants vary measurably in *how* they decide, not just *what* they decide — how
readily they abandon a task, how often they try something unprompted, how large
a load they carry before returning. Treating those as heritable traits rather
than fixed rules lets the colony discover them.

**Implemented and measured (2026-07-31).** Three constants that had been global
and hand-picked became per-creep genes, inherited and mutated alongside the
thresholds, each with bounds to keep selection out of degenerate corners. After
~3900 generations the colony had moved all three away from the values chosen for
it:

| trait | hand-picked | evolved mean |
|---|---|---|
| switch buffer (decisiveness) | 0.15 | **0.220** |
| exploration chance (curiosity) | 0.02 | **0.040** |
| return fraction (load size) | 0.70 | **0.566** |

Fitness rose from ~0.68 to 0.85–0.91, and the pool stayed diverse (switch buffer
spanning 0.065–0.36) rather than converging on one answer.

The return-fraction result is the instructive one. The hand-picked 0.70 assumed
fuller loads mean fewer trips and therefore less overhead. Selection preferred
~0.57 — leaving earlier — because time spent topping up at a contended source
costs more than the extra journey does. That is a real foraging trade-off, and
central-place foraging theory predicts exactly this shape: optimal load size
falls as loading becomes slower relative to travel.

**Why this matters beyond tuning.** A global constant that is wrong is wrong for
every creep simultaneously; several colony collapses in this project came from
exactly that. The same value as a gene is wrong only for its bearer, costs that
creep its fitness, and is bred out. Moving a decision from code into the genome
converts a systemic risk into a local one.

**Where a real caste is unavoidable — and why that is still faithful.** The
qualifier "in most species" matters. Many ants *do* have morphological castes:
*Atta* majors and minors, soldier castes with mandibles built for defence rather
than foraging. Those individuals are not assigned a role by policy; their bodies
make some work physically impossible, and the colony produces them deliberately
in the proportions it needs.

Our reserver is exactly that case. A `[CLAIM, MOVE]` creep has no WORK and no
CARRY, so it cannot harvest, build or upgrade no matter what its thresholds say.
Behaviour follows morphology, and the colony must therefore *decide to build one*
rather than let one emerge from stimulus. This is the only such exception in the
design and it is deliberately narrow: every creep that physically can do general
work still chooses its own task from thresholds, with no assignment anywhere.

### 4.2.1 Inactive workers are a feature, not waste

Roughly **40% of workers in a colony are persistently inactive**, and this is not
a failure of the allocation system — it is load-bearing. Charbonneau, Sasaki and
Dornhaus showed experimentally in *Temnothorax rugatulus* that inactive workers
act as a **reserve labor force**: when active workers are removed they are
replaced within about a week, whereas removed inactive workers are not replaced.
Modelling work reaches the same conclusion from the other direction — colonies
whose workers have **variable** response thresholds persist longer than colonies
with uniform thresholds, because the high-threshold individuals are still
available when the active ones fatigue. The trade is explicit: lower short-term
productivity, higher long-term persistence.

**Observed in our colony (2026-07-30, tick ~86120):** a creep whose jittered
profile put *every* threshold above *every* available stimulus sat parked on one
task, moving only when the exploration roll fired. That is this reserve caste
emerging for free out of threshold jitter — no special-casing required.

**One divergence worth correcting:** real inactive ants *rest*. Ours keeps
executing its last task at a negative margin, burning CPU and occupying tiles.
A genuine idle state would be both more faithful and cheaper.

Sources: [PLOS One](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0184074),
[Scientific Reports](https://www.nature.com/articles/srep20846)

### 4.2.2 Growth regulation: satiation feedback, not a target headcount

Colonies do not hold a target worker count. Production is governed by **closed-loop
satiation feedback**: successful foraging amplifies recruitment, while met needs
suppress it — well-fed larvae emit less hunger signal, and full reserves reduce
foraging recruitment. Negative feedback exists specifically to prevent
overinvestment in a satisfied need. At the individual level the loop is mediated
by **crop load**: how full a recipient ant is controls food flow rate, and how
full a forager is controls its trip frequency.

**Applied here (M2):** the colony has no target size. Below a survival floor it
always replaces; above it, it spawns only while reserves sit satiated — the
signal that it can afford more brood. The loop closes itself, because spawning
drains the reserve below the surplus ratio and growth pauses until foragers
refill it. If added workers cost more than they return, the ratio never recovers
and growth stops without anyone deciding to stop it.

**Observed:** with a fixed N=4 the colony sat at 300/300 energy indefinitely —
visible surplus it structurally could not use. Under satiation-driven spawning it
grew to the safety ceiling of 10 while *still* holding 300/300, confirming the
surplus was real and that ten workers remain within carrying capacity.

Sources: [J Exp Biol](https://journals.biologists.com/jeb/article/211/14/2224/17598/Carbohydrate-regulation-in-relation-to-colony),
[Individual crop loads (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5862530/),
[Harvester ant foraging as a closed-loop excitable system (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6294393/)

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

### 4.3.0 A colony that cannot store is limited by its worst tick

Before storage existed, this colony's entire energy capacity was the spawn (300)
plus 30 extensions (50 each) — 1800. Income it could not absorb within about
fifty ticks was simply never harvested, because a Screeps source refills on a
fixed 300-tick timer whether or not anyone drew from it. Measured consequence:
**1.70 energy/tick reached the controller against roughly 35 available**, and the
colony had spent 1.79M of the 5.28M control points needed for GCL 3 with no
prospect of closing the gap.

Ants solved this with dedicated storage castes and chambers. *Myrmecocystus*
repletes hang from the nest ceiling as living vessels, gorged during a glut and
tapped during dearth; *Pogonomyrmex* seed harvesters keep granary chambers. The
principle is the same in both: **a colony without a buffer grows at the rate of
its worst moment rather than its average one.**

Two mechanisms were needed, and the second was found only by measuring the first.

1. *The store itself.* One `STRUCTURE_STORAGE` holds 1,000,000 and does not
   decay — verified against `CONTROLLER_STRUCTURES.storage` (1 from RCL 4) and
   `STORAGE_CAPACITY` in `@screeps/common/lib/constants.js`.
2. *A dedicated inflow.* Filling the store from nest overflow was tried first and
   **failed outright** — it sat at 0 for 5319 ticks, because spawning drains the
   nest at ~4.4 energy/tick, so spawn and extensions always had room and nothing
   ever spilled over. A leaky bucket never overflows. Income was split by origin
   instead: local suppliers feed the nest, remote foragers bank. That is also the
   more honest reading of the biology — a returning forager's load is surplus
   precisely because the nest was being fed while it was away.

The throughput argument for the store is separate from the buffering one and
turned out to matter more. Harvesting is rate-limited to `HARVEST_POWER` (2) per
WORK part per tick, so a 2-WORK creep spends ~50 ticks filling a 100-energy
store; a withdraw is one instant transfer. An upgrader that mines its own energy
spends most of its life not upgrading. **Central-place foraging theory predicts
exactly this**: as travel and handling time rise, delivery rate falls even though
the resource is unlimited.

Measured: upgrade output 1.70 to 1.97 energy/tick at comparable headcount. The
store itself holds ~0 in steady state, which is the correct outcome rather than a
fault — it is operating as a conduit, and the binding constraint has moved from
buffer capacity to foraging inflow.

Sources: [AntWiki — Myrmecocystus](https://www.antwiki.org/wiki/Myrmecocystus),
[Encyclopedia of Social Insects — food storage](https://link.springer.com/referenceworkentry/10.1007/978-3-030-28102-1_60)

### 4.3.1 A shortage must push foraging outward, not inward

An intuitive crisis response — send everyone to the nearest food — is actively
harmful once the near source is already saturated. Adding workers to a patch
that is fully exploited yields nothing while removing them from everywhere else.

The literature is genuinely mixed on direction and worth stating honestly rather
than cherry-picking: *Formica* range further when local food is scarce, while
Argentine ants restrict their range under scarcity and travel further when
resources are plentiful. What transfers cleanly is **exploitation competition** —
resource depletion near the nest drives individuals to forage at greater
distances, where better load sizes are available.

**Measured here (2026-07-31), as a failure.** When energy collapsed to 27-268 of
1800 capacity, the `supply` stimulus saturated to 1.0 and outbid `remote` at its
0.55 ceiling. Every creep crowded the two home sources, which sustain 10 WORK
between them and were already saturated. The colony's own crisis response
switched off the only activity that brings *new* energy in, and the shortage
deepened — population fell from 26 to 2.

The distinction that matters: **supply moves energy that already exists; remote
foraging creates income.** During a shortage the second is what counts. Letting a
shortage raise the remote signal as well as the supply signal changed foraging
under low energy from **0 creeps to an average of 9.5**, and population went from
oscillating 26→2 to holding steady at 25-26.

Sources: [PMC — Foraging loads of red wood ants](https://pmc.ncbi.nlm.nih.gov/articles/PMC4878371/),
[AskNature — Food availability regulates foraging speed](https://asknature.org/strategy/food-availability-regulates-foraging-speed/)

**Measured here (2026-07-30).** Quorum control is not optional at scale. With a
saturating supply stimulus and no congestion term, a colony of 24 put **23 creeps
on `supply`** (tick 131800) — a task needing roughly two — while `build` and
`upgrade` went unstaffed. The same code was harmless at four creeps, because
four is below the point where over-recruitment costs anything.

Damping each stimulus by the number of creeps already committed to it
(`stimulus / (1 + occupancy × CONGESTION_FACTOR)`) reproduces the biological
effect: the late-arriving worker perceives a weaker signal than the first, so
recruitment self-caps near the productive level. After the change, an energy dip
to 167 drew 7 creeps to supply instead of 23, and all three tasks stayed staffed
(supply 7 / upgrade 12 / build 6).

Occupancy must be sampled from the *previous* tick's committed tasks, before any
creep decides this tick. Counting as they decide would make the damping depend on
iteration order, so the first creep polled would see no congestion and the last
would see all of it.

**Congestion must be measured against what a task can absorb, not against raw
headcount.** Dividing every stimulus by its occupancy was worse than having no
damping at all: at 25 creeps it scaled signals down by up to ~9×, pushing all of
them beneath every threshold. No creep ever saw a positive margin, so rule 1
("keep current task") applied universally and the colony froze on whatever
history had assigned — 5–12 workers sat on `build` while *zero* construction
sites existed.

The correction is that congestion only applies to workers **beyond** a task's
capacity, because arriving at an uncrowded site genuinely costs nothing:
`stimulus / (1 + max(0, occupancy − capacity) × factor)`. Capacity is per-task
and reflects the real sink — one spawn saturates after a couple of deliverers, a
controller absorbs as many upgraders as the colony can field, and build capacity
scales with actual site count, so no sites means no capacity and the task
correctly repels workers. After the change, `upgrade` recovered from a damped
0.145 to its true 0.5, and stranded builders fell from 7–9 to 2–5 while upgraders
rose from 8 to 18.

### 7.4 Nest size is driven by population, not the reverse

Colonies do not build capacity ahead of need and then grow into it. **Population
size controls nest area, not vice versa** — as workers are born, digging activity
rises and the nest expands to match. The proximate triggers are local and
stigmergic: workers perceive ant density and dig more where it is high, relocated
brood spatially guides where new chambers form, and freshly-excavated pellets
plus stridulation recruit further diggers to an active face.

**Directly relevant to our ceiling.** The colony reached RCL 3 with 25 creeps
while `energyCapacity` stayed at 300 — one spawn, zero extensions. Verified
against `@screeps/common/lib/constants.js` on disk: `CONTROLLER_STRUCTURES`
permits 5 extensions at RCL 2 and **10 at RCL 3**, so ~800 energy of capacity is
available and unbuilt. Because bodies scale with available energy, the colony is
pinned to the 200-energy minimum body indefinitely. Population has outgrown the
nest exactly as the biology describes, but nothing translates that pressure into
excavation.

Sources: [eLife — Colony demographics shape nest construction](https://elifesciences.org/articles/100706),
[PLOS One — Nest enlargement in leaf-cutting ants](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0097872)

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

**The biology is literal, not metaphorical.** *Atta* leafcutters do not merely
lay chemical trails over existing ground — they physically clear **trunk trails**
through undergrowth, up to 200 m long, cutting vegetation and removing debris.
Workers move measurably faster on cleared trail than over litter, and the
energetic savings repay the clearing investment within days. Some workers
specialise in trail maintenance, responding to unpredictable obstructions like
leaf fall.

Most importantly for us, this is **"infrastructure construction without
information exchange"**: no ant plans the network, and none communicates a route.
Each clears obstacles on paths it happens to use heavily, and the network is
simply what remains. That is a road system arising from stigmergy alone.

**Implemented and observed (2026-07-30).** Creeps deposit one unit of trail
pheromone on the tile they occupy each tick; the map evaporates on a timer, which
is what keeps a road meaning "currently useful" rather than "walked once" —
without decay every tile ever stepped on eventually crosses the threshold and the
colony paves the whole room. Tiles above the threshold get a road construction
site, capped so builders are never swamped. **Result: 105 roads built**, none of
them planned; the network is the residue of where the colony actually walked.

This also resolved a real inefficiency: with no construction sites the `build`
stimulus sat at zero, so builders idled. Roads give the colony permanent,
self-generated work that also compounds — every road makes future traffic cheaper.

Sources: [Royal Society — Infrastructure construction without information exchange](https://royalsocietypublishing.org/doi/10.1098/rspb.2018.2539),
[Insectes Sociaux — Trunk trail maintenance in leafcutter ants](https://link.springer.com/article/10.1007/s00040-016-0530-y)

### 5.5 Cross-Room Navigation

Ants use **edge pheromones** at territory boundaries and **inter-nest trails** between satellite colonies.

**Screeps implementation**:
- Portal-aware pathfinding with cached inter-room segments
- `Memory.strategy.routeCache` stores room-to-room paths with TTL
- Highway detection: rooms with `Memory.roomIntel[room].highway = true` get priority routing

---

## 6. Military — Raid & Defense

This section covers **kinetic** doctrine only (combat, sieges, defense-in-depth).
For the **economic** side — market cornering, credit drain, boost-price
sieges to cripple rival military spend — see
[`peaceful-strategy-analysis.md`](../peaceful-strategy-analysis.md). The two
are not yet reconciled into one doctrine; "starving competitors" per the
supercolony goal means both together, not either alone.

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
| Formic acid spray (ranged chemical) | `RANGED_ATTACK` creeps with `XKHO2` boost |
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

### 7.1.1 Polydomy: a colony cannot outgrow its central place

A colony's income is capped by the resource density around its nest, not by how
many workers it fields. Past that point additional workers add nothing — they
queue at the same depleted patches. The biological answer is **polydomy**: a
large central nest plus smaller subnests distributed across the foraging
territory. Its documented advantages are precisely increased food encounter and
exploitation rates, plus defence of resources and territory. Colonies also
relocate workers and brood between nests in response to spatial variation in
resources, so nest placement tracks where food actually is. *Camponotus gigas*
has been recorded running 17 nests and ~7,000 foragers over 0.8 ha.

Notably, colony size does *not* reliably predict foraging distance — colonies do
not simply forage further as they grow, they reorganise spatially. Growth past
the central place's carrying capacity is a structural change, not a scaling one.

**Measured here (2026-07-30), and the numbers are stark.** Verified against
`@screeps/common/lib/constants.js`: `SOURCE_ENERGY_CAPACITY = 3000`,
`ENERGY_REGEN_TIME = 300`, `HARVEST_POWER = 2`. So one source sustains
3000/300 = 10 energy/tick, and 10 ÷ 2 = **5 WORK parts saturate it completely**.

W5N8 has 2 sources — a hard ceiling of **20 energy/tick and 10 useful WORK
parts, no matter how large the colony grows**. The colony was fielding 22 creeps
carrying **74 WORK parts: 7.4× oversubscribed**, with roughly 64 of those parts
contributing nothing. This is the mechanical explanation for slow controller
progress and for population oscillation: the colony had grown far past its
central place's carrying capacity, exactly the condition polydomy exists to solve.

**Remote sources are worth more than they look**, because
`SOURCE_ENERGY_NEUTRAL_CAPACITY = 1500` while a *reserved* room's sources hold
the full 3000. An unreserved remote source yields 5 energy/tick; a reserved one
yields 10. Reservation therefore doubles remote income, and it requires no GCL —
only a CLAIM part (`CONTROLLER_RESERVE = 1` tick per CLAIM part,
`CONTROLLER_RESERVE_MAX = 5000`).

Four adjacent rooms hold **6 unowned sources with no Source Keeper lairs**
(W6N8 ×2, W5N9 ×2, W4N8 ×1, W5N7 ×1). Exploiting them takes the colony's income
ceiling from 20 energy/tick to ~50 unreserved, or ~80 reserved — a **4× increase**
that no amount of additional workers in the home room could ever produce.

Sources: [Royal Society — Polydomy enhances foraging performance](https://royalsocietypublishing.org/doi/10.1098/rspb.2017.0269),
[Polydomy: organisation and adaptive function](https://www.sciencedirect.com/science/article/pii/S221457451400073X),
[Oecologia — Polydomy and foraging in Camponotus gigas](https://link.springer.com/article/10.1007/s004420050695)

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
| `RANGED_ATTACK` | Flat 10 damage/tick at range ≤3, no falloff; 0 beyond range 3 |
| `HEAL` | 12 heal/tick at range ≤1 (incl. self), 4 at range ≤3 (ranged heal) |
| `TOUGH` | No damage reduction unless boosted; damage hits TOUGH parts first |
| Boosts (T3) | `XUH2O` attack ×4 · `XKHO2` ranged attack ×4 · `XLHO2` heal ×4 · `XGHO2` tough → 30% damage taken |
| Tower | 600 attack, 400 heal, 800 repair at range ≤5; linear falloff to 25% power at range ≥20 |
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

**Naming caveat**: despite the name, this section (and its module names —
`colony.manager.js`, `war.room.js`, `role.defender.js`, `auto.spawn.js`)
audits the flat-JS bot AGENTS.md used to describe, *not* the real vendored
`bencbartlett/Overmind` TypeScript codebase that's actually in `src/`
(confirmed: `Colony.ts`, `Overseer.ts`, `hiveClusters/`, `overlords/`,
`directives/` — see README.md's Architecture section). The two were
conflated somewhere in this doc's drafting. Re-auditing the real codebase
against these same gaps is unstarted — treat every row in §9.2/§9.3 below
as "true of the old described-but-nonexistent bot, unverified against the
real one" until redone.

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

## 9.5 Governance: what to centralize, and why the ant metaphor has a limit

This colony was built on the premise that decentralization is the point. After
~4000 generations it had reached RCL 5 and stopped, delivering **1.70 energy/tick
against ~35 available**. The obvious conclusion — autonomy failed, centralize
everything — is wrong, but so was the original premise. Both need stating
precisely.

### 9.5.1 Self-organization is a workaround for limited parts

Camazine and Deneubourg give the condition directly:

> "A biological system will be self-organized when it possesses a large number of
> subunits, and these subunits **lack either the communicational abilities or the
> computational abilities, or both, that are needed to implement centralized
> control.**"

Self-organization is what evolution reaches for when the parts *cannot*
centralize. Ants use pheromone gradients because an ant cannot perceive the
colony; the trail is a workaround for a missing global view, not a superior
design. The same paper notes that even subunits with high cognitive ability stay
self-organized when there is no preadaptation for a system-wide communication
network.

**Screeps creeps have neither limitation.** `Game.creeps` is a global object.
Every creep already has perfect global information at zero communication cost,
and the whole colony shares one CPU budget. The precondition that makes
decentralization correct in biology is simply absent here. Porting the pheromone
solution wholesale means solving a constraint this game does not impose.

### 9.5.2 But the observed failures were not decision failures

Every defect found in this colony:

| failure | a creep deciding badly? |
|---|---|
| no storage ever built | no — no build planner existed |
| creeps outside the home room never processed | no — plain bug in `main.ts` |
| fitness rewarded busywork | no — wrong objective function |
| upgraders mined their own energy | no — no withdraw path existed |
| five threshold-denominator collapses | no — wrong denominators |

None is "an ant chose wrongly." **A dictatorship with the same missing storage
and the same fitness function performs identically badly.** The colony did not
stall because ants decided for themselves; it stalled because nothing ever
defined what a good decision was. A dictator with no objective function is
exactly as stuck as a democracy with no objective function.

Centralization is not free either. Overmind's author reports that its
hierarchical, class-heavy architecture makes garbage collection more expensive
than a flatter design. And the one subsystem here that has consistently worked —
response-threshold task allocation — is both the cheapest and the one with the
strongest empirical support in real ant foraging.

### 9.5.3 The split: centralize by information locality, not by ideology

The question is never "who is in charge." It is **which decisions require global
state that no local signal can encode.**

**Centralize** — a local rule provably cannot produce these:
- *Structure placement.* A bunker layout cannot emerge from local traffic. This
  is not hypothetical: the colony had no storage for its entire life because no
  local signal encodes "we need a granary." Roads emerge from stigmergy because
  traffic *is* a local signal; storage placement has no equivalent.
- *The objective function.* What the colony is for. See §9.5.4.
- Expansion and claim decisions, defense response, caste ratios.

**Leave emergent** — local, cheap, robust, and empirically working:
- Which task to perform this tick (response thresholds).
- Which source, when to return, how full to fill.
- Per-creep heritable genes.

Stated plainly: **the centre decides what to build and what winning means; the
ants decide who does it.**

This is closer to real colonies than either extreme. The queen issues no orders
and does not manage division of labour — task allocation genuinely is
decentralized — yet nest architecture and reproductive allocation are
colony-level outcomes that no individual controls.

### 9.5.4 Homeostasis is not a goal

The deeper defect this exposed: every stimulus in the colony — supply, upgrade,
build, remote — is *homeostatic*. Each measures a deficit and pushes toward
equilibrium. **None measures growth.** A colony that satisfies every stimulus
sits still forever, which is exactly what was observed: it found equilibrium at
RCL 5 and stopped.

Real colonies escape this because reproduction is an appetite that never
satiates, not a deficit that closes. A progressive colony needs at least one
signal that cannot be satisfied — otherwise "progressive" is not encoded
anywhere in the system, and no amount of tuning will produce it.

Sources: [Camazine & Deneubourg, *When Is Self-Organization Used in Biological
Systems?*, Biological Bulletin 202(3)](https://www.journals.uchicago.edu/doi/10.2307/1543484)
([full text](http://order.ph.utexas.edu/Camazine.pdf)),
[Verification of response-threshold models in ant foraging](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6586672/),
[Bartlett, *Screeps #6: Verifiably refreshed* — on hierarchical architecture and GC cost](https://bencbartlett.com/blog/screeps-6-verifiably-refreshed/),
[Why the ant colony queen isn't really in charge](https://www.natureworldnews.com/articles/72957/20260514/why-ant-colony-queen-isnt-really-charge-swarm-intelligence-ants-explains-how-ant-colonies-work.htm)

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
  for (const [role, config] of Object.entries(STIMULI)) {
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

---

## 12. Hybrid Synthesis — Beyond Ants

The ant metaphor carried this colony a long way and then stopped paying. §9.5
gives the reason: Camazine's precondition for self-organization — subunits that
*lack* the communication or computation for central control — does not hold in
Screeps, where `Game.creeps` hands every creep perfect global information. Ants
are one solution to one set of constraints. This colony faces a different set,
so it should mine whatever lineage solved each specific problem best.

**This section is a working ledger, not a survey.** Each row names a mechanism, the
system that evolved it, and the concrete open problem in this colony it targets.
Iterations pick a row, research it properly with sources, and record what was
adopted or rejected and why. A rejected row is as valuable as an adopted one.

### 12.1 Candidate mechanisms

| System | Mechanism | Colony problem it targets |
|---|---|---|
| **Human economies** | investment vs consumption; compounding capital | **the growth term** — nothing in the colony distinguishes spending from investing, which is why it sits at equilibrium (§9.5.4) |
| **Honeybee nest-site selection** | quorum sensing with *cross-inhibition* — scouts actively signal others to stop | task oscillation and deadlock; the colony's stimuli compete but never suppress each other |
| **Octopus** | central brain sets goals, arms execute autonomously with local reflexes | the hybrid governance chosen in §9.5 — a working biological precedent for exactly that split |
| **Termite mounds** | stigmergic construction guided by *templates*, not just gradients | structure placement — roads emerge from traffic, but no local signal ever requests a granary |
| **Slime mold (*Physarum*)** | reinforce-and-prune network optimization | road networks; which remote rooms to keep |
| **Immune systems** | distributed detection, clonal expansion, memory cells | defense — the colony currently has none, and towers are unbuilt |
| **Mycelial networks** | resource redistribution across a connected network | multi-room energy sharing once expansion happens |
| **Siphonophores** | extreme zooid specialization in a colonial organism | caste design beyond the single reserver caste |
| **Naked mole rats** | eusociality in a vertebrate; castes without morphological lock-in | behavioural castes that can still switch |
| **r/K selection** | few large offspring vs many small | body size vs population count — the poverty trap that produced 3-part creeps |

### 12.2 The one that matters most first

**Economies, not insects, hold the missing concept.** Every stimulus in this
colony is homeostatic: it measures a deficit and closes it. No ant mechanism
naturally supplies a *growth* term, because ant colonies convert surplus into
reproduction through a channel that has no Screeps analogue — they make more
colonies, not bigger ones.

What a growing economy has that this colony does not is a distinction between
**consumption** and **investment**. Energy spent upgrading, spawning replacements
and repairing is consumption: it sustains the present. Energy spent on
extensions, links, containers, storage and new rooms is investment: it raises
future capacity. A colony with no such split cannot compound, and compounding is
the entire content of the word "progressive."

This reframes the project's own title. The goal is not a better ant colony. It is
a **civilization** that borrows ant task allocation because that part is genuinely
good, and borrows from elsewhere wherever ants have no answer.

### 12.3 Adoption ledger

Filled in by iterations. Record the mechanism, the source, what was implemented,
and the measured effect — including when the effect was nil.

| Mechanism | Source system | Status | Measured effect |
|---|---|---|---|
| Response-threshold task allocation | ants | adopted | works; cheapest subsystem, kept per §9.5 |
| Stigmergic trail formation → roads | ants / *Atta* | adopted | roads emerge from traffic; maintenance added |
| Central-place foraging limits | foraging theory | adopted | drove remote foraging |
| Food storage / repletes | *Myrmecocystus* | adopted, no gain yet | granary built; holds ~0, see §4.3.0 |
| Colony-level objective | superorganism selection | **adopted** | fitness now counts delivered energy; output 1.85 → 2.29/tick, best fitness unfroze |
| Investment vs consumption | economies | **open** | the growth term; highest value |
| Pre-emptive replacement (lead-time births) | animal life-history / standard Screeps practice | adopted | population floor 24 → 25; no steady-state output change, benefit is conditional on cohort events |
| Fewer, larger workers (r/K selection) | life-history theory | **rejected** | spawn time is proportional to parts and total parts is fixed by the economy, so 25x12 and 17x18 both occupy the one spawn ~60% of the time — no relief from the bottleneck. Do not retry as a spawn-throughput fix |
| Variable worker lifespan (de-synchronisation) | ant/bee life-history | adopted, no effect yet | jittered replacement lead time; collapses continued unchanged |
| Slot scarcity over resource scarcity | economics (capital vs labour) | adopted | body composition all-3-part → 27/28 full-size; `saving-for-full-body` blocked 0 ticks, so waiting cost nothing |
| Carrying capacity bounds population | central-place foraging (§7.1.1) | adopted | per-creep output rises monotonically as headcount falls: 0.094 at 28.5 creeps → 0.203 at 22. Same total output from 6 fewer creeps |

### 12.4 What a superorganism actually optimises

The fitness fix needed a principle, not just a bug report, so this is the one it
rests on. In advanced eusocial insects **the colony becomes the unit of
selection** — the colony is the extended phenotype, and individual survival and
reproduction stop mattering to a worker's genetic fitness as colony-level
selection takes over. Colonies with the most effective recruitment and defence
raise the most reproductives, and that — not worker activity — is what selection
scores.

Two things follow directly for this colony.

**1. The objective must be an outcome, never an activity.** The old `fitnessOf`
summed the *stimulus of whatever task a creep was doing*, so it scored intent
rather than result. Nothing in it referred to energy. Selection did what it was
told for ~7500 generations and produced creeps optimised for looking busy — best
fitness frozen at 0.9055, an unbeatable busywork champion. Fitness is now energy
that actually left the creep, which counts transfers, upgrades, construction and
repair through one measurement and cannot be misreported by a call site.

**2. Per-creep fitness is a proxy, and the seam is worth naming.** The literature
is explicit that selection acts on colonies, not workers; here it acts on
workers, because creeps die and are replaced while the colony does not
reproduce. That proxy holds only while delivery is **additive and non-rival** —
one creep's delivery must not come at another's expense. It would break for a
rival resource: a creep monopolising the granary would score well individually
while starving the colony. Nothing in the current task set is rival, so the
proxy is sound today; anything that introduces contention for a shared, finite
store invalidates it and needs a colony-level term instead.

**3. Growth versus reproduction is a real biological trade-off, not a borrowed
metaphor.** Colonies must balance investment in growth against investment in
reproduction. §12.2 reached the same split from economics; the convergence is
reassuring, and it means the consumption/investment term queued next has support
from both directions.

Sources: [The emergence of a superorganism through intergroup competition, PNAS](https://pnas.org/content/104/23/9736),
[Major Evolutionary Transitions in Social Insects: Worker Sterility and Life History Trade-Offs, Frontiers](https://www.frontiersin.org/journals/ecology-and-evolution/articles/10.3389/fevo.2021.732907/full),
[Natural selection drives the evolution of ant life cycles, PNAS](https://www.pnas.org/doi/full/10.1073/pnas.1405550111)
