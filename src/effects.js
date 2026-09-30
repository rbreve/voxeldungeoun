import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// Voxel debris particles, rendered with a single InstancedMesh.
export class Particles {
  constructor(scene, max = 2500) {
    this.max = max;
    this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.mesh);
  }

  // opts: { count, color | colors[], speed, size, life, gravity, up }
  burst(x, y, z, opts = {}) {
    const n = opts.count ?? 10;
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) this.list.shift();
      const sp = (opts.speed ?? 5) * (0.4 + Math.random() * 0.8);
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const colors = opts.colors;
      this.list.push({
        x, y, z,
        vx: Math.sin(ph) * Math.cos(th) * sp,
        vy: Math.abs(Math.cos(ph)) * sp * 0.8 + (opts.up ?? 2),
        vz: Math.sin(ph) * Math.sin(th) * sp,
        rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 12,
        life: 0,
        maxLife: (opts.life ?? 0.9) * (0.6 + Math.random() * 0.8),
        size: (opts.size ?? 0.18) * (0.6 + Math.random() * 0.8),
        gravity: opts.gravity ?? 18,
        color: colors ? colors[(Math.random() * colors.length) | 0] : opts.color ?? 0xffffff,
      });
    }
  }

  update(dt) {
    const list = this.list;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.size / 2) {
        p.y = p.size / 2;
        p.vy *= -0.35;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      p.rx += p.spin * dt;
      const k = 1 - Math.pow(p.life / p.maxLife, 3);
      _s.setScalar(p.size * k);
      _q.setFromEuler(_e.set(p.rx, p.ry + p.rx, 0));
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, _c.set(p.color));
      list[n++] = p;
    }
    list.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.list.length = 0;
    this.mesh.count = 0;
  }
}

// Short-lived beams for hitscan shots.
export class Tracers {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.BoxGeometry(1, 1, 1);
  }

  add(from, to, color = 0xffeeaa, width = 0.03, life = 0.06) {
    const len = from.distanceTo(to);
    if (len < 0.01) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.copy(from).lerp(to, 0.5);
    m.lookAt(to);
    m.scale.set(width, width, len);
    this.scene.add(m);
    this.list.push({ m, life, maxLife: life, width });
  }

  update(dt) {
    this.list = this.list.filter((t) => {
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.m);
        t.m.material.dispose();
        return false;
      }
      const k = t.life / t.maxLife;
      t.m.material.opacity = 0.9 * k;
      t.m.scale.x = t.m.scale.y = t.width * (0.5 + k * 0.5);
      return true;
    });
  }

  clear() {
    for (const t of this.list) {
      this.scene.remove(t.m);
      t.m.material.dispose();
    }
    this.list = [];
  }
}

// Player and monster projectiles (glowing voxel cubes).
export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mats = new Map();
  }

  mat(color) {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color });
      this.mats.set(color, m);
    }
    return m;
  }

  // opts: { pos, dir, speed, damage, size, color, owner: 'player'|'monster',
  //         splashRadius, splashDamage, selfDamageScale, knockback,
  //         gravity, bounce, fuse, explodeOnHit }
  spawn(opts) {
    const m = new THREE.Mesh(this.geo, this.mat(opts.color ?? 0xffffff));
    m.scale.setScalar(opts.size ?? 0.25);
    m.position.copy(opts.pos);
    this.game.scene.add(m);
    this.list.push({
      ...opts,
      m,
      pos: m.position,
      vel: opts.dir.clone().multiplyScalar(opts.speed),
      life: 6,
      trail: 0,
    });
  }

  update(dt) {
    const g = this.game;
    const level = g.level;
    const player = g.player;
    this.list = this.list.filter((p) => {
      p.life -= dt;
      if (p.fuse != null) {
        p.fuse -= dt;
        if (p.fuse <= 0) {
          this.impact(p, null);
          return this.kill(p);
        }
      }
      if (p.life <= 0) return this.kill(p);
      const dist = p.vel.length() * dt;
      const steps = Math.max(1, Math.ceil(dist / 0.3));
      const r = (p.size ?? 0.25) / 2;
      for (let i = 0; i < steps; i++) {
        const sdt = dt / steps;
        if (p.gravity) p.vel.y -= p.gravity * sdt;
        if (p.bounce != null) {
          this.bounceStep(p, sdt, r);
        } else {
          p.pos.addScaledVector(p.vel, sdt);
          if (p.pos.y < 0 || p.pos.y > level.H || level.isSolidAt(p.pos.x, p.pos.z)) {
            this.impact(p, null);
            return this.kill(p);
          }
        }
        if (p.owner === 'player') {
          for (const mon of g.monsters) {
            if (!mon.alive || mon.spawnT < 1 || !mon.hitTestPoint(p.pos, r)) continue;
            if (p.bounce != null && !p.explodeOnHit) continue;
            this.impact(p, mon);
            return this.kill(p);
          }
        } else if (player.alive) {
          const dx = p.pos.x - player.pos.x, dz = p.pos.z - player.pos.z;
          const py = p.pos.y - player.pos.y;
          if (dx * dx + dz * dz < (player.radius + r) ** 2 && py > -r && py < 1.8 + r) {
            player.hurt(p.damage, p.pos);
            g.particles.burst(p.pos.x, p.pos.y, p.pos.z, { count: 6, color: p.color, speed: 3, size: 0.12 });
            return this.kill(p);
          }
        }
      }
      p.m.rotation.x += dt * 9;
      p.m.rotation.y += dt * 7;
      p.trail -= dt;
      if (p.trail <= 0) {
        p.trail = 0.03;
        g.particles.burst(p.pos.x, p.pos.y, p.pos.z, {
          count: 1, color: p.color, speed: 0.4, size: (p.size ?? 0.25) * 0.5, life: 0.3, gravity: 0, up: 0,
        });
      }
      return true;
    });
  }

  // Move a bouncing projectile (grenade) one sub-step, reflecting off surfaces.
  bounceStep(p, sdt, r) {
    const lv = this.game.level;
    let bounced = false;
    const nx = p.pos.x + p.vel.x * sdt;
    if (lv.isSolidAt(nx + Math.sign(p.vel.x) * r, p.pos.z)) {
      p.vel.x = -p.vel.x * p.bounce;
      bounced = true;
    } else p.pos.x = nx;
    const nz = p.pos.z + p.vel.z * sdt;
    if (lv.isSolidAt(p.pos.x, nz + Math.sign(p.vel.z) * r)) {
      p.vel.z = -p.vel.z * p.bounce;
      bounced = true;
    } else p.pos.z = nz;
    const ny = p.pos.y + p.vel.y * sdt;
    if (ny < r) {
      p.pos.y = r;
      if (p.vel.y < -2) bounced = true;
      p.vel.y = -p.vel.y * p.bounce;
      p.vel.x *= 0.82;
      p.vel.z *= 0.82;
    } else if (ny > lv.H - r) {
      p.pos.y = lv.H - r;
      p.vel.y = -Math.abs(p.vel.y) * p.bounce;
      bounced = true;
    } else p.pos.y = ny;
    if (bounced) this.game.sfxThrottled('bounce', 0.08);
  }

  impact(p, monster) {
    const g = this.game;
    if (monster) monster.takeDamage(p.damage, p.vel, p.knockback ?? 1);
    g.particles.burst(p.pos.x, p.pos.y, p.pos.z, { count: 8, color: p.color, speed: 4, size: 0.12 });
    if (p.splashRadius > 0) {
      g.explosion(p.pos, p.splashRadius, p.splashDamage, {
        color: p.color,
        hurtsPlayer: true,
        selfScale: p.owner === 'player' ? p.selfDamageScale ?? 0.35 : 1,
        hurtsMonsters: p.owner === 'player',
        skip: monster,
      });
    }
  }

  kill(p) {
    this.game.scene.remove(p.m);
    return false;
  }

  clear() {
    for (const p of this.list) this.game.scene.remove(p.m);
    this.list = [];
  }
}
