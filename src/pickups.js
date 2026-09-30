import * as THREE from 'three';
import { buildPickupModel, buildWeaponModel, buildChestModel } from './voxel.js';

const hexStr = (c) => '#' + (c ?? 0xffffff).toString(16).padStart(6, '0');

// Floating text label (used for weapon drops, Diablo style).
function makeLabel(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 44px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(500, ctx.measureText(text).width + 36);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect((512 - w) / 2, 14, w, 68);
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, 256, 50);
  ctx.fillStyle = hexStr(color);
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set(2.6, 0.49, 1);
  return sprite;
}

function makeBeam(color, height = 7) {
  const g = new THREE.Group();
  const mk = (w, o) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, height, w),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    m.position.y = height / 2;
    g.add(m);
    return m;
  };
  mk(0.1, 0.55);
  mk(0.35, 0.15);
  return g;
}

// A collectible. `key` is a pickups-config id, or 'weapon:<weaponId>'.
// opts: { pedestal, vel: {x,y,z} (loot fountain), rarity (weapons),
//         locked (can't be collected until the player steps away once) }
export class Pickup {
  constructor(game, key, x, z, opts = {}) {
    this.game = game;
    this.key = key;
    this.alive = true;
    this.t = Math.random() * 10;
    this.age = 0;
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    this.pos = this.root.position;

    let beamColor = null;
    if (key.startsWith('weapon:')) {
      this.weapon = key.slice(7);
      const wdef = game.cfg.weapons[this.weapon];
      this.rarity = opts.rarity || 'common';
      const rdef = game.cfg.rarities?.[this.rarity] ?? { name: '', color: 0xffffff };
      this.def = { type: 'weapon', name: wdef.name, color: rdef.color };
      const m = buildWeaponModel(wdef).group;
      m.scale.setScalar(2.2);
      m.rotation.y = Math.PI / 2;
      this.model = new THREE.Group();
      this.model.add(m);
      beamColor = rdef.color;
      const label = this.rarity === 'common' ? wdef.name : `${rdef.name} ${wdef.name}`;
      this.label = makeLabel(label, rdef.color);
      this.root.add(this.label);
    } else {
      this.def = game.cfg.pickups[key];
      if (!this.def) throw new Error(`Unknown pickup "${key}" (check config.js)`);
      this.model = buildPickupModel(this.def);
    }
    this.isGem = this.def.type === 'gem';
    this.root.add(this.model);
    this.baseY = opts.pedestal ? 1.35 : this.isGem ? 0.45 : 0.7;
    if (this.label) this.label.position.y = this.baseY + 1.0;

    if (beamColor != null) {
      this.beam = makeBeam(beamColor);
      this.root.add(this.beam);
    }

    this.locked = !!opts.locked;

    // Loot-fountain physics
    this.h = 0;
    this.flying = !!opts.vel;
    if (opts.vel) {
      this.vel = { ...opts.vel };
      this.h = 0.8;
    }

    if (opts.pedestal) {
      const stone = new THREE.MeshLambertMaterial({ color: 0x77706a });
      const top = new THREE.MeshLambertMaterial({ color: 0x8a8278 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), stone);
      base.position.y = 0.15;
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), stone);
      col.position.y = 0.6;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 1.0), top);
      cap.position.y = 0.97;
      this.root.add(base, col, cap);
    }

    // Soft glow square on the floor
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(this.isGem ? 0.7 : 1.2, this.isGem ? 0.7 : 1.2),
      new THREE.MeshBasicMaterial({ color: this.def.color ?? 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = opts.pedestal ? 1.06 : 0.02;
    this.glow = glow;
    this.root.add(glow);
    game.scene.add(this.root);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.t += dt;
    this.age += dt;

    if (this.flying) {
      this.vel.y -= 25 * dt;
      this.h += this.vel.y * dt;
      if (g.level.moveCircle(this.pos, this.vel.x * dt, this.vel.z * dt, 0.3)) {
        this.vel.x *= -0.5;
        this.vel.z *= -0.5;
      }
      if (this.h <= 0) {
        this.h = 0;
        if (this.vel.y < -3) {
          this.vel.y *= -0.42;
          this.vel.x *= 0.55;
          this.vel.z *= 0.55;
        } else {
          this.flying = false;
          if (this.weapon && this.rarity !== 'common') g.sfxThrottled('legendary', 0.1);
        }
      }
      this.model.rotation.x += dt * 8;
    } else {
      this.model.rotation.x *= Math.max(0, 1 - dt * 8);
    }

    this.model.position.y = this.baseY + this.h + (this.flying ? 0 : Math.sin(this.t * 2.5) * 0.12);
    this.model.rotation.y += dt * 1.6;
    this.glow.material.opacity = this.flying ? 0 : 0.18 + Math.sin(this.t * 4) * 0.08;
    if (this.label) this.label.position.y = this.baseY + this.h + 1.0;
    if (this.beam) this.beam.visible = !this.flying;
    if (this.rarity === 'legendary' && !this.flying && Math.random() < dt * 12) {
      g.particles.burst(this.pos.x + (Math.random() - 0.5), 0.2, this.pos.z + (Math.random() - 0.5), {
        count: 1, colors: [0xff8800, 0xffcc44], speed: 0.3, up: 3, gravity: -1, size: 0.1, life: 1.2,
      });
    }

    if (this.flying || this.age < 0.35) return;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d2 = dx * dx + dz * dz;
    if (this.locked) {
      if (d2 > 2.2 * 2.2) this.locked = false;
      return;
    }

    // Gems get pulled toward the player.
    const mag = g.cfg.loot?.gemMagnetRadius ?? 0;
    if (this.isGem && d2 < mag * mag && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const sp = Math.min(d, (14 - d * 2) * dt);
      this.pos.x += (dx / d) * sp;
      this.pos.z += (dz / d) * sp;
    }

    if (d2 < 1.4 * 1.4 && p.pos.y < 1.5 && this.tryCollect(p)) {
      this.alive = false;
      this.dispose();
    }
  }

  tryCollect(p) {
    const g = this.game;
    const d = this.def;
    const pc = g.cfg.player;
    switch (d.type) {
      case 'health':
        if (p.hp >= pc.maxHealth) return false;
        p.hp = Math.min(pc.maxHealth, p.hp + d.amount);
        break;
      case 'armor':
        if (p.armor >= pc.maxArmor) return false;
        p.armor = Math.min(pc.maxArmor, p.armor + d.amount);
        break;
      case 'ammo': {
        const max = g.cfg.ammo[d.ammoType]?.max ?? 999;
        if (p.ammo[d.ammoType] >= max) return false;
        p.ammo[d.ammoType] = Math.min(max, p.ammo[d.ammoType] + d.amount);
        break;
      }
      case 'gem':
        g.gems += d.value ?? 10;
        g.score += d.value ?? 10;
        g.sfxThrottled('gem', 0.04);
        g.hud.gemPop();
        return true;
      case 'power':
        p.powers[d.effect] = { remaining: d.duration ?? 10, duration: d.duration ?? 10, def: d };
        g.sfx.play('power');
        g.hud.message(d.name + '!', hexStr(d.color), true);
        g.hud.flash(d.color);
        return true;
      case 'weapon':
        return this.collectWeapon(p);
      default:
        return false;
    }
    g.sfx.play('pickup');
    g.hud.message(d.name, hexStr(d.color));
    g.hud.flash(d.color);
    return true;
  }

  collectWeapon(p) {
    const g = this.game;
    const wdef = g.cfg.weapons[this.weapon];
    const tiers = Object.keys(g.cfg.rarities ?? { common: 1 });
    const owned = p.owned.includes(this.weapon);
    const better = owned && tiers.indexOf(this.rarity) > tiers.indexOf(p.rarity[this.weapon]);
    if (p.maxWeapons) return this.collectLimited(p, wdef, owned, better);

    let gotAmmo = false;
    if (wdef.ammoType) {
      const max = g.cfg.ammo[wdef.ammoType]?.max ?? 999;
      if (p.ammo[wdef.ammoType] < max) {
        p.ammo[wdef.ammoType] = Math.min(max, p.ammo[wdef.ammoType] + (wdef.pickupAmmo ?? 10));
        gotAmmo = true;
      }
    }
    const rdef = g.cfg.rarities?.[this.rarity] ?? { name: '', color: 0xffffff };
    const fullName = this.rarity === 'common' ? wdef.name : `${rdef.name} ${wdef.name}`;
    if (!owned) {
      p.giveWeapon(this.weapon, true, this.rarity);
      g.hud.message(`Picked up ${fullName}!`, hexStr(rdef.color), true);
    } else if (better) {
      p.rarity[this.weapon] = this.rarity;
      p.switchTo(this.weapon);
      g.hud.message(`Upgraded: ${fullName}!`, hexStr(rdef.color), true);
    } else if (gotAmmo) {
      g.hud.message(`${wdef.name} ammo`, '#ffdd55');
    } else {
      return false;
    }
    g.sfx.play('weapon');
    g.hud.flash(rdef.color);
    return true;
  }

  // Limited-inventory modes: fill an empty slot, upgrade, or swap on key press.
  collectLimited(p, wdef, owned, better) {
    const g = this.game;
    const rdef = g.cfg.rarities?.[this.rarity] ?? { name: '', color: 0xffffff };
    const fullName = this.rarity === 'common' ? wdef.name : `${rdef.name} ${wdef.name}`;
    const announce = (text) => {
      g.sfx.play('weapon');
      g.hud.message(text, hexStr(rdef.color), true);
      g.hud.flash(rdef.color);
    };

    if (owned) {
      if (!better) return false;
      p.rarity[this.weapon] = this.rarity;
      p.switchTo(this.weapon);
      announce(`Upgraded: ${fullName}!`);
      return true;
    }
    if (!p.inventoryFull) {
      p.giveWeapon(this.weapon, true, this.rarity);
      announce(`Picked up ${fullName}!`);
      return true;
    }

    const mode = g.mode;
    const key = mode.swapKey ?? 'KeyE';
    const keyLabel = key.replace(/^Key|^Digit/, '');
    if (!mode.autoSwap && !g.input.wasPressed(key)) {
      g.hud.prompt(`Press <b>${keyLabel}</b> to swap <span style="color:${hexStr(p.rarityDef().color)}">${p.displayName()}</span>
        for <span style="color:${hexStr(rdef.color)}">${fullName}</span>`);
      return false;
    }
    g.input.pressed.delete(key); // one swap per key press
    const dropped = p.swapCurrent(this.weapon, this.rarity);
    const a = Math.random() * Math.PI * 2;
    g.pickups.push(new Pickup(g, 'weapon:' + dropped.key, this.pos.x, this.pos.z, {
      rarity: dropped.rarity, locked: true, vel: { x: Math.cos(a) * 2.5, y: 5, z: Math.sin(a) * 2.5 },
    }));
    announce(`Swapped for ${fullName}!`);
    return true;
  }

  dispose() {
    this.game.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}

// Treasure chest: walk up to it and it bursts open with loot.
export class Chest {
  constructor(game, x, z, table, luck = 0) {
    this.game = game;
    this.table = table;
    this.luck = luck;
    this.opened = false;
    this.alive = true;
    this.t = 0;
    const m = buildChestModel();
    this.model = m;
    this.root = m.group;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = Math.random() * Math.PI * 2;
    this.pos = this.root.position;
    this.beam = makeBeam(0xffcc33, 5);
    this.root.add(this.beam);
    game.scene.add(this.root);
    game.particles.burst(x, 0.5, z, { count: 16, colors: [0xffcc33, 0xffffff], speed: 3, up: 4, size: 0.15 });
  }

  update(dt) {
    this.t += dt;
    const g = this.game;
    if (this.opened) {
      this.model.lid.rotation.x += (-1.9 - this.model.lid.rotation.x) * Math.min(1, dt * 10);
      return;
    }
    this.root.position.y = Math.abs(Math.sin(this.t * 3)) * 0.06;
    const p = g.player;
    if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.8) this.open();
  }

  open() {
    const g = this.game;
    this.opened = true;
    this.root.position.y = 0;
    this.root.remove(this.beam);
    g.sfx.play('chest');
    g.shake(0.15);
    g.particles.burst(this.pos.x, 0.9, this.pos.z, { count: 30, colors: [0xffcc33, 0xffee88, 0xffffff], speed: 4, up: 5, size: 0.14 });
    g.lootBurst(this.pos.x, this.pos.z, g.buildLoot(this.table, this.luck), 0.8);
  }

  dispose() {
    this.game.scene.remove(this.root);
    for (const m of this.model.mats) m.dispose();
  }
}

// Glowing voxel portal that takes you to the next floor.
export class Portal {
  constructor(game, x, z) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    this.pos = this.root.position;
    this.t = 0;
    const dark = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 2.4), new THREE.MeshBasicMaterial({ color: 0x0a0014 }));
    dark.position.y = 0.03;
    this.root.add(dark);
    this.ring = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xaa55ff });
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), mat);
      b.position.set(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4);
      this.ring.add(b);
    }
    this.ring.position.y = 0.3;
    this.root.add(this.ring);
    game.scene.add(this.root);
  }

  update(dt) {
    this.t += dt;
    this.ring.rotation.y += dt * 1.5;
    this.ring.children.forEach((b, i) => {
      b.position.y = Math.sin(this.t * 3 + i) * 0.25;
      b.rotation.x += dt * 3;
    });
    if (Math.random() < dt * 20) {
      const a = Math.random() * Math.PI * 2;
      this.game.particles.burst(this.pos.x + Math.cos(a) * 1.2, 0.2, this.pos.z + Math.sin(a) * 1.2, {
        count: 1, colors: [0xaa55ff, 0xff88ff, 0x6622cc], speed: 0.5, up: 3, gravity: -2, size: 0.12, life: 1,
      });
    }
    const p = this.game.player;
    return Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.2;
  }

  dispose() {
    this.game.scene.remove(this.root);
  }
}
