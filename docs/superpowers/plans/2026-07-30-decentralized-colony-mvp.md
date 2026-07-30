# Decentralized Colony MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vendored Overmind fork with a clean-room Screeps bot where each creep picks its own task every tick from room stimuli versus its own jittered thresholds, with structured logs shipped to SigNoz.

**Architecture:** Pure decision functions (`stimuli` → `decide`) feed three tiny task modules that all follow a gather-then-deliver loop. `main.ts` is the only orchestrator: it computes stimuli once per room per tick, then lets every creep decide for itself. Telemetry leaves the sandboxed VM as `[ANT]`-prefixed JSON on `console.log`, which the server writes to disk and an external Node tailer forwards to SigNoz over OTLP.

**Tech Stack:** TypeScript 5.3 (strict), Rollup, `@types/screeps`, Node 25 (shipper, zero dependencies), SigNoz/OTLP.

**Spec:** [`docs/superpowers/specs/2026-07-30-decentralized-colony-mvp-design.md`](../specs/2026-07-30-decentralized-colony-mvp-design.md)

## Global Constraints

- **No test framework.** This project uses none, by explicit direction. Every task's gate is `npx tsc --noEmit -p .` plus a stated observable check. Never scaffold a test runner.
- **Nothing from Overmind survives** except color values. No code reuse.
- **TypeScript is `strict: true`** (see `tsconfig.json`). Code must compile clean under it.
- **Tabs are not required** — the old codebase used tabs; the new `src/` is greenfield, so use 2-space indent consistently.
- **Never set `DEST` when compiling.** `rollup.config.js` attempts an HTTP push when `DEST` is set; that push cannot work against a Steam-authenticated server.
- **Never write to `screeps.com/default/` or `screeps.com/seasonal/`.** Those sync to the real official-server account. Private server only: `127_0_0_1___21025/pserver/`.
- **Telemetry sentinel is exactly `[ANT]`**, prefixed to every emitted line.
- **Severity levels are exactly four**: `DEBUG`, `INFO`, `WARN`, `ERROR` → OTel severity numbers 5, 9, 13, 17.
- **SigNoz resource attributes**: `service.name = screeps`, `deployment.environment = pserver`.

## Execution Model — Waves

Work is grouped into waves. **Within a wave, tasks are fully independent and run in parallel subagents.** Between waves there is a hard barrier.

| Wave | Tasks | Parallelism | Why the barrier |
|---|---|---|---|
| 0 | 1 (Task 1) | serial | Deletes `src/`, rewrites build config, and lays the type/constant foundation every later file imports |
| 1 | 9 (Tasks 2–10) | **9 parallel agents** | All depend only on Wave 0; none import each other |
| 2 | 1 (Task 11) | serial | `main.ts` imports every Wave 1 module |
| 3 | 3 (Tasks 12–14) | serial, interactive | Destructive world reset and live observation |

**Commit discipline under parallelism:** within Wave 1, subagents **write files but do not run git commands**. Nine agents committing into one index will race and corrupt state. The orchestrator commits the whole wave once, after all nine report and `tsc` passes. Waves 0, 2, and 3 are serial and commit normally.

**Wave 1 dispatch:** send all nine Agent calls in a single message so they actually run concurrently.

---

## File Structure

```
src/
  config.ts             — every tuning constant and color, single source of truth
  types.ts              — TaskName, Stimuli, ThresholdProfile, TaskState; global
                          CreepMemory augmentation
  creep/
    thresholds.ts       — generate/validate a jittered per-creep profile
    stimuli.ts          — read room → snapshot (impure) + snapshot → stimuli (pure)
    decide.ts           — pure task-selection rules
    tasks/
      gather.ts         — shared phase flip + harvest, used by all three tasks
      supply.ts         — deliver to spawn/extensions
      upgrade.ts        — deliver to controller
      build.ts          — deliver to construction sites
  spawn/
    respawn.ts          — fixed-N respawner + body scaling
  visuals.ts            — per-creep task label
  telemetry.ts          — '[ANT]' JSON emitter
  main.ts               — the only orchestrator

tools/
  log-shipper/
    index.js            — tails server logs, POSTs OTLP to SigNoz (not bundled)
```

---

### Task 1: Teardown and foundation

Serial and blocking. Removes the Overmind fork, makes the build work without it, and creates the four files that every Wave 1 task imports.

**Files:**
- Tag: `archive/overmind-fork`
- Delete: `src/` (entire Overmind fork), `tsc-out/`, `dist/`, `piolium/`, `/specs/`, `test/`, `tests/`
- Modify: `rollup.config.js`, `package.json`, `.gitignore`
- Create: `src/config.ts`, `src/types.ts`, `src/creep/thresholds.ts`, `src/creep/tasks/gather.ts`

**Interfaces:**
- Consumes: nothing
- Produces: everything below is imported by Wave 1. Exact names matter — Wave 1 agents cannot see each other's code, only this task's output.
  - `config.ts`: `COLONY_SIZE`, `SNAPSHOT_INTERVAL`, `THRESHOLD_BASE`, `THRESHOLD_JITTER`, `SWITCH_BUFFER`, `EXPLORATION_CHANCE`, `EXPLORATION_ENABLED`, `DEBUG_LOGGING`, `TELEMETRY_SENTINEL`, `MIN_BODY_COST`, `UPGRADE_BASELINE`, `BUILD_SATURATION_SITES`, `DEFAULT_TASK`, `MIN_BODY`, `IDEAL_BODY`, `IDEAL_BODY_COST`, `COLORS`
  - `types.ts`: `TaskName`, `TASK_NAMES`, `Stimuli`, `ThresholdProfile`, `TaskPhase`, `TaskState`, `LogLevel`
  - `creep/thresholds.ts`: `generateProfile(): ThresholdProfile`, `ensureProfile(creep: Creep): ThresholdProfile`
  - `creep/tasks/gather.ts`: `updatePhase(creep: Creep): TaskPhase`, `gatherEnergy(creep: Creep): void`

- [ ] **Step 1: Tag the current state so the fork is recoverable**

```bash
cd /home/jin/.config/Screeps/scripts
git tag archive/overmind-fork
git tag -l 'archive/*'
```

Expected: prints `archive/overmind-fork`.

- [ ] **Step 2: Remove the Overmind fork and stale tracked directories**

`/specs/` here means the **repo-root** directory holding three stale audit reports. It is NOT `docs/superpowers/specs/`, which holds the spec for this very plan and must survive.

```bash
cd /home/jin/.config/Screeps/scripts
git rm -r --quiet src tsc-out dist piolium specs test tests
git rm -r --cached --quiet graphify-out
rm -rf tsc-out dist
ls docs/superpowers/specs/
```

Expected: the last command still lists `2026-07-30-decentralized-colony-mvp-design.md`. If it does not, stop — the wrong directory was deleted.

- [ ] **Step 2b: Untrack `.env` — it holds a live secret**

`.env` contains the real `SCREEPS_TOKEN` and is currently **tracked**, committed in
`e17253e`. Adding it to `.gitignore` does not untrack an already-tracked file, so it must
be removed from the index explicitly. `--cached` keeps the file on disk, which the build
still needs.

```bash
cd /home/jin/.config/Screeps/scripts
git rm --cached --quiet .env
git ls-files --error-unmatch .env 2>/dev/null && echo "STILL TRACKED" || echo "untracked, file kept on disk"
test -f .env && echo ".env still present on disk"
```

Expected: `untracked, file kept on disk` and `.env still present on disk`.

Two things this does **not** fix, both for the user to decide:
- The token remains in prior history. This repo has no git remote, so it has not been
  pushed anywhere — but scrub history before ever adding one.
- The token has been sitting in history since 2026-07-23. Rotating it at screeps.com is
  the safe move.

- [ ] **Step 3: Extend `.gitignore`**

Append to `.gitignore`:

```
/tsc-out/
/dist/
/piolium/
/specs/
/test/
/tests/
/graphify-out/
.env
```

- [ ] **Step 4: Rewrite `rollup.config.js`**

Replace the whole file. The old one referenced `src/Overmind_obfuscated` and baked Overmind's ASCII banner into every bundle.

```js
"use strict";

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from "rollup-plugin-typescript2";
import screeps from "rollup-plugin-screeps";

let cfg;
const dest = process.env.DEST;
if (!dest) {
    console.log('Compiling (no deploy destination — local bundle only)');
} else if ((cfg = require("./screeps")[dest]) == null) {
    throw new Error("Invalid upload destination");
}

export default {
    input: "src/main.ts",
    plugins: [
        resolve(),
        commonjs(),
        typescript({tsconfig: "./tsconfig.json"}),
        screeps({config: cfg, dryRun: cfg == null})
    ],
    treeshake: false,
    output: {
        file: "dist/main.js",
        format: "cjs",
        sourcemap: false,
        banner: '// Progressive Ant Supercolony — decentralized Screeps colony\n'
    },
};
```

- [ ] **Step 5: Update `package.json` identity, scripts, and dependencies**

Apply these edits:
- `"name"`: `"progressive-ant-supercolony"`
- `"description"`: `"Decentralized ant-colony Screeps AI"`
- `"author"`: `"Fendy Jong"`
- Delete the `"repository"`, `"homepage"`, and `"bugs"` keys (they point at `bencbartlett/Overmind`).
- Delete the `"obfuscate"` script (it targets `tsc-out/Overmind.js`, which no longer exists).
- Delete the entire `"dependencies"` block — `@tensorflow/tfjs`, `onnxjs`, `columnify`, and `source-map` were all Overmind's.
- Delete `"javascript-obfuscator"` from `"devDependencies"`.
- Add to `"scripts"`, exactly as written — note there is deliberately **no** `DEST`:

```json
"deploy:pserver": "npm run compile && cp dist/main.js 127_0_0_1___21025/pserver/main.js"
```

Leave `"license"` alone for now; the user decides it separately.

- [ ] **Step 6: Create `src/types.ts`**

```ts
export type TaskName = 'supply' | 'upgrade' | 'build';

export const TASK_NAMES: TaskName[] = ['supply', 'upgrade', 'build'];

/** Per-task stimulus intensity, each normalized to 0..1. */
export type Stimuli = Record<TaskName, number>;

/** Per-creep response thresholds, one per task. */
export type ThresholdProfile = Record<TaskName, number>;

export type TaskPhase = 'gathering' | 'delivering';

export interface TaskState {
  /** Source while gathering; the delivery target while delivering. */
  targetId?: string;
  phase?: TaskPhase;
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

declare global {
  interface CreepMemory {
    task?: TaskName;
    thresholds?: ThresholdProfile;
    taskState?: TaskState;
  }
}
```

- [ ] **Step 7: Create `src/config.ts`**

```ts
import { TaskName } from './types';

/** N — target creep count per room. */
export const COLONY_SIZE = 4;

/** K — ticks between telemetry snapshots. Distinct from COLONY_SIZE. */
export const SNAPSHOT_INTERVAL = 10;

/** Threshold profiles are drawn from BASE ± JITTER, per task, at spawn. */
export const THRESHOLD_BASE = 0.5;
export const THRESHOLD_JITTER = 0.25;

/** A candidate task must beat the current one by this much to steal a creep. */
export const SWITCH_BUFFER = 0.15;

/** Per-creep, per-tick chance of switching regardless of margins. */
export const EXPLORATION_ENABLED = true;
export const EXPLORATION_CHANCE = 0.02;

/** DEBUG emits per creep per tick. Off unless actively investigating. */
export const DEBUG_LOGGING = false;

/** Prefixed to every telemetry line so the shipper can find our output. */
export const TELEMETRY_SENTINEL = '[ANT]';

/** Cost of the minimum body — the affordability point where supply saturates. */
export const MIN_BODY_COST = 200;

/** The controller always wants energy, so upgrade has a constant baseline pull. */
export const UPGRADE_BASELINE = 0.5;

/** Construction sites needed to drive the build stimulus to 1.0. */
export const BUILD_SATURATION_SITES = 3;

/** Used when a creep has no task and nothing clears its thresholds. */
export const DEFAULT_TASK: TaskName = 'upgrade';

export const MIN_BODY: BodyPartConstant[] = [WORK, CARRY, MOVE];
export const IDEAL_BODY: BodyPartConstant[] = [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
export const IDEAL_BODY_COST = 400;

export const COLORS = {
  hud: '#c9c9c9',
  DEBUG: '#808080',
  INFO: '#00b300',
  WARN: '#ff9800',
  ERROR: '#e53935',
} as const;
```

- [ ] **Step 8: Create `src/creep/thresholds.ts`**

```ts
import { THRESHOLD_BASE, THRESHOLD_JITTER } from '../config';
import { TASK_NAMES, ThresholdProfile } from '../types';

function jitteredThreshold(): number {
  return THRESHOLD_BASE + (Math.random() * 2 - 1) * THRESHOLD_JITTER;
}

/** A fresh profile: one independently jittered threshold per task. */
export function generateProfile(): ThresholdProfile {
  return {
    supply: jitteredThreshold(),
    upgrade: jitteredThreshold(),
    build: jitteredThreshold(),
  };
}

function isValidProfile(p: unknown): p is ThresholdProfile {
  if (typeof p !== 'object' || p === null) return false;
  const rec = p as Record<string, unknown>;
  return TASK_NAMES.every(t => typeof rec[t] === 'number' && isFinite(rec[t] as number));
}

/**
 * Returns the creep's profile, regenerating and persisting a fresh one if it is
 * missing or corrupt. Never throws — a creep without a profile still acts.
 */
export function ensureProfile(creep: Creep): ThresholdProfile {
  const existing = creep.memory.thresholds;
  if (isValidProfile(existing)) return existing;
  const fresh = generateProfile();
  creep.memory.thresholds = fresh;
  return fresh;
}
```

- [ ] **Step 9: Create `src/creep/tasks/gather.ts`**

```ts
import { COLORS } from '../../config';
import { TaskPhase } from '../../types';

/**
 * Flips the creep between gathering and delivering based on how full it is,
 * persists the phase, and returns it. Clears the stale target on every flip.
 */
export function updatePhase(creep: Creep): TaskPhase {
  const state = creep.memory.taskState ?? {};
  if (!state.phase) state.phase = 'gathering';

  if (state.phase === 'gathering' && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    state.phase = 'delivering';
    delete state.targetId;
  } else if (state.phase === 'delivering' && creep.store[RESOURCE_ENERGY] === 0) {
    state.phase = 'gathering';
    delete state.targetId;
  }

  creep.memory.taskState = state;
  return state.phase;
}

/** One tick of harvesting from the nearest active source. */
export function gatherEnergy(creep: Creep): void {
  const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
  if (!source) return;
  if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
    creep.moveTo(source, { visualizePathStyle: { stroke: COLORS.hud } });
  }
}
```

- [ ] **Step 10: Verify the foundation type-checks**

```bash
cd /home/jin/.config/Screeps/scripts
npx tsc --noEmit -p .
```

Expected: no output, exit code 0. If `@types/screeps` globals (`WORK`, `RESOURCE_ENERGY`, `Creep`) are reported as undefined, stop and confirm `node_modules/@types/screeps` still exists — do not work around it by declaring the globals yourself.

- [ ] **Step 11: Commit**

```bash
cd /home/jin/.config/Screeps/scripts
git add -A
git commit -m "feat: scrap Overmind fork, add clean-room foundation

Deletes the vendored Overmind source and its build wiring, and lays the
config/types/thresholds/gather foundation the new colony builds on."
```

---

## Wave 1 — Tasks 2 through 10, run in parallel

Nine independent files. Dispatch all nine subagents in one message. **No agent runs git commands**; the orchestrator commits the wave in Task 10's closing step.

Every Wave 1 agent must be told: the imports listed in its **Consumes** block already exist and compile — use those exact names, do not invent alternatives, and do not modify any file outside its own.

---

### Task 2: Room stimuli

**Files:**
- Create: `src/creep/stimuli.ts`

**Interfaces:**
- Consumes: `../config` → `MIN_BODY_COST`, `UPGRADE_BASELINE`, `BUILD_SATURATION_SITES`; `../types` → `Stimuli`
- Produces: `RoomSnapshot` (interface), `readRoom(room: Room): RoomSnapshot`, `computeStimuli(s: RoomSnapshot): Stimuli`

- [ ] **Step 1: Write the file**

Reading the room is impure; turning a snapshot into stimuli is pure. They are split so the decision path can be reasoned about without a live `Game`.

```ts
import { BUILD_SATURATION_SITES, MIN_BODY_COST, UPGRADE_BASELINE } from '../config';
import { Stimuli } from '../types';

export interface RoomSnapshot {
  energyAvailable: number;
  energyCapacityAvailable: number;
  hasController: boolean;
  constructionSiteCount: number;
}

export function readRoom(room: Room): RoomSnapshot {
  return {
    energyAvailable: room.energyAvailable,
    energyCapacityAvailable: room.energyCapacityAvailable,
    hasController: room.controller !== undefined && room.controller.my,
    constructionSiteCount: room.find(FIND_CONSTRUCTION_SITES).length,
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Pure. Supply SATURATES rather than scaling: if the room cannot afford to
 * replace a creep, its stimulus pegs at 1.0 so it clears essentially every
 * threshold. That is the guard against unrecoverable bootstrap death, and it is
 * not a central override — each creep still decides alone, the stimulus is just
 * shaped the way real hunger signals are.
 */
export function computeStimuli(s: RoomSnapshot): Stimuli {
  let supply: number;
  if (s.energyAvailable < MIN_BODY_COST) {
    supply = 1;
  } else if (s.energyCapacityAvailable > 0) {
    supply = 1 - s.energyAvailable / s.energyCapacityAvailable;
  } else {
    supply = 0;
  }

  return {
    supply: clamp01(supply),
    upgrade: s.hasController ? UPGRADE_BASELINE : 0,
    build: clamp01(s.constructionSiteCount / BUILD_SATURATION_SITES),
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/jin/.config/Screeps/scripts && npx tsc --noEmit -p .
```

Expected: exit code 0.

---

### Task 3: Decision rules

**Files:**
- Create: `src/creep/decide.ts`

**Interfaces:**
- Consumes: `../config` → `DEFAULT_TASK`, `EXPLORATION_CHANCE`, `EXPLORATION_ENABLED`, `SWITCH_BUFFER`; `../types` → `Stimuli`, `TaskName`, `TASK_NAMES`, `ThresholdProfile`
- Produces: `SwitchReason` (type), `Decision` (interface), `decide(stimuli, thresholds, current, roll): Decision`

- [ ] **Step 1: Write the file**

`decide` takes the random draw as an argument rather than calling `Math.random()` itself, which keeps it deterministic given its inputs. `main.ts` supplies the roll.

```ts
import { DEFAULT_TASK, EXPLORATION_CHANCE, EXPLORATION_ENABLED, SWITCH_BUFFER } from '../config';
import { Stimuli, TaskName, TASK_NAMES, ThresholdProfile } from '../types';

export type SwitchReason = 'no-current' | 'abandon' | 'better' | 'explore' | 'stay';

export interface Decision {
  task: TaskName;
  switched: boolean;
  reason: SwitchReason;
  /** stimulus − threshold, per task. Carried so telemetry can explain a switch. */
  margins: Stimuli;
}

/**
 * Pure. `roll` is a uniform draw in [0, 1) supplied by the caller.
 *
 * Rules, in order:
 *  4. Exploration fires first: a small chance to switch regardless of margins.
 *     Deliberate, not noise — exploration is intentional in young colonies.
 *  1. Nothing positive: keep the current task, or DEFAULT_TASK if there is none.
 *  2. Current went negative: abandon it for the best positive task, no buffer.
 *  3. Current still positive: switch only if beaten by more than SWITCH_BUFFER.
 */
export function decide(
  stimuli: Stimuli,
  thresholds: ThresholdProfile,
  current: TaskName | undefined,
  roll: number,
): Decision {
  const margins: Stimuli = {
    supply: stimuli.supply - thresholds.supply,
    upgrade: stimuli.upgrade - thresholds.upgrade,
    build: stimuli.build - thresholds.build,
  };

  if (EXPLORATION_ENABLED && roll < EXPLORATION_CHANCE) {
    const others = TASK_NAMES.filter(t => t !== current);
    const index = Math.floor((roll / EXPLORATION_CHANCE) * others.length);
    const pick = others[Math.min(index, others.length - 1)];
    return { task: pick, switched: pick !== current, reason: 'explore', margins };
  }

  const best = TASK_NAMES.reduce((a, b) => (margins[b] > margins[a] ? b : a));

  if (current === undefined) {
    const task = margins[best] > 0 ? best : DEFAULT_TASK;
    return { task, switched: true, reason: 'no-current', margins };
  }

  if (margins[best] <= 0) {
    return { task: current, switched: false, reason: 'stay', margins };
  }

  if (margins[current] <= 0) {
    return { task: best, switched: best !== current, reason: 'abandon', margins };
  }

  if (margins[best] > margins[current] + SWITCH_BUFFER) {
    return { task: best, switched: true, reason: 'better', margins };
  }

  return { task: current, switched: false, reason: 'stay', margins };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/jin/.config/Screeps/scripts && npx tsc --noEmit -p .
```

Expected: exit code 0.

---

### Task 4: Supply task

**Files:**
- Create: `src/creep/tasks/supply.ts`

**Interfaces:**
- Consumes: `./gather` → `updatePhase`, `gatherEnergy`
- Produces: `run(creep: Creep): void`

- [ ] **Step 1: Write the file**

```ts
import { gatherEnergy, updatePhase } from './gather';

/** Gather energy, then top up the spawn and extensions. */
export function run(creep: Creep): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    return;
  }

  const sinks = creep.room.find(FIND_MY_STRUCTURES).filter(
    (s): s is StructureSpawn | StructureExtension =>
      (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
      (s as StructureSpawn).store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  );

  const target = creep.pos.findClosestByPath(sinks);
  if (!target) return;

  creep.memory.taskState = { ...creep.memory.taskState, targetId: target.id };
  if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    creep.moveTo(target);
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/jin/.config/Screeps/scripts && npx tsc --noEmit -p .
```

Expected: exit code 0.

---

### Task 5: Upgrade task

**Files:**
- Create: `src/creep/tasks/upgrade.ts`

**Interfaces:**
- Consumes: `./gather` → `updatePhase`, `gatherEnergy`
- Produces: `run(creep: Creep): void`

- [ ] **Step 1: Write the file**

```ts
import { gatherEnergy, updatePhase } from './gather';

/** Gather energy, then push it into the controller. */
export function run(creep: Creep): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    return;
  }

  const controller = creep.room.controller;
  if (!controller) return;

  creep.memory.taskState = { ...creep.memory.taskState, targetId: controller.id };
  if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(controller);
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/jin/.config/Screeps/scripts && npx tsc --noEmit -p .
```

Expected: exit code 0.

---

### Task 6: Build task

**Files:**
- Create: `src/creep/tasks/build.ts`

**Interfaces:**
- Consumes: `./gather` → `updatePhase`, `gatherEnergy`
- Produces: `run(creep: Creep): void`

- [ ] **Step 1: Write the file**

Construction sites are placed by hand in the game UI — nothing in M1 creates them. With no sites this task simply idles, which is expected.

```ts
import { gatherEnergy, updatePhase } from './gather';

/** Gather energy, then work the nearest construction site. */
export function run(creep: Creep): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    return;
  }

  const site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
  if (!site) return;

  creep.memory.taskState = { ...creep.memory.taskState, targetId: site.id };
  if (creep.build(site) === ERR_NOT_IN_RANGE) {
    creep.moveTo(site);
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/jin/.config/Screeps/scripts && npx tsc --noEmit -p .
```

Expected: exit code 0.

---

### Task 7: Respawner

**Files:**
- Create: `src/spawn/respawn.ts`

**Interfaces:**
- Consumes: `../config` → `COLONY_SIZE`, `DEFAULT_TASK`, `IDEAL_BODY`, `IDEAL_BODY_COST`, `MIN_BODY`, `MIN_BODY_COST`; `../creep/thresholds` → `generateProfile`
- Produces: `bodyFor(energy: number): BodyPartConstant[] | null`, `runSpawning(room: Room): boolean`

- [ ] **Step 1: Write the file**

Stamping the jittered profile at spawn is the only centralized decision in the whole system. Everything after that is the creep's own.

```ts
import {
  COLONY_SIZE,
  DEFAULT_TASK,
  IDEAL_BODY,
  IDEAL_BODY_COST,
  MIN_BODY,
  MIN_BODY_COST,
} from '../config';
import { generateProfile } from '../creep/thresholds';

/** Largest affordable body, or null if even the minimum is out of reach. */
export function bodyFor(energy: number): BodyPartConstant[] | null {
  if (energy >= IDEAL_BODY_COST) return IDEAL_BODY;
  if (energy >= MIN_BODY_COST) return MIN_BODY;
  return null;
}

/**
 * Dumb fixed-N respawn. Returns true only if a creep was actually spawned.
 * Too little energy is normal at RCL1, not an error — skip quietly and retry.
 */
export function runSpawning(room: Room): boolean {
  const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
  if (!spawn) return false;

  if (room.find(FIND_MY_CREEPS).length >= COLONY_SIZE) return false;

  const body = bodyFor(room.energyAvailable);
  if (!body) return false;

  const result = spawn.spawnCreep(body, `ant_${Game.time}`, {
    memory: {
      task: DEFAULT_TASK,
      thresholds: generateProfile(),
      taskState: {},
    },
  });

  return result === OK;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/jin/.config/Screeps/scripts && npx tsc --noEmit -p .
```

Expected: exit code 0.

---

### Task 8: Visuals

**Files:**
- Create: `src/visuals.ts`

**Interfaces:**
- Consumes: `./config` → `COLORS`
- Produces: `drawCreepLabels(room: Room): void`

- [ ] **Step 1: Write the file**

This label is the instrument for the milestone, not decoration — watching the labels change is how reallocation gets observed live.

```ts
import { COLORS } from './config';

/** Draws each creep's current task above it. */
export function drawCreepLabels(room: Room): void {
  for (const creep of room.find(FIND_MY_CREEPS)) {
    const task = creep.memory.task;
    if (!task) continue;
    room.visual.text(task, creep.pos.x, creep.pos.y - 0.6, {
      color: COLORS.hud,
      font: 0.4,
      align: 'center',
    });
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/jin/.config/Screeps/scripts && npx tsc --noEmit -p .
```

Expected: exit code 0.

---

### Task 9: Telemetry emitter

**Files:**
- Create: `src/telemetry.ts`

**Interfaces:**
- Consumes: `./config` → `DEBUG_LOGGING`, `TELEMETRY_SENTINEL`; `./types` → `LogLevel`, `Stimuli`, `TaskName`
- Produces: `emit(level, event, data?): void`, `TaskDistribution` (type), `emitSnapshot(room, stimuli, distribution): void`

- [ ] **Step 1: Write the file**

The bot cannot reach the network — Screeps runs user code in an isolated VM. `console.log` is the only way out, so the sentinel prefix is what lets the external shipper tell our lines from other players' (the server forwards console output for every user, and `mods.json` registers a `simplebot`).

```ts
import { DEBUG_LOGGING, TELEMETRY_SENTINEL } from './config';
import { LogLevel, Stimuli, TaskName } from './types';

export type TaskDistribution = Record<TaskName, number>;

/**
 * Emits one '[ANT]'-prefixed JSON line. This is the only path out of the
 * sandbox: the server writes it to disk and tools/log-shipper forwards it.
 */
export function emit(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
  if (level === 'DEBUG' && !DEBUG_LOGGING) return;
  console.log(
    TELEMETRY_SENTINEL +
      JSON.stringify({
        tick: Game.time,
        level,
        event,
        ...data,
      }),
  );
}

/** The periodic colony snapshot. Task distribution is the key series. */
export function emitSnapshot(
  room: Room,
  stimuli: Stimuli,
  distribution: TaskDistribution,
): void {
  emit('INFO', 'snapshot', {
    room: room.name,
    creeps: room.find(FIND_MY_CREEPS).length,
    energyAvailable: room.energyAvailable,
    energyCapacity: room.energyCapacityAvailable,
    stimuli,
    distribution,
  });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/jin/.config/Screeps/scripts && npx tsc --noEmit -p .
```

Expected: exit code 0.

---

### Task 10: Log shipper

**Files:**
- Create: `tools/log-shipper/index.js`, `tools/log-shipper/README.md`

**Interfaces:**
- Consumes: nothing from `src/`. This is a separate Node process, not part of the bundle — Rollup's input is `src/main.ts` only, so it is excluded automatically.
- Produces: a CLI — `node tools/log-shipper/index.js <logfile>`

- [ ] **Step 1: Write `tools/log-shipper/index.js`**

Rotation is delegated to `tail -F` rather than reimplemented; the server rotates with `log_rotate_keep = 5`.

```js
#!/usr/bin/env node
'use strict';

// Tails a Screeps private-server log file, keeps the '[ANT]' telemetry lines,
// and forwards them to SigNoz over OTLP/HTTP. No dependencies.
//
//   node tools/log-shipper/index.js /path/to/server/logs/engine_runner1.log
//
// The OTLP endpoint comes from portctl (`portctl resolve signoz`), not a
// hardcoded port. Override with SIGNOZ_OTLP_URL.

const { spawn } = require('node:child_process');
const readline = require('node:readline');

const LOG_FILE = process.argv[2];
const OTLP_URL = process.env.SIGNOZ_OTLP_URL || 'http://localhost:17818/v1/logs';
const SENTINEL = '[ANT]';
const SERVICE_NAME = 'screeps';
const ENVIRONMENT = 'pserver';
const SEVERITY = { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 };
const FLUSH_MS = 2000;
const MAX_BATCH = 200;

if (!LOG_FILE) {
  console.error('usage: node index.js <logfile>');
  process.exit(1);
}

let buffer = [];

function toAttributes(obj) {
  const attrs = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'level') continue;
    attrs.push({
      key,
      value:
        typeof value === 'number'
          ? { doubleValue: value }
          : { stringValue: typeof value === 'string' ? value : JSON.stringify(value) },
    });
  }
  return attrs;
}

function toRecord(obj, raw) {
  return {
    timeUnixNano: String(Date.now() * 1000000),
    severityNumber: SEVERITY[obj.level] || SEVERITY.INFO,
    severityText: obj.level || 'INFO',
    body: { stringValue: raw },
    attributes: toAttributes(obj),
  };
}

async function flush() {
  if (buffer.length === 0) return;
  const logRecords = buffer.splice(0, MAX_BATCH);
  const payload = {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: SERVICE_NAME } },
            { key: 'deployment.environment', value: { stringValue: ENVIRONMENT } },
          ],
        },
        scopeLogs: [{ scope: { name: 'screeps-log-shipper' }, logRecords }],
      },
    ],
  };

  try {
    const res = await fetch(OTLP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[shipper] OTLP ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error('[shipper] send failed:', err.message);
  }
}

const tail = spawn('tail', ['-n', '0', '-F', LOG_FILE]);
tail.on('error', err => {
  console.error('[shipper] cannot tail:', err.message);
  process.exit(1);
});

readline.createInterface({ input: tail.stdout }).on('line', line => {
  const at = line.indexOf(SENTINEL);
  if (at === -1) return;
  const raw = line.slice(at + SENTINEL.length);
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return;
  }
  buffer.push(toRecord(obj, raw));
  if (buffer.length >= MAX_BATCH) flush();
});

setInterval(flush, FLUSH_MS);
process.on('SIGINT', () => {
  flush().finally(() => process.exit(0));
});

console.error(`[shipper] tailing ${LOG_FILE} -> ${OTLP_URL}`);
```

- [ ] **Step 2: Write `tools/log-shipper/README.md`**

````markdown
# log-shipper

Forwards the bot's `[ANT]` telemetry from the Screeps private server to SigNoz.

Screeps runs user code in a sandboxed VM with no network access, so the bot
cannot post to SigNoz itself. It logs JSON to the console instead; the server
writes that to disk, and this process tails it.

## Prerequisites

1. `.screepsrc` must have `log_console = true` (requires a server restart).
2. SigNoz OTLP endpoint. Resolve rather than hardcode:

```bash
portctl resolve signoz
```

## Run

```bash
SIGNOZ_OTLP_URL=http://localhost:17818/v1/logs \
  node tools/log-shipper/index.js \
  ~/.steam/debian-installation/steamapps/common/Screeps/server/logs/engine_runner1.log
```

Which log file receives user console output is **not yet confirmed** — try
`engine_runner1.log` first, then `engine_main.log`. See the design spec.

## Verify

In SigNoz, filter logs by `service.name = screeps`.
````

- [ ] **Step 3: Verify the shipper parses and runs**

```bash
cd /home/jin/.config/Screeps/scripts
node --check tools/log-shipper/index.js
```

Expected: no output, exit code 0.

Then smoke-test the filter and parse path against a fixture, with no SigNoz needed:

```bash
cd /home/jin/.config/Screeps/scripts
printf 'noise from another player\n[ANT]{"tick":1,"level":"INFO","event":"snapshot","room":"W1N1"}\n' > /tmp/ant-fixture.log
SIGNOZ_OTLP_URL=http://127.0.0.1:9/v1/logs timeout 5 node tools/log-shipper/index.js /tmp/ant-fixture.log
```

Expected: prints the `[shipper] tailing ...` banner, then a `[shipper] send failed:` line — that failure is the success signal here. It proves the sentinel line was matched, parsed, batched, and a send attempted, while the noise line was ignored. (Port 9 is the discard port and always refuses.)

- [ ] **Step 4: Wave 1 barrier — orchestrator only**

Only after all nine Wave 1 agents have reported:

```bash
cd /home/jin/.config/Screeps/scripts
npx tsc --noEmit -p .
git status --short
git add -A
git commit -m "feat: add colony decision modules, tasks, telemetry, and log shipper

Wave 1: stimuli, decide, the three task modules, respawner, visuals,
telemetry emitter, and the external OTLP log shipper."
```

Expected: `tsc` exits 0 and `git status` lists exactly the nine new files.

---

## Wave 2 — orchestration

### Task 11: Main loop

**Files:**
- Create: `src/main.ts`

**Interfaces:**
- Consumes: `./config` → `MIN_BODY_COST`, `SNAPSHOT_INTERVAL`; `./types` → `TaskName`; `./creep/stimuli` → `computeStimuli`, `readRoom`; `./creep/decide` → `decide`; `./creep/thresholds` → `ensureProfile`; `./creep/tasks/supply` → `run as runSupply`; `./creep/tasks/upgrade` → `run as runUpgrade`; `./creep/tasks/build` → `run as runBuild`; `./spawn/respawn` → `runSpawning`; `./visuals` → `drawCreepLabels`; `./telemetry` → `emit`, `emitSnapshot`, `TaskDistribution`
- Produces: `loop(): void` — the export Screeps calls once per tick

- [ ] **Step 1: Write the file**

```ts
import { runSpawning } from './spawn/respawn';
import { computeStimuli, readRoom } from './creep/stimuli';
import { decide } from './creep/decide';
import { ensureProfile } from './creep/thresholds';
import { run as runBuild } from './creep/tasks/build';
import { run as runSupply } from './creep/tasks/supply';
import { run as runUpgrade } from './creep/tasks/upgrade';
import { MIN_BODY_COST, SNAPSHOT_INTERVAL } from './config';
import { drawCreepLabels } from './visuals';
import { emit, emitSnapshot, TaskDistribution } from './telemetry';
import { TaskName } from './types';

const RUNNERS: Record<TaskName, (creep: Creep) => void> = {
  supply: runSupply,
  upgrade: runUpgrade,
  build: runBuild,
};

/** Drops memory for creeps that no longer exist, so it cannot grow unbounded. */
function pruneCreepMemory(): void {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
}

function runRoom(room: Room): void {
  const stimuli = computeStimuli(readRoom(room));
  const distribution: TaskDistribution = { supply: 0, upgrade: 0, build: 0 };

  for (const creep of room.find(FIND_MY_CREEPS)) {
    // One creep throwing must not cost every other creep its tick.
    try {
      const thresholds = ensureProfile(creep);
      const previous = creep.memory.task;
      const decision = decide(stimuli, thresholds, previous, Math.random());

      if (decision.switched) {
        // A new task starts with a clean slate — the old target is meaningless.
        creep.memory.taskState = {};
        emit('INFO', 'task-switch', {
          creep: creep.name,
          from: previous ?? null,
          to: decision.task,
          reason: decision.reason,
          margins: decision.margins,
        });
      }

      creep.memory.task = decision.task;
      distribution[decision.task] += 1;

      emit('DEBUG', 'decision', {
        creep: creep.name,
        task: decision.task,
        reason: decision.reason,
        thresholds,
        margins: decision.margins,
      });

      RUNNERS[decision.task](creep);
    } catch (err) {
      emit('ERROR', 'creep-exception', {
        creep: creep.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (runSpawning(room)) {
    emit('INFO', 'spawn', { room: room.name });
  }

  // Colony death: nothing alive, nothing being born, and not enough energy to
  // start one. All three must hold — a creep mid-spawn means the colony is
  // recovering, not dead. A legitimate experimental result about threshold
  // tuning, but it must be loud rather than discovered hours later. Throttled to
  // the snapshot cadence, since once true it stays true every tick.
  const alive = room.find(FIND_MY_CREEPS).length;
  const spawnBusy = room.find(FIND_MY_SPAWNS).some(s => s.spawning !== null);
  if (
    alive === 0 &&
    !spawnBusy &&
    room.energyAvailable < MIN_BODY_COST &&
    Game.time % SNAPSHOT_INTERVAL === 0
  ) {
    emit('ERROR', 'colony-starvation', {
      room: room.name,
      energyAvailable: room.energyAvailable,
    });
  }

  drawCreepLabels(room);

  if (Game.time % SNAPSHOT_INTERVAL === 0) {
    emitSnapshot(room, stimuli, distribution);
  }
}

export function loop(): void {
  pruneCreepMemory();

  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (room.controller && room.controller.my) {
      runRoom(room);
    }
  }
}
```

- [ ] **Step 2: Verify the whole project type-checks**

```bash
cd /home/jin/.config/Screeps/scripts && npx tsc --noEmit -p .
```

Expected: exit code 0.

- [ ] **Step 3: Verify the bundle actually builds**

```bash
cd /home/jin/.config/Screeps/scripts
npm run compile
ls -la dist/main.js
head -1 dist/main.js
```

Expected: `dist/main.js` exists and its first line is the new banner, `// Progressive Ant Supercolony — decentralized Screeps colony`. If it shows Overmind's ASCII logo, `rollup.config.js` was not rewritten in Task 1.

- [ ] **Step 4: Confirm no official-server push was attempted**

The compile above ran without `DEST`, so `rollup-plugin-screeps` should have been in dry-run. Confirm nothing was uploaded:

```bash
cd /home/jin/.config/Screeps/scripts
git status --short screeps.com/ 2>/dev/null || true
```

Expected: no modifications under `screeps.com/`.

- [ ] **Step 5: Commit**

```bash
cd /home/jin/.config/Screeps/scripts
git add -A
git commit -m "feat: wire the decentralized main loop

Each creep reads shared room stimuli, decides for itself against its own
jittered thresholds, and runs its chosen task. No central role assignment."
```

---

## Wave 3 — deploy and observe

Serial and partly destructive. Task 12 wipes the world; confirm with the user before running it.

### Task 12: Server-side changes

**Files:**
- Modify: `~/.steam/debian-installation/steamapps/common/Screeps/server/.screepsrc`

**Interfaces:**
- Consumes: nothing
- Produces: a wiped world with console forwarding enabled

- [ ] **Step 1: Enable console forwarding**

In `.screepsrc`, change `log_console = false` to `log_console = true`. This is what puts the bot's `[ANT]` lines on disk for the shipper.

- [ ] **Step 2: Confirm the destructive step with the user**

The next step destroys the existing world permanently. Do not run it without explicit confirmation in the conversation.

- [ ] **Step 3: Reset the world via the CLI socket**

The server exposes a CLI on a plain TCP socket, which Steam authentication does not gate.

```bash
printf 'system.resetAllData()\n' | timeout 20 nc localhost 21026
```

Expected: an acknowledgement from the CLI. If `nc` is unavailable, the Screeps client's own CLI tab reaches the same endpoint.

- [ ] **Step 4: Restart the server**

Restart it the way it was started (through the Steam client). Both the config change and the reset need it.

- [ ] **Step 5: Verify the world is empty and forwarding is on**

```bash
grep '^log_console' ~/.steam/debian-installation/steamapps/common/Screeps/server/.screepsrc
```

Expected: `log_console = true`.

---

### Task 13: Deploy and respawn

**Interfaces:**
- Consumes: `dist/main.js` from Task 11
- Produces: a running colony

- [ ] **Step 1: Build and deploy to the private server only**

```bash
cd /home/jin/.config/Screeps/scripts
npm run build
npm run deploy:pserver
ls -la 127_0_0_1___21025/pserver/main.js
```

Expected: the pserver copy's timestamp is current. The Steam client syncs it from there — there is no API push, and attempting one would fail against Steam auth.

- [ ] **Step 2: Respawn in the game UI**

Place the initial spawn by hand. A wiped world has no spawn, nothing in M1 places one, and the bot has nothing to act on until this is done.

- [ ] **Step 3: Confirm the colony is alive**

Watch the game view for ~50 ticks. Expected: creeps spawn up to 4, each carrying a task label above it.

---

### Task 14: Start telemetry and observe reallocation

**Interfaces:**
- Consumes: the running colony, `tools/log-shipper/index.js`
- Produces: the milestone's verification evidence

- [ ] **Step 1: Find which log file carries console output**

This was deliberately left unverified in the spec rather than guessed.

```bash
cd ~/.steam/debian-installation/steamapps/common/Screeps/server/logs
grep -l 'ANT' *.log
```

Expected: one filename. `engine_runner1.log` is the most likely, since user scripts run in the runner process. If nothing matches, confirm the server restarted after `log_console` was changed.

- [ ] **Step 2: Resolve the SigNoz OTLP endpoint**

```bash
portctl resolve signoz
docker port personal-signoz-otel-collector 4318
```

Expected: the host port mapped to container port 4318. Use it in the next step rather than assuming.

- [ ] **Step 3: Start the shipper**

Substitute the file from Step 1 and the port from Step 2.

```bash
cd /home/jin/.config/Screeps/scripts
SIGNOZ_OTLP_URL=http://localhost:<PORT>/v1/logs \
  node tools/log-shipper/index.js \
  ~/.steam/debian-installation/steamapps/common/Screeps/server/logs/<LOGFILE>
```

Expected: the tailing banner, and no repeated `send failed` errors.

- [ ] **Step 4: Confirm logs land in SigNoz**

Open `https://signoz.local.zeven.day`, go to Logs, filter `service.name = screeps`. Expected: `snapshot` records arriving every `SNAPSHOT_INTERVAL` ticks, each carrying a `distribution` attribute.

- [ ] **Step 5: Verify the milestone — perturb the colony and watch labor move**

This is the actual success criterion, and the reason sites are placed by hand.

1. Note the current `distribution` in SigNoz (with no construction sites, expect `build: 0`).
2. Place 3+ construction sites in the game UI.
3. Watch the creep labels change, and `distribution.build` rise in the snapshot stream.
4. Let the sites finish or cancel them.
5. Confirm creeps drift back off `build`.

Expected: task distribution shifts with no code change. Per the spec, movement will look somewhat **synchronized** rather than smooth — M1 has no congestion feedback, so differentiation comes only from threshold jitter and stimulus drift. That is expected, not a defect.

- [ ] **Step 6: Record what actually happened**

Append observed behavior to the spec's milestone section — what the distribution did, how fast it responded, whether starvation ever fired. Tuning constants (`THRESHOLD_JITTER`, `SWITCH_BUFFER`, `EXPLORATION_CHANCE`, `UPGRADE_BASELINE`) are meant to be adjusted from this evidence.

```bash
cd /home/jin/.config/Screeps/scripts
git add -A
git commit -m "docs: record M1 observed behavior"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `supply`/`upgrade`/`build`, creep-chosen | 3, 4, 5, 6, 11 |
| Jittered per-creep thresholds | 1 (thresholds.ts), 7 |
| Saturating supply stimulus | 2 |
| Four decision rules incl. exploration | 3 |
| Hand-placed construction sites | 6, 14 |
| Fixed-N=4 respawn, body scaling | 7 |
| Memory shape + dead-creep pruning | 1 (types.ts), 11 |
| HUD labels, `#c9c9c9` | 8 |
| Four severity levels → OTel numbers | 9, 10 |
| `[ANT]` sentinel | 9, 10 |
| `service.name`/`deployment.environment` | 10 |
| Snapshot every K ticks + events | 9, 11 |
| Starvation at ERROR | 11 |
| No-network constraint → log pipeline | 10, 12, 14 |
| `DEST` trap avoided | 1, 11 (step 4) |
| pserver-only deploy | 1, 13 |
| CLI reset on :21026 | 12 |
| Archive tag, `src/` removal, rollup/package cleanup | 1 |
| `/specs/` vs `docs/superpowers/specs/` | 1 (step 2) |

No spec requirement is unassigned.

**Beyond the spec:** Task 1 Step 2b untracks `.env`, which holds a live `SCREEPS_TOKEN`
and was committed in `e17253e`. The spec's cleanup list did not cover it because it was
found while writing this plan. It is included because the same commit removes other
tracked-but-shouldn't-be files, so leaving the one containing a secret would be perverse.

**Placeholder scan:** No TBDs. Two values are intentionally resolved at runtime rather than guessed — the log filename (Task 14 Step 1) and the OTLP port (Task 14 Step 2) — each with a command that determines it. That is discovery, not a placeholder.

**Type consistency:** `TaskName` values (`supply`/`upgrade`/`build`) are identical across `types.ts`, `Stimuli`, `ThresholdProfile`, `TaskDistribution`, and `RUNNERS`. Every task module exports `run(creep: Creep): void`, aliased at the single import site in `main.ts`. `decide()`'s four-argument signature in Task 3 matches its call in Task 11. `ensureProfile`/`generateProfile` are named identically in Tasks 1, 7, and 11.

**Known deviation from the spec:** `TaskState.targetId` is typed `string` rather than the `Id<...>` union. The union forced casts at every assignment across three independently-written task modules; `string` is what `Game.getObjectById` accepts anyway. The spec's intent — recording the current target — is unchanged.
