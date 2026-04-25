const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const WORLD = { w: 960, h: 600 };
const MAX_SPEED = 320;
const MAX_FIRE_RATE = 15;
const STATE_RATE_LIMIT = 40;

// ─────────────────────────────────────────────
// Místnosti
// ─────────────────────────────────────────────
// rooms[code] = {
//   code, hostId, started,
//   players: { [socketId]: { id, name, character, ready, isHost } }
// }
const rooms = {};

function generateCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 7).toUpperCase();
  } while (rooms[code]);
  return code;
}

function roomPublicState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    players: Object.values(room.players).map(p => ({
      id: p.id,
      name: p.name,
      character: p.character,
      ready: p.ready,
      isHost: p.isHost,
    })),
  };
}

function broadcastLobby(code) {
  const room = rooms[code];
  if (!room) return;
  io.to(code).emit('lobbyUpdate', roomPublicState(room));
}

// ─────────────────────────────────────────────
// Game state per room
// ─────────────────────────────────────────────
function initGameState(room) {
  for (const id in room.players) {
    const p = room.players[id];
    p.x = Math.random() * WORLD.w;
    p.y = Math.random() * WORLD.h;
    p.angle = 0;
    p.hp = 100;
    p.maxHp = 100;
    p.lastUpdate = Date.now();
    p.shotTimes = [];
  }
}

// ─────────────────────────────────────────────
// Sockets
// ─────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('connect', socket.id);
  let currentRoom = null;

  // ── LOBBY ──────────────────────────────────
  socket.on('createRoom', ({ name, character }, cb) => {
    const code = generateCode();
    rooms[code] = {
      code,
      hostId: socket.id,
      started: false,
      players: {
        [socket.id]: {
          id: socket.id,
          name: (name || 'Player').slice(0, 16),
          character: character || 'soldier',
          ready: true, // host je rovnou ready
          isHost: true,
        },
      },
    };
    socket.join(code);
    currentRoom = code;
    cb?.({ ok: true, code });
    broadcastLobby(code);
  });

  socket.on('joinRoom', ({ code, name, character }, cb) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) return cb?.({ ok: false, error: 'Místnost neexistuje' });
    if (room.started) return cb?.({ ok: false, error: 'Hra už začala' });
    if (Object.keys(room.players).length >= 8) return cb?.({ ok: false, error: 'Místnost plná' });

    room.players[socket.id] = {
      id: socket.id,
      name: (name || 'Player').slice(0, 16),
      character: character || 'soldier',
      ready: false,
      isHost: false,
    };
    socket.join(code);
    currentRoom = code;
    cb?.({ ok: true, code });
    broadcastLobby(code);
  });

  socket.on('setCharacter', ({ character }) => {
    const room = rooms[currentRoom];
    if (!room || !room.players[socket.id]) return;
    room.players[socket.id].character = character;
    broadcastLobby(currentRoom);
  });

  socket.on('toggleReady', () => {
    const room = rooms[currentRoom];
    if (!room || !room.players[socket.id]) return;
    const p = room.players[socket.id];
    if (p.isHost) return; // host je vždycky ready
    p.ready = !p.ready;
    broadcastLobby(currentRoom);
  });

  socket.on('chat', ({ text }) => {
    const room = rooms[currentRoom];
    if (!room || !room.players[socket.id]) return;
    text = (text || '').toString().slice(0, 200);
    if (!text.trim()) return;
    io.to(currentRoom).emit('chat', {
      from: room.players[socket.id].name,
      text,
      t: Date.now(),
    });
  });

  socket.on('startGame', () => {
    const room = rooms[currentRoom];
    if (!room || room.hostId !== socket.id) return;
    const players = Object.values(room.players);
    const allReady = players.every(p => p.ready);
    if (!allReady) {
      socket.emit('startError', 'Někteří hráči nejsou ready');
      return;
    }
    room.started = true;
    initGameState(room);
    io.to(currentRoom).emit('gameStart', {
      players: players.map(p => ({
        id: p.id, name: p.name, character: p.character,
        x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp,
      })),
      world: WORLD,
    });
  });

  // ── HRA ────────────────────────────────────
  socket.on('state', (s) => {
    const room = rooms[currentRoom];
    if (!room || !room.started) return;
    const prev = room.players[socket.id];
    if (!prev) return;

    const now = Date.now();
    const dt = (now - prev.lastUpdate) / 1000;
    if (dt < 1 / STATE_RATE_LIMIT) return;
    prev.lastUpdate = now;

    const dist = Math.hypot(s.x - prev.x, s.y - prev.y);
    if (dt > 0 && dist / dt > MAX_SPEED * 1.5) {
      socket.emit('correction', { x: prev.x, y: prev.y });
      return;
    }
    s.x = Math.max(0, Math.min(WORLD.w, s.x));
    s.y = Math.max(0, Math.min(WORLD.h, s.y));

    prev.x = s.x; prev.y = s.y; prev.angle = s.angle; prev.hp = s.hp;

    socket.to(currentRoom).emit('playerState', {
      id: socket.id, x: s.x, y: s.y, angle: s.angle, hp: s.hp, t: now,
    });
  });

  socket.on('shoot', (data) => {
    const room = rooms[currentRoom];
    if (!room || !room.started) return;
    const p = room.players[socket.id];
    if (!p) return;
    const now = Date.now();
    p.shotTimes = p.shotTimes.filter(t => now - t < 1000);
    if (p.shotTimes.length >= MAX_FIRE_RATE) return;
    p.shotTimes.push(now);
    socket.to(currentRoom).emit('shoot', {
      ownerId: socket.id,
      x: data.x, y: data.y, angle: data.angle, weapon: data.weapon,
    });
  });

  socket.on('hit', (data) => {
    const room = rooms[currentRoom];
    if (!room || !room.started) return;
    const target = room.players[socket.id];
    if (!target) return;
    target.hp = Math.max(0, target.hp - data.damage);
    if (target.hp === 0) {
      target.hp = target.maxHp;
      target.x = Math.random() * WORLD.w;
      target.y = Math.random() * WORLD.h;
      io.to(currentRoom).emit('respawn', {
        id: socket.id, x: target.x, y: target.y, hp: target.hp,
      });
    }
  });

  socket.on('ability', (data) => {
    if (!currentRoom || !rooms[currentRoom]?.started) return;
    socket.to(currentRoom).emit('ability', {
      id: socket.id, type: data.type, payload: data.payload,
    });
  });

  // ── ODPOJENÍ ───────────────────────────────
  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    if (!room) return;

    delete room.players[socket.id];

    if (Object.keys(room.players).length === 0) {
      delete rooms[currentRoom];
      return;
    }

    // pokud odešel host, předej hostství
    if (room.hostId === socket.id) {
      const next = Object.values(room.players)[0];
      room.hostId = next.id;
      next.isHost = true;
      next.ready = true;
    }

    io.to(currentRoom).emit('playerLeft', socket.id);
    broadcastLobby(currentRoom);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on :${PORT}`));