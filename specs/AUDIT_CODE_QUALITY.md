# Code Quality Audit — Overmind Screeps AI

**Audit ID:** 2025-07-code-quality  
**Date:** 2025-07-23  
**Scope:** `src/` — full TypeScript source (~44,745 lines across 70+ files)  
**Auditor:** Automated static + manual review  
**Status:** ⚠️ **CONCERNS** — 7 findings across security, testing, maintainability

---

## Executive Summary

| Domain | Grade | Key Finding |
|--------|-------|-------------|
| **Security** | 🔴 CRITICAL | 2 deliberate `eval()` backdoors shipped in source |
| **Testing** | 🔴 CRITICAL | 1 test file for 70+ source files; no test runner configured |
| **Type Safety** | 🟡 MODERATE | Loose `any` usage, deprecated TSLint, no strict null checks enforced |
| **Maintainability** | 🟡 MODERATE | Large files (1.4K lines), long lines in 259 files, circular dependencies suppressed |
| **Documentation** | 🟢 GOOD | Extensive JSDoc, module docblocks, typed README |
| **Architecture** | 🟢 GOOD | Well-modularised Overlord/Directive pattern, stable matching logistics |
| **Dependencies** | 🟡 MODERATE | Dead ML deps (TensorFlow.js, ONNX.js) bundled despite no RL use |
| **Dead Code** | 🟡 MODERATE | Dormant `new Function()` path, obfuscated file never tree-shaken |

---

## 🔴 Finding 1: Security — Eval Backdoors in Production Code

**Severity:** Critical  
**Location:** `src/assimilation/Assimilator_obfuscated.js` + `src/debug/remoteDebugger.ts`

**What:**
- `Assimilator_obfuscated.js` contains a deliberately RC4-obfuscated `eval()` that reads from Screeps public memory segments — writable by any other player on the shard.
- `remoteDebugger.ts:73` performs `eval(cmd)` on memory-segment content, gated only by a hardcoded username string comparison.

**Why it matters:** Screeps has no VM sandbox. A successful injection can read/write all memory, spawn creeps, transfer resources, or delete rooms. The obfuscation on the assimilator file suggests deliberate concealment.

**Severity rationale:** CVSS 9.9 (assimilator, no auth needed) / 8.8 (remote debugger, gated).

**Already documented in `specs/AUDIT_REPORT.md`** — this audit confirms those findings and adds operational context: these files are still in the source tree and included via `main.ts` imports.

---

## 🔴 Finding 2: Testing — Critical Coverage Gap

**Severity:** Critical  
**Location:** `tests/` directory

**What:**
- **1 test file** (`tests/ExpansionCampaign.test.ts`) for ~44,745 lines of source code.
- No test runner configured (`package.json` has no `test` script, no `jest.config.*`, no `mocha`, no `vitest`).
- The single test file runs 32 plain function calls with `assert.*` statements — no describe/it blocks, no isolation, no CI integration.
- No type-checking or linting in CI (no CI config at all).

**Impact:** Impossible to regression-test without manual verification. Architectural change risk is unmanaged.

**Recommendation:**
1. Add a test runner (`jest` or `vitest`) with a proper test script in `package.json`.
2. Add type-safe unit tests for critical modules: Colony, LogisticsNetwork, Pathing, Overlord.
3. Wire `npm test` into a CI workflow.

---

## 🟡 Finding 3: Type Safety — Loose Typing and Deprecated Linter

**Severity:** Moderate  
**Location:** TSConfig + TSLint config + `src/`

**What:**
- **Use of `any`:** 97 explicit `any` type annotations in source.
- **Deprecated linting:** Uses `tslint` (deprecated 2019) instead of `eslint` + `typescript-eslint`.
- **Loose TSConfig:**
  - `strictPropertyInitialization: false`
  - `noImplicitThis: false`
  - `allowUnusedLabels: true`
  - `strict` is enabled but undermined by the above exceptions.
- **TSLint rules disabled:** `no-shadowed-variable: false`, `triple-equals: false`, `no-empty: false`, `whitespace: false`.
- **Circular dependencies suppressed** in Rollup config via `onwarn` ignore list — cycles exist but are hidden.

**Impact:** Type-checking passes but catches fewer real bugs. `noImplicitThis: false` is particularly dangerous for Screeps where `this` binding in prototype methods is a common footgun.

**Recommendation:**
1. Migrate from TSLint to `eslint` + `typescript-eslint`.
2. Enable `noImplicitThis`, `strictPropertyInitialization`, `noUnusedLocals`.
3. Audit and eliminate circular dependencies instead of suppressing warnings.
4. Replace `any` with `unknown` + type guards.

---

## 🟡 Finding 4: Maintainability — Large Files and Long Lines

**Severity:** Moderate  
**Location:** Various files

**Metrics:**

| Threshold | Count |
|-----------|-------|
| Files > 500 lines | 24 files |
| Files > 1,000 lines | 4 files |
| Files with lines > 120 chars | 259 files |
| Max file size | 1,410 lines (`src/movement/Movement.ts`) |

**Top 5 largest files:**

| File | Lines |
|------|-------|
| `src/movement/Movement.ts` | 1,410 |
| `src/movement/Pathing.ts` | 1,258 |
| `src/logistics/TerminalNetwork_v2.ts` | 1,251 |
| `src/matrix/MatrixLib.ts` | 1,048 |
| `src/logistics/TradeNetwork.ts` | 982 |

**What:** 259 files exceed the project's own TSLint `max-line-length: 120` rule. The TSLint rule exists but is violated across nearly the entire codebase, indicating it was never enforced. Large modules mix multiple responsibilities (e.g., `Pathing.ts` combines path caching, cost matrices, room transitions, and stuck-creep detection).

**Recommendation:**
1. Decompose files > 800 lines into focused submodules.
2. Enforce line-length via ESLint `max-len` with Prettier integration.
3. Use Git hooks (husky/lint-staged) to prevent violations from reaching main.

---

## 🟡 Finding 5: Dead Code and Dormant Attack Surface

**Severity:** Moderate  
**Location:** `src/overlords/Overlord.ts`, `src/~settings.ts`

**What:**
- **Dormant `new Function()`** in `Overlord.ts:183` reads a string from memory and prepares to `new Function(fn)`. Currently gated by an error log ("NOT IMPLEMENTED") and TODO comment — dead now, but would become a third code-injection vector if completed.
- **Obfuscated file in source** (`Assimilator_obfuscated.js`) is imported by `main.ts` but the assimilation pipeline is non-functional for anyone not the original author (hardcoded `MY_USERNAME == 'MUON'` gate).
- **RL training mode** (`RL_TRAINING_MODE` flag) imports TensorFlow.js and ONNX.js but is disabled by default; these deps still bloat the bundle.

**Recommendation:**
1. Remove `new Function()` entirely; replace with enum-based condition system.
2. Gate the obfuscated assimilator behind a compile-time `ENABLE_ASSIMILATOR` flag that defaults to `false`.
3. Move ML dependencies behind dynamic imports or a separate bundle.

---

## 🟢 Finding 6: Documentation and Architecture — Strengths

**Severity:** Positive  
**Location:** All modules

**What's good:**
- **JSDoc density:** 3,484 single-line comments and 703 multi-line docblocks across the codebase. Nearly every exported class, interface, and method has a docstring explaining its purpose.
- **Architecture pattern:** Clean Overlord (process) / Directive (goal) / Zerg (unit) separation. The `LogisticsNetwork` stable-matching approach is well-documented with a blog post link.
- **Colony plan schema** in `AGENTS.md` is well-defined.
- **TypeScript interfaces** for complex state (`OverlordMemory`, `LogisticsRequest`, `CampaignSnapshot`) are properly defined.
- **`~settings.ts` isolates all configuration** in a single file with JSDoc annotations per setting.

**Recommendation:** Maintain this standard. Consider adding architecture decision records (ADRs) for the Overlord/Directive pattern.

---

## 🟡 Finding 7: Dependency Hygiene

**Severity:** Moderate  
**Location:** `package.json`

**What:**
- **@tensorflow/tfjs** (^1.2.11) and **onnxjs** (^0.1.6) are production dependencies but only used when `RL_TRAINING_MODE` is enabled, which defaults to `false`. These inflate bundle size for zero benefit in normal operation.
- **semgrep** (^0.0.1) is in devDependencies but no Semgrep config or scan scripts exist.
- **12 devDependencies** total; no Prettier, no ESLint, no test runner.
- **javascript-obfuscator** is used for production build — obfuscation in Screeps wastes CPU on the game server for decompilation of already-compiled JS.

**Recommendation:**
1. Move ML deps to optional or dynamic imports.
2. Remove or properly configure semgrep if security scanning is desired.
3. Add Prettier + ESLint + a test runner to devDependencies.
4. Reconsider whether obfuscation is necessary for Screeps (it adds bundle size and tick CPU cost).

---

## Summary: Action Items by Priority

### 🔴 Immediate

| # | Action | File(s) | Effort |
|---|--------|---------|--------|
| A1 | Remove `Assimilator_obfuscated.js` from build | `main.ts`, `src/assimilation/` | 5 min |
| A2 | Remove or compile-flag `remoteDebugger.ts` eval | `src/debug/remoteDebugger.ts` | 15 min |
| A3 | Add test runner + `npm test` script | `package.json`, `tests/` | 30 min |
| A4 | Write unit tests for high-risk modules (LogisticsNetwork, Pathing, Colony) | `tests/` | 2-3 hr |

### 🟡 Short-term

| # | Action | Effort |
|---|--------|--------|
| B1 | Migrate TSLint → ESLint + typescript-eslint | 1 hr |
| B2 | Enable `noImplicitThis`, `strictPropertyInitialization` in tsconfig | 30 min |
| B3 | Replace `new Function()` with enum-based suspend conditions | 30 min |
| B4 | Remove or gate dead ML deps | 15 min |
| B5 | Decompose `Movement.ts` and `Pathing.ts` | 2 hr |

### 🟢 Ongoing

| # | Action | Effort |
|---|--------|--------|
| C1 | Add Prettier + lint-staged + husky for pre-commit formatting | 30 min |
| C2 | Replace `any` with `unknown` throughout | 2 hr (incremental) |
| C3 | Resolve circular dependencies instead of suppressing | 3 hr |
| C4 | Add architecture decision records (ADRs) for core patterns | 1 hr |

---

*Generated by pi coding agent — code quality audit, 2025-07-23*
