// =====================================================================
//  VOXEL DUNGEON — GAME CONFIG
// ---------------------------------------------------------------------
//  Everything tunable lives here. Edit, save, reload the page.
//
//  Units:  colors are hex (0xRRGGBB), times are seconds, speeds are
//          world-units per second. One floor tile = dungeon.tileSize units.
//          The player is ~1.7 units tall.
//
//  Adding content:
//    - New monster  -> add an entry to `monsters` (pick a `model` template).
//    - New weapon   -> add an entry to `weapons` (pick a `model` template,
//                      give it a free `slot` number 1-9).
//    - New pickup   -> add an entry to `pickups` (type health/armor/ammo/power).
//  Keys (e.g. 'grunt', 'shotgun') are internal ids used to reference entries.
// =====================================================================

export const CONFIG = {
  // Set to a number to get the same dungeon every time, null = random.
  seed: null,

  // -------------------------------------------------------------------
  //  GAME MODES (picked on the title screen)
  //  unlimitedAmmo: no ammo is used and ammo never drops
  //  maxWeapons:    how many weapons you can carry (0 = no limit). When full,
  //                 stand on a weapon and press swapKey to trade your current
  //                 one for it (the old one drops on the floor). Keys 1..N
  //                 select inventory slots.
  //  autoSwap:      swap just by walking over a weapon (no key press)
  //  startWeapons:  overrides player.startWeapons for this mode. Use 'random'
  //                 for a random weapon from `weapons`.
  // -------------------------------------------------------------------
  defaultMode: 'duo',
  modes: {
    classic: {
      name: 'Classic',
      description: 'Collect every weapon. Manage your ammo.',
      unlimitedAmmo: false, maxWeapons: 0,
    },
    duo: {
      name: 'Two Guns',
      description: 'Unlimited ammo. Carry only two weapons, swap for better ones.',
      unlimitedAmmo: true, maxWeapons: 2, swapKey: 'KeyE', autoSwap: false,
      startWeapons: ['random'],
    },
  },

  // -------------------------------------------------------------------
  //  PLAYER
  // -------------------------------------------------------------------
  player: {
    maxHealth: 100,
    startHealth: 100,
    maxArmor: 100,
    startArmor: 0,
    armorAbsorb: 0.6,          // fraction of incoming damage armor soaks up
    moveSpeed: 7,
    sprintMultiplier: 1.45,    // hold Shift
    jumpVelocity: 7.5,
    gravity: 24,
    radius: 0.45,
    eyeHeight: 1.6,
    mouseSensitivity: 0.0022,
    invulnAfterHit: 0.3,       // i-frames after taking damage
    startWeapons: ['pistol'],
    startAmmo: { bullets: 50, shells: 8, rockets: 0, cells: 0, grenades: 0 },
  },

  // Ammo pools shared by weapons.
  ammo: {
    bullets: { name: 'Bullets', max: 300 },
    shells:  { name: 'Shells',  max: 50 },
    rockets: { name: 'Rockets', max: 25 },
    cells:   { name: 'Cells',   max: 250 },
    grenades:{ name: 'Grenades',max: 40 },
  },

  // -------------------------------------------------------------------
  //  WEAPONS
  //  model:        'pistol' | 'shotgun' | 'supershotgun' | 'smg' | 'minigun' |
  //                'plasma' | 'rocket' | 'grenade' | 'railgun'
  //  slot:         number key. Weapons may share a slot: pressing the key
  //                again cycles between them (Doom style).
  //  damage:       per pellet / projectile
  //  fireRate:     shots per second
  //  auto:         hold mouse to keep firing
  //  pellets:      projectiles per shot (shotguns)
  //  spreadDeg:    random cone in degrees
  //  ammoType:     key in `ammo`, or null for infinite
  //  hitscan:      true = instant ray, false = uses `projectile`
  //  pierce:       hitscan passes through all monsters in line
  //  spinUp:       seconds to reach full fire rate while holding the trigger (minigun)
  //  projectile:   { speed, size, color, splashRadius, splashDamage, selfDamageScale,
  //                  gravity, bounce (0-1), fuse (seconds), explodeOnHit }
  //  knockback:    pushes monsters back
  //  pickupAmmo:   ammo granted when you pick up this weapon
  //  dropWeight:   relative chance to appear as a weapon pickup (0 = never)
  // -------------------------------------------------------------------
  weapons: {
    pistol: {
      name: 'Pistol', slot: 1, model: 'pistol',
      colors: { body: 0x5a606e, accent: 0x2a2a30, glow: 0xffdd66 },
      damage: 22, fireRate: 3.5, auto: false,
      pellets: 1, spreadDeg: 0.6,
      ammoType: null, ammoPerShot: 0,
      hitscan: true, range: 80,
      recoil: 0.05, knockback: 1.5,
      sound: 'pistol', dropWeight: 0,
    },
    shotgun: {
      name: 'Shotgun', slot: 2, model: 'shotgun',
      colors: { body: 0x6b4a2b, accent: 0x3a3a40, glow: 0xffaa44 },
      damage: 11, fireRate: 1.25, auto: false,
      pellets: 9, spreadDeg: 7,
      ammoType: 'shells', ammoPerShot: 1,
      hitscan: true, range: 40,
      recoil: 0.16, knockback: 5,
      pickupAmmo: 10, sound: 'shotgun', dropWeight: 10,
    },
    supershotgun: {
      name: 'Super Shotgun', slot: 2, model: 'supershotgun',
      colors: { body: 0x4a2e1a, accent: 0x1e1e22, glow: 0xff9933 },
      damage: 12, fireRate: 0.85, auto: false,
      pellets: 18, spreadDeg: 11,
      ammoType: 'shells', ammoPerShot: 2,
      hitscan: true, range: 32,
      recoil: 0.3, knockback: 9,
      pickupAmmo: 12, sound: 'supershotgun', dropWeight: 6,
    },
    smg: {
      name: 'SMG', slot: 3, model: 'smg',
      colors: { body: 0x33363d, accent: 0x777c88, glow: 0xffee88 },
      damage: 9, fireRate: 12, auto: true,
      pellets: 1, spreadDeg: 3.2,
      ammoType: 'bullets', ammoPerShot: 1,
      hitscan: true, range: 70,
      recoil: 0.03, knockback: 0.6,
      pickupAmmo: 80, sound: 'smg', dropWeight: 10,
    },
    minigun: {
      name: 'Minigun', slot: 3, model: 'minigun',
      colors: { body: 0x3a3d44, accent: 0x9aa0aa, glow: 0xffee66 },
      damage: 8, fireRate: 22, auto: true, spinUp: 0.6,
      pellets: 1, spreadDeg: 4.5,
      ammoType: 'bullets', ammoPerShot: 1,
      hitscan: true, range: 70,
      recoil: 0.015, knockback: 0.8,
      pickupAmmo: 120, sound: 'smg', dropWeight: 4,
    },
    plasma: {
      name: 'Plasma Rifle', slot: 4, model: 'plasma',
      colors: { body: 0x2c3e66, accent: 0x9aa6c0, glow: 0x44ddff },
      damage: 20, fireRate: 9, auto: true,
      pellets: 1, spreadDeg: 1.5,
      ammoType: 'cells', ammoPerShot: 1,
      hitscan: false,
      projectile: { speed: 42, size: 0.18, color: 0x44ddff, splashRadius: 0, splashDamage: 0 },
      recoil: 0.025, knockback: 1,
      pickupAmmo: 80, sound: 'plasma', dropWeight: 7,
    },
    rocket: {
      name: 'Rocket Launcher', slot: 5, model: 'rocket',
      colors: { body: 0x4a5a3a, accent: 0x222222, glow: 0xff7722 },
      damage: 50, fireRate: 1.1, auto: false,
      pellets: 1, spreadDeg: 0,
      ammoType: 'rockets', ammoPerShot: 1,
      hitscan: false,
      projectile: { speed: 24, size: 0.3, color: 0xff7722, splashRadius: 4.5, splashDamage: 100, selfDamageScale: 0.35 },
      recoil: 0.2, knockback: 8,
      pickupAmmo: 6, sound: 'rocket', dropWeight: 5,
    },
    grenade: {
      name: 'Grenade Launcher', slot: 5, model: 'grenade',
      colors: { body: 0x3e5a2a, accent: 0x2a2a2a, glow: 0x99ff44 },
      damage: 35, fireRate: 1.6, auto: false,
      pellets: 1, spreadDeg: 0,
      ammoType: 'grenades', ammoPerShot: 1,
      hitscan: false,
      projectile: {
        speed: 19, size: 0.3, color: 0x66aa33, up: 0.18,
        gravity: 20, bounce: 0.55, fuse: 1.8, explodeOnHit: true,
        splashRadius: 4.8, splashDamage: 120, selfDamageScale: 0.35,
      },
      recoil: 0.14, knockback: 6,
      pickupAmmo: 8, sound: 'grenade', dropWeight: 7,
    },
    railgun: {
      name: 'Railgun', slot: 6, model: 'railgun',
      colors: { body: 0x2a2f2a, accent: 0x55ff99, glow: 0x66ff99 },
      damage: 160, fireRate: 0.85, auto: false,
      pellets: 1, spreadDeg: 0,
      ammoType: 'cells', ammoPerShot: 12,
      hitscan: true, pierce: true, range: 120, trailColor: 0x66ff99,
      recoil: 0.22, knockback: 6,
      pickupAmmo: 60, sound: 'railgun', dropWeight: 3,
    },
  },

  // -------------------------------------------------------------------
  //  MONSTERS
  //  model:             'humanoid' | 'spider' | 'bat' | 'slime'
  //  colors:            { body, head, limbs, eyes } (missing keys fall back to body)
  //  scale:             model size multiplier (hitbox scales too)
  //  attack:            'melee' | 'ranged' | 'explode'
  //  attackRange:       melee reach / max shooting distance / explode trigger distance
  //  attackCooldown:    seconds between attacks
  //  preferredDistance: ranged monsters try to keep this distance
  //  projectile:        { speed, damage, size, color, count, spreadDeg } for ranged
  //  flying/flyHeight:  hovers above ground
  //  splitInto/splitCount: spawns these monsters on death
  //  spawnWeight:       relative chance to appear in normal rooms (0 = never)
  //  minFloor:          first floor this monster can appear on
  //  dropChance:        chance to drop a random pickup on death
  //  gems:              [min, max] gems dropped on death (default: loot.monsterGems)
  //  boss:              only appears in boss rooms
  //  special:           boss ring attack { count, cooldown, projectile }
  //  summon:            boss summons { monster, count, cooldown }
  // -------------------------------------------------------------------
  monsters: {
    grunt: {
      name: 'Grunt', model: 'humanoid', scale: 1.0,
      colors: { body: 0x4f7a3a, head: 0x86c060, limbs: 0x3a5a2a, eyes: 0xff2200 },
      health: 45, speed: 3.6, damage: 12,
      attack: 'melee', attackRange: 1.5, attackCooldown: 0.9,
      spawnWeight: 10, minFloor: 1, score: 10, dropChance: 0.15,
    },
    imp: {
      name: 'Imp', model: 'humanoid', scale: 0.85,
      colors: { body: 0x8a2a1a, head: 0xc0442a, limbs: 0x5a1a10, eyes: 0xffee00 },
      health: 35, speed: 3.2, damage: 10,
      attack: 'ranged', attackRange: 24, attackCooldown: 1.9, preferredDistance: 9,
      projectile: { speed: 13, damage: 10, size: 0.28, color: 0xff5522, count: 1, spreadDeg: 0 },
      spawnWeight: 8, minFloor: 1, score: 15, dropChance: 0.2,
    },
    bat: {
      name: 'Bat', model: 'bat', scale: 0.9,
      colors: { body: 0x3a2a4a, head: 0x4a3a5a, limbs: 0x2a1a3a, eyes: 0xff3355 },
      health: 16, speed: 6.5, damage: 6,
      attack: 'melee', attackRange: 1.3, attackCooldown: 0.8,
      flying: true, flyHeight: 2.0, erratic: 1.0,
      spawnWeight: 7, minFloor: 1, score: 8, dropChance: 0.08,
    },
    spider: {
      name: 'Spider', model: 'spider', scale: 1.0,
      colors: { body: 0x2a2a2a, head: 0x3a3a3a, limbs: 0x1a1a1a, eyes: 0x33ff33 },
      health: 28, speed: 6.2, damage: 8,
      attack: 'melee', attackRange: 1.4, attackCooldown: 0.7,
      spawnWeight: 6, minFloor: 1, score: 10, dropChance: 0.1,
    },
    slime: {
      name: 'Slime', model: 'slime', scale: 1.3,
      colors: { body: 0x44cc55, eyes: 0x113311 },
      health: 70, speed: 2.6, damage: 12,
      attack: 'melee', attackRange: 1.6, attackCooldown: 1.0,
      splitInto: 'slimelet', splitCount: 3,
      spawnWeight: 5, minFloor: 2, score: 15, dropChance: 0.1, gems: [1, 2],
    },
    slimelet: {
      name: 'Slimelet', model: 'slime', scale: 0.6,
      colors: { body: 0x66ee77, eyes: 0x113311 },
      health: 15, speed: 4.2, damage: 5,
      attack: 'melee', attackRange: 1.1, attackCooldown: 0.8,
      spawnWeight: 0, minFloor: 1, score: 4, dropChance: 0.03, gems: [1, 1],
    },
    tick: {
      name: 'Tick', model: 'spider', scale: 0.8,
      colors: { body: 0xaa2211, head: 0xff5522, limbs: 0x551100, eyes: 0xffff00 },
      health: 20, speed: 5.5, damage: 0,
      attack: 'explode', attackRange: 1.8, attackCooldown: 0,
      explodeRadius: 3.6, explodeDamage: 35, fuse: 0.55,
      spawnWeight: 4, minFloor: 2, score: 12, dropChance: 0.1,
    },
    brute: {
      name: 'Brute', model: 'humanoid', scale: 1.6,
      colors: { body: 0x6a5a4a, head: 0x9a8a6a, limbs: 0x4a3a2a, eyes: 0xff6600 },
      health: 230, speed: 2.5, damage: 28,
      attack: 'melee', attackRange: 2.3, attackCooldown: 1.3,
      spawnWeight: 3, minFloor: 2, score: 40, dropChance: 0.5, gems: [2, 3],
    },
    warlock: {
      name: 'Warlock', model: 'humanoid', scale: 1.1,
      colors: { body: 0x3a2a6a, head: 0xd8d8c8, limbs: 0x2a1a4a, eyes: 0x66ffff },
      health: 70, speed: 2.8, damage: 9,
      attack: 'ranged', attackRange: 26, attackCooldown: 2.2, preferredDistance: 11,
      projectile: { speed: 11, damage: 9, size: 0.25, color: 0x66ffff, count: 3, spreadDeg: 14 },
      spawnWeight: 4, minFloor: 3, score: 30, dropChance: 0.35, gems: [1, 2],
    },

    // ----- BOSSES -----
    demonLord: {
      name: 'Demon Lord', model: 'humanoid', scale: 2.7, horns: true, boss: true,
      colors: { body: 0x6a0a0a, head: 0xaa2222, limbs: 0x3a0505, eyes: 0xffff00 },
      health: 900, speed: 2.7, damage: 30,
      attack: 'ranged', attackRange: 40, attackCooldown: 1.5, preferredDistance: 9,
      projectile: { speed: 14, damage: 14, size: 0.45, color: 0xff3300, count: 5, spreadDeg: 32 },
      special: { count: 18, cooldown: 5, projectile: { speed: 10, damage: 12, size: 0.4, color: 0xff9900 } },
      summon: { monster: 'bat', count: 3, cooldown: 11 },
      minFloor: 1, score: 500, dropChance: 1,
    },
    broodMother: {
      name: 'Brood Mother', model: 'spider', scale: 3.2, boss: true,
      colors: { body: 0x2a1a2a, head: 0x4a2a4a, limbs: 0x1a0a1a, eyes: 0xff00ff },
      health: 1100, speed: 3.6, damage: 25,
      attack: 'ranged', attackRange: 36, attackCooldown: 1.8, preferredDistance: 7,
      projectile: { speed: 15, damage: 12, size: 0.4, color: 0xcc44ff, count: 3, spreadDeg: 20 },
      special: { count: 12, cooldown: 6, projectile: { speed: 9, damage: 10, size: 0.35, color: 0xff66ff } },
      summon: { monster: 'spider', count: 4, cooldown: 9 },
      minFloor: 2, score: 600, dropChance: 1,
    },
  },

  // -------------------------------------------------------------------
  //  PICKUPS
  //  type:  'health' | 'armor' | 'ammo' | 'power' | 'gem'
  //  model: 'cross' | 'shield' | 'box' | 'orb' | 'gem'
  //  gems:  `value` is added to your gem count and score. Gems are chosen
  //         with their own dropWeight whenever the loot tables ask for a gem.
  //  power effects: 'damage' (multiplier), 'speed' (multiplier),
  //                 'fireRate' (multiplier), 'invulnerable', 'regen' (amount/sec)
  //  dropWeight: relative chance when a random pickup drops (0 = never random)
  // -------------------------------------------------------------------
  pickups: {
    health_small: { name: '+20 Health', type: 'health', amount: 20, model: 'cross', color: 0xff3344, scale: 0.7, dropWeight: 10 },
    health_large: { name: '+50 Health', type: 'health', amount: 50, model: 'cross', color: 0xff1133, scale: 1.1, dropWeight: 3 },
    armor:        { name: '+50 Armor',  type: 'armor',  amount: 50, model: 'shield', color: 0x3399ff, scale: 1.0, dropWeight: 3 },
    ammo_bullets: { name: 'Bullets',    type: 'ammo', ammoType: 'bullets', amount: 40, model: 'box', color: 0xddbb33, scale: 0.8, dropWeight: 6 },
    ammo_shells:  { name: 'Shells',     type: 'ammo', ammoType: 'shells',  amount: 8,  model: 'box', color: 0xdd5522, scale: 0.8, dropWeight: 6 },
    ammo_rockets: { name: 'Rockets',    type: 'ammo', ammoType: 'rockets', amount: 4,  model: 'box', color: 0x668833, scale: 0.9, dropWeight: 3 },
    ammo_cells:   { name: 'Cells',      type: 'ammo', ammoType: 'cells',   amount: 40, model: 'box', color: 0x33ccff, scale: 0.8, dropWeight: 4 },
    ammo_grenades:{ name: 'Grenades',   type: 'ammo', ammoType: 'grenades',amount: 5,  model: 'box', color: 0x66aa33, scale: 0.85, dropWeight: 4 },

    gem_ruby:     { name: 'Ruby',     type: 'gem', value: 10,  model: 'gem', color: 0xff2244, scale: 0.55, dropWeight: 10 },
    gem_emerald:  { name: 'Emerald',  type: 'gem', value: 25,  model: 'gem', color: 0x22ff66, scale: 0.6,  dropWeight: 5 },
    gem_sapphire: { name: 'Sapphire', type: 'gem', value: 50,  model: 'gem', color: 0x3377ff, scale: 0.65, dropWeight: 2.5 },
    gem_amethyst: { name: 'Amethyst', type: 'gem', value: 100, model: 'gem', color: 0xbb44ff, scale: 0.7,  dropWeight: 1 },
    gem_diamond:  { name: 'Diamond',  type: 'gem', value: 250, model: 'gem', color: 0xeeffff, scale: 0.8,  dropWeight: 0.3 },

    power_damage: { name: 'QUAD DAMAGE',     type: 'power', effect: 'damage',   multiplier: 3,   duration: 12, model: 'orb', color: 0xaa44ff, dropWeight: 1 },
    power_speed:  { name: 'HASTE',           type: 'power', effect: 'speed',    multiplier: 1.6, duration: 15, model: 'orb', color: 0xffee33, dropWeight: 1 },
    power_rapid:  { name: 'RAPID FIRE',      type: 'power', effect: 'fireRate', multiplier: 2,   duration: 12, model: 'orb', color: 0xff8833, dropWeight: 1 },
    power_shield: { name: 'INVULNERABILITY', type: 'power', effect: 'invulnerable',              duration: 8,  model: 'orb', color: 0xffffff, dropWeight: 0.6 },
    power_regen:  { name: 'REGENERATION',    type: 'power', effect: 'regen',    amount: 6,       duration: 15, model: 'orb', color: 0x44ff66, dropWeight: 1 },
  },

  // -------------------------------------------------------------------
  //  LOOT
  //  [min, max] pairs are inclusive random ranges. Counts are multiplied by
  //  (1 + countPerFloor * (floor - 1)) so deeper floors are more generous.
  // -------------------------------------------------------------------
  loot: {
    amount: 1.0,                   // master multiplier for all loot counts & drop chances (0.5 = half)
    countPerFloor: 0.1,
    // Every monster: its own dropChance + this bonus per floor
    monsterDropBonusPerFloor: 0.01,
    monsterDropScale: 0.5,         // multiplies every monster's own dropChance
    monsterGems: [1, 1],           // gems dropped by EVERY kill (a monster can override with `gems: [min, max]`)
    monsterWeaponChance: 0,        // chance any kill drops a weapon (weapons come from room clears)
    // Cleared rooms spray loot from the room center. `weapons: [1, 1]` = always one weapon.
    roomClear: { drops: [0, 1], gems: [0, 2], weapons: [1, 1] },
    chestChance: 0.15,             // chance a cleared normal room spawns a chest
    chest: { drops: [1, 3], gems: [2, 4], weapons: [0, 1], powerUps: [0, 1], luck: 0.5 },
    treasureRoomChest: true,       // treasure rooms also get a chest
    // Diablo-style loot explosion when a boss dies (a monster can override
    // this with its own `loot: {...}` entry).
    boss: { drops: [3, 5], gems: [8, 12], weapons: [1, 2], healthPacks: [1, 2], powerUps: [1, 1], armor: [0, 1], luck: 2 },
    burstDuration: 1.2,            // seconds for a big loot fountain to finish
    gemMagnetRadius: 3.5,          // gems fly to you inside this distance
  },

  // Weapon drops roll a rarity. Higher tiers deal more damage and fire faster.
  // Picking up a better rarity of a weapon you own upgrades it.
  // Luck multiplies each tier's weight by (1 + luck) ^ tierIndex.
  rarities: {
    common:    { name: 'Common',    color: 0xdddddd, weight: 60, damage: 1.0,  fireRate: 1.0 },
    rare:      { name: 'Rare',      color: 0x4499ff, weight: 28, damage: 1.25, fireRate: 1.05 },
    epic:      { name: 'Epic',      color: 0xbb44ff, weight: 10, damage: 1.55, fireRate: 1.15 },
    legendary: { name: 'Legendary', color: 0xff8800, weight: 2,  damage: 2.0,  fireRate: 1.3 },
  },
  rarityLuckPerFloor: 0.2,

  // -------------------------------------------------------------------
  //  DUNGEON GENERATION
  // -------------------------------------------------------------------
  dungeon: {
    tileSize: 2,             // world units per tile
    wallHeight: 5,
    gridSize: 9,             // rooms are laid out on a gridSize x gridSize map
    cellTiles: 30,           // tiles per grid cell (room + alley space); keep >= biggest room + 5
    baseRoomCount: 7,        // rooms on floor 1
    roomsPerFloor: 2,        // extra rooms each floor
    maxRoomCount: 20,
    roomMinTiles: 13,        // room width/depth range (in tiles)
    roomMaxTiles: 22,
    bossRoomTiles: 25,
    startRoomTiles: 12,
    treasureRoomTiles: 12,
    corridorWidth: 2,        // alley width in tiles
    bendChance: 0.65,        // chance an alley zig-zags instead of going straight
    loopChance: 0.15,        // chance to add extra connections (loops)
    pillarChance: 0.55,      // chance a normal room gets pillars
    maxPillars: 10,
    treasureRooms: 1,        // rooms with a weapon + power-up, no monsters
  },

  // -------------------------------------------------------------------
  //  ROOM ENCOUNTERS
  // -------------------------------------------------------------------
  rooms: {
    minMonsters: 2,          // per normal room on floor 1
    maxMonsters: 5,
    monstersPerFloor: 1,     // added to min & max each floor
    maxMonstersCap: 16,
    spawnDelay: 0.9,         // seconds monsters take to materialize
    minSpawnDistance: 6,     // from player, in world units
    bossMinions: 2,          // extra regular monsters in boss rooms
    healthPackChance: 1,     // chance a normal room already has health packs lying around
    healthPacksPerRoom: [1, 2],
    treasurePowerUp: true,   // treasure rooms also contain a random power-up
    alleyMonsters: [2, 4],   // monsters lurking in the alleys on floor 1
    alleyMonstersPerFloor: 1,// added to min & max each floor
    alleyWakeRadius: 14,     // they wake when they see you this close (or get shot)
  },

  // Per-floor scaling applied to monsters (floor 1 = x1.0).
  difficulty: {
    healthPerFloor: 0.2,
    damagePerFloor: 0.1,
    speedPerFloor: 0.03,
  },

  // -------------------------------------------------------------------
  //  VISUALS / AUDIO
  // -------------------------------------------------------------------
  graphics: {
    fov: 75,
    fogColor: 0x07060a,
    fogNear: 6,
    fogFar: 70,
    ambientLight: 0.7,
    torchIntensity: 60,      // light carried by the player
    torchDistance: 36,
    pixelRatio: 1,           // lower (e.g. 0.6) for chunkier look / more FPS
    palette: {
      roomFloor:   [0x4a4238, 0x534a3e, 0x443c33],
      alleyFloor:  [0x33302c, 0x3a3631, 0x2e2b27],
      wall:        [0x5b5550, 0x66605a, 0x4f4a45, 0x57514c], // used if wallThemes is empty
      // Each floor picks one of these at random for its walls.
      wallThemes: {
        gray:  [0x5a5a5e, 0x65656a, 0x4e4e52, 0x58585c],
        green: [0x4a5a44, 0x55664c, 0x42503c, 0x4e5e46],
        brown: [0x6a5440, 0x75604a, 0x5e4a38, 0x664f3c],
      },
      ceiling:     [0x1e1c1a, 0x23201e],
      pillar:      [0x6e6258, 0x5e5349],
      door:        0x8a2a1a,
      bossFloor:   [0x4a2222, 0x552828, 0x3e1c1c],
      treasureFloor:[0x4a4422, 0x55502a, 0x3e3a1c],
    },
  },

  audio: {
    volume: 0.35,
  },
};
