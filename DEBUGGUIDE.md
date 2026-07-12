# Screeps Debugging Tools Guide

## New Performance Debugging Tools

I've added comprehensive debugging tools to help diagnose and fix your performance issues:

### 1. Enhanced Debug Report (`Memory.debugReport.markdown`)
- **Generated every 25 ticks** (automatically)
- **New Sections**:
  - **Full Memory Snapshot**: Dumps key memory structures when CPU bucket ≥ 5000
  - **Real-Time Performance Insights**: CPU utilization, creep activity, critical alerts
  - **Rampart Strategy Analysis**: Evaluates rampart placement around critical structures
  - **Energy Efficiency Metrics**: Tracks source/d energy utilization
  - **Creep Idle Detection**: Identifies and flags idle/stuck creeps

### 2. Performance Analysis Module (`debug.performance.js`)
- **Automatic Alerts**: Critical issues logged to console every 100 ticks
- **Key Analytics**:
  - Creep idle/stuck detection (role breakdown)
  - CPU utilization optimization recommendations
  - Rampart placement strategy evaluation
  - Memory health monitoring

### 3. Critical Issue Detection
- **Console Alerts**: Automatically logs warnings for:
  - High idle creep ratios (>60%)
  - Low CPU utilization (<30%) - wasted potential!
  - Memory usage near limits (>90%)
  - Poor rampart placement (no protection for controller/spawns)

## How to Access Debug Data

### Real-Time Console Output
Check your Screeps client console for automatic alerts:
- `[PERF HIGH]` - Important issues needing attention
- `[PERF CRITICAL]` - Urgent problems requiring immediate fix

### Full Debug Report
Access the comprehensive report via:
```javascript
console.log(Memory.debugReport.markdown);
```

### Performance Snapshot
Get instant performance insights:
```javascript
const debugPerf = require('debug.performance');
const snapshot = debugPerf.generatePerformanceSnapshot();
console.log(JSON.stringify(snapshot, null, 2));
```

## Current Issues Identified

Based on your debug report, the main issues are:

### 1. **High Idle Creep Ratio** (93%)
- **Problem**: Most creeps are not productively working
- **Fix**: Review spawn logic and role distribution
- **Tool**: Check `Memory.debug.creepAnalysis.idleByRole` for role-specific breakdown

### 2. **Low CPU Utilization** (9% used / 20 CPU available)
- **Problem**: Wasting 55% of available CPU capacity
- **Fix**: Enable more burst workers (links, labs, market)
- **Tool**: Use `debug.performance.auditCpuUtilization()` for recommendations

### 3. **Potential Rampart Issues**
- **Problem**: May lack protection for critical structures
- **Fix**: Run `debug.performance.evaluateRampartStrategy(room)` for room-specific analysis

## Recommended Actions

1. **Immediate**: Check console for critical alerts
2. **Short-term**: Review creep role distribution and spawn timing
3. **Long-term**: Implement performance optimizations based on debug insights

The tools will continue monitoring and providing detailed feedback automatically.