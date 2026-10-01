import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createRng, rand } from './rng.js';
import { generateDungeon, TILE_FLOOR } from './dungeon.js';
import { Level } from './level.js';
import { Player } from './player.js';
import { Monster } from './monsters.js';
import { Pickup, Portal, Chest } from './pickups.js';
import { Particles, Tracers, Projectiles } from './effects.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';

class Game {
  constructor() {
    this.cfg = CONFIG;
    const gfx = this.cfg.graphics;

    // Renderer / scenes
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio * (gfx.pixelRatio ?? 1)));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.autoClear = false;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(gfx.fogColor);
    this.scene.fog = new THREE.Fog(gfx.fogColor, gfx.fogNear, gfx.fogFar);
    this.camera = new THREE.PerspectiveCamera(gfx.fov, innerWidth / innerHeight, 0.05, 200);

    this.scene.add(new THREE.HemisphereLight(0xb8b0d0, 0x40302a, gfx.ambientLight));
    this.torch = new THREE.PointLight(0xffb070, gfx.torchIntensity, gfx.torchDistance, 1.3);
    this.scene.add(this.torch);
    this.flashLight = new THREE.PointLight(0xffcc66, 0, 18, 1.5);
    this.scene.add(this.flashLight);

    // Viewmodel is drawn in its own pass so it never clips into walls.
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.6));
    const vmSun = new THREE.DirectionalLight(0xffe0c0, 1.2);
    vmSun.position.set(1, 2, 1);
    this.vmScene.add(vmSun);

    this.input = new Input(this.renderer.domElement);
    this.sfx = new Sfx(this.cfg.audio.volume);
    this.hud = new Hud(this);
    this.particles = new Particles(this.scene);
    this.tracers = new Tracers(this.scene);
    this.projectiles = new Projectiles(this);

    this.monsters = [];
    this.pickups = [];
    this.chests = [];
    this.lootQueue = [];
    this.portal = null;
    this.state = 'title';
    this.shakeAmount = 0;
    this.monsterSpeedScale = 1;
    this.time = 0;
    this.sfxTimes = {};

    this.modeKey = this.loadMode();
    this.overlay = document.getElementById('overlay');
    this.overlay.addEventListener('click', (e) => this.onOverlayClick(e));
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    addEventListener('resize', () => this.onResize());

    this.validateConfig();
    this.newGame();
    this.showOverlay('title');
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // Catch typos in config.js early with readable warnings.
  validateConfig() {
    const c = this.cfg;
    for (const [k, m] of Object.entries(c.monsters)) {
      if (m.splitInto && !c.monsters[m.splitInto]) console.warn(`monster ${k}: splitInto "${m.splitInto}" not found`);
      if (m.summon && !c.monsters[m.summon.monster]) console.warn(`monster ${k}: summon "${m.summon.monster}" not found`);
      if (m.attack === 'ranged' && !m.projectile) console.warn(`monster ${k}: ranged attack needs a projectile`);
    }
    for (const [k, w] of Object.entries(c.weapons)) {
      if (w.ammoType && !c.ammo[w.ammoType]) console.warn(`weapon ${k}: ammoType "${w.ammoType}" not in ammo`);
    }
    for (const [k, p] of Object.entries(c.pickups)) {
      if (p.type === 'ammo' && !c.ammo[p.ammoType]) console.warn(`pickup ${k}: ammoType "${p.ammoType}" not in ammo`);
    }
  }

  get mode() {
    return this.cfg.modes?.[this.modeKey] ?? {};
  }

  loadMode() {
    let saved = null;
    try { saved = localStorage.getItem('voxelDungeon.mode'); } catch (_) { /* storage blocked */ }
    const modes = this.cfg.modes ?? {};
    return modes[saved] ? saved : modes[this.cfg.defaultMode] ? this.cfg.defaultMode : Object.keys(modes)[0];
  }

  setMode(key) {
    this.modeKey = key;
    try { localStorage.setItem('voxelDungeon.mode', key); } catch (_) { /* storage blocked */ }
  }

  // ---------------------------------------------------------------- flow
  newGame() {
    this.floor = 1;
    this.score = 0;
    this.kills = 0;
    if (this.player) this.player.dispose();
    this.player = new Player(this);
    this.buildFloor();
  }

  buildFloor() {
    for (const m of this.monsters) if (m.alive) m.dispose();
    for (const p of this.pickups) if (p.alive) p.dispose();
    for (const c of this.chests) c.dispose();
    this.monsters = [];
    this.pickups = [];
    this.chests = [];
    this.lootQueue = [];
    if (this.portal) this.portal.dispose();
    this.portal = null;
    this.projectiles.clear();
    this.particles.clear();
    this.tracers.clear();
    if (this.level) this.level.dispose();

    const seed = this.cfg.seed != null ? this.cfg.seed + this.floor * 7919 : (Math.random() * 2 ** 31) | 0;
    this.dungeon = generateDungeon(this.cfg, this.floor, createRng(seed));
    this.level = new Level(this, this.dungeon);
    this.currentRoom = null;

    const R = this.cfg.rooms;
    for (const r of this.dungeon.rooms) {
      if (r.type === 'start' || r.type === 'treasure') r.cleared = true;
      if (r.type === 'treasure') this.stockTreasureRoom(r);
      // Some rooms have health packs lying around.
      if (r.type === 'normal' && rand.chance(R.healthPackChance ?? 0)) {
        const [a, b] = R.healthPacksPerRoom ?? [1, 2];
        for (const spot of this.randomRoomSpots(r, rand.int(a, b))) {
          const key = this.randomPickupKey((d) => d.type === 'health');
          if (key) this.pickups.push(new Pickup(this, key, spot.x, spot.z));
        }
      }
    }

    const start = this.dungeon.startRoom;
    const c = this.level.roomCenter(start);
    this.player.pos.set(c.x, 0, c.z);
    this.player.vel.set(0, 0, 0);
    // Face the first doorway.
    const door = start.doors[0];
    if (door) {
      const [tx, ty] = door.tiles[0];
      const dc = this.level.tileCenter(tx, ty);
      this.player.yaw = Math.atan2(-(dc.x - c.x), -(dc.z - c.z));
    }
    this.player.pitch = 0;
    this.spawnAlleyMonsters();
    this.visitRoom(start);
    this.hud.message(`FLOOR ${this.floor}`, '#ffcc66', true);
  }

  nextFloor() {
    this.floor++;
    this.score += 100;
    this.sfx.play('portal');
    this.hud.flash(0xaa55ff);
    this.buildFloor();
  }

  stockTreasureRoom(room) {
    const c = this.level.roomCenter(room);
    const hasPower = this.cfg.rooms.treasurePowerUp;
    const offset = hasPower ? 1.6 : 0;
    const weapon = this.randomWeaponKey(true);
    const rarity = this.rollRarity(this.floorLuck() + 0.5);
    if (weapon) this.pickups.push(new Pickup(this, 'weapon:' + weapon, c.x - offset, c.z, { pedestal: true, rarity }));
    else this.pickups.push(new Pickup(this, 'armor', c.x - offset, c.z, { pedestal: true }));
    if (hasPower) {
      const key = this.randomPickupKey((d) => d.type === 'power');
      if (key) this.pickups.push(new Pickup(this, key, c.x + offset, c.z, { pedestal: true }));
    }
    const L = this.cfg.loot;
    if (L.treasureRoomChest) this.chests.push(new Chest(this, c.x, c.z - 3.5, L.chest, L.chest.luck ?? 0));
  }

  // ---------------------------------------------------------------- overlays
  showOverlay(kind) {
    const o = this.overlay;
    o.style.display = 'flex';
    o.dataset.kind = kind;
    const limited = this.mode.maxWeapons > 0;
    const weaponKeys = limited
      ? `<div><b>1-${this.mode.maxWeapons} / Wheel / Q</b> switch weapon</div><div><b>${(this.mode.swapKey ?? 'KeyE').replace(/^Key/, '')}</b> swap weapon</div>`
      : `<div><b>1-6 / Wheel</b> weapons (tap again to cycle)</div><div><b>Q</b> last weapon</div>`;
    const controls = `<div class="controls">
      <div><b>WASD</b> move</div><div><b>Mouse</b> look</div><div><b>Click</b> shoot</div>
      ${weaponKeys}<div><b>Shift</b> sprint</div>
      <div><b>Space</b> jump</div><div><b>Esc</b> pause</div></div>`;
    if (kind === 'title') {
      const modes = Object.entries(this.cfg.modes ?? {})
        .map(([k, m]) => `<div class="modebtn ${k === this.modeKey ? 'default' : ''}" data-mode="${k}">
          <h2>${m.name ?? k}</h2><p>${m.description ?? ''}</p></div>`)
        .join('');
      o.innerHTML = `<h1>VOXEL<br>DUNGEON</h1><p class="sub">Clear every room. Find the boss. Go deeper.</p>
        <div class="modes">${modes}</div>${controls}<p class="blink">PICK A MODE TO START</p>`;
    } else if (kind === 'paused') {
      o.innerHTML = `<h1>PAUSED</h1><p class="sub">${this.mode.name ?? ''}</p>${controls}<p class="blink">CLICK TO RESUME</p>`;
    } else if (kind === 'dead') {
      o.innerHTML = `<h1 class="red">YOU DIED</h1>
        <p class="sub">${this.mode.name ?? ''} &nbsp;·&nbsp; Floor ${this.floor} &nbsp;·&nbsp; ${this.kills} kills &nbsp;·&nbsp; ${this.score} points</p>
        <div class="btnrow"><div class="btn" data-action="retry">TRY AGAIN</div><div class="btn" data-action="menu">CHANGE MODE</div></div>`;
    }
  }

  onOverlayClick(e) {
    this.sfx.unlock();
    const kind = this.overlay.dataset.kind;
    if (kind === 'title') {
      const btn = e.target.closest('[data-mode]');
      if (!btn) return;
      this.setMode(btn.dataset.mode);
      this.newGame();
      this.state = 'ready';
    } else if (kind === 'dead' || this.state === 'dead') {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'menu') {
        this.showOverlay('title');
        return;
      }
      this.newGame();
      this.state = 'ready';
    }
    this.input.lock();
  }

  onLockChange() {
    if (this.input.locked) {
      this.overlay.style.display = 'none';
      if (this.state !== 'dead') this.state = 'playing';
      this.last = performance.now();
    } else if (this.state === 'playing') {
      this.state = 'paused';
      this.showOverlay('paused');
    }
  }

  gameOver() {
    this.state = 'dead';
    this.sfx.play('monsterDie');
    setTimeout(() => {
      document.exitPointerLock();
      this.showOverlay('dead');
    }, 1200);
  }

  onResize() {
    this.renderer.setSize(innerWidth, innerHeight);
    for (const cam of [this.camera, this.vmCamera]) {
      cam.aspect = innerWidth / innerHeight;
      cam.updateProjectionMatrix();
    }
  }

  // ---------------------------------------------------------------- main loop
  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 'playing' || (this.state === 'dead' && dt > 0)) this.update(dt);
    else this.player.updateCamera(0);
    this.input.endFrame();
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.player.alive) {
      this.renderer.clearDepth();
      this.renderer.render(this.vmScene, this.vmCamera);
    }
  }

  update(dt) {
    this.time += dt;
    const p = this.player;
    if (p.alive) p.update(dt);
    else {
      // death cam: sink to the floor
      p.pos.y = Math.max(-1.2, p.pos.y - dt * 2);
      p.updateCamera(dt);
    }

    this.level.updateFlow(p.pos.x, p.pos.z);
    for (const m of this.monsters) m.update(dt, this.time);
    this.monsters = this.monsters.filter((m) => m.alive);
    this.projectiles.update(dt);
    this.updateLootQueue(dt);
    for (const pk of this.pickups) pk.update(dt);
    this.pickups = this.pickups.filter((pk) => pk.alive);
    for (const ch of this.chests) ch.update(dt);
    this.particles.update(dt);
    this.tracers.update(dt);
    this.level.update(dt, this.time);
    if (p.alive) this.updateRooms();
    if (this.portal && p.alive && this.portal.update(dt)) {
      this.nextFloor();
      return;
    }

    // Lights / shake
    this.torch.position.set(p.pos.x, p.pos.y + 2.2, p.pos.z);
    this.torch.intensity = this.cfg.graphics.torchIntensity * (0.92 + Math.sin(this.time * 13) * 0.04 + Math.sin(this.time * 5.3) * 0.04);
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 900);
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.5);
    this.hud.update(dt);
  }

  // ---------------------------------------------------------------- rooms
  visitRoom(room) {
    room.visited = true;
    room.known = true;
    for (const id of room.links) this.dungeon.rooms[id].known = true;
  }

  updateRooms() {
    const p = this.player;
    const rid = this.level.roomIdAt(p.pos.x, p.pos.z);
    const room = rid >= 0 ? this.dungeon.rooms[rid] : null;
    if (room && room !== this.currentRoom) {
      this.currentRoom = room;
      this.visitRoom(room);
    }
    if (!room && this.currentRoom && !this.currentRoom.locked) this.currentRoom = null;

    // Trigger an encounter once the player is fully inside.
    const r = this.currentRoom;
    if (r && !r.cleared && !r.locked && this.level.insideRoom(r, p.pos.x, p.pos.z, 1)) {
      this.startEncounter(r);
    }

    // Room cleared?
    if (r && r.locked && !this.monsters.some((m) => m.alive && m.room === r)) {
      this.level.setRoomLocked(r, false);
      r.cleared = true;
      this.sfx.play('door');
      this.sfx.play('clear');
      const c = this.level.roomCenter(r);
      const L = this.cfg.loot;
      if (r.type === 'boss') {
        this.hud.message('BOSS DEFEATED — ENTER THE PORTAL', '#cc88ff', true);
        this.portal = new Portal(this, c.x, c.z);
      } else {
        this.hud.message('ROOM CLEARED', '#88ff88');
        this.lootBurst(c.x, c.z, this.buildLoot(L.roomClear), 0.5);
        if (rand.chance(L.chestChance)) {
          const spot = this.spawnTiles(r).find((t) => Math.hypot(t.x - c.x, t.z - c.z) > 3) ?? { x: c.x + 3, z: c.z };
          this.chests.push(new Chest(this, spot.x, spot.z, L.chest, L.chest.luck ?? 0));
          this.hud.message('A treasure chest appeared!', '#ffcc33');
        }
      }
    }
  }

  startEncounter(room) {
    const R = this.cfg.rooms;
    const f = this.floor - 1;
    const spawns = [];
    if (room.type === 'boss') {
      const bosses = Object.entries(this.cfg.monsters).filter(([, m]) => m.boss && (m.minFloor ?? 1) <= this.floor);
      const [bossKey, bossDef] = rand.pick(bosses.length ? bosses : Object.entries(this.cfg.monsters).filter(([, m]) => m.boss));
      spawns.push({ key: bossKey, center: true });
      for (let i = 0; i < R.bossMinions + Math.floor(f / 2); i++) spawns.push({ key: this.randomMonsterKey() });
      this.hud.message(bossDef.name.toUpperCase(), '#ff4444', true);
      this.sfx.play('boss');
    } else {
      const min = R.minMonsters + f * R.monstersPerFloor;
      const max = Math.min(R.maxMonstersCap, R.maxMonsters + f * R.monstersPerFloor);
      const n = rand.int(Math.min(min, max), max);
      for (let i = 0; i < n; i++) spawns.push({ key: this.randomMonsterKey() });
    }
    const valid = spawns.filter((s) => s.key);
    if (!valid.length) {
      room.cleared = true;
      return;
    }

    this.level.setRoomLocked(room, true);
    this.sfx.play('door');
    this.shake(0.3);

    const tiles = this.spawnTiles(room);
    for (const s of valid) {
      let pos;
      if (s.center) pos = this.level.roomCenter(room);
      else pos = tiles.shift() || this.level.roomCenter(room);
      this.spawnMonster(s.key, room, pos.x, pos.z);
    }
    this.sfx.play('spawn');
  }

  // Dormant monsters scattered through the alleys, away from doors and the start.
  spawnAlleyMonsters() {
    const R = this.cfg.rooms;
    const [a, b] = R.alleyMonsters ?? [0, 0];
    const extra = (R.alleyMonstersPerFloor ?? 0) * (this.floor - 1);
    let n = rand.int(a + extra, b + extra);
    if (n <= 0) return;
    const lv = this.level;
    const W = lv.W;
    const doorTiles = this.dungeon.rooms.flatMap((r) => r.doors.flatMap((d) => d.tiles));
    const nearDoor = (x, y) => doorTiles.some(([dx, dy]) => Math.abs(dx - x) <= 2 && Math.abs(dy - y) <= 2);
    const start = lv.roomCenter(this.dungeon.startRoom);
    const spots = [];
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        if (this.dungeon.roomAt[y * W + x] >= 0 || lv.tile(x, y) !== TILE_FLOOR || nearDoor(x, y)) continue;
        const c = lv.tileCenter(x, y);
        if (Math.hypot(c.x - start.x, c.z - start.z) > 20) spots.push(c);
      }
    }
    // Spread them out so they don't all bunch up in one alley.
    const placed = [];
    for (const s of rand.shuffle(spots)) {
      if (n <= 0) break;
      if (placed.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 12)) continue;
      const key = this.randomMonsterKey();
      if (!key) break;
      const m = new Monster(this, key, null, s.x, s.z, true);
      m.dormant = true;
      this.monsters.push(m);
      placed.push(s);
      n--;
    }
  }

  // n random open floor spots inside a room, away from walls.
  randomRoomSpots(room, n) {
    const lv = this.level;
    const spots = [];
    for (let y = room.y + 2; y < room.y + room.h - 2; y++) {
      for (let x = room.x + 2; x < room.x + room.w - 2; x++) {
        if (lv.tile(x, y) === TILE_FLOOR) spots.push(lv.tileCenter(x, y));
      }
    }
    return rand.shuffle(spots).slice(0, n);
  }

  spawnTiles(room) {
    const p = this.player;
    const lv = this.level;
    const minD = this.cfg.rooms.minSpawnDistance;
    const all = [];
    for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
      for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
        if (lv.tile(x, y) !== TILE_FLOOR) continue;
        const c = lv.tileCenter(x, y);
        const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
        all.push({ ...c, d });
      }
    }
    rand.shuffle(all);
    const far = all.filter((t) => t.d >= minD);
    const near = all.filter((t) => t.d < minD).sort((a, b) => b.d - a.d);
    return far.concat(near).map((t) => ({ x: t.x + rand.range(-0.4, 0.4), z: t.z + rand.range(-0.4, 0.4) }));
  }

  spawnMonster(key, room, x, z, instant = false) {
    const m = new Monster(this, key, room, x, z, instant);
    this.monsters.push(m);
    const col = m.def.colors?.body ?? 0xaa55ff;
    this.particles.burst(x, 0.3, z, { count: 14, colors: [0x7733cc, 0xaa66ff, col], speed: 2.5, up: 4, gravity: 4, size: 0.2, life: 0.9 });
    return m;
  }

  randomMonsterKey() {
    const entries = Object.entries(this.cfg.monsters)
      .filter(([, m]) => !m.boss && (m.spawnWeight ?? 0) > 0 && (m.minFloor ?? 1) <= this.floor)
      .map(([k, m]) => [k, m.spawnWeight]);
    return rand.weighted(entries);
  }

  // Weighted random pickup; favours health when the player is hurt.
  randomPickupKey(filter = () => true) {
    const p = this.player;
    const hurt = 1 - p.hp / this.cfg.player.maxHealth;
    const noAmmo = this.mode.unlimitedAmmo;
    const entries = Object.entries(this.cfg.pickups)
      .filter(([, d]) => (d.dropWeight ?? 0) > 0 && filter(d) && !(noAmmo && d.type === 'ammo'))
      .map(([k, d]) => [k, d.dropWeight * (d.type === 'health' ? 1 + hurt * 2 : 1)]);
    return rand.weighted(entries);
  }

  // Weighted weapon drop, twice as likely to be something you don't own yet.
  randomWeaponKey(preferNew = false) {
    const owned = new Set(this.player.owned);
    let entries = Object.entries(this.cfg.weapons)
      .filter(([, w]) => (w.dropWeight ?? 0) > 0)
      .map(([k, w]) => [k, w.dropWeight * (owned.has(k) ? 1 : 2)]);
    if (preferNew) {
      const fresh = entries.filter(([k]) => !owned.has(k));
      if (fresh.length) entries = fresh;
    }
    return rand.weighted(entries);
  }

  floorLuck() {
    return (this.floor - 1) * (this.cfg.rarityLuckPerFloor ?? 0);
  }

  rollRarity(luck = 0) {
    const tiers = Object.entries(this.cfg.rarities ?? {});
    if (!tiers.length) return 'common';
    return rand.weighted(tiers.map(([k, r], i) => [k, r.weight * Math.pow(1 + luck, i)]));
  }

  // Turn a loot table (see config.loot) into a list of { key, rarity? }.
  buildLoot(table, luck = 0) {
    if (!table) return [];
    const L = this.cfg.loot;
    const mul = (L.amount ?? 1) * (1 + (L.countPerFloor ?? 0) * (this.floor - 1));
    const count = (range) => {
      if (!range) return 0;
      const v = rand.int(range[0], range[1]) * mul;
      return Math.floor(v) + (rand.chance(v % 1) ? 1 : 0);
    };
    const items = [];
    const add = (key) => key && items.push({ key });
    const weapon = () => {
      const w = this.randomWeaponKey();
      if (w) items.push({ key: 'weapon:' + w, rarity: this.rollRarity(luck + this.floorLuck()) });
    };
    for (let i = count(table.drops); i--; ) add(this.randomPickupKey());
    for (let i = count(table.healthPacks); i--; ) add(this.randomPickupKey((d) => d.type === 'health'));
    for (let i = count(table.armor); i--; ) add(this.randomPickupKey((d) => d.type === 'armor'));
    for (let i = count(table.powerUps); i--; ) add(this.randomPickupKey((d) => d.type === 'power'));
    const nWeapons = table.weapons ? rand.int(table.weapons[0], table.weapons[1]) : 0;
    for (let i = 0; i < nWeapons; i++) weapon();
    if (table.weaponChance && rand.chance(table.weaponChance)) weapon();
    return rand.shuffle(items);
  }

  // Diablo-style fountain: items pop out one after another and bounce around.
  lootBurst(x, z, items, duration = this.cfg.loot.burstDuration ?? 1) {
    items.forEach((item, i) => {
      this.lootQueue.push({ t: items.length > 1 ? (i / items.length) * duration : 0, x, z, ...item });
    });
  }

  updateLootQueue(dt) {
    if (!this.lootQueue.length) return;
    const ready = [];
    this.lootQueue = this.lootQueue.filter((q) => {
      q.t -= dt;
      if (q.t <= 0) ready.push(q);
      return q.t > 0;
    });
    for (const q of ready) {
      const a = rand.range(0, Math.PI * 2);
      const sp = rand.range(2, 6.5);
      const vel = { x: Math.cos(a) * sp, y: rand.range(7, 11), z: Math.sin(a) * sp };
      let { x, z } = q;
      if (this.level.circleHits(x, z, 0.35)) {
        const c = this.currentRoom ? this.level.roomCenter(this.currentRoom) : { x, z };
        x = c.x;
        z = c.z;
      }
      this.pickups.push(new Pickup(this, q.key, x, z, { vel, rarity: q.rarity }));
      this.sfxThrottled('loot', 0.05);
    }
  }

  dropPickup(key, x, z) {
    if (!key) return;
    // Nudge out of walls if needed.
    if (this.level.circleHits(x, z, 0.5)) {
      const c = this.currentRoom ? this.level.roomCenter(this.currentRoom) : { x, z };
      x = c.x;
      z = c.z;
    }
    this.pickups.push(new Pickup(this, key, x, z));
  }

  onMonsterKilled(m) {
    const def = m.def;
    this.kills++;
    this.score += def.score ?? 10;
    const L = this.cfg.loot;
    const items = [];
    const dropChance = ((def.dropChance ?? 0) * (L.monsterDropScale ?? 1) + (L.monsterDropBonusPerFloor ?? 0) * (this.floor - 1)) * (L.amount ?? 1);
    if (rand.chance(dropChance)) items.push({ key: this.randomPickupKey() });
    if (rand.chance(L.monsterWeaponChance ?? 0)) {
      const w = this.randomWeaponKey();
      if (w) items.push({ key: 'weapon:' + w, rarity: this.rollRarity(this.floorLuck()) });
    }
    if (def.boss) {
      const table = def.loot ?? L.boss;
      items.push(...this.buildLoot(table, table.luck ?? 0));
      this.hud.message('LOOT!', '#ffcc33', true);
    }
    const valid = items.filter((i) => i.key);
    if (valid.length) this.lootBurst(m.pos.x, m.pos.z, valid, def.boss ? L.burstDuration : 0.15);
    if (def.splitInto) {
      const n = def.splitCount ?? 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = m.pos.x + Math.cos(a) * 0.6, z = m.pos.z + Math.sin(a) * 0.6;
        const px = this.level.circleHits(x, z, 0.3) ? m.pos.x : x;
        const pz = this.level.circleHits(x, z, 0.3) ? m.pos.z : z;
        const child = this.spawnMonster(def.splitInto, m.room, px, pz, true);
        child.kx = Math.cos(a) * 6;
        child.kz = Math.sin(a) * 6;
      }
    }
    if (def.boss) this.shake(0.8);
  }

  // ---------------------------------------------------------------- fx helpers
  explosion(pos, radius, damage, opts = {}) {
    this.particles.burst(pos.x, pos.y, pos.z, {
      count: 40, colors: [0xffee66, 0xff9922, opts.color ?? 0xff5500, 0x555555], speed: radius * 2.2, size: 0.25, life: 0.9,
    });
    this.sfx.play('explosion');
    this.shake(0.5);
    this.muzzleLight(pos, 0xff8833, 2.5);

    if (opts.hurtsMonsters) {
      for (const m of this.monsters) {
        if (!m.alive || m === opts.skip) continue;
        const c = m.center;
        const d = Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z) - m.radius;
        if (d > radius) continue;
        const k = 1 - Math.max(0, d) / radius * 0.7;
        const dir = new THREE.Vector3(c.x - pos.x, 0, c.z - pos.z);
        m.takeDamage(damage * k * (opts.monsterScale ?? 1), dir, 4);
      }
    }
    const p = this.player;
    if (opts.hurtsPlayer && p.alive) {
      const d = Math.hypot(p.pos.x - pos.x, p.pos.y + 0.9 - pos.y, p.pos.z - pos.z) - p.radius;
      if (d < radius) {
        const k = 1 - Math.max(0, d) / radius * 0.7;
        p.hurt(damage * k * (opts.selfScale ?? 1), pos);
        const len = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) || 1;
        p.vel.x += ((p.pos.x - pos.x) / len) * 8 * k;
        p.vel.z += ((p.pos.z - pos.z) / len) * 8 * k;
        p.vel.y += 4 * k;
        p.onGround = false;
      }
    }
  }

  muzzleLight(pos, color, strength = 1) {
    this.flashLight.position.copy(pos);
    this.flashLight.color.setHex(color);
    this.flashLight.intensity = 60 * strength;
  }

  shake(amount) {
    this.shakeAmount = Math.min(1, this.shakeAmount + amount);
  }

  sfxThrottled(name, gap) {
    const t = performance.now() / 1000;
    if ((this.sfxTimes[name] ?? 0) + gap > t) return;
    this.sfxTimes[name] = t;
    this.sfx.play(name);
  }
}

window.game = new Game();
