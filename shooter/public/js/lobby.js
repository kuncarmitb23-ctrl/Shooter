// LOBBY — handles menu and lobby screen
import { CHARACTERS } from './characters.js';

export function initLobby({ session, showScreen, onStartGame }) {
  const socket = session.socket;

  // ── Elementy ──────────────────────────────────
  const nameInput = document.getElementById('nameInput');
  const codeInput = document.getElementById('codeInput');
  const createBtn = document.getElementById('createBtn');
  const joinBtn   = document.getElementById('joinBtn');
  const menuErr   = document.getElementById('menuErr');

  const roomCodeEl   = document.getElementById('roomCodeEl');
  const playerListEl = document.getElementById('playerList');
  const charGridEl   = document.getElementById('charGrid');
  const readyBtn     = document.getElementById('readyBtn');
  const startBtn     = document.getElementById('startBtn');
  const leaveBtn     = document.getElementById('leaveBtn');
  const lobbyErr     = document.getElementById('lobbyErr');
  const chatLog      = document.getElementById('chatLog');
  const chatInput    = document.getElementById('chatInput');

  // ── MENU ──────────────────────────────────────
  nameInput.value = session.name;
  nameInput.addEventListener('input', () => {
    session.name = nameInput.value.trim();
    localStorage.setItem('shooter_name', session.name);
  });

  function setMenuErr(t) { menuErr.textContent = t || ''; }

  function validateName() {
    if (!session.name) { setMenuErr('Enter your name'); return false; }
    setMenuErr('');
    return true;
  }

  createBtn.addEventListener('click', () => {
    if (!validateName()) return;
    if (!socket.connected) { setMenuErr('Server not connected'); return; }
    createBtn.disabled = true;
    socket.emit('lobby:create', { name: session.name, character: session.character }, (res) => {
      createBtn.disabled = false;
      if (!res || !res.ok) { setMenuErr(res?.error || 'Error'); return; }
      enterLobby();
    });
  });

  joinBtn.addEventListener('click', () => {
    if (!validateName()) return;
    const code = codeInput.value.trim().toUpperCase();
    if (!code) { setMenuErr('Enter code'); return; }
    if (!socket.connected) { setMenuErr('Server not connected'); return; }
    joinBtn.disabled = true;
    socket.emit('lobby:join', { code, name: session.name, character: session.character }, (res) => {
      joinBtn.disabled = false;
      if (!res || !res.ok) { setMenuErr(res?.error || 'Error'); return; }
      enterLobby();
    });
  });

  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); joinBtn.click(); }
  });

  // ── LOBBY ─────────────────────────────────────
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

      const nm = document.createElement('div');
      nm.className = 'cname';
      nm.style.color = c.color;
      nm.textContent = c.name;
      card.appendChild(nm);

      const ab = document.createElement('div');
      ab.className = 'cab';
      ab.textContent = `HP ${c.maxHp} • ${c.ability.id}`;
      card.appendChild(ab);

      card.addEventListener('click', () => {
        session.character = id;
        socket.emit('lobby:setCharacter', { character: id });
        renderCharGrid();
      });
      charGridEl.appendChild(card);
    }
  }

  socket.on('lobby:update', (room) => {
    session.selfId = socket.id;
    roomCodeEl.textContent = room.code;
    renderPlayerList(room);
    renderMapSizes(room);
    updateButtons(room);
  });

  function renderMapSizes(room) {
    const el = document.getElementById('mapSizeGrid');
    if (!el) return;
    el.innerHTML = '';
    const isHost = room.players.find(p => p.id === socket.id)?.isHost;
    for (const m of (room.availableMaps || [])) {
      const card = document.createElement('div');
      card.className = 'map-card' + (room.mapSize === m.id ? ' selected' : '');
      if (!isHost) card.classList.add('readonly');

      const name = document.createElement('div');
      name.className = 'mname';
      name.textContent = m.label;
      card.appendChild(name);

      const dim = document.createElement('div');
      dim.className = 'mdim';
      dim.textContent = m.w + ' × ' + m.h;
      card.appendChild(dim);

      if (isHost) {
        card.addEventListener('click', () => {
          socket.emit('lobby:setMapSize', { mapSize: m.id });
        });
      }
      el.appendChild(card);
    }
  }

  function renderPlayerList(room) {
    playerListEl.innerHTML = '';
    for (const p of room.players) {
      const c = CHARACTERS[p.character];
      const li = document.createElement('li');

      const dot = document.createElement('span');
      dot.className = 'dot' + (p.ready ? ' ready' : '');
      li.appendChild(dot);

      const pn = document.createElement('span');
      pn.className = 'pname';
      pn.textContent = p.name;
      li.appendChild(pn);

      const pc = document.createElement('span');
      pc.className = 'pchar';
      pc.style.color = c?.color || '#9ca3af';
      pc.textContent = c?.name || p.character;
      li.appendChild(pc);

      if (p.isHost) {
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = 'HOST';
        li.appendChild(b);
      }
      playerListEl.appendChild(li);
    }
  }

  function updateButtons(room) {
    const me = room.players.find(p => p.id === socket.id);
    if (!me) return;
    if (me.isHost) {
      readyBtn.style.display = 'none';
      startBtn.style.display = '';
      const allReady = room.players.every(p => p.ready);
      startBtn.disabled = !allReady;
      startBtn.textContent = allReady ? 'Start game' : 'Waiting for ready...';
    } else {
      readyBtn.style.display = '';
      startBtn.style.display = 'none';
      readyBtn.textContent = me.ready ? '✓ Ready' : 'Ready';
      readyBtn.classList.toggle('btn-success', me.ready);
      readyBtn.classList.toggle('btn-secondary', !me.ready);
    }
  }

  readyBtn.addEventListener('click', () => socket.emit('lobby:toggleReady'));
  startBtn.addEventListener('click', () => socket.emit('lobby:start'));
  leaveBtn.addEventListener('click', () => location.reload());
  socket.on('lobby:error', (msg) => { lobbyErr.textContent = msg; });

  roomCodeEl.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(roomCodeEl.textContent).catch(() => {});
    }
  });

  // ── CHAT ──────────────────────────────────────
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
      e.preventDefault();
      socket.emit('lobby:chat', { text: chatInput.value });
      chatInput.value = '';
    }
  });

  socket.on('lobby:chat', ({ from, text }) => {
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

  // ── START HRY ─────────────────────────────────
  socket.on('game:start', (data) => {
    onStartGame(data);
  });

  console.log('lobby.js loaded');
}