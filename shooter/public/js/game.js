// GAME — všechno pro hru samotnou
import { CHARACTERS, ABILITIES } from './characters.js';
import { WEAPONS, LOADOUTS } from './weapons.js';
import { LocalPlayer } from './localPlayer.js';
import { RemotePlayer } from './remotePlayer.js';
import { Bullet } from './bullet.js';

export function initGame({ session, showScreen }) {
  const socket = session.socket;

  // ── Canvas ────────────────────────────────────
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const view = { w: canvas.width, h: canvas.height };
  const hud = document.getElementById('hud');

  // ── Stav ──────────────────────────────────────
  const keys = {};
  const mouse = { x: 0, y: 0, down: false };

  let me = null;
  let remotes = {};
  let bullets = [];
  let loadout = null;
  let activeSlot = 'primary';
  let stateInterval = null;
  let running = false;

  // ── Input ─────────────────────────────────────
  addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    keys[e.key.toLowerCase()] = true;

    if (!me) return;
    if (e.key === '1') activeSlot = 'primary';
    if (e.key === '2') activeSlot = 'secondary';
    if (e.key === '3') activeSlot = 'grenade';
    if (e.key.toLowerCase() === 'q') tryAbility();
  });

  addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  canvas.addEventListener('mouseup',   () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('selectstart', (e) => e.preventDefault());

  // ── Network ──────────────────────────────────
  socket.on('player:left', (id) => {
    delete remotes[id];
  });

  socket.on('game:state', (s) => {
    const r = remotes[s.id];
    if (r) r.pushSnapshot(s);
  });

  socket.on('game:shoot', (d) => {
    const w = WEAPONS[d.weapon];
    if (!w) return;
    for (let i = 0; i < w.pellets; i++) {
      const a = d.angle + (Math.random() - 0.5) * w.spread;
      bullets.push(new Bullet({
        x: d.x, y: d.y, angle: a,
        speed: w.bulletSpeed, life: w.bulletLife,
        damage: w.damage, ownerId: d.ownerId,
      }));
    }
  });

  socket.on('game:ability', (d) => {
    const r = remotes[d.id];
    if (!r) return;
    if (d.type === 'shield')       r.shieldUntil    = Date.now() + 3000;
    if (d.type === 'invisibility') r.invisibleUntil = Date.now() + 4000;
  });

  socket.on('game:respawn', (d) => {
    if (!me) return;
    if (d.id === session.selfId) {
      me.x = d.x; me.y = d.y; me.hp = d.hp;
    } else if (remotes[d.id]) {
      remotes[d.id].pushSnapshot({ ...d, t: Date.now(), angle: 0 });
    }
  });

  // ── Start hry ────────────────────────────────
  function startGame(data) {
    session.selfId = socket.id;
    remotes = {};
    bullets = [];
    me = null;

    for (const p of data.players) {
      const character = CHARACTERS[p.character] || CHARACTERS.soldier;
      if (p.id === session.selfId) {
        me = new LocalPlayer(p.x, p.y, character);
        me.name = p.name;
        loadout = LOADOUTS[character.loadout] || LOADOUTS.soldier;
      } else {
        const r = new RemotePlayer({
          id: p.id, x: p.x, y: p.y, hp: p.hp,
          maxHp: character.maxHp, color: character.color,
        });
        r.name = p.name;
        remotes[p.id] = r;
      }
    }

    if (!me) {
      console.error('Nepodařilo se najít vlastního hráče!');
      return;
    }

    if (stateInterval) clearInterval(stateInterval);
    stateInterval = setInterval(() => {
      if (me) socket.emit('game:state', { x: me.x, y: me.y, angle: me.angle, hp: me.hp });
    }, 33); // 30 Hz

    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  // ── Akce ─────────────────────────────────────
  function readMovement() {
    return {
      up: !!keys['w'], down: !!keys['s'],
      left: !!keys['a'], right: !!keys['d'],
    };
  }

  function tryShoot() {
    if (!me || !mouse.down || me.fireCooldown > 0 || !loadout) return;
    const wn = loadout[activeSlot];
    const w = WEAPONS[wn];
    if (!w) return;
    for (let i = 0; i < w.pellets; i++) {
      const a = me.angle + (Math.random() - 0.5) * w.spread;
      bullets.push(new Bullet({
        x: me.x, y: me.y, angle: a,
        speed: w.bulletSpeed, life: w.bulletLife,
        damage: w.damage, ownerId: session.selfId,
      }));
    }
    socket.emit('game:shoot', { x: me.x, y: me.y, angle: me.angle, weapon: wn });
    me.fireCooldown = w.fireRate;
  }

  function checkBulletHits() {
    for (const b of bullets) {
      if (b.dead || b.ownerId === session.selfId) continue;
      if (Math.hypot(b.x - me.x, b.y - me.y) < 18) {
        b.dead = true;
        if (Date.now() < me.shieldUntil) continue;
        me.hp = Math.max(0, me.hp - b.damage);
        socket.emit('game:hit', { damage: b.damage });
      }
    }
  }

  function tryAbility() {
    if (!me || me.abilityCooldown > 0) return;
    const ab = me.character.ability;
    if (!ab) return;
    const handler = ABILITIES[ab.id];
    if (handler) handler(me);
    socket.emit('game:ability', { type: ab.id, payload: { x: me.x, y: me.y } });
    me.abilityCooldown = ab.cooldown;
  }

  // ── Render ───────────────────────────────────
  function clearCanvas() {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, view.w, view.h);
  }

  function drawPlayer(p, isSelf) {
    const inv = p.invisibleUntil && Date.now() < p.invisibleUntil;
    const sh  = p.shieldUntil    && Date.now() < p.shieldUntil;

    ctx.save();
    ctx.globalAlpha = inv ? (isSelf ? 0.35 : 0.1) : 1;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle || 0);
    ctx.fillStyle = isSelf ? '#4ecdc4' : (p.color || '#ff6b6b');
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(26, 0);
    ctx.stroke();
    ctx.restore();

    if (sh) {
      ctx.strokeStyle = '#7fd0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (p.name) {
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, p.x, p.y - 36);
    }

    const pct = Math.max(0, (p.hp || 0) / (p.maxHp || 100));
    ctx.fillStyle = '#000';
    ctx.fillRect(p.x - 22, p.y - 30, 44, 6);
    ctx.fillStyle = '#5ec85e';
    ctx.fillRect(p.x - 22, p.y - 30, 44 * pct, 6);
  }

  function drawBullet(b) {
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Game loop ────────────────────────────────
  let lastT = performance.now();

  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (me) {
      me.update(dt, readMovement(), mouse, view.w, view.h);
      tryShoot();

      for (const id in remotes) remotes[id].update();

      for (const b of bullets) b.update(dt, view.w, view.h);
      checkBulletHits();
      for (let i = bullets.length - 1; i >= 0; i--) {
        if (bullets[i].dead) bullets.splice(i, 1);
      }

      clearCanvas();
      for (const id in remotes) drawPlayer(remotes[id], false);
      drawPlayer(me, true);
      for (const b of bullets) drawBullet(b);

      const ab = me.character.ability;
      const cd = me.abilityCooldown > 0 ? me.abilityCooldown.toFixed(1) + 's' : 'připraveno';
      hud.textContent =
        `HP ${Math.round(me.hp)}/${me.maxHp} | ` +
        `Slot: ${activeSlot} (${loadout?.[activeSlot] || '?'}) | ` +
        `${ab.id}: ${cd} | Hráči: ${1 + Object.keys(remotes).length}`;
    }

    requestAnimationFrame(loop);
  }

  console.log('game.js loaded');
  return startGame;
}