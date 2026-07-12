# Hybrid Dynamic Spawn Balancing Implementation Plan

> **For agentic workers:** REQUIRED SUB‑SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task‑by‑task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement hybrid dynamic spawn‑balancing system (demand‑tracker, baseline, per‑tick triggers, debug‑report).

**Architecture:** auto.spawn.js computes demand, baseline, triggers, spawns; debug.report.js shows spawn demand.

**Tech Stack:** Screeps JavaScript, lodash `_`.

--- 

### Task 1: Add updateDemandTracker to auto.spawn.js
- [ ] Insert function `updateDemandTracker(room)` (see spec).
- [ ] Commit.

### Task 2: Add computeBaseline to auto.spawn.js
- [ ] Insert function `computeBaseline(room)`.
- [ ] Commit.

### Task 3: Add applyTriggers to auto.spawn.js
- [ ] Insert function `applyTriggers(room, baseline)`.
- [ ] Commit.

### Task 4: Refactor autoSpawn.run
- [ ] Replace run body with hybrid algorithm (per spec).
- [ ] Commit.

### Task 5: Extend debug.report.js
- [ ] Add “Spawn Demand” markdown section displaying Memory.spawnDemand.
- [ ] Commit.

### Task 6: Verification
- [ ] Verify Memory.spawnDemand updates every 25 ticks.
- [ ] Test backlog spike, idle‑creep surge, energy emergency.
- [ ] Confirm debug report shows new section.
- [ ] Commit final verification.

--- 

**Execution:** Inline execution (superpowers:executing-plans) will be used.