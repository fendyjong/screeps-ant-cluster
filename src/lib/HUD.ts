function drawPanel(vis: RoomVisual, x: number, y: number, rows: string[][], width: number): void {
  const rowH = 0.85;
  const h = rows.length * rowH + 0.3;
  vis.rect(x - 0.2, y - 0.2, width, h, {
    fill: '#000000',
    opacity: 0.4,
    stroke: '#444444',
    strokeWidth: 0.05,
  });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowY = y + i * rowH;
    if (row[0]) {
      vis.text(row[0], x, rowY, {
        align: 'left',
        fontSize: 7,
        color: '#888888',
        font: 'monospace',
      });
    }
    if (row[1]) {
      vis.text(row[1], x + width - 0.5, rowY, {
        align: 'right',
        fontSize: 7,
        color: '#ffffff',
        font: 'monospace',
      });
    }
  }
}

function drawTopLeft(vis: RoomVisual, room: Room): void {
  const rcl = room.controller ? room.controller.level : 0;
  const sources = room.find(FIND_SOURCES);
  const harvesters = _.filter(Game.creeps, (c: Creep) =>
    c.memory.roomName === room.name && c.memory.role === 'harvester'
  );
  const sourceAssignments = sources.map((s: Source) => {
    const count = harvesters.filter((h: Creep) => h.memory.targetSourceId === s.id).length;
    const fill = s.energy / s.energyCapacity;
    return 'S' + (sources.indexOf(s) + 1) + '(' + count + ')';
  }).join(' ');

  const avgFill = sources.length > 0
    ? Math.round(sources.reduce((sum: number, s: Source) => sum + s.energy / s.energyCapacity, 0) / sources.length * 100)
    : 0;

  const myCreeps = _.filter(Game.creeps, (c: Creep) => c.memory.roomName === room.name);
  const idle = myCreeps.filter((c: Creep) => (c.memory._stuckTicks || 0) > 5).length;

  const cpuAtStart = (Memory.v1 as any).hud?.cpuTick?.[room.name] || 0;
  const cpuUsed = ((Game.cpu.getUsed() - cpuAtStart) * 100).toFixed(1);

  drawPanel(vis, 0.5, 0.5, [
    [room.name + '  RCL ' + rcl, ''],
    ['Sources: ' + sourceAssignments, avgFill + '%'],
    ['Creeps: ' + myCreeps.length + '  idle: ' + idle, idle > 0 ? Math.round(idle / myCreeps.length * 100) + '%' : ''],
    ['CPU: ' + cpuUsed + 'ms', ''],
  ], 13);
}

function drawTopRight(vis: RoomVisual, room: Room): void {
  const energy = room.energyAvailable.toLocaleString();
  const energyCap = room.energyCapacityAvailable.toLocaleString();
  const storage = room.storage ? room.storage.store[RESOURCE_ENERGY].toLocaleString() : '0';

  const hudMem = (Memory.v1 as any).hud || {};
  const income = hudMem.income?.[room.name] || 0;
  const spend = hudMem.spend?.[room.name] || 0;

  drawPanel(vis, 35, 0.5, [
    ['Energy', energy + ' / ' + energyCap],
    ['Income', '+' + income.toFixed(1) + '/t'],
    ['Spend', '-' + spend.toFixed(1) + '/t'],
    ['Stockpile', storage],
  ], 14);
}

function drawBottomLeft(vis: RoomVisual, room: Room): void {
  const towers = room.find(FIND_MY_STRUCTURES, {
    filter: (s: Structure) => s.structureType === STRUCTURE_TOWER
  });
  const towersOnline = towers.filter((t: StructureTower) => t.store[RESOURCE_ENERGY] > 0).length;
  const towerBar = towers.map((_t: StructureTower, i: number) => i < towersOnline ? '■' : '□').join('');

  const walls = room.find(FIND_STRUCTURES, {
    filter: (s: Structure) => s.structureType === STRUCTURE_WALL
  });
  const wallHealth = walls.length > 0
    ? Math.round(walls.reduce((sum: number, w: Structure) => sum + w.hits / w.hitsMax, 0) / walls.length * 100)
    : 0;

  const ramparts = room.find(FIND_STRUCTURES, {
    filter: (s: Structure) => s.structureType === STRUCTURE_RAMPART
  });
  const rampartHealth = ramparts.length > 0
    ? Math.round(ramparts.reduce((sum: number, r: Structure) => sum + r.hits / r.hitsMax, 0) / ramparts.length * 100)
    : 0;

  const hostiles = room.find(FIND_HOSTILE_CREEPS).length;
  const lastThreat = (Memory.v1 as any).hud?.lastThreat?.[room.name] || 0;
  const threatAgo = lastThreat > 0 ? (Game.time - lastThreat).toLocaleString() + ' ticks ago' : 'never';

  drawPanel(vis, 0.5, 35, [
    ['Towers: ' + towerBar, towersOnline + '/' + towers.length + ' online'],
    ['Walls: ' + wallHealth + '%', 'Ramparts: ' + rampartHealth + '%'],
    ['Hostiles: ' + hostiles, hostiles > 0 ? 'IN ROOM' : 'clear'],
    ['Last threat', threatAgo],
  ], 13);
}

function drawBottomRight(vis: RoomVisual, room: Room): void {
  const swap = room.memory.layout?.swap;
  const swapState = swap?.state || 'none';
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
  const pendingRoads = ((Memory.v1 as any).pathing?.pendingRoads || [])
    .filter((r: any) => r.roomName === room.name).length;
  const nextReplan = 100 - (Game.time % 100);

  drawPanel(vis, 35, 35, [
    ['Swap', swapState],
    ['Sites', sites + ' pending'],
    ['Roads pending', pendingRoads.toString()],
    ['Next replan', nextReplan + ' ticks'],
  ], 14);
}

export function run(room: Room): void {
  if (Game.time % 25 !== 0) return;
  const vis = new RoomVisual(room.name);

  if (!(Memory.v1 as any).hud) (Memory.v1 as any).hud = {};
  if (!(Memory.v1 as any).hud.cpuTick) (Memory.v1 as any).hud.cpuTick = {};
  (Memory.v1 as any).hud.cpuTick[room.name] = Game.cpu.getUsed();

  drawTopLeft(vis, room);
  drawTopRight(vis, room);
  drawBottomLeft(vis, room);
  drawBottomRight(vis, room);

  if (room.find(FIND_HOSTILE_CREEPS).length > 0) {
    if (!(Memory.v1 as any).hud.lastThreat) (Memory.v1 as any).hud.lastThreat = {};
    (Memory.v1 as any).hud.lastThreat[room.name] = Game.time;
  }
}