import { weaponIcon } from './icons.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + (c ?? 0xffffff).toString(16).padStart(6, '0');

// DOM heads-up display + Isaac-style minimap.
export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      hpFill: $('hp-fill'), hpText: $('hp-text'),
      arFill: $('ar-fill'), arText: $('ar-text'),
      weapon: $('weapon-name'), ammo: $('ammo'), toolbar: $('toolbar'), prompt: $('prompt'),
      floor: $('floor'), score: $('score'), gems: $('gems'),
      boss: $('bossbar'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      messages: $('messages'), powers: $('powers'),
      damage: $('damage'), flash: $('flash'), hit: $('hitmarker'),
      room: $('roominfo'),
    };
    this.map = $('minimap');
    this.ctx = this.map.getContext('2d');
    this.hitT = 0;
    this.dmgT = 0;
    this.flashT = 0;
    this.lastSlots = '';
    this.gemT = 0;
  }

  // Context prompt shown for the current frame only (e.g. "Press E to swap").
  prompt(html) {
    this.promptHtml = html;
  }

  gemPop() {
    this.gemT = 0.2;
  }

  message(text, color = '#fff', big = false) {
    const div = document.createElement('div');
    div.className = 'msg' + (big ? ' big' : '');
    div.textContent = text;
    div.style.color = color;
    this.el.messages.appendChild(div);
    setTimeout(() => div.classList.add('fade'), big ? 2200 : 1500);
    setTimeout(() => div.remove(), big ? 3000 : 2300);
    while (this.el.messages.children.length > 5) this.el.messages.firstChild.remove();
  }

  hitMarker() {
    this.hitT = 0.12;
  }

  damageFlash() {
    this.dmgT = 0.5;
  }

  flash(color) {
    this.el.flash.style.background = hex(color);
    this.flashT = 0.25;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const pc = g.cfg.player;
    const e = this.el;

    e.hpFill.style.width = Math.min(100, (100 * Math.max(0, p.hp)) / pc.maxHealth) + '%';
    e.hpText.textContent = Math.ceil(p.hp);
    e.hpFill.style.background = p.hp < pc.maxHealth * 0.3 ? '#ff3030' : '#e8423c';
    e.arFill.style.width = Math.min(100, (100 * p.armor) / pc.maxArmor) + '%';
    e.arText.textContent = Math.ceil(p.armor);

    const w = p.weaponDef();
    e.weapon.textContent = p.displayName();
    e.weapon.style.color = hex(p.rarityDef().color);
    e.ammo.textContent = w.ammoType && !p.unlimitedAmmo ? `${p.ammo[w.ammoType]} ${g.cfg.ammo[w.ammoType]?.name ?? w.ammoType}` : '∞';
    this.updateToolbar();
    if (this.promptHtml !== this.lastPrompt) {
      this.lastPrompt = this.promptHtml;
      e.prompt.innerHTML = this.promptHtml ?? '';
      e.prompt.style.display = this.promptHtml ? 'block' : 'none';
    }
    this.promptHtml = null;

    e.floor.textContent = `FLOOR ${g.floor}`;
    e.score.textContent = `SCORE ${g.score}  ·  KILLS ${g.kills}`;
    e.gems.textContent = `◆ ${g.gems}`;
    this.gemT = Math.max(0, this.gemT - dt);
    e.gems.style.transform = `scale(${1 + this.gemT * 1.5})`;
    const cur = g.currentRoom;
    if (cur && cur.locked) {
      const alive = g.monsters.filter((m) => m.alive && m.room === cur).length;
      e.room.textContent = `${alive} ${alive === 1 ? 'enemy' : 'enemies'} left`;
      e.room.style.display = 'block';
    } else e.room.style.display = 'none';

    // Boss bar
    const boss = g.monsters.find((m) => m.alive && m.def.boss);
    if (boss) {
      e.boss.style.display = 'block';
      e.bossName.textContent = boss.def.name;
      e.bossFill.style.width = (100 * Math.max(0, boss.hp)) / boss.maxHp + '%';
    } else e.boss.style.display = 'none';

    // Power-ups
    const pw = Object.values(p.powers);
    e.powers.innerHTML = pw
      .map((x) => `<div class="power" style="border-color:${hex(x.def.color)};color:${hex(x.def.color)}">${x.def.name}<span>${Math.ceil(x.remaining)}s</span>
        <i style="width:${(100 * x.remaining) / x.duration}%;background:${hex(x.def.color)}"></i></div>`)
      .join('');

    // Effects
    this.hitT -= dt;
    e.hit.style.opacity = this.hitT > 0 ? 1 : 0;
    this.dmgT = Math.max(0, this.dmgT - dt);
    const invul = p.power('invulnerable');
    e.damage.style.opacity = invul ? 0.35 : Math.min(1, this.dmgT * 1.6) + (p.hp < pc.maxHealth * 0.25 ? 0.25 : 0);
    e.damage.style.boxShadow = invul ? 'inset 0 0 120px 30px rgba(255,255,255,0.8)' : 'inset 0 0 140px 40px rgba(220,0,0,0.85)';
    this.flashT = Math.max(0, this.flashT - dt);
    e.flash.style.opacity = this.flashT * 0.8;

    this.drawMinimap();
  }

  // Bottom-center weapon bar. Limited modes show fixed slots (1..N) including
  // empty ones; classic shows every owned weapon with its slot key.
  updateToolbar() {
    const g = this.game;
    const p = g.player;
    const limit = p.maxWeapons;
    const key = [limit, p.current, ...p.owned.map((k) => k + p.rarity[k] + p.hasAmmoFor(k))].join('|');
    if (key === this.lastToolbar) return;
    this.lastToolbar = key;
    const slots = limit ? Array.from({ length: limit }, (_, i) => p.owned[i] ?? null) : p.owned;
    this.el.toolbar.classList.toggle('compact', slots.length > 4);
    this.el.toolbar.innerHTML = slots
      .map((k, i) => {
        const num = limit ? i + 1 : g.cfg.weapons[k].slot;
        if (!k) return `<div class="tslot emptyslot"><span class="key">${num}</span>empty</div>`;
        const d = g.cfg.weapons[k];
        const cls = ['tslot', k === p.current ? 'active' : '', p.hasAmmoFor(k) ? '' : 'noammo'].join(' ');
        const color = hex(p.rarityDef(k).color);
        const border = k === p.current ? '' : p.rarity[k] && p.rarity[k] !== 'common' ? `style="border-color:${color}88"` : '';
        return `<div class="${cls}" ${border}><span class="key">${num}</span><img src="${weaponIcon(k, d)}" alt="">
          <div class="tname" style="color:${color}">${p.displayName(k)}</div></div>`;
      })
      .join('');
  }

  drawMinimap() {
    const g = this.game;
    const d = g.dungeon;
    const ctx = this.ctx;
    const S = this.map.width;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, S, S);

    // Center the map on the explored area bounds.
    const known = d.rooms.filter((r) => r.known || r.visited);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of known) {
      minX = Math.min(minX, r.gx); maxX = Math.max(maxX, r.gx);
      minY = Math.min(minY, r.gy); maxY = Math.max(maxY, r.gy);
    }
    const span = Math.max(5, maxX - minX + 1, maxY - minY + 1);
    const cell = Math.floor((S - 16) / span);
    const ox = (S - (maxX - minX + 1) * cell) / 2 - minX * cell;
    const oy = (S - (maxY - minY + 1) * cell) / 2 - minY * cell;
    const pad = Math.max(2, Math.floor(cell * 0.14));

    // Connections
    ctx.strokeStyle = 'rgba(200,200,200,0.5)';
    ctx.lineWidth = Math.max(2, cell * 0.12);
    for (const r of known) {
      for (const id of r.links) {
        const o = d.rooms[id];
        if (!(o.known || o.visited) || id < r.id) continue;
        if (!r.visited && !o.visited) continue;
        ctx.beginPath();
        ctx.moveTo(ox + (r.gx + 0.5) * cell, oy + (r.gy + 0.5) * cell);
        ctx.lineTo(ox + (o.gx + 0.5) * cell, oy + (o.gy + 0.5) * cell);
        ctx.stroke();
      }
    }

    // Rooms
    for (const r of known) {
      const x = ox + r.gx * cell + pad, y = oy + r.gy * cell + pad, s = cell - pad * 2;
      const isCur = r === g.currentRoom;
      ctx.fillStyle = isCur ? '#ffffff' : r.visited ? (r.cleared ? '#8a8a8a' : '#a05050') : '#3c3c3c';
      ctx.fillRect(x, y, s, s);
      if (r.type === 'boss' || r.type === 'treasure' || r.type === 'start') {
        ctx.fillStyle = r.type === 'boss' ? '#ff2a2a' : r.type === 'treasure' ? '#ffd23a' : '#4aa3ff';
        const c = Math.max(3, s * 0.36);
        ctx.fillRect(x + (s - c) / 2, y + (s - c) / 2, c, c);
      }
    }

    // Player dot
    const lv = g.level;
    const p = g.player;
    const C = g.cfg.dungeon.cellTiles;
    const px = ox + (p.pos.x / lv.T / C) * cell;
    const py = oy + (p.pos.z / lv.T / C) * cell;
    ctx.fillStyle = '#39ff6a';
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2.5, cell * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#39ff6a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.sin(p.yaw) * cell * 0.3, py - Math.cos(p.yaw) * cell * 0.3);
    ctx.stroke();
  }
}
