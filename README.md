# Voxel Dungeon

DEMO https://rbreve.github.io/voxeldungeoun/

A first-person voxel shooter with procedurally generated, Binding of Isaac–style dungeon floors.
Walk into a room and the doors slam shut. A random number and mix of monsters spawn in, and the
doors only reopen once they're all dead. Find the boss room, kill the boss, take the portal down
to the next floor, which is bigger and harder.

Uses plain JavaScript and Three.js (vendored in `vendor/`, so it runs offline). No build step.

## Run

```bash
npm start          # or: node serve.js 8080
# open http://localhost:8080
```

You need a local server because browsers block ES modules on `file://`. `serve.js` is a tiny
static server with no dependencies. `python3 -m http.server` also works.

## Game modes

Pick a mode on the title screen. The game remembers your last choice.

| Mode | Rules |
|---|---|
| **Two Guns** (default) | Unlimited ammo, so ammo never drops. You carry **2 weapons**. Keys **1** and **2** (or wheel / Q) switch between them. Stand on a weapon and press **E** to swap it for the one in your hands; your old weapon drops on the floor. An empty slot fills automatically. |
| **Classic** | Collect every weapon and manage ammo. Number keys select weapons, and pressing one again cycles weapons that share the slot. |

Modes live in `config.js` under `modes`. You can change `defaultMode`, set `autoSwap: true` to swap
just by walking over a weapon, change `maxWeapons` (3 guns? 1 gun?) or `swapKey`, or add your own mode.
The toolbar at the bottom of the screen shows your weapons with their icons and rarity colors.

## Controls

| Key | Action |
|---|---|
| WASD / arrows | move |
| Mouse | look |
| Left click | shoot (hold for automatic weapons) |
| 1–6 / mouse wheel | switch weapon (Two Guns: 1 / 2 pick your slots) |
| E | swap the weapon you're standing on for your current one (Two Guns) |
| Q | previous weapon |
| Shift | sprint |
| Space | jump |
| Esc | pause |

## Loot

- **Monsters** can drop pickups and, rarely, weapons. Drop chances grow each floor.
- **Cleared rooms** spray loot from their center and may spawn a **treasure chest**. Walk up to a
  chest and it bursts open.
- **Treasure rooms** hold a weapon on a pedestal, a power-up and a chest.
- **Bosses** explode into a loot fountain: health, armor, ammo, power-ups and 2–3 weapons.
- **Weapon rarity** (Common / Rare / Epic / Legendary) boosts damage and fire rate. Dropped weapons
  show a colored light beam and a name label. Picking up a higher rarity of a weapon you already
  own upgrades it. Deeper floors, chests and bosses roll better rarities.

## Tuning: `config.js`

Everything gameplay-related is in **`config.js`**. Edit it and reload the page.

| Section | What it controls |
|---|---|
| `seed` | fixed number = same dungeon every run, `null` = random |
| `modes` / `defaultMode` | game modes: unlimited ammo, weapon carry limit, swap key, auto-swap, starting weapons |
| `player` | health, armor, speed, jump, mouse sensitivity, starting weapons/ammo |
| `ammo` | ammo types and their max carry |
| `weapons` | damage, fire rate, pellets, spread, hitscan vs projectile, splash, pierce, bouncing grenades, minigun spin-up, knockback, ammo use |
| `monsters` | health, speed, damage, attack type (melee / ranged / explode), projectiles, spawn weight, first floor, drops, splitting, boss specials and summons |
| `pickups` | health packs, armor, ammo boxes, power packs (quad damage, haste, rapid fire, invulnerability, regen) |
| `loot` | monster drop chances, room-clear loot, chest chance and contents, boss loot explosion, per-floor growth |
| `rarities` | weapon rarity tiers: weight, damage and fire-rate multipliers, beam color |
| `dungeon` | room count per floor, room sizes, alley width and bends, loops, pillars, treasure rooms |
| `rooms` | monsters per room (min/max + growth per floor), spawn delay, boss minions |
| `difficulty` | monster health, damage and speed scaling per floor |
| `graphics` / `audio` | FOV, fog, lighting, color palettes, volume |

### Adding a monster

```js
// in CONFIG.monsters
ghoul: {
  name: 'Ghoul', model: 'humanoid', scale: 1.2,
  colors: { body: 0x445566, head: 0x8899aa, limbs: 0x334455, eyes: 0x00ffff },
  health: 80, speed: 4, damage: 15,
  attack: 'melee', attackRange: 1.6, attackCooldown: 1,
  spawnWeight: 5, minFloor: 2, score: 20, dropChance: 0.2,
},
```

Available models are `humanoid`, `spider`, `bat` and `slime`. Setting `boss: true` makes the
monster appear only in boss rooms.

### Adding a weapon

Pick a `slot` (weapons can share one) and a `model`: `pistol`, `shotgun`, `supershotgun`, `smg`,
`minigun`, `plasma`, `rocket`, `grenade` or `railgun`. Drops pick weapons by `dropWeight`.

## Project layout

```
config.js          all tunable game data
index.html         page shell, HUD markup and CSS
serve.js           zero-dependency dev server
src/main.js        game loop, room encounters, spawning, drops, floors
src/dungeon.js     procedural generation (room graph → tiles, alleys, pillars)
src/level.js       voxel meshes, collision, ray casts, pathfinding flow field, doors
src/player.js      movement, weapons, firing, power-ups, viewmodel
src/monsters.js    monster AI, attacks, boss specials
src/voxel.js       voxel model templates (monsters, weapons, pickups)
src/effects.js     particles, tracers, projectiles
src/pickups.js     pickups (loot physics, beams, labels), chests, next-floor portal
src/hud.js         HUD, weapon toolbar, prompts, minimap
src/icons.js       renders weapon icons for the toolbar
src/audio.js       synthesized sound effects (WebAudio, no asset files)
```
