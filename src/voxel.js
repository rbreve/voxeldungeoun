import * as THREE from 'three';

// Voxel model templates. Every model is built from boxes so the whole game
// keeps a consistent chunky look. Monster models return animation handles.

const boxGeoCache = new Map();
function boxGeo(w, h, d) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = boxGeoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxGeoCache.set(key, g);
  }
  return g;
}

function box(parent, w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ===================================================================== MONSTERS
// Returns { root, inner, parts, mats, height, radius }
// `inner` is scaled by def.scale; root is positioned/rotated by the monster.
export function buildMonsterModel(def) {
  const c = def.colors || {};
  const body = c.body ?? 0x888888;
  const mats = [];
  const lambert = (hex) => {
    const m = new THREE.MeshLambertMaterial({ color: hex ?? body });
    mats.push(m);
    return m;
  };
  const M = {
    body: lambert(c.body),
    head: lambert(c.head),
    limbs: lambert(c.limbs),
    dark: lambert(0x1a1a1a),
    eyes: new THREE.MeshBasicMaterial({ color: c.eyes ?? 0xff0000 }),
  };
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const s = def.scale ?? 1;
  inner.scale.setScalar(s);
  const parts = {};
  let height, radius;

  switch (def.model) {
    case 'spider': {
      box(inner, 0.95, 0.45, 1.1, M.body, 0, 0.55, -0.1);
      box(inner, 0.7, 0.2, 0.8, M.limbs, 0, 0.82, -0.15); // back plate
      const head = box(inner, 0.6, 0.42, 0.45, M.head, 0, 0.55, 0.62);
      box(head, 0.12, 0.1, 0.02, M.eyes, -0.15, 0.06, 0.23);
      box(head, 0.12, 0.1, 0.02, M.eyes, 0.15, 0.06, 0.23);
      box(head, 0.07, 0.07, 0.02, M.eyes, -0.05, 0.14, 0.23);
      box(head, 0.07, 0.07, 0.02, M.eyes, 0.05, 0.14, 0.23);
      box(head, 0.08, 0.2, 0.08, M.dark, -0.12, -0.2, 0.2); // fangs
      box(head, 0.08, 0.2, 0.08, M.dark, 0.12, -0.2, 0.2);
      parts.legs = [];
      for (let i = 0; i < 3; i++) {
        for (const side of [-1, 1]) {
          const p = pivot(inner, side * 0.45, 0.6, 0.3 - i * 0.38);
          const upper = box(p, 0.7, 0.12, 0.12, M.limbs, side * 0.35, 0.18, 0);
          upper.rotation.z = side * 0.5;
          box(p, 0.12, 0.7, 0.12, M.limbs, side * 0.72, -0.12, 0);
          p.userData = { side, phase: i * 2.1 + (side > 0 ? Math.PI : 0) };
          parts.legs.push(p);
        }
      }
      height = 1.0;
      radius = 0.65;
      break;
    }
    case 'bat': {
      const bodyM = box(inner, 0.45, 0.42, 0.45, M.body, 0, 0, 0);
      const head = box(inner, 0.38, 0.32, 0.32, M.head, 0, 0.25, 0.18);
      box(head, 0.1, 0.22, 0.08, M.limbs, -0.12, 0.24, 0); // ears
      box(head, 0.1, 0.22, 0.08, M.limbs, 0.12, 0.24, 0);
      box(head, 0.08, 0.08, 0.02, M.eyes, -0.09, 0.03, 0.17);
      box(head, 0.08, 0.08, 0.02, M.eyes, 0.09, 0.03, 0.17);
      box(head, 0.05, 0.1, 0.04, M.dark, -0.05, -0.14, 0.15);
      box(head, 0.05, 0.1, 0.04, M.dark, 0.05, -0.14, 0.15);
      parts.wingL = pivot(inner, -0.22, 0.1, 0);
      parts.wingR = pivot(inner, 0.22, 0.1, 0);
      box(parts.wingL, 0.55, 0.05, 0.5, M.limbs, -0.28, 0, 0);
      box(parts.wingL, 0.4, 0.05, 0.35, M.limbs, -0.75, 0, -0.05);
      box(parts.wingR, 0.55, 0.05, 0.5, M.limbs, 0.28, 0, 0);
      box(parts.wingR, 0.4, 0.05, 0.35, M.limbs, 0.75, 0, -0.05);
      parts.body = bodyM;
      height = 0.8;
      radius = 0.5;
      inner.position.y = 0.3 * s; // pivot around its middle
      break;
    }
    case 'slime': {
      const blob = pivot(inner, 0, 0, 0);
      box(blob, 1.0, 0.8, 1.0, M.body, 0, 0.4, 0);
      box(blob, 0.8, 0.15, 0.8, M.body, 0, 0.87, 0);
      box(blob, 0.16, 0.2, 0.04, M.eyes, -0.22, 0.52, 0.51);
      box(blob, 0.16, 0.2, 0.04, M.eyes, 0.22, 0.52, 0.51);
      box(blob, 0.4, 0.08, 0.04, M.dark, 0, 0.28, 0.51);
      parts.blob = blob;
      height = 0.95;
      radius = 0.55;
      break;
    }
    case 'humanoid':
    default: {
      parts.legL = pivot(inner, -0.18, 0.8, 0);
      parts.legR = pivot(inner, 0.18, 0.8, 0);
      box(parts.legL, 0.26, 0.8, 0.28, M.limbs, 0, -0.4, 0);
      box(parts.legR, 0.26, 0.8, 0.28, M.limbs, 0, -0.4, 0);
      box(inner, 0.72, 0.72, 0.42, M.body, 0, 1.15, 0);
      box(inner, 0.74, 0.1, 0.44, M.dark, 0, 0.82, 0); // belt
      parts.armL = pivot(inner, -0.48, 1.45, 0);
      parts.armR = pivot(inner, 0.48, 1.45, 0);
      box(parts.armL, 0.22, 0.72, 0.24, M.limbs, 0, -0.32, 0);
      box(parts.armR, 0.22, 0.72, 0.24, M.limbs, 0, -0.32, 0);
      box(parts.armL, 0.24, 0.16, 0.26, M.head, 0, -0.7, 0); // hands
      box(parts.armR, 0.24, 0.16, 0.26, M.head, 0, -0.7, 0);
      const head = pivot(inner, 0, 1.78, 0);
      box(head, 0.52, 0.52, 0.52, M.head, 0, 0, 0);
      box(head, 0.12, 0.08, 0.02, M.eyes, -0.12, 0.04, 0.265);
      box(head, 0.12, 0.08, 0.02, M.eyes, 0.12, 0.04, 0.265);
      box(head, 0.24, 0.05, 0.02, M.dark, 0, -0.12, 0.265); // mouth
      if (def.horns) {
        const h1 = box(head, 0.1, 0.35, 0.1, M.dark, -0.2, 0.38, 0);
        const h2 = box(head, 0.1, 0.35, 0.1, M.dark, 0.2, 0.38, 0);
        h1.rotation.z = 0.35;
        h2.rotation.z = -0.35;
      }
      parts.head = head;
      height = 2.05;
      radius = 0.42;
    }
  }

  return { root, inner, parts, mats, height: height * s, radius: radius * s };
}

// Animate a monster model. `walk` is a phase accumulator, `attack` 0..1 pulse.
export function animateMonster(model, def, time, walk, moving, attack) {
  const p = model.parts;
  const swing = moving ? Math.sin(walk) : 0;
  switch (def.model) {
    case 'spider':
      for (const leg of p.legs) {
        const { side, phase } = leg.userData;
        leg.rotation.y = moving ? Math.sin(walk * 1.5 + phase) * 0.35 : 0;
        leg.rotation.z = moving ? Math.max(0, Math.cos(walk * 1.5 + phase)) * 0.25 * side : 0;
      }
      model.inner.rotation.x = -attack * 0.4;
      break;
    case 'bat': {
      const flap = Math.sin(time * 18) * 0.7;
      p.wingL.rotation.z = flap;
      p.wingR.rotation.z = -flap;
      model.inner.rotation.x = attack * 0.6;
      break;
    }
    case 'slime': {
      const b = moving ? Math.abs(Math.sin(walk * 0.8)) : 0.3 + Math.sin(time * 3) * 0.1;
      p.blob.scale.set(1 + (0.3 - b * 0.3) * 0.5, 0.8 + b * 0.35 + attack * 0.3, 1 + (0.3 - b * 0.3) * 0.5);
      break;
    }
    default:
      p.legL.rotation.x = swing * 0.7;
      p.legR.rotation.x = -swing * 0.7;
      p.armL.rotation.x = -swing * 0.5 - attack * 2.2;
      p.armR.rotation.x = swing * 0.5 - attack * 2.2;
      p.head.rotation.y = Math.sin(time * 1.3) * 0.15;
  }
}

// ===================================================================== WEAPONS
// Weapon models point down -Z (camera forward). Returns { group, muzzle, spinner }.
export function buildWeaponModel(def) {
  const col = def.colors || {};
  const body = new THREE.MeshLambertMaterial({ color: col.body ?? 0x555555 });
  const accent = new THREE.MeshLambertMaterial({ color: col.accent ?? 0x222222 });
  const glow = new THREE.MeshBasicMaterial({ color: col.glow ?? 0xffcc66 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  g.add(muzzle);
  let spinner = null;

  switch (def.model) {
    case 'supershotgun':
      box(g, 0.075, 0.075, 0.46, accent, -0.04, 0.03, -0.15);
      box(g, 0.075, 0.075, 0.46, accent, 0.04, 0.03, -0.15);
      box(g, 0.17, 0.03, 0.05, glow, 0, 0.03, -0.38); // hot muzzle band
      box(g, 0.16, 0.12, 0.16, body, 0, 0.0, 0.14);   // breech
      box(g, 0.1, 0.13, 0.26, wood, 0, -0.05, 0.32);  // stock
      box(g, 0.07, 0.15, 0.07, wood, 0, -0.13, 0.17); // grip
      muzzle.position.set(0, 0.03, -0.4);
      break;
    case 'minigun': {
      box(g, 0.16, 0.16, 0.28, body, 0, 0, 0.08);           // motor housing
      box(g, 0.05, 0.1, 0.18, accent, 0, 0.13, 0.06);       // carry handle
      box(g, 0.12, 0.1, 0.12, accent, 0.0, -0.12, 0.1);     // ammo feed
      spinner = new THREE.Group();
      spinner.position.set(0, 0, -0.1);
      g.add(spinner);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        box(spinner, 0.03, 0.03, 0.5, accent, Math.cos(a) * 0.055, Math.sin(a) * 0.055, -0.2);
      }
      box(spinner, 0.15, 0.15, 0.03, body, 0, 0, -0.1);
      box(spinner, 0.15, 0.15, 0.03, body, 0, 0, -0.4);
      box(g, 0.04, 0.04, 0.04, glow, 0, 0.1, 0.18);
      muzzle.position.set(0, 0, -0.56);
      break;
    }
    case 'grenade':
      box(g, 0.15, 0.15, 0.34, body, 0, 0.02, -0.18);       // fat barrel
      box(g, 0.1, 0.1, 0.02, new THREE.MeshBasicMaterial({ color: 0x050505 }), 0, 0.02, -0.355);
      box(g, 0.2, 0.2, 0.16, accent, 0, -0.01, 0.04);       // drum
      for (let i = 0; i < 3; i++) box(g, 0.21, 0.03, 0.03, glow, 0, 0.05 - i * 0.06, 0.04);
      box(g, 0.07, 0.14, 0.08, accent, 0, -0.14, 0.12);     // grip
      box(g, 0.08, 0.1, 0.22, body, 0, -0.02, 0.24);        // stock
      muzzle.position.set(0, 0.02, -0.37);
      break;
    case 'shotgun':
      box(g, 0.055, 0.055, 0.62, accent, -0.03, 0.03, -0.22);
      box(g, 0.055, 0.055, 0.62, accent, 0.03, 0.03, -0.22);
      box(g, 0.12, 0.08, 0.2, body, 0, -0.03, -0.26); // pump
      box(g, 0.12, 0.12, 0.22, accent, 0, 0.0, 0.08);  // receiver
      box(g, 0.1, 0.14, 0.3, wood, 0, -0.04, 0.3);     // stock
      box(g, 0.06, 0.14, 0.07, wood, 0, -0.12, 0.12);  // grip
      muzzle.position.set(0, 0.03, -0.55);
      break;
    case 'smg':
      box(g, 0.09, 0.12, 0.36, body, 0, 0, -0.05);
      box(g, 0.04, 0.04, 0.18, accent, 0, 0.02, -0.32);
      box(g, 0.05, 0.2, 0.07, accent, 0, -0.14, -0.08); // mag
      box(g, 0.06, 0.12, 0.07, body, 0, -0.1, 0.07);    // grip
      box(g, 0.05, 0.05, 0.22, accent, 0, 0.0, 0.22);   // stock
      box(g, 0.03, 0.03, 0.03, glow, 0, 0.08, -0.02);   // sight
      muzzle.position.set(0, 0.02, -0.42);
      break;
    case 'plasma':
      box(g, 0.15, 0.15, 0.46, body, 0, 0, -0.06);
      box(g, 0.09, 0.09, 0.12, accent, 0, 0, -0.34);
      for (let i = 0; i < 3; i++) box(g, 0.17, 0.04, 0.05, glow, 0, 0.04, -0.2 + i * 0.1);
      box(g, 0.06, 0.06, 0.03, glow, 0, 0, -0.405);
      box(g, 0.07, 0.14, 0.08, accent, 0, -0.13, 0.08);
      muzzle.position.set(0, 0, -0.42);
      break;
    case 'rocket':
      box(g, 0.18, 0.18, 0.8, body, 0, 0.04, -0.1);
      box(g, 0.22, 0.22, 0.06, accent, 0, 0.04, -0.5);
      box(g, 0.22, 0.22, 0.06, accent, 0, 0.04, 0.3);
      box(g, 0.13, 0.13, 0.02, glow, 0, 0.04, -0.535);
      box(g, 0.06, 0.14, 0.08, accent, 0, -0.1, -0.05);
      box(g, 0.05, 0.08, 0.14, accent, 0.1, 0.12, -0.1); // scope
      muzzle.position.set(0, 0.04, -0.55);
      break;
    case 'railgun':
      box(g, 0.1, 0.12, 0.6, body, 0, 0, -0.1);
      box(g, 0.03, 0.03, 0.72, glow, -0.06, 0.05, -0.2);
      box(g, 0.03, 0.03, 0.72, glow, 0.06, 0.05, -0.2);
      box(g, 0.14, 0.05, 0.05, accent, 0, 0.05, -0.5);
      box(g, 0.06, 0.14, 0.08, accent, 0, -0.12, 0.1);
      box(g, 0.08, 0.08, 0.2, accent, 0, -0.02, 0.28);
      muzzle.position.set(0, 0.03, -0.58);
      break;
    case 'pistol':
    default:
      box(g, 0.08, 0.08, 0.3, body, 0, 0.02, -0.1);
      box(g, 0.07, 0.16, 0.08, accent, 0, -0.09, 0.02);
      box(g, 0.02, 0.03, 0.02, glow, 0, 0.075, -0.22);
      muzzle.position.set(0, 0.02, -0.27);
  }
  return { group: g, muzzle, spinner };
}

// ===================================================================== PICKUPS
export function buildPickupModel(def) {
  const g = new THREE.Group();
  const c = def.color ?? 0xffffff;
  const main = new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 });
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2 });
  const s = def.scale ?? 1;
  switch (def.model) {
    case 'cross':
      box(g, 0.6, 0.6, 0.25, white);
      box(g, 0.5, 0.16, 0.27, main);
      box(g, 0.16, 0.5, 0.27, main);
      break;
    case 'shield':
      box(g, 0.6, 0.55, 0.18, main);
      box(g, 0.44, 0.2, 0.2, main, 0, -0.35, 0);
      box(g, 0.2, 0.15, 0.22, main, 0, -0.5, 0);
      box(g, 0.12, 0.5, 0.2, white, 0, -0.05, 0.01);
      break;
    case 'box':
      box(g, 0.55, 0.4, 0.4, main);
      box(g, 0.57, 0.08, 0.42, new THREE.MeshLambertMaterial({ color: 0x222222 }), 0, 0.1, 0);
      break;
    case 'gem': {
      const core = new THREE.MeshBasicMaterial({ color: c });
      const facet = new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.5 });
      const top = box(g, 0.34, 0.34, 0.34, facet);
      top.rotation.set(Math.PI / 4, 0, Math.PI / 4);
      box(g, 0.14, 0.14, 0.14, core, 0.08, 0.1, 0.12); // sparkle
      break;
    }
    case 'orb':
    default: {
      const core = new THREE.MeshBasicMaterial({ color: c });
      box(g, 0.4, 0.4, 0.4, core).rotation.set(0.6, 0.6, 0);
      const shell = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, depthWrite: false });
      box(g, 0.7, 0.7, 0.7, shell);
    }
  }
  g.scale.setScalar(s);
  return g;
}

// Treasure chest with a hinged lid. Returns { group, lid }.
export function buildChestModel() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a4a22 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x4a2a12 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xffcc33, emissive: 0xaa7700, emissiveIntensity: 0.4 });
  box(g, 1.3, 0.7, 0.9, wood, 0, 0.35, 0);
  box(g, 1.34, 0.1, 0.94, dark, 0, 0.05, 0);
  box(g, 0.1, 0.72, 0.94, gold, -0.5, 0.36, 0);
  box(g, 0.1, 0.72, 0.94, gold, 0.5, 0.36, 0);
  const lid = pivot(g, 0, 0.7, -0.45);
  box(lid, 1.3, 0.3, 0.9, wood, 0, 0.15, 0.45);
  box(lid, 0.1, 0.32, 0.94, gold, -0.5, 0.15, 0.45);
  box(lid, 0.1, 0.32, 0.94, gold, 0.5, 0.15, 0.45);
  box(lid, 0.22, 0.26, 0.08, gold, 0, -0.02, 0.92); // lock
  return { group: g, lid, mats: [wood, dark, gold] };
}
