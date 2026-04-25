import { lobbyEvents } from './lobby.js';
import { view, clear, drawPlayer, drawBullet } from './renderer.js';
import { keys, mouse, bindMouse } from './input.js';
import { LocalPlayer } from './localPlayer.js';
import { RemotePlayer } from './remotePlayer.js';
import { Bullet } from './bullet.js';
import { CHARACTERS, ABILITIES } from './characters.js';
import { WEAPONS, LOADOUTS } from './weapons.js';
import { net, sendState, sendShoot, sendHit, sendAbility } from './network.js';

// ── Lobby říká: hra začíná ────────────────────
lobbyEvents.onGameStart = (data, lobbyState) => {
  startGame(data, lobbyState);
};

let me = null;
let bullets = [];
let loadout = null;
let activeSlot = 'primary';
let running = false;
let stateInterval = null;

function startGame(data, lobbyState) {
  bindMouse(view.canvas);

  net.selfId = lobbyState.selfId;
  net.world  = data.world;
  net.remotes = {};
  bullets = [];

  // najdi sebe a ostatní v datech ze serveru
  for (const p of data.players) {
    const character = CHARACTERS[p.character] || CHARACTERS.soldier;
    if (p.id === net.selfId) {
      me = new LocalPlayer(p.x, p.y, character);
      me.name = p.name;
      loadout = LOADOUTS[character.loadout];
    } else {
      const remote = new RemotePlayer({
        ...p, color: character.color, maxHp: character.maxHp,
      });
      remote.name = p.name;
      remote.character = character;
      net.remotes[p.id] = remote;
    }
  }

  // hooks
  net.onShoot = (d) => {
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
  };
  net.onAbility = (d) => {
    const remote = net.remotes[d.id];
    if (!remote) return;
    if (d.type === 'shield')       remote.shieldUntil    = Date.now() + 3000;
    if (d.type === 'invisibility') remote.invisibleUntil = Date.now() + 4000;
  };
  net.onCorrection = (d) => {
    if (d.x !== undefined)  me.x  = d.x;
    if (d.y !== undefined)  me.y  = d.y;
    if (d.hp !== undefined) me.hp = d.hp;
  };

  if (stateInterval) clearInterval(stateInterval);
  stateInterval = setInterval(() => sendState(me), 50);

  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
}

// ── Vstupy ────────────────────────────────────
function readInput() {
  return {
    up:    !!keys['w'],
    down:  !!keys['s'],
    left:  !!keys['a'],
    right: !!keys['d'],
  };
}

function tryShoot() {
  if (!me || !mouse.down || me.fireCooldown > 0) return;
  const weaponName = loadout[activeSlot];
  const w = WEAPONS[weaponName];
  if (!w) return;
  for (let i = 0; i < w.pellets; i++) {
    const a = me.angle + (Math.random() - 0.5) * w.spread;
    bullets.push(new Bullet({
      x: me.x, y: me.y, angle: a,
      speed: w.bulletSpeed, life: w.bulletLife,
      damage: w.damage, ownerId: net.selfId,
    }));
  }
  sendShoot(me, weaponName);
  me.fireCooldown = w.fireRate;
}

function checkBulletHits() {
  for (const b of bullets) {
    if (b.dead || b.ownerId === net.selfId) continue;
    const d = Math.hypot(b.x - me.x, b.y - me.y);
    if (d < 18) {
      b.dead = true;
      if (Date.now() < me.shieldUntil) continue;
      me.hp = Math.max(0, me.hp - b.damage);
      sendHit(b.damage);
    }
  }
}

function tryAbility() {
  if (!me || me.abilityCooldown > 0) return;
  const ability = me.character.ability;
  if (!ability) return;
  const handler = ABILITIES[ability.id];
  if (handler) handler(me);
  sendAbility(ability.id, { x: me.x, y: me.y, angle: me.angle });
  me.abilityCooldown = ability.cooldown;
}

// klávesy pro slot a abilitu
addEventListener('keydown', (e) => {
  if (!running) return;
  if (e.key === '1') activeSlot = 'primary';
  if (e.key === '2') activeSlot = 'secondary';
  if (e.key === '3') activeSlot = 'grenade';
  if (e.key.toLowerCase() === 'q') tryAbility();
});

// ── Game loop ─────────────────────────────────
const hud = document.getElementById('hud');
let last = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (me) {
    me.update(dt, readInput(), mouse, view.w, view.h);
    tryShoot();

    for (const id in net.remotes) net.remotes[id].update();

    for (const b of bullets) b.update(dt, view.w, view.h);
    checkBulletHits();
    for (let i = bullets.length - 1; i >= 0; i--) {
      if (bullets[i].dead) bullets.splice(i, 1);
    }

    clear();
    for (const id in net.remotes) drawPlayer(net.remotes[id], false);
    drawPlayer(me, true);
    for (const b of bullets) drawBullet(b);

    const ability = me.character.ability;
    const cdTxt = me.abilityCooldown > 0 ? me.abilityCooldown.toFixed(1) + 's' : 'připraveno';
    hud.textContent =
      `HP ${Math.round(me.hp)}/${me.maxHp}  |  ` +
      `Slot: ${activeSlot} (${loadout[activeSlot]})  |  ` +
      `${ability.id}: ${cdTxt}  |  ` +
      `Hráči: ${1 + Object.keys(net.remotes).length}`;
  }

  requestAnimationFrame(loop);
}