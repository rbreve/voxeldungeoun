import * as THREE from 'three';
import { TILE_FLOOR, TILE_PILLAR } from './dungeon.js';
import { rand } from './rng.js';

// Turns a generated dungeon into voxel meshes and provides collision,
// ray casting and a flow-field for monster pathfinding.
export class Level {
  constructor(game, dungeon) {
    this.game = game;
    this.cfg = game.cfg;
    this.d = dungeon;
    this.W = dungeon.width;
    this.T = this.cfg.dungeon.tileSize;
    this.H = this.cfg.dungeon.wallHeight;
    this.blocked = new Uint8Array(this.W * this.W); // locked doors
    this.group = new THREE.Group();
    this.flow = new Int16Array(this.W * this.W);
    this.flowQueue = new Int32Array(this.W * this.W);
    this.flowOrigin = -1;
    this.buildMeshes();
    game.scene.add(this.group);
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  // ---------------------------------------------------------------- tiles
  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.W) return 0;
    return this.d.tiles[ty * this.W + tx];
  }
  isSolidTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.W) return true;
    const i = ty * this.W + tx;
    return this.d.tiles[i] !== TILE_FLOOR || this.blocked[i] === 1;
  }
  isSolidAt(x, z) {
    return this.isSolidTile(Math.floor(x / this.T), Math.floor(z / this.T));
  }
  roomIdAt(x, z) {
    const tx = Math.floor(x / this.T), ty = Math.floor(z / this.T);
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.W) return -1;
    return this.d.roomAt[ty * this.W + tx];
  }
  tileCenter(tx, ty) {
    return { x: (tx + 0.5) * this.T, z: (ty + 0.5) * this.T };
  }
  roomCenter(room) {
    return { x: (room.x + room.w / 2) * this.T, z: (room.y + room.h / 2) * this.T };
  }
  // Is point (x,z) inside the room with at least `margin` tiles of clearance to its edges?
  insideRoom(room, x, z, margin = 0) {
    const tx = x / this.T, ty = z / this.T;
    return tx >= room.x + margin && tx <= room.x + room.w - margin &&
           ty >= room.y + margin && ty <= room.y + room.h - margin;
  }

  // ---------------------------------------------------------------- collision
  circleHits(x, z, r) {
    const T = this.T;
    const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T);
    const z0 = Math.floor((z - r) / T), z1 = Math.floor((z + r) / T);
    for (let ty = z0; ty <= z1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.isSolidTile(tx, ty)) continue;
        // closest point on tile box to circle center
        const cx = Math.max(tx * T, Math.min(x, (tx + 1) * T));
        const cz = Math.max(ty * T, Math.min(z, (ty + 1) * T));
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  }

  // Moves pos (with .x/.z) by (dx,dz), sliding along walls. Returns true if blocked.
  moveCircle(pos, dx, dz, r) {
    let blocked = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (r * 0.8)));
    const sx = dx / steps, sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      if (sx !== 0) {
        if (!this.circleHits(pos.x + sx, pos.z, r)) pos.x += sx;
        else blocked = true;
      }
      if (sz !== 0) {
        if (!this.circleHits(pos.x, pos.z + sz, r)) pos.z += sz;
        else blocked = true;
      }
    }
    return blocked;
  }

  // Distance along a normalized 3D ray until it hits a wall, floor or ceiling.
  rayDistance(o, d, maxT) {
    const T = this.T;
    let limit = maxT;
    if (d.y < -1e-6) limit = Math.min(limit, o.y / -d.y);
    if (d.y > 1e-6) limit = Math.min(limit, (this.H - o.y) / d.y);
    let tx = Math.floor(o.x / T), ty = Math.floor(o.z / T);
    if (this.isSolidTile(tx, ty)) return 0;
    const stepX = d.x > 0 ? 1 : -1, stepY = d.z > 0 ? 1 : -1;
    const tDX = d.x !== 0 ? Math.abs(T / d.x) : Infinity;
    const tDY = d.z !== 0 ? Math.abs(T / d.z) : Infinity;
    let tMX = d.x !== 0 ? (d.x > 0 ? (tx + 1) * T - o.x : o.x - tx * T) / Math.abs(d.x) : Infinity;
    let tMY = d.z !== 0 ? (d.z > 0 ? (ty + 1) * T - o.z : o.z - ty * T) / Math.abs(d.z) : Infinity;
    for (;;) {
      let t;
      if (tMX < tMY) { t = tMX; tMX += tDX; tx += stepX; }
      else { t = tMY; tMY += tDY; ty += stepY; }
      if (t >= limit) return limit;
      if (this.isSolidTile(tx, ty)) return t;
    }
  }

  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    const t = this.rayDistance({ x: ax, y: ay, z: az }, { x: dx / len, y: dy / len, z: dz / len }, len);
    return t >= len - 1e-3;
  }

  // Wide line-of-sight test: can a circle of radius r walk straight from a to b?
  clearPath(ax, az, bx, bz, r) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / (this.T * 0.4));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.circleHits(ax + dx * t, az + dz * t, r)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- flow field
  // BFS distance (in tiles) from the player's tile. Monsters walk downhill.
  updateFlow(x, z, force = false) {
    const W = this.W;
    const tx = Math.floor(x / this.T), ty = Math.floor(z / this.T);
    const origin = ty * W + tx;
    if (origin === this.flowOrigin && !force) return;
    this.flowOrigin = origin;
    const flow = this.flow, q = this.flowQueue;
    flow.fill(-1);
    if (this.isSolidTile(tx, ty)) return;
    let head = 0, tail = 0;
    flow[origin] = 0;
    q[tail++] = origin;
    const MAX = 80;
    while (head < tail) {
      const i = q[head++];
      const d = flow[i];
      if (d >= MAX) continue;
      const cx = i % W, cy = (i / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (this.isSolidTile(nx, ny)) continue;
        const ni = ny * W + nx;
        if (flow[ni] !== -1) continue;
        flow[ni] = d + 1;
        q[tail++] = ni;
      }
    }
  }

  // Returns world position of the next tile to walk toward, or null.
  flowStep(x, z) {
    const W = this.W;
    const tx = Math.floor(x / this.T), ty = Math.floor(z / this.T);
    const here = this.flow[ty * W + tx];
    let best = here < 0 ? 1e9 : here, bx = -1, by = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (this.isSolidTile(nx, ny)) continue;
        // no corner cutting
        if (dx && dy && (this.isSolidTile(tx + dx, ty) || this.isSolidTile(tx, ty + dy))) continue;
        const f = this.flow[ny * W + nx];
        if (f >= 0 && f < best) { best = f; bx = nx; by = ny; }
      }
    }
    return bx < 0 ? null : this.tileCenter(bx, by);
  }

  // ---------------------------------------------------------------- doors
  setRoomLocked(room, locked) {
    room.locked = locked;
    for (const door of room.doors) {
      for (const [x, y] of door.tiles) this.blocked[y * this.W + x] = locked ? 1 : 0;
      door.mesh.visible = locked;
    }
    this.flowOrigin = -1;
  }

  // Door slabs slide in/out of the floor.
  update(dt, time) {
    for (const r of this.d.rooms) {
      for (const door of r.doors) {
        const m = door.mesh;
        const target = r.locked ? this.H / 2 : -this.H / 2;
        m.position.y += (target - m.position.y) * Math.min(1, dt * 12);
        m.visible = m.position.y > -this.H / 2 + 0.05;
      }
    }
    if (this.flameMat) {
      const f = 0.85 + Math.sin(time * 17) * 0.08 + Math.sin(time * 7.3) * 0.07;
      this.flameMat.color.setRGB(1.0 * f, 0.55 * f, 0.15 * f);
    }
  }

  // ---------------------------------------------------------------- meshes
  buildMeshes() {
    const { W, T, H } = this;
    const P = this.cfg.graphics.palette;
    const tiles = this.d.tiles;
    const rooms = this.d.rooms;
    const color = new THREE.Color();
    const m4 = new THREE.Matrix4();

    const floors = [], walls = [], pillars = [];
    const isFloor = (x, y) => x >= 0 && y >= 0 && x < W && y < W && tiles[y * W + x] === TILE_FLOOR;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const t = tiles[y * W + x];
        if (t === TILE_FLOOR) floors.push([x, y]);
        else if (t === TILE_PILLAR) pillars.push([x, y]);
        else {
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++)
            for (let dx = -1; dx <= 1 && !near; dx++) if (isFloor(x + dx, y + dy)) near = true;
          if (near) walls.push([x, y]);
        }
      }
    }

    const floorPalette = (x, y) => {
      const rid = this.d.roomAt[y * W + x];
      if (rid < 0) return P.alleyFloor;
      const type = rooms[rid].type;
      if (type === 'boss') return P.bossFloor;
      if (type === 'treasure') return P.treasureFloor;
      return P.roomFloor;
    };

    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const makeInstanced = (geo, count) => {
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
      mesh.count = count;
      this.group.add(mesh);
      return mesh;
    };
    const jitter = (hex, amt = 0.06) => {
      color.setHex(hex);
      const k = 1 + (Math.random() * 2 - 1) * amt;
      return color.setRGB(color.r * k, color.g * k, color.b * k);
    };

    // Floor + ceiling slabs (one voxel per tile).
    const slab = new THREE.BoxGeometry(T, 0.4, T);
    const floorMesh = makeInstanced(slab, floors.length);
    const ceilMesh = makeInstanced(slab, floors.length);
    floors.forEach(([x, y], i) => {
      m4.makeTranslation((x + 0.5) * T, -0.2, (y + 0.5) * T);
      floorMesh.setMatrixAt(i, m4);
      const pal = floorPalette(x, y);
      floorMesh.setColorAt(i, jitter(pal[(x * 7 + y * 13 + ((x ^ y) & 3)) % pal.length]));
      m4.makeTranslation((x + 0.5) * T, H + 0.2, (y + 0.5) * T);
      ceilMesh.setMatrixAt(i, m4);
      ceilMesh.setColorAt(i, jitter(rand.pick(P.ceiling), 0.1));
    });

    // Walls: stacked voxel blocks for a brick look.
    const layers = Math.max(1, Math.round(H / T));
    const bh = H / layers;
    const block = new THREE.BoxGeometry(T, bh, T);
    const wallMesh = makeInstanced(block, walls.length * layers);
    const themes = Object.values(P.wallThemes ?? {});
    const wallPal = themes.length ? rand.pick(themes) : P.wall;
    let wi = 0;
    for (const [x, y] of walls) {
      for (let l = 0; l < layers; l++) {
        m4.makeTranslation((x + 0.5) * T, bh * (l + 0.5), (y + 0.5) * T);
        wallMesh.setMatrixAt(wi, m4);
        wallMesh.setColorAt(wi, jitter(rand.pick(wallPal), 0.08));
        wi++;
      }
    }

    // Pillars: slightly inset columns with a cap.
    const pillarBlock = new THREE.BoxGeometry(T * 0.86, bh, T * 0.86);
    const pillarMesh = makeInstanced(pillarBlock, pillars.length * layers);
    let pi = 0;
    for (const [x, y] of pillars) {
      for (let l = 0; l < layers; l++) {
        m4.makeTranslation((x + 0.5) * T, bh * (l + 0.5), (y + 0.5) * T);
        pillarMesh.setMatrixAt(pi, m4);
        pillarMesh.setColorAt(pi, jitter(rand.pick(P.pillar), 0.08));
        pi++;
      }
    }

    // Doors (one slab per door, hidden until the room locks).
    const doorMat = new THREE.MeshLambertMaterial({ color: P.door, emissive: P.door, emissiveIntensity: 0.25 });
    const barMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    for (const r of rooms) {
      for (const door of r.doors) {
        const xs = door.tiles.map((t) => t[0]), ys = door.tiles.map((t) => t[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const w = (maxX - minX + 1) * T, d = (maxY - minY + 1) * T;
        const g = new THREE.Group();
        const slabW = door.horizontal ? T * 0.5 : w;
        const slabD = door.horizontal ? d : T * 0.5;
        g.add(new THREE.Mesh(new THREE.BoxGeometry(slabW, H, slabD), doorMat));
        // vertical iron bars for a voxel portcullis feel
        const bars = 4;
        for (let b = 0; b < bars; b++) {
          const f = (b + 0.5) / bars - 0.5;
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(door.horizontal ? slabW + 0.1 : 0.18, H, door.horizontal ? 0.18 : slabD + 0.1),
            barMat,
          );
          if (door.horizontal) bar.position.z = f * d;
          else bar.position.x = f * w;
          g.add(bar);
        }
        g.position.set((minX * T + (maxX + 1) * T) / 2, -H / 2, (minY * T + (maxY + 1) * T) / 2);
        g.visible = false;
        door.mesh = g;
        this.group.add(g);
      }
    }

    // Wall torches: emissive voxel flames along room walls.
    const torchSpots = [];
    for (const r of rooms) {
      const spacing = 5;
      const cand = [];
      for (let x = r.x + 1; x < r.x + r.w - 1; x += spacing) {
        cand.push([x, r.y - 1, 0, 1]);
        cand.push([x, r.y + r.h, 0, -1]);
      }
      for (let y = r.y + 1; y < r.y + r.h - 1; y += spacing) {
        cand.push([r.x - 1, y, 1, 0]);
        cand.push([r.x + r.w, y, -1, 0]);
      }
      for (const [x, y, nx, ny] of cand) {
        if (this.tile(x, y) !== 0) continue; // skip doorways
        torchSpots.push([(x + 0.5) * T + nx * (T / 2 + 0.12), (y + 0.5) * T + ny * (T / 2 + 0.12)]);
      }
    }
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0xff8833 });
    const stickMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.6, 0.16),
      new THREE.MeshLambertMaterial({ color: 0x4a3020 }), Math.max(1, torchSpots.length));
    const flameMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), this.flameMat, Math.max(1, torchSpots.length));
    stickMesh.count = flameMesh.count = torchSpots.length;
    torchSpots.forEach(([x, z], i) => {
      m4.makeTranslation(x, H * 0.55, z);
      stickMesh.setMatrixAt(i, m4);
      m4.makeTranslation(x, H * 0.55 + 0.42, z);
      flameMesh.setMatrixAt(i, m4);
    });
    this.group.add(stickMesh, flameMesh);
  }
}
