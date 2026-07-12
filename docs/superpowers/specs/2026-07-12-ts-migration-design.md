# Dynamic TypeScript Migration Design (Full Rollup Build)

**Date:** 2026-07-12  
**Author:** OpenCode (AI)

---

## 1. Goal
Convert the existing plain‑JavaScript Screeps bot (`/home/jin/.config/Screeps/scripts/screeps.com/default`) into a **TypeScript‑first project** that is compiled with **Rollup** exactly like the Overmind reference implementation. The resulting `dist/main.js` will be the only file uploaded to Screeps, preserving current behaviour while giving us static typing, module imports, and a clean build pipeline.

## 2. High‑level architecture
```
+---------------------------+      +-----------------------+
|   src/ (TS source)        | ---> |   rollup.config.js    |
|   ├─ main.ts               |      |   (inputs src/main.ts)|
|   ├─ role.harvester.ts     |      +-----------------------+
|   ├─ role.builder.ts       |                |
|   ├─ utils/*.ts            |                v
|   └─ ...                  |      +-----------------------+
+---------------------------+      |   dist/main.js (CJS)  |
                                   |   exports.loop ...    |
                                   +-----------------------+
```
* **src/** – all existing `.js` files are renamed to `.ts` and refactored to use ES6 `import` / `export`.  
* **rollup.config.js** – identical to Overmind’s config (input `src/main.ts`, output `dist/main.js`, plugins: `node-resolve`, `commonjs`, `typescript`, `screeps`, `progress`).  
* **tsconfig.json** – targets ES2020, `module: ESNext` (let Rollup handle conversion), `strict: false` (allow gradual typing), `esModuleInterop: true`, `allowJs: false`.

## 3. Migration steps
| Step | Description | Files created / changed |
|------|-------------|------------------------|
| **0 Prep** | `npm init -y`; add dev dependencies (`typescript`, `rollup`, `rollup-plugin-typescript2`, `rollup-plugin-node-resolve`, `rollup-plugin-commonjs`, `rollup-plugin-screeps`, `rollup-plugin-progress`, `lodash`, `@types/lodash`, `@types/screeps`). | `package.json` |
| **1 TS config** | Add `tsconfig.json` with Screeps typings. | `tsconfig.json` |
| **2 Rollup config** | Copy Overmind’s `rollup.config.js` (adjust `input: "src/main.ts"`). | `rollup.config.js` |
| **3 Move sources** | Create `src/` directory; move every file from the root of the bot into `src/` and rename `*.js → *.ts`. | `src/*.ts` |
| **4 Convert modules** | For each file: replace `module.exports = …` with `export const …` or `export default …`; replace `require('…')` with `import … from './…'`; add trivial type annotations (e.g., `function run(creep: Creep): void`). | All source files |
| **5 Globals & lodash** | At top of files that use `_` or Screeps globals, add `/// <reference types="screeps" />` and `declare const _: _.LoDashStatic;` or `import _ from "lodash";` and assign `global._ = _;` in a dedicated `src/globals.ts`. | `src/globals.ts`, updated files |
| **6 Main loop** | Create `src/main.ts` mirroring current `main.js` logic but using imported modules (`import roleHarvester from './role.harvester';` …). Keep the `safeRequireRole` wrapper (now a thin alias returning the imported object). Export final loop: `export const loop = _loop;`. | `src/main.ts`, updated `src/auto.spawn.ts`, etc. |
| **7 Build script** | Add `"build": "rollup -c"` to `package.json`. | `package.json` |
| **8 Testing & verification** | 1️⃣ `npm run build` → `dist/main.js` generated without TypeScript errors. 2️⃣ Upload `dist/main.js` to Screeps and watch for runtime errors. 3️⃣ Verify idle‑creep ratio, phase detection, and spawning behave identically. | N/A |
| **9 Fallback** | If a module fails to compile, keep original `.js` alongside new `.ts` and add `// @ts-ignore` comments gradually. Allows incremental migration without breaking the bot. | As needed |

## 4. Error handling & fallback strategies
* **Compilation errors** – `npm run build` stops on the first TypeScript error. Fix one file at a time; the rest compiles once resolved.
* **Runtime missing import** – Rollup will error during build, preventing a broken deployment.
* **Legacy globals** – Screeps globals (`Game`, `Memory`, `RawMemory`, etc.) are declared via `/// <reference types="screeps" />`. If missing, add a declaration in `src/types/screeps.d.ts`.

## 5. Testing & validation plan
| Test | Goal | Method |
|------|------|--------|
| **Type‑checking** | No TypeScript errors after migration. | Run `npm run build`; CI can be added later. |
| **Bundle size** | Verify output stays < 200 KB (Screeps limit). | `ls -lh dist/main.js`. |
| **Functional parity** | Bot’s behaviour unchanged (idle‑creep ratio, spawn logic). | Compare logs before/after for 10 ticks; monitor `Memory.debug.creepAnalysis.idleCreeps`. |
| **Phase detection** | Confirm `colony.manager` still computes phases correctly. | Run a few ticks in a test room, inspect `Memory.roomIntel[room].colonyPlan.phase`. |
| **Module resolution** | All `import` statements resolve correctly. | Build output should contain no `require` errors. |
| **Rollback** | Ability to revert to original JS version if needed. | Keep original files in a backup folder (`legacy/`). |

## 6. Self‑review (no placeholders)
* All sections are fully fleshed – no “TODO” markers.  
* Scope limited to migration and build pipeline; no unrelated refactoring.  
* No contradictions: the compiled bundle replaces the original `module.exports.loop` contract via `exports.loop`.  
* Ambiguities (e.g., exact lodash import) are explicitly documented.

---

## 7. Next steps
1. **Commit this spec** to `docs/superpowers/specs/2026-07-12-ts-migration-design.md`.  
2. **User review** – please open the file at that path and let me know if any changes are needed.  
3. After approval, we will invoke the **`writing-plans`** skill to generate a detailed implementation plan (file creations/edits, exact commands, verification steps).

*Awaiting your sign‑off on the spec.*