import * as THREE from 'three';
import { buildMonsterModel, animateMonster } from './voxel.js';
import { rand } from './rng.js';

const _dir = new THREE.Vector3();
const _org = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);
const barGeo = new THREE.PlaneGeometry(1, 0.12);

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Monster {
  constructor(game, key, room, x, z, instant = false) {
    const def = game.cfg.monsters[key];
    if (!def) throw new Error(`Unknown monster "${key}" (check config.js)`);
    this.game = game;
    this.key = key;
    this.def = def;
    this.room = room;

    const f = game.floor - 1;
    const D = game.cfg.difficulty;
    const table = D.floors ?? [];
    const last = Math.max(0, table.length - 1);
    const row = table[Math.min(f, last)] ?? {};
    const extra = Math.max(0, f - last);
    this.maxHp = def.health * ((row.health ?? 1) + (D.healthPerFloor ?? 0) * extra);
    this.hp = this.maxHp;
    this.dmgMul = (row.damage ?? 1) + (D.damagePerFloor ?? 0) * extra;
    this.damage = def.damage * this.dmgMul;
    this.speed = def.speed * (1 + D.speedPerFloor * f);

    this.model = buildMonsterModel(def);
    this.radius = this.model.radius;
    this.height = this.model.height;
    this.pos = this.model.root.position;
    this.baseY = def.flying ? def.flyHeight ?? 2 : 0;
    this.pos.set(x, this.baseY, z);
    this.yaw = rand.range(0, Math.PI * 2);

    this.alive = true;
    this.spawnT = instant ? 1 : 0;
    this.spawnDelay = Math.max(0.05, game.cfg.rooms.spawnDelay);
    this.kx = 0;
    this.kz = 0;
    this.attackTimer = (def.attackCooldown || 1) * rand.range(0.5, 1.2);
    this.specialTimer = def.special ? def.special.cooldown : 0;
    this.summonTimer = def.summon ? def.summon.cooldown * 0.6 : 0;
    this.contactTimer = 0;
    this.windup = 0;
    this.attackAnim = 0;
    this.flash = 0;
    this.walk = rand.range(0, 10);
    this.seed = rand.range(0, 100);
    this.strafeDir = rand.chance(0.5) ? 1 : -1;
    this.strafeTimer = rand.range(1, 3);
    this.fuse = -1;
    this.exploded = false;

    if (!instant) this.model.root.scale.setScalar(0.01);
    game.scene.add(this.model.root);

    // Floating health bar (non-bosses)
    this.bar = new THREE.Group();
    const bw = Math.max(0.9, this.radius * 2);
    this.barBg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x330000 }));
    this.barFg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x33ff44 }));
    this.barBg.scale.x = bw;
    this.barFg.scale.x = bw;
    this.barFg.position.z = 0.001;
    this.barWidth = bw;
    this.bar.add(this.barBg, this.barFg);
    this.bar.visible = false;
    game.scene.add(this.bar);
  }

  // ---------------------------------------------------------------- hit tests
  get bottom() { return this.pos.y; }

  hitTestPoint(p, r = 0) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const rr = this.radius + r;
    return dx * dx + dz * dz < rr * rr && p.y > this.bottom - r && p.y < this.bottom + this.height + r;
  }

  // Ray vs. axis-aligned box. Returns distance or Infinity.
  rayHit(o, d) {
    const r = this.radius;
    const min = [this.pos.x - r, this.bottom, this.pos.z - r];
    const max = [this.pos.x + r, this.bottom + this.height, this.pos.z + r];
    const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];
    let t0 = 0, t1 = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(da[i]) < 1e-8) {
        if (oa[i] < min[i] || oa[i] > max[i]) return Infinity;
        continue;
      }
      let a = (min[i] - oa[i]) / da[i], b = (max[i] - oa[i]) / da[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return Infinity;
    }
    return t0;
  }

  get center() {
    return _org.set(this.pos.x, this.bottom + this.height * 0.5, this.pos.z);
  }

  // ---------------------------------------------------------------- damage
  takeDamage(amount, dir, knockback = 1) {
    if (!this.alive) return;
    this.hp -= amount;
    this.flash = 0.12;
    this.dormant = false;
    if (dir) {
      const len = Math.hypot(dir.x, dir.z) || 1;
      const k = (knockback * 4) / Math.max(1, (this.def.scale ?? 1) * (this.def.boss ? 3 : 1));
      this.kx += (dir.x / len) * k;
      this.kz += (dir.z / len) * k;
    }
    const g = this.game;
    const c = this.center;
    g.particles.burst(c.x, c.y, c.z, { count: 4, color: this.def.colors?.body ?? 0x888888, speed: 3, size: 0.12 });
    g.sfxThrottled('hit', 0.05);
    g.hud.hitMarker();
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    const g = this.game;
    const c = this.center;
    const col = this.def.colors || {};
    const s = this.def.scale ?? 1;
    g.particles.burst(c.x, c.y, c.z, {
      count: Math.round(18 + 14 * s * s),
      colors: [col.body, col.head ?? col.body, col.limbs ?? col.body, col.eyes ?? col.body].filter((v) => v != null),
      speed: 5 + s * 2,
      size: 0.16 * Math.sqrt(s) + 0.06,
      life: 1.4,
    });
    g.sfx.play('monsterDie');
    this.dispose();
    if (this.def.attack === 'explode' && !this.exploded) this.explode();
    g.onMonsterKilled(this);
  }

  explode() {
    this.exploded = true;
    const d = this.def;
    this.game.explosion(this.center.clone(), d.explodeRadius ?? 3.5, (d.explodeDamage ?? 30) * this.dmgMul, {
      color: d.colors?.body ?? 0xff5500,
      hurtsPlayer: true,
      hurtsMonsters: true,
      monsterScale: 0.5,
      skip: this,
    });
    if (this.alive) this.die();
  }

  dispose() {
    this.game.scene.remove(this.model.root);
    this.game.scene.remove(this.bar);
    for (const m of this.model.mats) m.dispose();
    this.barBg.material.dispose();
    this.barFg.material.dispose();
  }

  // ---------------------------------------------------------------- AI
  update(dt, time) {
    if (!this.alive) return;
    const g = this.game;
    const def = this.def;
    const level = g.level;
    const player = g.player;

    // Materializing
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt / this.spawnDelay);
      const t = this.spawnT;
      const back = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2); // ease-out-back
      this.model.root.scale.setScalar(Math.max(0.01, back));
      this.yaw += dt * 12 * (1 - t);
      this.model.root.rotation.y = this.yaw;
      return;
    }

    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const eyeY = this.bottom + this.height * 0.75;
    const los = level.lineOfSight(this.pos.x, eyeY, this.pos.z, player.pos.x, player.pos.y + 1.4, player.pos.z);

    // Alley lurkers idle until they see the player up close (or get shot).
    if (this.dormant) {
      if (los && dist < (g.cfg.rooms.alleyWakeRadius ?? 14)) this.dormant = false;
      else {
        if (def.flying) this.pos.y = this.baseY + Math.sin(time * 3 + this.seed) * 0.3;
        animateMonster(this.model, def, time + this.seed, this.walk, false, 0);
        return;
      }
    }

    // Knockback
    if (Math.abs(this.kx) + Math.abs(this.kz) > 0.01) {
      level.moveCircle(this.pos, this.kx * dt, this.kz * dt, this.radius);
      const decay = Math.exp(-9 * dt);
      this.kx *= decay;
      this.kz *= decay;
    }

    // ----- decide movement -----
    let mx = 0, mz = 0;
    const toward = () => {
      if (dist < 1e-3) return;
      if (los && level.clearPath(this.pos.x, this.pos.z, player.pos.x, player.pos.z, this.radius * 0.9)) {
        mx = dx / dist;
        mz = dz / dist;
      } else {
        const step = level.flowStep(this.pos.x, this.pos.z);
        if (step) {
          const sx = step.x - this.pos.x, sz = step.z - this.pos.z;
          const sl = Math.hypot(sx, sz) || 1;
          mx = sx / sl;
          mz = sz / sl;
        } else if (dist > 0) {
          mx = dx / dist;
          mz = dz / dist;
        }
      }
    };

    const attack = def.attack || 'melee';
    if (this.fuse >= 0) {
      // standing still, about to pop
    } else if (attack === 'ranged') {
      const pref = def.preferredDistance ?? 8;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir *= -1;
        this.strafeTimer = rand.range(1, 3);
      }
      if (!los || dist > pref + 2) toward();
      else if (dist < pref - 2) { mx = -dx / dist; mz = -dz / dist; }
      else { mx = (-dz / dist) * this.strafeDir; mz = (dx / dist) * this.strafeDir; }
    } else if (dist > (def.attackRange ?? 1.5) * 0.6 + player.radius) {
      toward();
    }

    if (def.erratic) {
      const w = Math.sin(time * 4 + this.seed) * def.erratic;
      const px = -mz, pz = mx;
      mx += px * w;
      mz += pz * w;
      const l = Math.hypot(mx, mz) || 1;
      mx /= l;
      mz /= l;
    }

    const slow = this.windup > 0 ? (attack === 'ranged' ? 0 : 0.35) : 1;
    const spd = this.speed * slow * g.monsterSpeedScale;
    const ox = this.pos.x, oz = this.pos.z;
    if (mx || mz) level.moveCircle(this.pos, mx * spd * dt, mz * spd * dt, this.radius);

    // Separation from other monsters
    for (const o of g.monsters) {
      if (o === this || !o.alive || o.spawnT < 1) continue;
      const sx = this.pos.x - o.pos.x, sz = this.pos.z - o.pos.z;
      const min = this.radius + o.radius;
      const d2 = sx * sx + sz * sz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        level.moveCircle(this.pos, (sx / d) * push, (sz / d) * push, this.radius);
      }
    }
    // Don't overlap the player
    const pd = Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
    const pmin = this.radius + player.radius;
    if (pd < pmin && pd > 1e-4 && !def.flying) {
      const push = pmin - pd;
      level.moveCircle(this.pos, ((this.pos.x - player.pos.x) / pd) * push, ((this.pos.z - player.pos.z) / pd) * push, this.radius);
    }
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);

    // ----- attacks -----
    this.attackTimer -= dt;
    this.attackAnim = Math.max(0, this.attackAnim - dt * 4);
    const reach = (def.attackRange ?? 1.5) + player.radius;
    const vertOk = player.pos.y < this.bottom + this.height + 0.5 && player.pos.y + 1.8 > this.bottom - 0.5;

    if (attack === 'explode') {
      if (this.fuse < 0 && dist < reach && vertOk) {
        this.fuse = def.fuse ?? 0.5;
        g.sfx.play('fuse');
      }
      if (this.fuse >= 0) {
        this.fuse -= dt;
        this.flash = Math.sin(time * 40) > 0 ? 0.12 : 0;
        this.model.root.scale.setScalar(1 + (1 - Math.max(0, this.fuse) / (def.fuse ?? 0.5)) * 0.35);
        if (this.fuse <= 0) {
          this.explode();
          return;
        }
      }
    } else if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) {
        this.attackAnim = 1;
        if (attack === 'ranged') this.shoot(def.projectile, player);
        else if (dist < reach + 0.4 && vertOk) player.hurt(this.damage, this.pos);
      }
    } else if (this.attackTimer <= 0) {
      if (attack === 'ranged' && los && dist < (def.attackRange ?? 20)) {
        this.windup = 0.4;
        this.attackTimer = def.attackCooldown * rand.range(0.8, 1.2);
        this.attackAnim = 0.4;
      } else if (attack === 'melee' && dist < reach && vertOk) {
        this.windup = 0.25;
        this.attackTimer = def.attackCooldown;
        this.attackAnim = 0.3;
      }
    }

    // Bosses (and big ranged monsters) hurt on contact
    this.contactTimer -= dt;
    if (def.boss && dist < this.radius + player.radius + 0.3 && this.contactTimer <= 0 && vertOk) {
      player.hurt(this.damage, this.pos);
      this.contactTimer = 1;
    }

    // Boss specials
    if (def.special) {
      this.specialTimer -= dt;
      if (this.specialTimer <= 0) {
        this.specialTimer = def.special.cooldown;
        this.ring(def.special);
      }
    }
    if (def.summon) {
      this.summonTimer -= dt;
      if (this.summonTimer <= 0) {
        this.summonTimer = def.summon.cooldown;
        const alive = g.monsters.filter((m) => m.alive && m.room === this.room).length;
        const n = Math.min(def.summon.count, 14 - alive);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rand.range(0, 1);
          const r = this.radius + 1.5;
          const sx = this.pos.x + Math.cos(a) * r, sz = this.pos.z + Math.sin(a) * r;
          if (!level.circleHits(sx, sz, 0.6)) g.spawnMonster(def.summon.monster, this.room, sx, sz);
        }
      }
    }

    // ----- visuals -----
    const targetYaw = Math.atan2(dx, dz);
    this.yaw = angleLerp(this.yaw, targetYaw, Math.min(1, dt * 8));
    this.model.root.rotation.y = this.yaw;
    if (def.flying) this.pos.y = this.baseY + Math.sin(time * 3 + this.seed) * 0.3;
    const isMoving = moved > 0.2 * dt;
    if (isMoving) this.walk += dt * (4 + this.speed * 1.2);
    animateMonster(this.model, def, time + this.seed, this.walk, isMoving, this.windup > 0 ? 0.6 : this.attackAnim);

    this.flash = Math.max(0, this.flash - dt);
    const fl = this.flash > 0 ? 1 : 0;
    const fuseRed = this.fuse >= 0;
    for (const m of this.model.mats) {
      m.emissive.setRGB(fl, fuseRed ? fl * 0.2 : fl, fuseRed ? fl * 0.1 : fl);
    }

    // Health bar
    if (!def.boss && this.hp < this.maxHp) {
      this.bar.visible = true;
      this.bar.position.set(this.pos.x, this.bottom + this.height + 0.35, this.pos.z);
      this.bar.quaternion.copy(g.camera.quaternion);
      const k = Math.max(0, this.hp / this.maxHp);
      this.barFg.scale.x = this.barWidth * k;
      this.barFg.position.x = -(this.barWidth * (1 - k)) / 2;
      this.barFg.material.color.setHSL(k * 0.33, 0.9, 0.5);
    }
  }

  shoot(proj, player) {
    if (!proj) return;
    const g = this.game;
    const s = this.def.scale ?? 1;
    const origin = new THREE.Vector3(this.pos.x, this.bottom + this.height * 0.65, this.pos.z);
    const target = new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z);
    const dir = target.sub(origin).normalize();
    origin.addScaledVector(new THREE.Vector3(dir.x, 0, dir.z).normalize(), this.radius * 0.8 + 0.1 * s);
    const count = proj.count ?? 1;
    const spread = THREE.MathUtils.degToRad(proj.spreadDeg ?? 0);
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
      g.projectiles.spawn({
        pos: origin.clone(),
        dir: dir.clone().applyAxisAngle(_y, off),
        speed: proj.speed ?? 12,
        damage: (proj.damage ?? 10) * this.dmgMul,
        size: proj.size ?? 0.25,
        color: proj.color ?? 0xff4400,
        owner: 'monster',
      });
    }
    g.sfx.play('enemyShoot', 0.7);
  }

  ring(special) {
    const g = this.game;
    const n = special.count ?? 12;
    const p = special.projectile || {};
    const origin = new THREE.Vector3(this.pos.x, this.bottom + Math.min(1.2, this.height * 0.4), this.pos.z);
    const offset = rand.range(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = offset + (i / n) * Math.PI * 2;
      _dir.set(Math.cos(a), 0, Math.sin(a));
      g.projectiles.spawn({
        pos: origin.clone().addScaledVector(_dir, this.radius + 0.3),
        dir: _dir.clone(),
        speed: p.speed ?? 10,
        damage: (p.damage ?? 10) * this.dmgMul,
        size: p.size ?? 0.35,
        color: p.color ?? 0xff8800,
        owner: 'monster',
      });
    }
    this.attackAnim = 1;
    g.sfx.play('enemyShoot', 1);
  }
}
