import * as THREE from 'three';
import { buildWeaponModel } from './voxel.js';
import { rand } from './rng.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _end = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

// Where each weapon model sits in front of the camera.
const VIEW_OFFSETS = {
  pistol: [0.3, -0.27, -0.66],
  shotgun: [0.28, -0.3, -0.62],
  supershotgun: [0.28, -0.3, -0.6],
  minigun: [0.3, -0.32, -0.62],
  grenade: [0.3, -0.3, -0.62],
  smg: [0.28, -0.28, -0.64],
  plasma: [0.3, -0.31, -0.68],
  rocket: [0.34, -0.28, -0.6],
  railgun: [0.28, -0.3, -0.64],
};

export class Player {
  constructor(game) {
    this.game = game;
    const c = game.cfg.player;
    this.c = c;
    this.mode = game.mode;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = c.radius;
    this.hp = c.startHealth;
    this.armor = c.startArmor;
    this.alive = true;
    this.onGround = true;
    this.invuln = 0;
    this.bob = 0;
    this.powers = {}; // effect -> { remaining, def }

    this.ammo = {};
    for (const k of Object.keys(game.cfg.ammo)) this.ammo[k] = c.startAmmo?.[k] ?? 0;
    this.owned = [];
    this.rarity = {}; // weapon -> rarity key
    this.spin = 0;    // minigun spin-up 0..1
    for (const w of this.mode.startWeapons ?? c.startWeapons) {
      // 'random' = any weapon from the config not already owned.
      const key = w === 'random' ? rand.pick(Object.keys(game.cfg.weapons).filter((k) => !this.owned.includes(k))) : w;
      if (key) this.giveWeapon(key, false);
    }
    this.current = this.owned[0];
    this.cooldown = 0;
    this.pendingShot = 0;

    // Viewmodel
    this.vmModels = {};
    this.vmGroup = new THREE.Group();
    game.vmScene.add(this.vmGroup);
    this.recoil = 0;
    this.switchT = 1;
    this.flashT = 0;
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd77, transparent: true, opacity: 0.9 });
    this.flashMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), flashMat);
    this.flashMesh.visible = false;
    this.showWeapon(this.current);
  }

  dispose() {
    this.game.vmScene.remove(this.vmGroup);
  }

  // ---------------------------------------------------------------- weapons
  weaponDef(key = this.current) {
    return this.game.cfg.weapons[key];
  }

  // Inventory limit from the game mode (0 = unlimited).
  get maxWeapons() {
    return this.mode.maxWeapons || 0;
  }

  get unlimitedAmmo() {
    return !!this.mode.unlimitedAmmo;
  }

  get inventoryFull() {
    return this.maxWeapons > 0 && this.owned.length >= this.maxWeapons;
  }

  giveWeapon(key, announce = true, rarity = 'common') {
    const def = this.game.cfg.weapons[key];
    if (!def) {
      console.warn(`Unknown weapon "${key}" in config`);
      return false;
    }
    if (this.owned.includes(key) || this.inventoryFull) return false;
    this.owned.push(key);
    this.rarity[key] = rarity;
    // Classic: keep weapons ordered by slot. Limited inventory keeps pickup order.
    if (!this.maxWeapons) this.owned.sort((a, b) => (this.weaponDef(a).slot ?? 9) - (this.weaponDef(b).slot ?? 9));
    if (announce) this.switchTo(key);
    return true;
  }

  // Replace the weapon in hand with a new one. Returns what was dropped.
  swapCurrent(key, rarity = 'common') {
    const i = this.owned.indexOf(this.current);
    const dropped = { key: this.current, rarity: this.rarity[this.current] };
    this.owned[i] = key;
    delete this.rarity[dropped.key];
    this.rarity[key] = rarity;
    this.vmModels[dropped.key] && (this.vmModels[dropped.key].group.visible = false);
    this.switchTo(key);
    this.lastWeapon = null;
    return dropped;
  }

  rarityDef(key = this.current) {
    return this.game.cfg.rarities?.[this.rarity[key]] ?? { name: '', color: 0xffffff, damage: 1, fireRate: 1 };
  }

  displayName(key = this.current) {
    const r = this.rarity[key];
    const name = this.weaponDef(key).name;
    return !r || r === 'common' ? name : `${this.rarityDef(key).name} ${name}`;
  }

  hasAmmoFor(key) {
    if (this.unlimitedAmmo) return true;
    const d = this.weaponDef(key);
    return !d.ammoType || this.ammo[d.ammoType] >= (d.ammoPerShot ?? 1);
  }

  switchTo(key) {
    if (!this.owned.includes(key) || key === this.current) return;
    this.lastWeapon = this.current;
    this.current = key;
    this.switchT = 0;
    this.cooldown = Math.max(this.cooldown, 0.25);
    this.showWeapon(key);
    this.game.sfx.play('switch');
  }

  cycleWeapon(dir) {
    const i = this.owned.indexOf(this.current);
    for (let k = 1; k <= this.owned.length; k++) {
      const key = this.owned[(i + dir * k + this.owned.length * 10) % this.owned.length];
      if (this.hasAmmoFor(key)) return this.switchTo(key);
    }
  }

  autoSwitch() {
    for (let i = this.owned.length - 1; i >= 0; i--) {
      if (this.hasAmmoFor(this.owned[i])) return this.switchTo(this.owned[i]);
    }
  }

  showWeapon(key) {
    for (const k in this.vmModels) this.vmModels[k].group.visible = false;
    if (!this.vmModels[key]) {
      const def = this.weaponDef(key);
      const m = buildWeaponModel(def);
      this.vmModels[key] = m;
      this.vmGroup.add(m.group);
    }
    const m = this.vmModels[key];
    m.group.visible = true;
    m.muzzle.add(this.flashMesh);
    this.flashMesh.material.color.setHex(this.weaponDef(key).colors?.glow ?? 0xffdd77);
  }

  power(effect) {
    return this.powers[effect];
  }

  // ---------------------------------------------------------------- damage
  hurt(amount, srcPos) {
    if (!this.alive || this.invuln > 0 || this.power('invulnerable')) return;
    const absorbed = Math.min(this.armor, amount * this.c.armorAbsorb);
    this.armor -= absorbed;
    this.hp -= amount - absorbed;
    this.invuln = this.c.invulnAfterHit;
    this.game.hud.damageFlash(srcPos);
    this.game.sfx.play('hurt');
    this.game.shake(0.25);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.game.gameOver();
    }
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const g = this.game;
    const input = g.input;
    const level = g.level;
    const c = this.c;

    // Look
    this.yaw -= input.dx * c.mouseSensitivity;
    this.pitch -= input.dy * c.mouseSensitivity;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

    // Move
    let fx = 0, fz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) fz -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) fz += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) fx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;
    let speed = c.moveSpeed;
    if (input.down('ShiftLeft') || input.down('ShiftRight')) speed *= c.sprintMultiplier;
    const haste = this.power('speed');
    if (haste) speed *= haste.def.multiplier ?? 1.5;
    const accel = this.onGround ? 14 : 4;
    const k = Math.min(1, dt * accel);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;
    level.moveCircle(this.pos, this.vel.x * dt, this.vel.z * dt, this.radius);

    // Jump / gravity
    if (input.down('Space') && this.onGround) {
      this.vel.y = c.jumpVelocity;
      this.onGround = false;
    }
    this.vel.y -= c.gravity * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
    }
    const ceiling = level.H - c.eyeHeight - 0.2;
    if (this.pos.y > ceiling) {
      this.pos.y = ceiling;
      this.vel.y = Math.min(0, this.vel.y);
    }

    // Weapon switching
    if (input.slotPressed && this.maxWeapons) {
      // Limited inventory: number keys pick inventory slots.
      const key = this.owned[input.slotPressed - 1];
      if (key) this.switchTo(key);
    } else if (input.slotPressed) {
      // Weapons sharing a slot cycle on repeated presses.
      const inSlot = this.owned.filter((w) => this.weaponDef(w).slot === input.slotPressed);
      if (inSlot.length) this.switchTo(inSlot[(inSlot.indexOf(this.current) + 1) % inSlot.length]);
    }
    if (input.wheel) this.cycleWeapon(input.wheel > 0 ? 1 : -1);
    if (input.wasPressed('KeyQ')) {
      if (this.maxWeapons) this.cycleWeapon(1);
      else if (this.lastWeapon) this.switchTo(this.lastWeapon);
    }

    // Firing
    this.cooldown -= dt;
    this.pendingShot -= dt;
    if (input.clicked) this.pendingShot = 0.2;
    const def = this.weaponDef();
    if (def.spinUp) {
      const k = dt / def.spinUp;
      this.spin = input.mouseDown && this.hasAmmoFor(this.current) ? Math.min(1, this.spin + k) : Math.max(0, this.spin - k * 1.5);
    } else this.spin = 0;
    const spinner = this.vmModels[this.current]?.spinner;
    if (spinner) spinner.rotation.z += dt * 45 * this.spin;
    const wantFire = (def.auto && input.mouseDown) || this.pendingShot > 0;
    if (wantFire && this.cooldown <= 0 && this.switchT >= 1) {
      if (this.hasAmmoFor(this.current)) {
        this.fire(def);
        this.pendingShot = 0;
      } else {
        g.sfx.play('empty');
        this.cooldown = 0.3;
        this.pendingShot = 0;
        this.autoSwitch();
      }
    }

    // Power-ups
    for (const [effect, p] of Object.entries(this.powers)) {
      p.remaining -= dt;
      if (effect === 'regen') this.hp = Math.min(c.maxHealth, this.hp + (p.def.amount ?? 5) * dt);
      if (p.remaining <= 0) {
        delete this.powers[effect];
        g.hud.message(`${p.def.name} wore off`, '#aaa');
      }
    }
    this.invuln -= dt;

    this.updateCamera(dt);
    this.updateViewmodel(dt);
  }

  fire(def) {
    const g = this.game;
    const cam = g.camera;
    if (def.ammoType && !this.unlimitedAmmo) this.ammo[def.ammoType] -= def.ammoPerShot ?? 1;
    const rar = this.rarityDef();
    const spinK = def.spinUp ? Math.max(0.12, this.spin) : 1;
    const rate = def.fireRate * (this.power('fireRate')?.def.multiplier ?? 1) * (rar.fireRate ?? 1) * spinK;
    this.cooldown = 1 / rate;
    const dmgMul = (this.power('damage')?.def.multiplier ?? 1) * (rar.damage ?? 1);

    cam.getWorldDirection(_fwd);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const origin = cam.position.clone();
    this.muzzleWorld(_muzzle);

    const spread = THREE.MathUtils.degToRad(def.spreadDeg ?? 0);
    const pellets = def.pellets ?? 1;
    for (let i = 0; i < pellets; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.tan(spread * Math.sqrt(Math.random()));
      _dir.copy(_fwd).addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();

      if (def.hitscan !== false) {
        const range = def.range ?? 60;
        const wallT = g.level.rayDistance(origin, _dir, range);
        let endT = wallT;
        const hits = [];
        for (const m of g.monsters) {
          if (!m.alive) continue;
          const t = m.rayHit(origin, _dir);
          if (t < wallT) hits.push([t, m]);
        }
        hits.sort((x, y) => x[0] - y[0]);
        const targets = def.pierce ? hits : hits.slice(0, 1);
        for (const [, m] of targets) m.takeDamage(def.damage * dmgMul, _dir, def.knockback ?? 1);
        if (!def.pierce && hits.length) endT = hits[0][0];
        _end.copy(origin).addScaledVector(_dir, endT);
        if (!hits.length || def.pierce) {
          if (wallT < range) {
            g.particles.burst(_end.x, _end.y, _end.z, { count: 4, color: 0xbbaa88, speed: 2.5, size: 0.08, life: 0.5 });
          }
        }
        const isRail = !!def.trailColor;
        g.tracers.add(_muzzle, _end, def.trailColor ?? def.colors?.glow ?? 0xffeeaa, isRail ? 0.12 : 0.025, isRail ? 0.35 : 0.05);
      } else {
        const p = def.projectile || {};
        const start = origin.clone().addScaledVector(_dir, 0.4).addScaledVector(_up, -0.12).addScaledVector(_right, 0.08);
        const pdir = _dir.clone();
        if (p.up) pdir.y += p.up;
        g.projectiles.spawn({
          pos: start,
          dir: pdir.normalize(),
          speed: p.speed ?? 30,
          damage: def.damage * dmgMul,
          size: p.size ?? 0.2,
          color: p.color ?? 0x44ddff,
          owner: 'player',
          splashRadius: p.splashRadius ?? 0,
          splashDamage: (p.splashDamage ?? 0) * dmgMul,
          selfDamageScale: p.selfDamageScale,
          knockback: def.knockback,
          gravity: p.gravity ?? 0,
          bounce: p.bounce,
          fuse: p.fuse,
          explodeOnHit: p.explodeOnHit,
        });
      }
    }

    this.recoil = Math.min(0.4, this.recoil + (def.recoil ?? 0.05));
    this.pitch = Math.min(1.5, this.pitch + (def.recoil ?? 0.05) * 0.15);
    this.flashT = 0.05;
    g.muzzleLight(origin, def.colors?.glow ?? 0xffcc66);
    g.sfx.play(def.sound || 'pistol');
    if ((def.recoil ?? 0) > 0.1) g.shake(def.recoil * 0.6);
  }

  muzzleWorld(out) {
    const m = this.vmModels[this.current];
    this.vmGroup.updateMatrixWorld(true);
    m.muzzle.getWorldPosition(out); // in view space (vm camera sits at origin)
    return out.applyMatrix4(this.game.camera.matrixWorld);
  }

  updateCamera(dt) {
    const cam = this.game.camera;
    const moving = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && moving > 0.5) this.bob += dt * moving * 1.6;
    const bobY = Math.sin(this.bob * 2) * 0.05 * Math.min(1, moving / 7);
    const sh = this.game.shakeAmount;
    cam.position.set(
      this.pos.x + (Math.random() - 0.5) * sh * 0.3,
      this.pos.y + this.c.eyeHeight + bobY + (Math.random() - 0.5) * sh * 0.3,
      this.pos.z + (Math.random() - 0.5) * sh * 0.3,
    );
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
  }

  updateViewmodel(dt) {
    const off = VIEW_OFFSETS[this.weaponDef().model] ?? VIEW_OFFSETS.pistol;
    const moving = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 7);
    this.recoil = Math.max(0, this.recoil - dt * 1.8);
    this.switchT = Math.min(1, this.switchT + dt * 4);
    const sw = 1 - this.switchT;
    const bx = Math.cos(this.bob) * 0.012 * moving;
    const by = Math.abs(Math.sin(this.bob)) * 0.012 * moving;
    const g = this.vmGroup;
    g.position.set(off[0] + bx, off[1] + by - sw * 0.4, off[2] + this.recoil * 0.35);
    g.rotation.set(this.recoil * 1.2 - sw * 0.8, 0, 0);

    this.flashT -= dt;
    this.flashMesh.visible = this.flashT > 0;
    if (this.flashMesh.visible) {
      this.flashMesh.rotation.z = Math.random() * Math.PI;
      this.flashMesh.scale.setScalar(0.8 + Math.random() * 0.8);
    }
  }
}
