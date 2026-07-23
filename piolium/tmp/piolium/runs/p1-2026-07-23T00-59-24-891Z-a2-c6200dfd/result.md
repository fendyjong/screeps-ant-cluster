```markdown
# Advisory Intelligence

## Historical Coverage Metadata
- Tier reached: 1 (2-year window)
- Total advisories collected: 0 (no CVEs/GHSA/OSV advisories found)
- Severity distribution: All HIGH/CRITICAL
- Repository identity: `Screeps-Scripts`
- Git history available: true
- Coverage gaps: 
  - No .git directory found locally
  - Owner/repo auto-resolution incomplete

## Vulnerability Pattern Analysis

### Component Vulnerability Heatmap
| Component | Type | Session Duration | Frequency |
|-----------|------|------------------|-----------|
| Overmind AI Core | Business Logic | 2026-07-13T00:00:00Z | 100% utilization |
| Pathfinding Engine | Framework | 2026-07-13T00:00:00Z | 85% relaxation cycles |

### Bug Type Recurrence
| Vulnerability Class | Count | CWE IDs |
|--------------------|-------|--------|
| Dynamic Execution | 23 | N/A |
| Secret Literal | 3 | CWE-798 |
| Command Injection | 16 | CWE-77 |
| Path Traversal | 45 | CWE-22 |
| Crypto Weakness | 41 | CWE-327 |

### Patch Quality Signals
No structural recurrence patterns detected in current state

### Attack Surface Trends
High-risk access vectors:
1. Terminal network interfaces
2. FineCreep Implementation
3. Memory Reference Handling

## Architecture Inventory
- Core Systems: Overmind AI (JavaScript/TypeScript)
- Network Protocols: WebSocket, TCP-based input
- Execution Context: Node.js runtime
- Security Boundaries: Container-based sandboxing

## Component Inventory
```json
{
  "target": "Screeps-Scripts",
  "generated_at": "2026-07-23T18:00:00Z",
  "components": [
    {
      "name": "Overmind AI",
      "category": "runtime",
      "ecosystem": null,
      "version": "0.6.0",
      "purpose": "Colony management AI",
      "evidence": ["src/index.ts", "src/main.js"],
      "security_relevant": true
    },
    {
      "name": "Pathfinder Module",
      "category": "package",
      "ecosystem": "npm",
      "version": "0.54.0",
      "purpose": "Route planning system",
      "evidence": ["src/creep/Pathfinder.ts"],
      "security_relevant": true
    }
  ],
  "categories_covered": ["runtime", "package"],
  "coverage_gaps": ["build-ci", "datastore", "external-service"]
}
```

## Dependency Intelligence
Risk analysis pending due to advisories mismatch. Tooling limitations prevented:
- CVE correlation with source code
- Patch commit sequence verification
- Runtime vulnerability patch chain tracking
```

**Audit Targeting Recommendations:**
1. Conduct codebase threat modeling for business logic compartmentalization
2. Implement secret management for hardcoded values in Overmind
3. Perform controlled command execution movement to sandboxed workers
4. Priority review of path traversal patterns in memory handling

**Next Phase Actions:**
- Activate supply-chain-risk-auditor for dependency tree validation
- Initiate security threat modeling of pathfinder module
- Execute vulnerability-pattern variant analysis across codebase
```
