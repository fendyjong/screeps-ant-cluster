# Security Audit Report — Screeps Bot

**Audit ID:** 2025-07-piolium  
**Date:** 2025-07-17  
**Scope:** `src/` — TypeScript + JS source (Screeps bot codebase)  
**Method:** Heuristic static analysis (piolium attack-surface scan) + manual cross-validation  
**Status:** Phase P1 partial (Semgrep not executed — output directory empty; manual validation substituted)

---

## Executive Summary

**3 confirmed findings** — 2 critical backdoors, 1 dormant architectural risk.  
~240 heuristic findings dismissed as false positives (~99% noise rate).

The codebase contains **two deliberate remote code execution backdoors** and one dormant `new Function()` path that would be a third if completed. Both active backdoors read from Screeps public memory segments — data writable by any other player — making them remotely exploitable by anyone who can write to memory.

---

## 🔴 CRITICAL — Immediate Action Required

### #1 — Assimilator Obfuscated Backdoor

| Field | Value |
|-------|-------|
| **File** | `src/assimilation/Assimilator_obfuscated.js` |
| **CWE** | CWE-95: Eval Injection |
| **CVSS (estimated)** | 9.9 (AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H) |
| **Type** | Deliberately obfuscated `eval()` backdoor |

**How it works:**
```js
[/* assimilate */]() {
  const data = Segmenter.getForeignSegment(/* remoteDebugger */) || {};
  const command = data[MY_USERNAME];
  command && eval(command);
}
```
- Reads from Screeps **public memory segment** (writable by ANY player)
- Keyed by `MY_USERNAME` — attacker writes to `Memory.segments[segment][targetUsername]`
- Entire file is RC4-cipher-obfuscated with string encoding (`a0_0x1b62` pattern)

**Why it's critical:**
- The obfuscation is intentional concealment — this is not a debug leftover
- No username whitelist beyond the player's own username (which the attacker knows)
- Any other player in the same shard can write to public segments and inject arbitrary code
- Screeps has no sandbox — `eval()` can read/write all memory, spawn creeps, transfer energy, delete rooms

**Recommendation:**
1. **Immediately** remove `Assimilator_obfuscated.js` from the build
2. **Audit git history** for when and by whom this file was introduced
3. If remote administration is genuinely needed, replace with a signed-message scheme using `RawMemory.setActiveSegments()` + HMAC verification — **never raw eval**
4. Consider rotating all in-game credentials if this was deployed on a public shard

---

### #2 — Remote Debugger Eval

| Field | Value |
|-------|-------|
| **File** | `src/debug/remoteDebugger.ts:73` |
| **CWE** | CWE-94: Code Injection |
| **CVSS (estimated)** | 8.8 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H) |
| **Type** | Gated `eval()` from public memory segment |

**How it works:**
```ts
// remoteDebugger.ts:71-73
const cmd = Segmenter.getForeignSegmentProperty('command');
// ...
const response = eval(cmd);
```
- Gated by `MY_USERNAME == 'MUON'` (hardcoded master username)
- Auto-disables after 1000 ticks
- The `enable()` method logs: *"Warning: this enables remote arbitrary code execution!"*

**Why it's critical:**
- The gate is a single hardcoded string comparison — trivial to bypass if the master account is compromised
- The code itself **warns** about the danger, suggesting the author knew it was problematic
- 1000-tick timeout is a weak safeguard (Screeps runs at ~1 tick/sec; 1000 ticks ≈ 16 minutes of exposure per enable cycle)

**Recommendation:**
1. **Remove or gate behind a compile-time flag** that defaults to `false`
2. If remote debugging is essential, replace with a **read-only telemetry segment** (write state to memory, never eval commands)
3. Never ship debug eval backdoors in production code — use `RawMemory.setActiveSegments()` to expose diagnostic data instead

---

## ⚠️ HIGH — Architectural Risk

### #3 — Dormant `new Function()` in Overlord

| Field | Value |
|-------|-------|
| **File** | `src/overlords/Overlord.ts:183` |
| **CWE** | CWE-94: Code Injection (dormant) |
| **CVSS (estimated)** | 3.7 (AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:N) — currently dead code |
| **Type** | Incomplete dynamic code execution path |

**How it works:**
```ts
if (this.memory.suspend.condition) {
  log.error('NOT IMPLEMENTED'); // TODO
  const {fn, freq} = this.memory.suspend.condition;
  if (Game.time % freq == 0) {
    const condition = new Function(fn);
    // TODO - finish this
  }
}
```
- Reads `fn` string from `this.memory.suspend.condition` (game memory — attacker-writable if they gain memory access)
- Currently dead: gated by `log.error('NOT IMPLEMENTED')` + `// TODO`

**Why it's an architectural risk:**
- The pattern is dangerous by design — string-to-function from mutable memory
- If a future developer completes the TODO, this becomes a third backdoor
- The `suspend.condition` property is never written by the existing codebase (no setter found), suggesting this is speculative/future infrastructure

**Recommendation:**
1. **Replace** `new Function(fn)` with a finite-state-machine or enum-based condition system (e.g., `suspend.condition: 'low_energy' | 'hostile_in_room' | 'under_attack'`)
2. **Remove the dead code** if the suspend feature isn't actively being developed
3. Add a lint rule banning `new Function()` and `eval()` globally

---

## 📊 False Positive Analysis

| Heuristic | Hits | Actual Pattern | Correction |
|-----------|------|----------------|------------|
| `dynamic-code-execution` | ~20 | `regex.exec()` flagged as eval | `.exec()` is `RegExp.prototype.exec` — returns match arrays, safe |
| `command-execution` | ~16 | `.exec()` + `.spawn()` | Regex exec + Screeps API call — no shell |
| `secret-literal` | 3 | Placeholder tokens in example config | Template files, not real secrets |
| `weak-token-or-crypto` | 41 | `Math.random()` for game logic | Used for AI probabilities, repath chance, score jitter — not cryptographic |
| `raw-sql-query` | 6 | Template literals + `delete obj[key]` | JS object property deletion, not SQL |
| `path-traversal-file-access` | ~45 | `.join()` on arrays + Rollup `resolve()` | String formatting + build-time only |
| `hidden-control-channel` | ~110 | Variable named `origin` | Pathfinding coordinate parameters |
| `ssrf-capable-request` | 1 | `log.error(...)` | Log message, not HTTP call |

**False positive rate: 99%** — the scanner heavily overmatches common programming patterns. Manual validation was essential to isolate the 3 real findings from ~240 noise hits.

---

## 🛡️ Actionable Recommendations

### Immediate (within 24h)

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| A1 | **Remove `Assimilator_obfuscated.js`** from build and source | Code owner | 5 min |
| A2 | **Remove or compile-flag `remoteDebugger.ts` eval** | Code owner | 15 min |
| A3 | **Verify no other obfuscated files** in `src/assimilation/` | Code owner | 10 min |
| A4 | **Audit git ancestry** of both backdoor files — determine when and why they were introduced | Code owner | 30 min |

### Short-term (within 1 week)

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| B1 | **Replace `new Function()` in Overlord.ts** with enum-based condition system | Developer | 1 hr |
| B2 | **Add ESLint rule**: `no-eval` + `no-new-func` | Developer | 10 min |
| B3 | **Review all `Segmenter.getForeignSegment*` calls** — ensure no other eval-like patterns exist | Developer | 30 min |
| B4 | **Audit `src/assimilation/` directory** — understand its purpose and whether it's needed | Developer | 1 hr |

### Long-term (next sprint)

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| C1 | **Establish a security policy** for debug/remote-admin features — they must be compile-time gated, default-off, and code-reviewed | Tech lead | 2 hr |
| C2 | **Add SAST to CI** — Semgrep/CodeQL with custom rules for `eval()` and `new Function()` | Developer | 2 hr |
| C3 | **Replace heuristic scanner** with one that can distinguish `.exec()` from `eval()` — or patch the existing rules to exclude `RegExp.prototype.exec` | Developer | 1 hr |
| C4 | **Conduct a threat model** for public memory segment usage — what data flows through `Segmenter` and who can write to it | Tech lead | 3 hr |

---

## 🔗 References

- `src/debug/remoteDebugger.ts` — eval backdoor (lines 71-73)
- `src/assimilation/Assimilator_obfuscated.js` — obfuscated eval backdoor (line ~74)
- `src/overlords/Overlord.ts` — dormant `new Function()` (line 183)
- `AGENTS.md` — project conventions (no security policy defined)
- `README.md` — architecture overview

---

## Appendix: How to Disable Remote Debug / Assimilator

### Option A: Quick removal (recommended)

Delete or comment out the require/import in `main.ts`:

```bash
# Search for imports
grep -rn "remoteDebugger\|Assimilator\|assimilation" src/main.ts
```

Remove the import and all references.

### Option B: Compile-time gate

```ts
// In a config.ts or similar
const ENABLE_REMOTE_DEBUG = false;  // must be false in production
const ENABLE_ASSIMILATOR = false;   // must be false in production
```

Wrap both features in `if (ENABLE_REMOTE_DEBUG) { ... }` blocks so the bundler tree-shakes them in production.

### Option C: Replace with read-only telemetry

Instead of `eval()` for remote debugging, expose diagnostic data via `RawMemory.setActiveSegments()`:

```ts
// Debug data — readable by anyone, executable by no one
RawMemory.setActiveSegments([DEBUG_READ_SEGMENT]);
RawMemory.setSegment(DEBUG_READ_SEGMENT, {
  stats: Game.cpu.getUsed(),
  rooms: Object.keys(Game.rooms),
  memorySize: RawMemory.get().length,
  lastTick: Game.time,
});
```

This gives observability without code execution risk.
