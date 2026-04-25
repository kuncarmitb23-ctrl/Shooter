// GAME — handles the game itself
import { CHARACTERS, ABILITIES } from './characters.js';
import { WEAPONS, LOADOUTS } from './weapons.js';
import { LocalPlayer } from './localPlayer.js';
import { RemotePlayer } from './remotePlayer.js';
import { Bullet } from './bullet.js';

// ── Default keybinds ────────────────────────────
const DEFAULT_KEYBINDS = {
  moveUp:    'w',
  moveDown:  's',
  moveLeft:  'a',
  moveRight: 'd',
  weapon1:   '1',
  weapon2:   '2',
  weapon3:   '3',
  ability:   'q',
  chat:      'z',
};

const KEYBIND_LABELS = {
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  weapon1: 'Primary weapon',
  weapon2: 'Secondary weapon',
  weapon3: 'Grenade',
  ability: 'Ability',
  chat: 'Chat',
};

function loadKeybinds() {
  try {
    const saved = JSON.parse(localStorage.getItem('shooter_keybinds') || '{}');
    return { ...DEFAULT_KEYBINDS, ...saved };
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

function saveKeybinds(kb) {
  localStorage.setItem('shooter_keybinds', JSON.stringify(kb));
}

export function initGame({ session, showScreen }) {
  const socket = session.socket;

  // ── Canvas ────────────────────────────────────
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const view = { w: canvas.width, h: canvas.height };  // viewport (co vidíš)
  const world = { w: 960, h: 600 };                    // velikost světa (přepíše gameStart)
  const camera = { x: 0, y: 0 };                       // levý horní roh viewportu ve světě
  const hud = document.getElementById('hud');

  // ── In-game UI elementy ───────────────────────
  const chatLog       = document.getElementById('gameChatLog');
  const chatInput     = document.getElementById('gameChatInput');
  const gameChat      = document.getElementById('gameChat');
  const pauseOverlay  = document.getElementById('pauseOverlay');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const keybindsList  = document.getElementById('keybindsList');
  const resumeBtn     = document.getElementById('resumeBtn');
  const settingsBtn   = document.getElementById('settingsBtn');
  const backToLobbyBtn = document.getElementById('backToLobbyBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const resetKeybindsBtn = document.getElementById('resetKeybindsBtn');
  const scoreboardEl = document.getElementById('scoreboard');
  const scoreboardBody = document.getElementById('scoreboardBody');

  // ── Minimap ───────────────────────────────────
  const minimap = document.getElementById('minimap');
  const mctx = minimap.getContext('2d');
  const MINIMAP_SIZE = 180;

  // ── Stav ──────────────────────────────────────
  const keys = {};
  const mouse = { sx: 0, sy: 0, x: 0, y: 0, down: false };  // sx/sy = screen, x/y = world

  let me = null;
  let remotes = {};
  let bullets = [];
  let loadout = null;
  let activeSlot = 'primary';
  let stateInterval = null;
  let pingInterval = null;
  let running = false;

  // UI stav
  let chatOpen = false;
  let pauseOpen = false;
  let settingsOpen = false;
  let bindingKey = null;
  let scoreboardOpen = false;

  let keybinds = loadKeybinds();
  let scoreboardData = []; // poslední data od serveru
  let currentPing = 0;

  function isInputBlocked() {
    return chatOpen || pauseOpen || settingsOpen || bindingKey !== null;
  }

  // ── Input handler ─────────────────────────────
  addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;

    // 1) Rebinding mode
    if (bindingKey) {
      e.preventDefault();
      const newKey = e.key.toLowerCase();
      if (['shift', 'control', 'alt', 'meta'].includes(newKey)) return;
      if (newKey === 'escape') {
        bindingKey = null;
        renderKeybinds();
        return;
      }
      // odstranit konflikty
      for (const k in keybinds) {
        if (keybinds[k] === newKey && k !== bindingKey) {
          keybinds[k] = '';
        }
      }
      keybinds[bindingKey] = newKey;
      saveKeybinds(keybinds);
      bindingKey = null;
      renderKeybinds();
      return;
    }

    // 2) Chat input has focus
    if (chatInput && tag === 'INPUT' && e.target === chatInput) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (text) socket.emit('lobby:chat', { text });
        chatInput.value = '';
        closeChatInput();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        chatInput.value = '';
        closeChatInput();
      }
      return;
    }

    // 3) Other input element — do not block
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // 4) ESC opens/closes pause menu
    if (e.key === 'Escape') {
      e.preventDefault();
      if (settingsOpen) {
        closeSettings();
        openPause();
      } else {
        togglePause();
      }
      return;
    }

    // 4.5) TAB shows scoreboard while held
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!scoreboardOpen && me) {
        scoreboardOpen = true;
        renderScoreboard();
        scoreboardEl.classList.add('visible');
      }
      return;
    }

    // 5) Game keys — only when no overlay is open
    if (!me || isInputBlocked()) return;

    const k = e.key.toLowerCase();
    keys[k] = true;

    if (k === keybinds.weapon1) activeSlot = 'primary';
    if (k === keybinds.weapon2) activeSlot = 'secondary';
    if (k === keybinds.weapon3) activeSlot = 'grenade';
    if (k === keybinds.ability) tryAbility();
    if (k === keybinds.chat) {
      e.preventDefault();
      openChatInput();
    }
  });

  addEventListener('keyup', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      scoreboardOpen = false;
      scoreboardEl.classList.remove('visible');
      return;
    }
    keys[e.key.toLowerCase()] = false;
  });

  // safety: když se přepne tab v prohlížeči, vyčistit klávesy
  addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    if (scoreboardOpen) {
      scoreboardOpen = false;
      scoreboardEl.classList.remove('visible');
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    // CSS škálování — canvas může být zobrazen v jiné velikosti
    const sx = (e.clientX - r.left) * (canvas.width / r.width);
    const sy = (e.clientY - r.top) * (canvas.height / r.height);
    mouse.sx = sx;
    mouse.sy = sy;
    // world coords = screen + camera offset
    mouse.x = sx + camera.x;
    mouse.y = sy + camera.y;
  });
  canvas.addEventListener('mousedown', () => {
    if (isInputBlocked()) return;
    mouse.down = true;
  });
  canvas.addEventListener('mouseup',   () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('selectstart', (e) => e.preventDefault());

  // ── Chat UI ──────────────────────────────────
  function openChatInput() {
    chatOpen = true;
    gameChat.classList.add('active');
    setTimeout(() => chatInput.focus(), 0);
    for (const k in keys) keys[k] = false;
    mouse.down = false;
  }

  function closeChatInput() {
    chatOpen = false;
    gameChat.classList.remove('active');
    chatInput.blur();
  }

  function appendChatMessage(from, text) {
    const line = document.createElement('div');
    line.className = 'msg';
    const fromEl = document.createElement('span');
    fromEl.className = 'from';
    fromEl.textContent = from + ': ';
    line.appendChild(fromEl);
    line.appendChild(document.createTextNode(text));
    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;

    // remove old messages after fade animation (only when chat is not actively open)
    if (!chatOpen) {
      setTimeout(() => {
        if (line.parentNode && !chatOpen) line.remove();
      }, 6500);
    }
  }

  socket.on('lobby:chat', ({ from, text }) => {
    appendChatMessage(from, text);
  });

  // ── Scoreboard ────────────────────────────────
  function renderScoreboard() {
    scoreboardBody.innerHTML = '';
    // seřadit: nejvíc killů první, pak nejmíň deaths
    const sorted = [...scoreboardData].sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      return a.deaths - b.deaths;
    });
    for (const p of sorted) {
      const tr = document.createElement('tr');
      if (p.id === session.selfId) tr.className = 'me';

      const charData = CHARACTERS[p.character];

      const nameTd = document.createElement('td');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'pname';
      nameSpan.textContent = p.name;
      const charSpan = document.createElement('span');
      charSpan.className = 'pchar';
      charSpan.style.color = charData?.color || '#9ca3af';
      charSpan.textContent = charData?.name || p.character;
      nameTd.appendChild(nameSpan);
      nameTd.appendChild(document.createTextNode(' '));
      nameTd.appendChild(charSpan);
      tr.appendChild(nameTd);

      const killsTd = document.createElement('td');
      killsTd.className = 'col-num';
      killsTd.textContent = p.kills;
      tr.appendChild(killsTd);

      const deathsTd = document.createElement('td');
      deathsTd.className = 'col-num';
      deathsTd.textContent = p.deaths;
      tr.appendChild(deathsTd);

      const scoreTd = document.createElement('td');
      scoreTd.className = 'col-num';
      scoreTd.textContent = '0'; // pro budoucí score logic
      tr.appendChild(scoreTd);

      const pingTd = document.createElement('td');
      pingTd.className = 'col-num ' + (
        p.ping < 80 ? 'ping-good' :
        p.ping < 200 ? 'ping-mid' : 'ping-bad'
      );
      pingTd.textContent = p.ping + ' ms';
      tr.appendChild(pingTd);

      scoreboardBody.appendChild(tr);
    }
  }

  // ── Pause menu ────────────────────────────────
  function togglePause() {
    if (pauseOpen) closePause();
    else openPause();
  }

  function openPause() {
    pauseOpen = true;
    pauseOverlay.classList.add('visible');
    for (const k in keys) keys[k] = false;
    mouse.down = false;
  }

  function closePause() {
    pauseOpen = false;
    pauseOverlay.classList.remove('visible');
  }

  resumeBtn.addEventListener('click', closePause);
  settingsBtn.addEventListener('click', () => {
    closePause();
    openSettings();
  });
  backToLobbyBtn.addEventListener('click', () => {
    location.reload();
  });

  // ── Settings ─────────────────────────────────
  function openSettings() {
    settingsOpen = true;
    settingsOverlay.classList.add('visible');
    renderKeybinds();
  }

  function closeSettings() {
    settingsOpen = false;
    bindingKey = null;
    settingsOverlay.classList.remove('visible');
  }

  closeSettingsBtn.addEventListener('click', closeSettings);
  resetKeybindsBtn.addEventListener('click', () => {
    keybinds = { ...DEFAULT_KEYBINDS };
    saveKeybinds(keybinds);
    renderKeybinds();
  });

  function renderKeybinds() {
    keybindsList.innerHTML = '';
    for (const action in DEFAULT_KEYBINDS) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = KEYBIND_LABELS[action] || action;
      li.appendChild(label);

      const keyBtn = document.createElement('button');
      keyBtn.className = 'key' + (bindingKey === action ? ' binding' : '');
      keyBtn.textContent = bindingKey === action
        ? '...'
        : (keybinds[action] ? keybinds[action].toUpperCase() : '—');
      keyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        bindingKey = action;
        renderKeybinds();
      });
      li.appendChild(keyBtn);
      keybindsList.appendChild(li);
    }
  }

  // ── Network ──────────────────────────────────
  socket.on('player:left', (id) => {
    delete remotes[id];
  });

  socket.on('game:state', (s) => {
    const r = remotes[s.id];
    if (r) r.pushSnapshot(s);
  });

  socket.on('game:scoreboard', (data) => {
    scoreboardData = data || [];
    if (scoreboardOpen) renderScoreboard();
  });

  socket.on('game:pong', (clientTime) => {
    currentPing = Date.now() - clientTime;
    socket.emit('game:reportPing', currentPing);
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
    chatOpen = false; pauseOpen = false; settingsOpen = false; bindingKey = null;
    scoreboardOpen = false;
    scoreboardData = [];
    currentPing = 0;
    chatLog.innerHTML = '';
    gameChat.classList.remove('active');
    pauseOverlay.classList.remove('visible');
    settingsOverlay.classList.remove('visible');
    scoreboardEl.classList.remove('visible');

    // World rozměry ze serveru
    if (data.world) {
      world.w = data.world.w;
      world.h = data.world.h;
    }
    camera.x = 0;
    camera.y = 0;

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
      console.error('Failed to find local player!');
      return;
    }

    if (stateInterval) clearInterval(stateInterval);
    stateInterval = setInterval(() => {
      if (me) socket.emit('game:state', { x: me.x, y: me.y, angle: me.angle, hp: me.hp });
    }, 33);

    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      socket.emit('game:ping', Date.now());
    }, 2000);

    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  // ── Akce ─────────────────────────────────────
  function readMovement() {
    if (isInputBlocked()) return { up: false, down: false, left: false, right: false };
    return {
      up:    !!keys[keybinds.moveUp],
      down:  !!keys[keybinds.moveDown],
      left:  !!keys[keybinds.moveLeft],
      right: !!keys[keybinds.moveRight],
    };
  }

  function tryShoot() {
    if (!me || !mouse.down || me.fireCooldown > 0 || !loadout) return;
    if (isInputBlocked()) return;
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
        socket.emit('game:hit', { damage: b.damage, shooterId: b.ownerId });
      }
    }
  }

  function tryAbility() {
    if (!me || me.abilityCooldown > 0) return;
    if (isInputBlocked()) return;
    const ab = me.character.ability;
    if (!ab) return;
    const handler = ABILITIES[ab.id];
    if (handler) handler(me);
    socket.emit('game:ability', { type: ab.id, payload: { x: me.x, y: me.y } });
    me.abilityCooldown = ab.cooldown;
  }

  // ── Render ───────────────────────────────────
  function clearCanvas() {
    // tmavé pozadí mimo svět (bude vidět když je hráč u kraje)
    ctx.fillStyle = '#0a0a0a';
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
      ctx.font = '12px "Silkscreen", monospace';
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

  function updateCamera() {
    if (!me) return;
    // kamera centrovaná na hráči
    let cx = me.x - view.w / 2;
    let cy = me.y - view.h / 2;
    // omez aby kamera neutíkala mimo svět
    cx = Math.max(0, Math.min(world.w - view.w, cx));
    cy = Math.max(0, Math.min(world.h - view.h, cy));
    camera.x = cx;
    camera.y = cy;
    // přepočet world coords pro myš (camera se mohla pohnout)
    mouse.x = mouse.sx + camera.x;
    mouse.y = mouse.sy + camera.y;
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (me) {
      if (!pauseOpen) {
        me.update(dt, readMovement(), mouse, world.w, world.h);
        tryShoot();
      }

      for (const id in remotes) remotes[id].update();

      for (const b of bullets) b.update(dt, world.w, world.h);
      checkBulletHits();
      for (let i = bullets.length - 1; i >= 0; i--) {
        if (bullets[i].dead) bullets.splice(i, 1);
      }

      updateCamera();

      // Render s offsetem kamery
      clearCanvas();

      ctx.save();
      ctx.translate(-camera.x, -camera.y);

      drawWorld();
      for (const id in remotes) drawPlayer(remotes[id], false);
      drawPlayer(me, true);
      for (const b of bullets) drawBullet(b);

      ctx.restore();

      drawMinimap();

      const ab = me.character.ability;
      const cd = me.abilityCooldown > 0 ? me.abilityCooldown.toFixed(1) + 's' : 'ready';
      hud.textContent =
        `HP ${Math.round(me.hp)}/${me.maxHp} | ` +
        `Slot: ${activeSlot} (${loadout?.[activeSlot] || '?'}) | ` +
        `${ab.id}: ${cd} | ${currentPing}ms | TAB scoreboard`;
    }

    requestAnimationFrame(loop);
  }

  // ── Vykreslení světa (mřížka + hranice) ───────
  function drawWorld() {
    // pozadí celého světa
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, world.w, world.h);

    // mřížka 100×100 — viditelný offset při pohybu kamery
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    const grid = 100;
    // jen ty čáry co jsou ve viewportu (rychlejší)
    const startX = Math.floor(camera.x / grid) * grid;
    const endX   = camera.x + view.w;
    const startY = Math.floor(camera.y / grid) * grid;
    const endY   = camera.y + view.h;
    for (let x = startX; x <= endX; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, camera.y);
      ctx.lineTo(x, camera.y + view.h);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += grid) {
      ctx.beginPath();
      ctx.moveTo(camera.x, y);
      ctx.lineTo(camera.x + view.w, y);
      ctx.stroke();
    }

    // okraj světa — silnější červená linka
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, world.w, world.h);
  }

  // ── Minimap ──────────────────────────────────
  function drawMinimap() {
    if (!me) return;
    // měřítko: ať se celý svět vejde do MINIMAP_SIZE
    const scale = Math.min(MINIMAP_SIZE / world.w, MINIMAP_SIZE / world.h);
    const w = world.w * scale;
    const h = world.h * scale;
    // vycentruj v rámci canvasu
    const ox = (MINIMAP_SIZE - w) / 2;
    const oy = (MINIMAP_SIZE - h) / 2;

    // pozadí
    mctx.fillStyle = 'rgba(20, 20, 30, 0.4)';
    mctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // hranice světa
    mctx.fillStyle = 'rgba(60, 70, 90, 0.6)';
    mctx.fillRect(ox, oy, w, h);
    mctx.strokeStyle = '#4ecdc4';
    mctx.lineWidth = 1;
    mctx.strokeRect(ox, oy, w, h);

    // viewport rectangle (kde se aktuálně dívám)
    const vx = ox + camera.x * scale;
    const vy = oy + camera.y * scale;
    const vw = view.w * scale;
    const vh = view.h * scale;
    mctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    mctx.lineWidth = 1;
    mctx.strokeRect(vx, vy, vw, vh);

    // ostatní hráči — červené tečky
    for (const id in remotes) {
      const r = remotes[id];
      const inv = r.invisibleUntil && Date.now() < r.invisibleUntil;
      if (inv) continue; // neviditelní se na minimapě nezobrazí
      mctx.fillStyle = '#ff6b6b';
      mctx.beginPath();
      mctx.arc(ox + r.x * scale, oy + r.y * scale, 3, 0, Math.PI * 2);
      mctx.fill();
    }

    // já — tyrkysová tečka
    mctx.fillStyle = '#4ecdc4';
    mctx.beginPath();
    mctx.arc(ox + me.x * scale, oy + me.y * scale, 4, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = 1;
    mctx.stroke();
  }

  console.log('game.js loaded');
  return startGame;
}