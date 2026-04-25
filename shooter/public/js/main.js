// ═══════════════════════════════════════════════
// MAIN — entry point, koordinuje lobby a hru
// ═══════════════════════════════════════════════
import { CHARACTERS, ABILITIES } from './characters.js';
import { WEAPONS, LOADOUTS } from './weapons.js';
import { LocalPlayer } from './localPlayer.js';
import { RemotePlayer } from './remotePlayer.js';
import { Bullet } from './bullet.js';

// ── Socket.IO ────────────────────────────────
const socket = io();

const connStatus = document.getElementById('connStatus');
socket.on('connect',     () => { connStatus.textContent = 'připojeno'; connStatus.className = 'conn-status connected'; });
socket.on('disconnect',  () => { connStatus.textContent = 'odpojeno';  connStatus.className = 'conn-status disconnected'; });
socket.on('connect_error', (err) => { console.error('connect_error:', err); });

// ═══════════════════════════════════════════════
// OBRAZOVKY
// ═══════════════════════════════════════════════
const screens = {
  menu:  document.getElementById('menu'),
  lobby: document.getElementById('lobby'),
  game:  document.getElementById('game-screen'),
};

function showScreen(name) {
  for (const k in screens) {
    if (!screens[k]) continue;
    screens[k].classList.remove('active');
    screens[k].style.display = 'none';
  }
  if (name === 'menu')  screens.menu.style.display = 'flex';
  if (name === 'lobby') screens.lobby.classList.add('active');
  if (name === 'game')  screens.game.classList.add('active');
}

showScreen('menu');

// ═══════════════════════════════════════════════
// STAV
// ═══════════════════════════════════════════════
const session = {
  name: localStorage.getItem('shooter_name') || '',
  character: 'soldier',
  selfId: null,
  inGame: false,
};

// ═══════════════════════════════════════════════
// MENU
// ═══════════════════════════════════════════════
const nameInput = document.getElementById('nameInput');
const codeInput = document.getElementById('codeInput');
const createBtn = document.getElementById('createBtn');
const joinBtn   = document.getElementById('joinBtn');
const menuErr   = document.getElementById('menuErr');

nameInput.value = session.name;

nameInput.addEventListener('input', () => {
  session.name = nameInput.value.trim();
  localStorage.setItem('shooter_name', session.name);
});

function showMenuErr(text) { menuErr.textContent = text || ''; }

function validateName() {
  if (!session.name) { showMenuErr('Zadej jméno'); return false; }
  showMenuErr('');
  return true;
}

createBtn.addEventListener('click', () => {
  if (!validateName()) return;
  if (!socket.connected) { showMenuErr('Server není připojen, zkus za chvíli'); return; }
  createBtn.disabled = true;
  socket.emit('createRoom', { name: session.name, character: session.character }, (res) => {
    createBtn.disabled = false;
    if (!res?.ok) { showMenuErr(res?.error || 'Chyba'); return; }
    enterLobby();
  });
});

joinBtn.addEventListener('click', () => {
  if (!validateName()) return;
  const code = codeInput.value.trim().toUpperCase();
  if (!code) { showMenuErr('Zadej kód'); return; }
  if (!socket.connected) { showMenuErr('Server není připojen, zkus za chvíli'); return; }
  joinBtn.disabled = true;
  socket.emit('joinRoom', { code, name: session.name, character: session.character }, (res) => {
    joinBtn.disabled = false;
    if (!res?.ok) { showMenuErr(res?.error || 'Chyba'); return; }
    enterLobby();
  });
});

codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); joinBtn.click(); }
});

// ═══════════════════════════════════════════════
// LOBBY
// ═══════════════════════════════════════════════
const roomCodeEl   = document.getElementById('roomCode');
const playerListEl = document.getElementById('playerList');
const charGridEl   = document.getElementById('charGrid');
const readyBtn     = document.getElementById('readyBtn');
const startBtn     = document.getElementById('startBtn');
const leaveBtn     = document.getElementById('leaveBtn');
const lobbyErr     = document.getElementById('lobbyErr');
const chatLog      = document.getElementById('chatLog');
const chatInput    = document.getElementById('chatInput');

function enterLobby() {
  showScreen('lobby');
  renderCharGrid();
  chatLog.innerHTML = '';
  lobbyErr.textContent = '';
}

function renderCharGrid() {
  charGridEl.innerHTML = '';
  for (const id in CHARACTERS) {
    const c = CHARACTERS[id];
    const card = document.createElement('div');
    card.className = 'char-card' + (session.character === id ? ' selected' : '');
    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.style.color = c.color;
    nameEl.textContent = c.name;
    const abEl = document.createElement('div');
    abEl.className = 'ability';
    abEl.textContent = `HP ${c.maxHp} • ${c.ability.id}`;
    card.appendChild(nameEl);
    card.appendChild(abEl);
    card.addEventListener('click', () => {
      session.character = id;
      socket.emit('setCharacter', { character: id });
      renderCharGrid();
    });
    charGridEl.appendChild(card);
  }
}

socket.on('lobbyUpdate', (room) => {
  session.selfId = socket.id;
  roomCodeEl.textContent = room.code;
  renderPlayerList(room);
  updateActionButtons(room);
});

function renderPlayerList(room) {
  playerListEl.innerHTML = '';
  for (const p of room.players) {
    const c = CHARACTERS[p.character];
    const li = document.createElement('li');

    const dot = document.createElement('span');
    dot.className = 'dot' + (p.ready ? ' ready' : '');
    li.appendChild(dot);

    const nameEl = document.createElement('span');
    nameEl.className = 'name';
    nameEl.textContent = p.name;
    li.appendChild(nameEl);

    const charEl = document.createElement('span');
    charEl.className = 'char';
    charEl.style.color = c?.color || '#9ca3af';
    charEl.textContent = c?.name || p.character;
    li.appendChild(charEl);

    if (p.isHost) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'HOST';
      li.appendChild(badge);
    }
    playerListEl.appendChild(li);
  }
}

function updateActionButtons(room) {
  const me = room.players.find(p => p.id === socket.id);
  if (!me) return;

  if (me.isHost) {
    readyBtn.style.display = 'none';
    startBtn.style.display = '';
    const allReady = room.players.every(p => p.ready);
    startBtn.disabled = !allReady;
    startBtn.textContent = allReady ? 'Start hry' : 'Čeká se na ready...';
  } else {
    readyBtn.style.display = '';
    startBtn.style.display = 'none';
    readyBtn.textContent = me.ready ? '✓ Ready' : 'Ready';
    readyBtn.classList.toggle('is-ready', me.ready);
  }
}

readyBtn.addEventListener('click', () => socket.emit('toggleReady'));
startBtn.addEventListener('click', () => socket.emit('startGame'));
leaveBtn.addEventListener('click', () => location.reload());
socket.on('startError', (msg) => { lobbyErr.textContent = msg; });

roomCodeEl.addEventListener('click', () => {
  navigator.clipboard?.writeText(roomCodeEl.textContent).catch(() => {});
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim()) {
    e.preventDefault();
    socket.emit('chat', { text: chatInput.value });
    chatInput.value = '';
  }
});

socket.on('chat', ({ from, text }) => {
  const line = document.createElement('div');
  line.className = 'msg';
  const fromEl = document.createElement('span');
  fromEl.className = 'from';
  fromEl.textContent = from + ': ';
  line.appendChild(fromEl);
  line.appendChild(document.createTextNode(text));
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
});

// ═══════════════════════════════════════════════
// HRA
// ═══════════════════════════════════════════════
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { canvas, ctx, w: canvas.width, h: canvas.height };
const hud = document.getElementById('hud');

const keys = {};
const mouse = { x: 0, y: 0, down: false };

let me = null;
let remotes = {};
let bullets = [];
let loadout = null;
let activeSlot = 'primary';
let stateInterval = null;
let gameRunning = false;

// ── input — globální, ale akce jen při hře ────
addEventListener('keydown', (e) => {
  const target = e.target;
  // ignoruj klávesy když píšeš do inputu / chatu
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  keys[e.key.toLowerCase()] = true;

  if (!gameRunning || !me) return;
  if (e.key === '1') activeSlot = 'primary';
  if (e.key === '2') activeSlot = 'secondary';
  if (e.key === '3') activeSlot = 'grenade';
  if (e.key.toLowerCase() === 'q') tryAbility();
});

addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// myš — jen na canvasu
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', () => { mouse.down = true; });
canvas.addEventListener('mouseup',   () => { mouse.down = false; });
canvas.addEventListener('selectstart', (e) => e.preventDefault());
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ── network handlery pro hru ──────────────────
socket.on('gameStart', (data) => {
  startGame(data);
});

socket.on('playerLeft', (id) => {
  delete remotes[id];
});

socket.on('playerState', (s) => {
  const r = remotes[s.id];
  if (r) r.pushSnapshot(s);
});

socket.on('shoot', (d) => {
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

socket.on('ability', (d) => {
  const remote = remotes[d.id];
  if (!remote) return;
  if (d.type === 'shield')       remote.shieldUntil    = Date.now() + 3000;
  if (d.type === 'invisibility') remote.invisibleUntil = Date.now() + 4000;
});

socket.on('respawn', (d) => {
  if (!me) return;
  if (d.id === session.selfId) {
    me.x = d.x; me.y = d.y; me.hp = d.hp;
  } else if (remotes[d.id]) {
    remotes[d.id].pushSnapshot({ ...d, t: Date.now(), angle: 0 });
  }
});

socket.on('correction', (d) => {
  if (!me) return;
  if (d.x !== undefined)  me.x  = d.x;
  if (d.y !== undefined)  me.y  = d.y;
  if (d.hp !== undefined) me.hp = d.hp;
});

// ── start hry ─────────────────────────────────
function startGame(data) {
  showScreen('game');
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
      const remote = new RemotePlayer({
        id: p.id, x: p.x, y: p.y, hp: p.hp,
        maxHp: character.maxHp, color: character.color,
      });
      remote.name = p.name;
      remotes[p.id] = remote;
    }
  }

  if (!me) {
    console.error('Nepodařilo se najít vlastního hráče v gameStart!');
    return;
  }

  if (stateInterval) clearInterval(stateInterval);
  stateInterval = setInterval(() => {
    if (me) socket.emit('state', { x: me.x, y: me.y, angle: me.angle, hp: me.hp });
  }, 50);

  if (!gameRunning) {
    gameRunning = true;
    requestAnimationFrame(loop);
  }
  session.inGame = true;
}

// ── herní funkce ──────────────────────────────
function readMovement() {
  return {
    up:    !!keys['w'],
    down:  !!keys['s'],
    left:  !!keys['a'],
    right: !!keys['d'],
  };
}

function tryShoot() {
  if (!me || !mouse.down || me.fireCooldown > 0) return;
  if (!loadout) return;
  const weaponName = loadout[activeSlot];
  const w = WEAPONS[weaponName];
  if (!w) return;
  for (let i = 0; i < w.pellets; i++) {
    const a = me.angle + (Math.random() - 0.5) * w.spread;
    bullets.push(new Bullet({
      x: me.x, y: me.y, angle: a,
      speed: w.bulletSpeed, life: w.bulletLife,
      damage: w.damage, ownerId: session.selfId,
    }));
  }
  socket.emit('shoot', { x: me.x, y: me.y, angle: me.angle, weapon: weaponName });
  me.fireCooldown = w.fireRate;
}

function checkBulletHits() {
  for (const b of bullets) {
    if (b.dead || b.ownerId === session.selfId) continue;
    const d = Math.hypot(b.x - me.x, b.y - me.y);
    if (d < 18) {
      b.dead = true;
      if (Date.now() < me.shieldUntil) continue;
      me.hp = Math.max(0, me.hp - b.damage);
      socket.emit('hit', { damage: b.damage });
    }
  }
}

function tryAbility() {
  if (!me || me.abilityCooldown > 0) return;
  const ability = me.character.ability;
  if (!ability) return;
  const handler = ABILITIES[ability.id];
  if (handler) handler(me);
  socket.emit('ability', { type: ability.id, payload: { x: me.x, y: me.y, angle: me.angle } });
  me.abilityCooldown = ability.cooldown;
}

// ── render funkce ─────────────────────────────
function clearCanvas() {
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, view.w, view.h);
}

function drawPlayer(p, isSelf = false) {
  const invisible = p.invisibleUntil && Date.now() < p.invisibleUntil;
  const shielded  = p.shieldUntil    && Date.now() < p.shieldUntil;

  ctx.save();
  ctx.globalAlpha = invisible ? (isSelf ? 0.35 : 0.1) : 1;
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

  if (shielded) {
    ctx.strokeStyle = '#7fd0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
    ctx.stroke();
  }

  // jméno nad hráčem
  if (p.name) {
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - 36);
  }

  // hp bar
  const hpPct = Math.max(0, (p.hp || 0) / (p.maxHp || 100));
  ctx.fillStyle = '#000';
  ctx.fillRect(p.x - 22, p.y - 30, 44, 6);
  ctx.fillStyle = '#5ec85e';
  ctx.fillRect(p.x - 22, p.y - 30, 44 * hpPct, 6);
}

function drawBullet(b) {
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

// ── game loop ─────────────────────────────────
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

    const ability = me.character.ability;
    const cdTxt = me.abilityCooldown > 0 ? me.abilityCooldown.toFixed(1) + 's' : 'připraveno';
    hud.textContent =
      `HP ${Math.round(me.hp)}/${me.maxHp}  |  ` +
      `Slot: ${activeSlot} (${loadout?.[activeSlot] || '?'})  |  ` +
      `${ability.id}: ${cdTxt}  |  ` +
      `Hráči: ${1 + Object.keys(remotes).length}`;
  }

  requestAnimationFrame(loop);
}