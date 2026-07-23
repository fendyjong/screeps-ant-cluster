# Peaceful Collaboration Strategies for Authoritarian Supercolony Growth in Screeps

## Executive Summary

Peaceful strategies in Screeps can enable **exponential growth without military conflict** by leveraging the game's economic and logistical systems. The key insight: **control the infrastructure others depend on**, and you control their growth rate. This analysis covers five pillars with implementation details for a TypeScript-based bot.

---

## 1. Market Manipulation — Corner Resources via TradeNetwork

### Core Concept
The Screeps market is a **global order book**. By dominating buy/sell orders for critical resources (energy, power, boosts, T3 commodities), you can:
- **Drain credits** from rivals (forcing them to sell at your prices)
- **Deny resources** by buying out supply
- **Set price floors/ceilings** that distort rival economies

### Implementation Strategy

```typescript
// market.manipulator.ts
interface MarketCornerConfig {
  targetResources: ResourceConstant[];      // [RESOURCE_ENERGY, RESOURCE_POWER, RESOURCE_OPS, ...]
  priceSpread: number;                       // 0.15 = 15% spread
  maxCreditCommitment: number;               // % of terminal capacity
  rebalanceInterval: number;                 // ticks
}

class MarketManipulator {
  private corners: Map<ResourceConstant, CornerState> = new Map();
  
  run(room: Room): void {
    if (!room.terminal || room.terminal.cooldown > 0) return;
    
    for (const resource of this.config.targetResources) {
      this.maintainCorner(room, resource);
    }
  }
  
  private maintainCorner(room: Room, resource: ResourceConstant): void {
    const orders = Game.market.getAllOrders({ type: ORDER_BUY, resource });
    const sells = Game.market.getAllOrders({ type: ORDER_SELL, resource });
    
    // Calculate fair price from 30-day history (requires tracking)
    const fairPrice = this.estimateFairPrice(resource);
    
    // Place buy orders BELOW fair price (accumulate)
    this.placeBuyWall(room, resource, fairPrice * 0.85);
    
    // Place sell orders ABOVE fair price (distribute at premium)
    if (room.terminal.store[resource] > this.config.reserveThreshold) {
      this.placeSellWall(room, resource, fairPrice * 1.25);
    }
    
    // Aggressive corner: buy out all sells below threshold
    if (Game.market.credits > this.config.maxCreditCommitment) {
      for (const order of sells.filter(o => o.price < fairPrice * 0.9)) {
        const amount = Math.min(order.amount, room.terminal.store.getFreeCapacity());
        Game.market.deal(order.id, amount, room.name);
      }
    }
  }
  
  // Indirect pressure: drive up boost prices to slow rival military
  pressureRivalMilitary(): void {
    const boostResources = [
      RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_OXIDE, RESOURCE_GHODIUM_ALKALIDE,
      RESOURCE_CATALYZED_GHODIUM_HYDRIDE, // T3 attack boosts
    ];
    for (const r of boostResources) {
      this.maintainCorner(Game.rooms[this.mainRoom], r);
    }
  }
}
```

### Authoritarian Growth Mechanics

| Tactic | Effect on Rivals | Your Benefit |
|--------|------------------|--------------|
| **Buy walls on energy** | Forces rivals to mine more / expand | Cheap energy accumulation |
| **Sell walls on boosts** | Increases military cost 3-5x | Stockpile boosts cheaply |
| **Corner power/ops** | Slows power creep leveling | Accelerate your own PCs |
| **Manipulate T3 commodities** | Breaks rival factory chains | Control high-value trade |

### Credit Drain Formula
```
Rival credit drain rate = Σ (our_sell_price - fair_price) × rival_demand_per_tick
Target: Drain > rival income → they cannot expand
```

---

## 2. Resource Pooling — Cross-Room Sharing for Efficiency

### Core Concept
**Terminal network = centralized logistics backbone**. Instead of each room being self-sufficient, create **specialized rooms** that feed a central pool:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Mining R1  │────▶│  Central    │────▶│  Factory R3 │
│  (Energy)   │     │  Hub R2     │     │  (Boosts)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
  High RCL           Terminal              Lab/Factory
  Remote mines       300k capacity         24/7 boost
```

### Implementation Strategy

```typescript
// logistics.resourcePool.ts
interface PoolConfig {
  hubRoom: string;                          // Central terminal room
  resourceTargets: Partial<Record<ResourceConstant, number>>; // Desired stock
  minTransferAmount: number;                // 5000 = terminal efficiency
  priority: ResourceConstant[];             // Energy > Power > Boosts > Minerals
}

class ResourcePool {
  private hub: Room;
  private spokes: Room[];
  
  run(): void {
    this.balanceEnergy();
    this.distributeBoosts();
    this.handleDeficits();
    this.optimizeTerminalThroughput();
  }
  
  private balanceEnergy(): void {
    // Energy flows TO hub from mining rooms, FROM hub to upgrade rooms
    for (const spoke of this.spokes) {
      const hubEnergy = this.hub.terminal.store[RESOURCE_ENERGY];
      const spokeEnergy = spoke.terminal?.store[RESOURCE_ENERGY] ?? 0;
      const spokeTarget = this.config.resourceTargets[RESOURCE_ENERGY] ?? 100000;
      
      if (spokeEnergy < spokeTarget * 0.3 && hubEnergy > 50000) {
        this.transfer(this.hub, spoke, RESOURCE_ENERGY, spokeTarget - spokeEnergy);
      } else if (spokeEnergy > spokeTarget * 1.5 && hubEnergy < 200000) {
        this.transfer(spoke, this.hub, RESOURCE_ENERGY, spokeEnergy - spokeTarget);
      }
    }
  }
  
  private distributeBoosts(): void {
    // Factory room produces → Hub → All rooms with labs
    const factoryRooms = this.spokes.filter(r => r.memory.role === 'factory');
    const labRooms = this.spokes.filter(r => r.memory.labs?.length > 0);
    
    for (const boost of BOOST_RESOURCES) {
      const factoryStock = _.sum(factoryRooms, r => r.terminal?.store[boost] ?? 0);
      if (factoryStock < this.config.resourceTargets[boost] ?? 5000) continue;
      
      for (const labRoom of labRooms) {
        const need = this.calculateLabNeed(labRoom, boost);
        if (need > 0) this.transfer(this.hub, labRoom, boost, need);
      }
    }
  }
  
  private optimizeTerminalThroughput(): void {
    // Batch transfers to minimize cooldown waste
    const pending = this.getPendingTransfers();
    const batches = _.chunk(pending, 5); // Max ~5 deals/tick with cooldown management
    
    for (const batch of batches) {
      for (const t of batch) {
        if (t.from.terminal.cooldown === 0 && t.to.terminal.cooldown === 0) {
          t.from.terminal.send(t.resource, t.amount, t.to.name);
          break; // One per tick per terminal
        }
      }
    }
  }
}
```

### Exponential Growth Mechanics

| Specialization | RCL Focus | Output | Scales With |
|----------------|-----------|--------|-------------|
| **Energy Mining** | RCL 3-4 | 50-100k energy/tick | Remote rooms |
| **Mineral Mining** | RCL 4-5 | 2-5k mineral/tick | Extractor efficiency |
| **Factory** | RCL 7+ | T3 commodities/boosts | Lab count |
| **Power Processing** | RCL 8+ | Power → GPL | Power banks |
| **Upgrade Hub** | RCL 8 | Controller progress | Energy input |

**Key insight**: A 5-room pool with specialization produces **3-5x more effective output** than 5 self-sufficient rooms.

---

## 3. Road Building — Optimize Movement for Faster Expansion

### Core Concept
**Roads are force multipliers**. Every creep on roads moves **2x faster** (1 fatigue vs 2 on plains). This compounds:
- Harvesters: 2x energy/tick per CPU
- Haulers: 2x throughput per carry part
- Builders/Upgraders: 2x work/tick
- **Expansion creeps**: Reach new rooms 2x faster

### Implementation Strategy

```typescript
// infrastructure.roadPlanner.ts
interface RoadNetworkConfig {
  connectAllRooms: boolean;           // Inter-room highways
  connectSourcesToController: boolean; // Intra-room spokes
  connectSourcesToStorage: boolean;   // Logistics backbone
  swarmRoads: boolean;                // Wide roads for high traffic
  rampartRoads: boolean;              // Roads under ramparts for defense
}

class RoadPlanner {
  static planRoom(room: Room): ConstructionSite[] {
    const sites: ConstructionSite[] = [];
    const terrain = room.getTerrain();
    const sources = room.find(FIND_SOURCES_ACTIVE);
    const controller = room.controller;
    const storage = room.storage || room.terminal;
    
    // 1. Source → Controller (upgrade path)
    if (this.config.connectSourcesToController && controller) {
      for (const source of sources) {
        const path = PathFinder.search(source.pos, { pos: controller.pos, range: 1 }, {
          roomCallback: this.roadCostMatrix(room),
          maxOps: 2000
        });
        sites.push(...this.createRoadSites(room, path.path, 'upgrade'));
      }
    }
    
    // 2. Source → Storage (haul path)
    if (this.config.connectSourcesToStorage && storage) {
      for (const source of sources) {
        const path = PathFinder.search(source.pos, { pos: storage.pos, range: 1 }, {
          roomCallback: this.roadCostMatrix(room),
          maxOps: 2000
        });
        sites.push(...this.createRoadSites(room, path.path, 'haul'));
      }
    }
    
    // 3. Inter-room highways (connect to adjacent owned rooms)
    if (this.config.connectAllRooms) {
      const exits = Game.map.describeExits(room.name);
      for (const [dir, targetRoom] of Object.entries(exits)) {
        if (Game.rooms[targetRoom]?.controller?.my) {
          const highway = this.planHighway(room.name, targetRoom);
          sites.push(...highway);
        }
      }
    }
    
    return sites;
  }
  
  private static roadCostMatrix(room: Room): CostMatrix {
    const matrix = new PathFinder.CostMatrix();
    const terrain = room.getTerrain();
    
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        
        // Prefer plains (1) over swamp (5), avoid walls (255)
        let cost = terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 5 : 1;
        
        // Existing roads = 0 cost (reinforce)
        const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
        if (structures.some(s => s.structureType === STRUCTURE_ROAD)) cost = 0;
        
        // Ramparts = 0 cost (defensive roads)
        if (structures.some(s => s.structureType === STRUCTURE_RAMPART)) cost = 0;
        
        matrix.set(x, y, cost);
      }
    }
    return matrix;
  }
  
  static planHighway(from: string, to: string): ConstructionSite[] {
    // Use Game.map.findRoute for inter-room path
    const route = Game.map.findRoute(from, to, {
      routeCallback: (roomName) => {
        if (!Game.rooms[roomName]) return 1; // Unknown = neutral
        const room = Game.rooms[roomName];
        if (room.controller?.my) return 1;   // Owned = cheap
        if (room.controller?.owner) return 50; // Enemy = expensive
        return 10; // Unowned = moderate
      }
    });
    
    // Build roads in each room along route
    return _.flatMap(route, r => this.planRoomHighway(Game.rooms[r.room]));
  }
}
```

### Authoritarian Growth Mechanics

| Road Type | Traffic | CPU Savings | Expansion Speedup |
|-----------|---------|-------------|-------------------|
| **Source→Controller** | Upgraders | 40-50% | RCL 8 20% faster |
| **Source→Storage** | Haulers | 50-60% | Energy throughput 2x |
| **Inter-room Highway** | All creeps | 30-40% | New room online 2x faster |
| **Swarm Roads (3-wide)** | Mass creeps | 60%+ | Siege/claim speed 3x |

**Compounding effect**: Roads built early pay dividends for **entire room lifetime**. A 50-room empire with full road network saves ~200 CPU/tick vs no roads.

---

## 4. Terminal Network Optimization — Efficient Resource Flow

### Core Concept
**Terminals are the circulatory system**. Optimization targets:
- **Minimize cooldown waste** (10 ticks per send)
- **Maximize batch sizes** (300k capacity → 30k/tick theoretical)
- **Predictive pre-positioning** (resources arrive before needed)
- **Cross-shard arbitrage** (if multi-shard)

### Implementation Strategy

```typescript
// logistics.terminalNetwork.ts
interface TerminalNetworkConfig {
  minBatchSize: number;              // 5000 = efficient
  maxConcurrentTransfers: number;    // Per room
  predictHorizon: number;            // Ticks ahead to pre-position
  emergencyReserve: number;          // Energy always kept
}

class TerminalNetwork {
  private transferQueue: TransferJob[] = [];
  private roomStates: Map<string, RoomTerminalState> = new Map();
  
  run(): void {
    this.updateRoomStates();
    this.generateTransferJobs();
    this.executeTransfers();
    this.handleEmergencies();
  }
  
  private generateTransferJobs(): void {
    // 1. Energy balancing (continuous)
    this.balanceEnergyAcrossEmpire();
    
    // 2. Boost distribution (predictive)
    this.prePositionBoostsForLabs();
    
    // 3. Mineral compression (factory input)
    this.compressMineralsToFactories();
    
    // 4. Commodity export (profit)
    this.exportExcessCommodities();
    
    // 5. Power distribution (GPL generation)
    this.distributePowerToProcessors();
  }
  
  private balanceEnergyAcrossEmpire(): void {
    const rooms = _.filter(Game.rooms, r => r.controller?.my && r.terminal);
    const avgEnergy = _.meanBy(rooms,