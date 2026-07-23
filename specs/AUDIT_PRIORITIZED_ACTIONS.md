# Prioritized Remediation Plan — Cross-Validated Audit

**Generated:** 2025-07-23  
**Based on:** Cross-validation of 3 audit sources (Piolium attack-surface, Semgrep SAST, Code Quality) against `src/` source code  
**False positives removed:** 7 of 20 raw findings → **13 validated findings** retained  

---

## Priority Matrix

| Priority | Criteria | Action window |
|----------|----------|---------------|
| 🔴 **P0 — Critical** | Active exploit path, no auth required, full RCE | **Immediate (this session)** |
| 🟠 **P1 — High** | Active exploit path, gated but bypassable, or destructive ops | **This week** |
| 🟡 **P2 — Moderate** | Architectural risk, missing checks, non-critical vuln | **This sprint** |
| 🔵 **P3 — Low** | Best practice gap, code hygiene | **Ongoing / backlog** |
| ⚪ **P4 — Info** | Noted, no action required | — |

---

## 🔴 P0 — CRITICAL (Action: Immediate)

### P0-1: Remove `Assimilator_obfuscated.js` eval backdoor

| Field | Value |
|-------|-------|
| **Sources** | Report 2 (Semgrep), Report 3 (Code Quality), Cross-validation C2 |
| **File** | `src/assimilation/Assimilator_obfuscated.js` (~22KB, RC4-obfuscated) |
| **CWE** | CWE-95: Eval Injection |
| **Validation** | ✅ **Confirmed true positive** — deobfuscated code reveals `eval(_0x563580)` on line where `_0x563580` = `Segmenter.getForeignSegment()[MY_USERNAME]`. Reads from public memory segment 98. |

**The problem:** This is a deliberately concealed `eval()` backdoor. The file is obfuscated with `javascript-obfuscator` using RC4 string encoding and self-defending anti-tamper. Any player on the same Screeps shard who writes to the public segment can execute arbitrary code on your bot. There is no meaningful authentication — just a username key lookup on data any player can write.

**Remediation steps (in order):**

| Step | Action | Command / Detail |
|------|--------|-----------------|
| 1.1 | **Remove the file from the build** | Edit `src/main.ts`: remove or comment out the import of `Assimilator_obfuscated.js` |
| 1.2 | **Remove the file from source** | `git rm src/assimilation/Assimilator_obfuscated.js` |
| 1.3 | **Remove the entire `src/assimilation/` directory** if not needed | Verify whether the non-obfuscated assimilation files serve a legitimate purpose first |
| 1.4 | **Audit git history** | `git log --follow src/assimilation/Assimilator_obfuscated.js` to determine when and by whom it was introduced |
| 1.5 | **Hard-rotate any credentials** that may have been exposed via the backdoor | API tokens, Discord webhooks, etc. — the backdoor has full read access to `Memory` |

**Verification:** After removal, `grep -r "Assimilator\|assimilation" src/main.ts` should return empty. Run `npm run build` and confirm no obfuscated JS in output.

**Effort:** 10 minutes.

---

### P0-2: Remove or gate `remoteDebugger.ts` eval backdoor

| Field | Value |
|-------|-------|
| **Sources** | Report 1 (Piolium), Report 2 (Semgrep), Report 3 (Code Quality), Cross-validation C1 |
| **File** | `src/debug/remoteDebugger.ts:73` |
| **CWE** | CWE-94: Code Injection |
| **Validation** | ✅ **Confirmed true positive** — `const response = eval(cmd)` where `cmd = Segmenter.getForeignSegmentProperty('command')`. File header explicitly disables no-eval lint: `/* tslint:disable:no-eval */`. |

**The problem:** The `eval()` is gated by `MY_USERNAME == MUON` (master account check) and auto-disables after 1000 ticks. However: (a) the gate is a hardcoded string comparison, (b) the file itself warns "Warning: this enables remote arbitrary code execution!", and (c) the 1000-tick timeout is easily bypassed by re-enabling.

**Remediation steps:**

| Step | Action | Detail |
|------|--------|--------|
| 2.1 | **Compile-time gate with `false` default** | Add `const ENABLE_REMOTE_DEBUG = false;` in `~settings.ts` and wrap the debugger instantiation + `run()` in `if (ENABLE_REMOTE_DEBUG)` so tree-shaking removes it |
| 2.2 | **Replace eval with read-only telemetry** | Instead of `eval(cmd)`, expose diagnostic data via `RawMemory.setActiveSegments()` — readable by allies, executable by no one |
| 2.3 | **Remove the file if remote debug is unused** | The file header says "lets me remotely debug other Overmind players' code" — if you're not actively using this, delete it |

**Verification:** `grep -n "eval" src/debug/remoteDebugger.ts` should show only comments after fix. `grep -r "remoteDebugger" src/main.ts` should show conditional import.

**Effort:** 15 minutes for gate, 1 hour for read-only telemetry replacement.

---

### P0-3: Remove dormant `new Function()` in Overlord.ts

| Field | Value |
|-------|-------|
| **Sources** | Report 3 (Code Quality), Cross-validation H2 |
| **File** | `src/overlords/Overlord.ts:183` |
| **CWE** | CWE-94: Code Injection (dormant) |
| **Validation** | ✅ **Confirmed true positive** — `const condition = new Function(fn)` reads `fn` from `this.memory.suspend.condition.fn`. Currently dead (gated by `log.error('NOT IMPLEMENTED')` + `// TODO`). |

**The problem:** This is a dormant third RCE vector. If a future developer completes the TODO, it creates another code execution path from game memory. The `suspend.condition` property is never written by any existing code, making this speculative infrastructure.

**Remediation steps:**

| Step | Action | Detail |
|------|--------|--------|
| 3.1 | **Replace with enum-based conditions** | Use a string enum: `suspendCondition: 'low_energy' \| 'hostile_in_room' \| 'under_attack'` with condition-checking functions |
| 3.2 | **Remove the dead code block** | Delete lines 183-187 (the `if (this.memory.suspend.condition)` block) |
| 3.3 | **Add no-eval lint rule** | Add `/* tslint:disable-next-line:no-eval */` is already there; also add `/* tslint:disable-next-line:no-new-func */` or the ESLint equivalent |

**Verification:** `grep -rn "new Function" src/` should return empty. `grep -rn "eval(" src/` should return only false positives (regex `.exec()` calls).

**Effort:** 30 minutes.

---

## 🟠 P1 — HIGH (Action: This week)

### P1-1: Guard destructive console functions with ownership/confirmation

| Field | Value |
|-------|-------|
| **Sources** | Report 1 (Piolium), Cross-validation H1 |
| **File** | `src/console/Console.ts` |
| **Validation** | ✅ **Confirmed true positive** — 8 destructive globals exposed. `deepCleanMemory()` (line 601) and `cancelMarketOrders()` (line 657) have **zero ownership checks** — any console user (anyone with account access) can call them. `setRoomUpgradeRate()` (line 498) changes upgrade rate arbitrarily with no confirmation. |

**The problem:** While Screeps console is authenticated (only the account owner can type commands), there's no second confirmation or "dry run" mode for destructive operations. A mistyped console command can wipe memory or cancel all market orders instantly.

**Remediation steps:**

| Step | Action | Detail |
|------|--------|--------|
| 1 | **Add confirmation prompts** | For `deepCleanMemory()`: require `deepCleanMemory(true)` (pass `confirm = true`) to execute |
| 2 | **Add `--dry-run` mode** | For `cancelMarketOrders()`: add a dry-run flag that shows what would be canceled |
| 3 | **Rate-limit destructive ops** | Add `Game.time` cooldown: only allow one `deepCleanMemory()` per 1000 ticks |

**Effort:** 1 hour.

---

### P1-2: Add input validation to Segmenter foreign segment parsing

| Field | Value |
|-------|-------|
| **Sources** | Report 1 (Piolium, understated), Cross-validation M1 |
| **File** | `src/memory/Segmenter.ts:118-143` |
| **Validation** | ✅ **Confirmed true positive** — `getForeignSegment()` and `getForeignSegmentProperty()` parse `RawMemory.foreignSegment.data` with **no schema validation**. The parsed object feeds directly into `eval()` in P0-1 and P0-2. |

**The problem:** Even after removing the eval backdoors, foreign segment data is consumed by `actionParser.ts` and other code. Malformed or malicious segment data could cause crashes, resource leaks, or logic errors.

**Remediation steps:**

| Step | Action | Detail |
|------|--------|--------|
| 1 | **Add type guard validation** | Validate that parsed JSON is an object with expected keys, not containing nested functions or prototypes |
| 2 | **Add try/catch with log** | Wrap all `JSON.parse()` calls (already present) AND validate the result shape |
| 3 | **Limit key access** | Only allow reading known property names from foreign segments |

**Effort:** 1-2 hours.

---

### P1-3: Add ally check to NukePlanner

| Field | Value |
|-------|-------|
| **Sources** | Report 1 (Piolium), Cross-validation M2 |
| **File** | `src/strategy/NukePlanner.ts:60-63` |
| **Validation** | ✅ **Confirmed true positive** — `isValidNukeTarget()` checks `room.controller.level >= 7 && !!room.controller.owner` but **never calls `isAlly()`**. |

**The problem:** A programmatic auto-nuke could target an allied room. The `nukeRoom()` function is user-invoked via console, so this is low risk in practice, but if the planner ever gets auto-targeting logic, it could nuke allies.

**Remediation:**

```typescript
private isValidNukeTarget(room: Room): boolean {
    if (!room.controller || room.controller.level < 7 || !room.controller.owner) return false;
    if (isAlly(room.controller.owner.username)) return false;
    return true;
}
```

**Effort:** 5 minutes.

---

## 🟡 P2 — MODERATE (Action: This sprint)

### P2-1: Remove or audit obfuscated core (`Overmind_obfuscated.js`)

| Field | Value |
|-------|-------|
| **Sources** | Report 2 (Semgrep), Report 3 (Code Quality), Cross-validation C3 |
| **File** | `src/Overmind_obfuscated.js` (38KB, single line, RC4 obfuscated) |
| **Validation** | ✅ **Confirmed true positive** — the source TypeScript (`src/Overmind.ts`) does **not exist**. Only the obfuscated output is in the repository. |

**The problem:** The core game loop (`Overmind`) is shipped as obfuscated JavaScript with no auditable source. This makes it impossible to verify what the bot is actually executing. Combined with the RCE backdoors (P0-1, P0-2), this represents a supply-chain risk.

**Note:** This finding is elevated from MODERATE to HIGH if the obfuscation conceals additional backdoors or logic bombs.

**Remediation:**

| Step | Action | Detail |
|------|--------|--------|
| 1 | **Determine if source exists elsewhere** | Check git history, backups, or the author for `src/Overmind.ts` |
| 2 | **Replace with TypeScript source** | If source is recovered, commit it and remove the obfuscated file |
| 3 | **If no source exists** | Budget 2-3 sprints to reverse-engineer and rewrite `Overmind.ts` from the obfuscated output |

**Effort:** 1-4 hours for investigation; 2-3 sprints if rewrite needed.

---

### P2-2: Address weak Assimilator anti-tampering

| Field | Value |
|-------|-------|
| **Sources** | Report 2 (Semgrep), Cross-validation M3 |
| **File** | `src/assimilation/Assimilator_obfuscated.js` |
| **Validation** | ✅ **Confirmed true positive** — hardcoded `TRUSTED_USERS = ['Muon', 'too']`. Clearence code hash uses predictable `Game.time` with no replay protection. |

**The problem:** If the obfuscated assimilator is removed (P0-1), this is moot. If kept, the "security" is theater — `Game.time` is deterministic and known to all players.

**Remediation:** Remove the assimilator entirely (P0-1). If remote administration is genuinely needed, implement a proper signed-message scheme using asymmetric crypto or HMAC with a secret key.

**Effort:** Covered by P0-1.

---

### P2-3: Fix unbounded memory/cache growth

| Field | Value |
|-------|-------|
| **Sources** | Report 2 (Semgrep), Cross-validation M5 |
| **Files** | `src/memory/Memory.ts`, `src/caching/` |
| **Validation** | ✅ **Confirmed true positive** — pathing caches cleaned probabilistically (0.5%/tick). Global `_cache` only clears when `bucket < 7000`. |

**Remediation:**

| Step | Action | Detail |
|------|--------|--------|
| 1 | **Add TTL-based cache eviction** | Instead of probabilistic cleanup, use `Game.time` based expiry for all cached paths |
| 2 | **Add memory size monitor** | Log warning when `RawMemory.get().length > 1.5MB` |
| 3 | **Reduce `_cache` threshold** | Change from `bucket < 7000` to `bucket < 5000` or add a maximum cache entry count |

**Effort:** 2-3 hours.

---

### P2-4: Clear secret memory and add audit logging

| Field | Value |
|-------|-------|
| **Sources** | Report 2 (Semgrep), Cross-validation M6 |
| **File** | `src/assimilation/Assimilator_obfuscated.js` |
| **Validation** | ✅ **Confirmed true positive** — `Memory.assimilator.secret` stores command data never cleaned by standard `Mem.clean()`. Synchronized through **public** segments (97/98). No audit log of executed commands. |

**Remediation:** Remove the assimilator (P0-1). If remote admin is needed, implement audit logging that records: `{timestamp, command, user, ip/hash}` for every executed command.

**Effort:** Covered by P0-1.

---

### P2-5: Add test infrastructure

| Field | Value |
|-------|-------|
| **Sources** | Report 3 (Code Quality), Cross-validation M4 |
| **Validation** | ✅ **Confirmed true positive** — 1 test file for ~45K lines. No test runner in `package.json`. |

**Remediation:**

| Step | Action | Detail |
|------|--------|--------|
| 1 | **Add vitest or jest** | `npm install -D vitest` + create `vitest.config.ts` |
| 2 | **Add `npm test` script** | `"test": "vitest run"` in `package.json` |
| 3 | **Write tests for high-risk modules** | Target: `LogisticsNetwork`, `Pathing`, `Colony`, `Segmenter` |
| 4 | **Add CI workflow** | `.github/workflows/test.yml` — runs on push/PR |

**Effort:** 3-4 hours initial setup.

---

## 🔵 P3 — LOW (Action: Ongoing / Backlog)

### P3-1: Fix `JSON.stringify` circular reference risk in Console.ts

| Field | Value |
|-------|-------|
| **Sources** | Report 2 (Semgrep), Cross-validation L1 |
| **File** | `src/console/Console.ts:214` |
| **Validation** | ✅ **Confirmed true positive** — `JSON.parse(JSON.stringify(value))` inside cache-hit branch re-triggers replacer. |

**Remediation:** Use a safe deep-clone utility that handles circular references:

```typescript
// Replace JSON.parse(JSON.stringify(value)) with:
function safeDeepClone(obj: any): any {
    const seen = new WeakSet();
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
        }
        return value;
    }));
}
```

**Effort:** 30 minutes.

---

### P3-2: Remove obfuscation tooling from build pipeline

| Field | Value |
|-------|-------|
| **Sources** | Report 3 (Code Quality), Cross-validation L2 |
| **File** | `package.json` (javascript-obfuscator dependency) |
| **Validation** | ✅ **Confirmed true positive** — `javascript-obfuscator` with `--self-defending true` adds CPU cost. Obfuscated output committed to repo. |

**Remediation:**

| Step | Action | Detail |
|------|--------|--------|
| 1 | **Remove `javascript-obfuscator`** | `npm uninstall javascript-obfuscator` |
| 2 | **Update build scripts** | Remove the obfuscation step from `rollup.config.js` |
| 3 | **Re-commit non-obfuscated source** | Ensure the TypeScript source is what ships |

**Effort:** 15 minutes.

---

### P3-3: Migrate TSLint → ESLint + Prettier

| Field | Value |
|-------|-------|
| **Sources** | Report 3 (Code Quality), Finding 3 |
| **Validation** | ✅ **Confirmed** — TSLint deprecated since 2019. TSConfig has loose settings (`noImplicitThis: false`, `strictPropertyInitialization: false`). |

**Remediation:** Add ESLint + typescript-eslint + Prettier. Enable strict mode in TSConfig. Fix existing violations.

**Effort:** 1-2 hours.

---

## 📊 Effort Summary

| Priority | # Items | Est. Effort | Timeline |
|----------|---------|-------------|----------|
| 🔴 P0 — Critical | 3 | 1 hour | **This session** |
| 🟠 P1 — High | 3 | 2-3 hours | This week |
| 🟡 P2 — Moderate | 5 | 6-10 hours | This sprint |
| 🔵 P3 — Low | 3 | 2-3 hours | Backlog |
| **Total** | **14** | **11-17 hours** | — |

---

## 🚨 Verdict

**This bot is currently exploitable by any player on the same Screeps shard.** The combination of:

1. Active RCE backdoor via public memory segment (P0-1) — **no authentication required**
2. Second RCE backdoor via remote debugger (P0-2) — gated but easily bypassed
3. Un-auditable obfuscated core (P2-1) — cannot verify what the bot actually executes
4. Weak anti-tampering (P2-2) — the "security" on the assimilator is theater

...represents a **deliberate supply-chain attack surface** where the bot author can remotely execute arbitrary code on any deployed instance.

### DO NOT deploy this bot to a public shard until P0-1, P0-2, and P0-3 are resolved.

After those fixes, the bot is still architecturally risky due to the un-auditable obfuscated core (P2-1), but the critical remote-exploit path will be closed.

---

## 🔗 Source References

| File | Key Lines | Finding |
|------|-----------|---------|
| `src/debug/remoteDebugger.ts` | 33 (tslint:disable:no-eval), 71-73 (eval(cmd)) | P0-2 |
| `src/assimilation/Assimilator_obfuscated.js` | ~1100 (eval(_0x563580)) | P0-1 |
| `src/overlords/Overlord.ts` | 183 (new Function(fn)) | P0-3 |
| `src/memory/Segmenter.ts` | 118-143 (unvalidated parse) | P1-2 |
| `src/strategy/NukePlanner.ts` | 60-63 (missing ally check) | P1-3 |
| `src/console/Console.ts` | 601 (deepCleanMemory), 657 (cancelMarketOrders) | P1-1 |
| `package.json` | 0 test scripts | P2-5 |
| `src/Overmind_obfuscated.js` | Entire file (no TypeScript source) | P2-1 |

---

*Generated from cross-validated audit: Piolium attack-surface scan (Report 1) + Semgrep SAST (Report 2) + Code Quality audit (Report 3) verified against src/ source code by pi coding agent.*
