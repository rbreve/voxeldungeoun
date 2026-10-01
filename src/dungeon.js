// Procedural dungeon generation.
//
// Step 1: grow a graph of rooms on a coarse grid (Binding of Isaac style).
// Step 2: pick special rooms (start, boss = farthest dead end, treasure).
// Step 3: pack the grid tight so rooms sit a short alley apart.
// Step 4: rasterize rooms + zig-zag alleys into a tile map.
//
// Tile values: 0 = solid rock, 1 = floor, 2 = pillar (solid).

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

export const TILE_SOLID = 0;
export const TILE_FLOOR = 1;
export const TILE_PILLAR = 2;

export function generateDungeon(cfg, floor, rng) {
  const D = cfg.dungeon;
  const G = D.gridSize;
  const target = Math.min(D.maxRoomCount, D.baseRoomCount + (floor - 1) * D.roomsPerFloor);

  // ---------- 1. room graph ----------
  const rooms = [];
  const cellMap = new Int16Array(G * G).fill(-1);
  const occupied = (x, y) => x >= 0 && y >= 0 && x < G && y < G && cellMap[y * G + x] >= 0;
  const neighborCount = (x, y) => DIRS.reduce((n, d) => n + (occupied(x + d.dx, y + d.dy) ? 1 : 0), 0);

  const addRoom = (gx, gy) => {
    const room = {
      id: rooms.length, gx, gy,
      type: 'normal', links: [], doors: [],
      visited: false, known: false, cleared: false, locked: false,
    };
    rooms.push(room);
    cellMap[gy * G + gx] = room.id;
    return room;
  };
  const link = (a, b) => {
    a.links.push(b.id);
    b.links.push(a.id);
  };

  const mid = Math.floor(G / 2);
  addRoom(mid, mid);
  for (let attempts = 0; rooms.length < target && attempts < 8000; attempts++) {
    const base = rng.pick(rooms);
    const d = rng.pick(DIRS);
    const nx = base.gx + d.dx, ny = base.gy + d.dy;
    if (nx < 0 || ny < 0 || nx >= G || ny >= G || occupied(nx, ny)) continue;
    // Prefer branchy layouts: avoid cells touching more than one room.
    if (neighborCount(nx, ny) > 1 && rng.chance(0.85)) continue;
    link(base, addRoom(nx, ny));
  }

  // ---------- 2. special rooms ----------
  const start = rooms[0];
  start.type = 'start';
  const dist = bfsDistances(rooms, start.id);
  const deadEnds = rooms.filter((r) => r !== start && r.links.length === 1);
  const byDist = (a, b) => dist[b.id] - dist[a.id];
  const boss = (deadEnds.length ? [...deadEnds] : rooms.filter((r) => r !== start)).sort(byDist)[0];
  if (boss) boss.type = 'boss';
  const treasureCandidates = rng.shuffle(deadEnds.filter((r) => r !== boss));
  const fallback = rng.shuffle(rooms.filter((r) => r.type === 'normal'));
  for (let i = 0; i < D.treasureRooms; i++) {
    const r = treasureCandidates.shift() || fallback.find((f) => f.type === 'normal');
    if (r) r.type = 'treasure';
  }

  // Extra loops (never into boss / treasure rooms, they keep a single entrance).
  for (const r of rooms) {
    if (r.type === 'boss' || r.type === 'treasure') continue;
    for (const d of DIRS) {
      const id = occupied(r.gx + d.dx, r.gy + d.dy) ? cellMap[(r.gy + d.dy) * G + r.gx + d.dx] : -1;
      if (id < 0 || id < r.id) continue;
      const o = rooms[id];
      if (o.type === 'boss' || o.type === 'treasure' || r.links.includes(id)) continue;
      if (rng.chance(D.loopChance)) link(r, o);
    }
  }

  // ---------- 3. lay out ----------
  // Each grid column is as wide as its widest room and each row as tall as
  // its tallest room, with a short alley gap between neighbours.
  for (const r of rooms) {
    let size;
    if (r.type === 'boss') size = [D.bossRoomTiles, D.bossRoomTiles];
    else if (r.type === 'start') size = [D.startRoomTiles ?? 12, D.startRoomTiles ?? 12];
    else if (r.type === 'treasure') size = [D.treasureRoomTiles ?? 12, D.treasureRoomTiles ?? 12];
    else size = [rng.int(D.roomMinTiles, D.roomMaxTiles), rng.int(D.roomMinTiles, D.roomMaxTiles)];
    [r.w, r.h] = size;
  }
  const colW = new Array(G).fill(0), rowH = new Array(G).fill(0);
  for (const r of rooms) {
    colW[r.gx] = Math.max(colW[r.gx], r.w);
    rowH[r.gy] = Math.max(rowH[r.gy], r.h);
  }
  const [gapMin, gapMax] = D.alleyTiles ?? [4, 8];
  const cols = layoutAxis(colW, gapMin, gapMax, rng);
  const rows = layoutAxis(rowH, gapMin, gapMax, rng);
  const W = Math.max(cols.length, rows.length);

  // Slide each room toward the side it links to, so its alleys stay short.
  const place = (cellStart, cellSize, size, toLow, toHigh) => {
    const slack = cellSize - size;
    if (toHigh && !toLow) return cellStart + slack;
    if (toLow && !toHigh) return cellStart;
    if (toLow && toHigh) return cellStart + Math.floor(slack / 2);
    return cellStart + rng.int(0, slack);
  };
  for (const r of rooms) {
    const near = (dx, dy) => r.links.some((id) => rooms[id].gx === r.gx + dx && rooms[id].gy === r.gy + dy);
    r.x = place(cols.start[r.gx], colW[r.gx], r.w, near(-1, 0), near(1, 0));
    r.y = place(rows.start[r.gy], rowH[r.gy], r.h, near(0, -1), near(0, 1));
  }

  // ---------- 4. rasterize ----------
  const tiles = new Uint8Array(W * W);
  const roomAt = new Int16Array(W * W).fill(-1);
  const setTile = (x, y, v) => { tiles[y * W + x] = v; };

  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        setTile(x, y, TILE_FLOOR);
        roomAt[y * W + x] = r.id;
      }
    }
  }

  // Alleys between linked rooms.
  const done = new Set();
  for (const a of rooms) {
    for (const bid of a.links) {
      const key = Math.min(a.id, bid) + ':' + Math.max(a.id, bid);
      if (done.has(key)) continue;
      done.add(key);
      carveAlley(a, rooms[bid], D, rng, tiles, W);
    }
  }

  // Pillars inside normal rooms (never adjacent to each other so paths stay open).
  for (const r of rooms) {
    if (r.type !== 'normal' || !rng.chance(D.pillarChance)) continue;
    const want = rng.int(1, Math.max(1, Math.floor(D.maxPillars / 2)));
    const cx = r.x + (r.w - 1) / 2, cy = r.y + (r.h - 1) / 2;
    for (let i = 0, placed = 0; i < 40 && placed < want; i++) {
      const px = rng.int(r.x + 2, r.x + r.w - 3);
      const py = rng.int(r.y + 2, r.y + r.h - 3);
      // Mirror across the room's center for a designed look.
      const mx = Math.round(2 * cx - px), my = Math.round(2 * cy - py);
      const spots = [[px, py], [mx, my]];
      if (Math.abs(px - cx) < 2 && Math.abs(py - cy) < 2) continue;
      if (!spots.every(([x, y]) => canPlacePillar(x, y, r, tiles, W))) continue;
      for (const [x, y] of spots) setTile(x, y, TILE_PILLAR);
      placed++;
    }
  }

  return {
    rooms, tiles, roomAt, width: W, gridSize: G, startRoom: start, bossRoom: boss, floor,
    colEdges: cellEdges(cols, colW, W), rowEdges: cellEdges(rows, rowH, W),
  };
}

// Place the columns (or rows) of the grid along one axis. Empty ones take
// no space. Returns where each one starts and the total length in tiles.
function layoutAxis(sizes, gapMin, gapMax, rng) {
  const EDGE = 3; // solid rock around the whole map
  const start = new Array(sizes.length).fill(0);
  let at = EDGE, first = true;
  for (let i = 0; i < sizes.length; i++) {
    if (!sizes[i]) continue;
    if (!first) at += rng.int(gapMin, gapMax);
    start[i] = at;
    at += sizes[i];
    first = false;
  }
  return { start, length: at + EDGE };
}

// Grid cell edges in tiles: each cell owns half the alley on either side.
function cellEdges(axis, sizes, W) {
  const n = sizes.length;
  const lo = [], hi = [];
  let seen = false;
  for (let i = 0; i < n; i++) {
    if (sizes[i]) seen = true;
    lo[i] = sizes[i] ? axis.start[i] : seen ? W : 0;
    hi[i] = sizes[i] ? axis.start[i] + sizes[i] : lo[i];
  }
  const edges = [0];
  for (let i = 1; i < n; i++) edges.push((hi[i - 1] + lo[i]) / 2);
  edges.push(W);
  return edges;
}

// Tile coordinate -> fractional grid coordinate, for the minimap.
export function tileToGrid(edges, t) {
  for (let i = 0; i < edges.length - 1; i++) {
    if (t < edges[i + 1] || i === edges.length - 2) {
      return i + (t - edges[i]) / Math.max(1e-6, edges[i + 1] - edges[i]);
    }
  }
  return 0;
}

function canPlacePillar(x, y, r, tiles, W) {
  if (x < r.x + 2 || y < r.y + 2 || x > r.x + r.w - 3 || y > r.y + r.h - 3) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (tiles[(y + dy) * W + x + dx] === TILE_PILLAR) return false;
    }
  }
  return true;
}

function bfsDistances(rooms, startId) {
  const dist = new Array(rooms.length).fill(Infinity);
  dist[startId] = 0;
  const q = [startId];
  while (q.length) {
    const id = q.shift();
    for (const n of rooms[id].links) {
      if (dist[n] === Infinity) {
        dist[n] = dist[id] + 1;
        q.push(n);
      }
    }
  }
  return dist;
}

// Carve an alley between two grid-adjacent rooms. Works on an abstract
// (u = along the connection, v = across) axis so one routine handles both
// horizontal and vertical links. Registers a door on each room.
function carveAlley(a, b, D, rng, tiles, W) {
  const horizontal = a.gy === b.gy;
  if (horizontal ? a.gx > b.gx : a.gy > b.gy) [a, b] = [b, a];
  const cw = D.corridorWidth;
  const U = (r) => (horizontal ? r.x : r.y);
  const V = (r) => (horizontal ? r.y : r.x);
  const Ulen = (r) => (horizontal ? r.w : r.h);
  const Vlen = (r) => (horizontal ? r.h : r.w);
  const set = (u, v) => {
    const x = horizontal ? u : v, y = horizontal ? v : u;
    if (tiles[y * W + x] === 0) tiles[y * W + x] = TILE_FLOOR;
  };

  const u0 = U(a) + Ulen(a);   // first tile outside room a
  const u1 = U(b) - 1;         // last tile outside room b
  const vRange = (r) => [V(r) + 1, V(r) + Vlen(r) - 1 - cw];
  const [aMin, aMax] = vRange(a);
  const [bMin, bMax] = vRange(b);
  const oMin = Math.max(aMin, bMin), oMax = Math.min(aMax, bMax);

  let va, vb;
  const canBend = u1 - u0 + 1 >= cw + 2;
  if (oMin <= oMax && !(canBend && rng.chance(D.bendChance))) {
    va = vb = rng.int(oMin, oMax);
  } else {
    // Zig-zag, but keep the sideways step short when the rooms allow it.
    const bend = D.maxBendTiles ?? Infinity;
    const near = (v, lo, hi) => rng.int(Math.max(lo, Math.min(hi, v - bend)), Math.min(hi, Math.max(lo, v + bend)));
    va = rng.int(aMin, aMax);
    vb = near(va, bMin, bMax);
    va = near(vb, aMin, aMax);
  }

  if (va === vb) {
    for (let u = u0; u <= u1; u++) for (let k = 0; k < cw; k++) set(u, va + k);
  } else {
    const um = canBend ? rng.int(u0 + 1, u1 - cw) : u0;
    for (let u = u0; u < um + cw; u++) for (let k = 0; k < cw; k++) set(u, va + k);
    const vLo = Math.min(va, vb), vHi = Math.max(va, vb) + cw - 1;
    for (let v = vLo; v <= vHi; v++) for (let k = 0; k < cw; k++) set(um + k, v);
    for (let u = um; u <= u1; u++) for (let k = 0; k < cw; k++) set(u, vb + k);
  }

  const doorTiles = (u, v) => {
    const out = [];
    for (let k = 0; k < cw; k++) out.push(horizontal ? [u, v + k] : [v + k, u]);
    return out;
  };
  a.doors.push({ tiles: doorTiles(u0, va), horizontal, to: b.id });
  b.doors.push({ tiles: doorTiles(u1, vb), horizontal, to: a.id });
}
