import { CHARACTERS } from './characters.js';

export const socket = io();

const screens = {
  menu: document.getElementById('menu'),
  lobby: document.getElementById('lobby'),
  game: document.getElementById('game-screen'),
};

function showScreen(name) {
  for (const k in screens) {
    screens[k].classList.remove('active');
    screens[k].style.display = 'none';
  }
  if (name === 'menu')  screens.menu.style.display = 'flex';
  if (name === 'lobby') screens.lobby.classList.add('active');
  if (name === 'game')  screens.game.classList.add('active');
}

// ── stav ─────────────────────────────────────
const state = {
  name: localStorage.getItem('shooter_name') || '',
  character: 'soldier',
  selfId: null,
  room: null,    // { code, hostId, players, started }
};

// ── hooks pro main.js ────────────────────────
export const lobbyEvents = {
  onGameStart: null,
};

// ──────────────────────────────────────────────
// MENU obrazovka
// ──────────────────────────────────────────────
const nameInput = document.getElementById('nameInput');
const codeInput = document.getElementById('codeInput');
const createBtn = document.getElementById('createBtn');
const joinBtn   = document.getElementById('joinBtn');
const menuErr   = document.getElementById('menuErr');

nameInput.value = state.name;
nameInput.addEventListener('input', () => {
  state.name = nameInput.value.trim();
  localStorage.setItem('shooter_name', state.name);
});

function validateName() {
  if (!state.name) {
    menuErr.textContent = 'Zadej jméno';
    return false;
  }
  menuErr.textContent = '';
  return true;
}

createBtn.addEventListener('click', () => {
  if (!validateName()) return;
  socket.emit('createRoom', { name: state.name, character: state.character }, (res) => {
    if (!res.ok) { menuErr.textContent = res.error || 'Chyba'; return; }
    enterLobby();
  });
});

joinBtn.addEventListener('click', () => {
  if (!validateName()) return;
  const code = codeInput.value.trim().toUpperCase();
  if (!code) { menuErr.textContent = 'Zadej kód'; return; }
  socket.emit('joinRoom', { code, name: state.name, character: state.character }, (res) => {
    if (!res.ok) { menuErr.textContent = res.error || 'Chyba'; return; }
    enterLobby();
  });
});

codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });

// ──────────────────────────────────────────────
// LOBBY obrazovka
// ──────────────────────────────────────────────
const roomCodeEl = document.getElementById('roomCode');
const playerListEl = document.getElementById('playerList');
const charGridEl = document.getElementById('charGrid');
const readyBtn = document.getElementById('readyBtn');
const startBtn = document.getElementById('startBtn');
const leaveBtn = document.getElementById('leaveBtn');
const lobbyErr = document.getElementById('lobbyErr');
const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');

function enterLobby() {
  showScreen('lobby');
  renderCharGrid();
  chatLog.innerHTML = '';
}

function renderCharGrid() {
  charGridEl.innerHTML = '';
  for (const id in CHARACTERS) {
    const c = CHARACTERS[id];
    const card = document.createElement('div');
    card.className = 'char-card' + (state.character === id ? ' selected' : '');
    card.innerHTML = `
      <div class="name" style="color:${c.color}">${c.name}</div>
      <div class="ability">HP ${c.maxHp} • ${c.ability.id}</div>
    `;
    card.addEventListener('click', () => {
      state.character = id;
      socket.emit('setCharacter', { character: id });
      renderCharGrid();
    });
    charGridEl.appendChild(card);
  }
}

socket.on('lobbyUpdate', (room) => {
  state.room = room;
  state.selfId = socket.id;
  roomCodeEl.textContent = room.code;
  renderPlayerList(room);
  updateActionButtons(room);
});

function renderPlayerList(room) {
  playerListEl.innerHTML = '';
  for (const p of room.players) {
    const c = CHARACTERS[p.character];
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="dot ${p.ready ? 'ready' : ''}"></span>
      <span class="name">${escapeHtml(p.name)}</span>
      <span class="char" style="color:${c?.color || '#9ca3af'}">${c?.name || p.character}</span>
      ${p.isHost ? '<span class="badge">HOST</span>' : ''}
    `;
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
    const enoughPlayers = room.players.length >= 1; // i 1 hráč může pro testování
    startBtn.disabled = !allReady || !enoughPlayers;
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
  navigator.clipboard?.writeText(roomCodeEl.textContent);
});

// chat
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim()) {
    socket.emit('chat', { text: chatInput.value });
    chatInput.value = '';
  }
});

socket.on('chat', ({ from, text }) => {
  const line = document.createElement('div');
  line.className = 'msg';
  line.innerHTML = `<span class="from">${escapeHtml(from)}:</span> ${escapeHtml(text)}`;
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
});

// ──────────────────────────────────────────────
// START HRY → přepnutí na canvas
// ──────────────────────────────────────────────
socket.on('gameStart', (data) => {
  showScreen('game');
  lobbyEvents.onGameStart?.(data, state);
});

// ──────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// init
showScreen('menu');