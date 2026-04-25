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
const MAX_PLAYERS_PER_ROOM = 8;
const ROOM_CODE_LEN = 5;

// ─────────────────────────────────────────────
// Místnosti
// ─────────────────────────────────────────────
const rooms = {};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez snadno zaměnitelných
  let code;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LEN; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
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

function initGameState(room) {
  for (const id in room.players) {
    const p = room.players[id];
    p.x = 100 + Math.random() * (WORLD.w - 200);
    p.y = 100 + Math.random() * (WORLD.h - 200);
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

  function leaveCurrentRoom() {
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    if (!room) { currentRoom = null; return; }

    delete room.players[socket.id];
    socket.leave(currentRoom);

    if (Object.keys(room.players).length === 0) {
      delete rooms[currentRoom];
    } else {
      // pokud odešel host, předej hostství
      if (room.hostId === socket.id) {
        const next = Object.values(room.players)[0];
        room.hostId = next.id;
        next.isHost = true;
        next.ready = true;
      }
      io.to(currentRoom).emit('playerLeft', socket.id);
      broadcastLobby(currentRoom);
    }
    currentRoom = null;
  }

  // ── LOBBY ──────────────────────────────────
  socket.on('createRoom', (data, cb) => {
    try {
      if (currentRoom) leaveCurrentRoom();
      const name = String(data?.name || 'Player').slice(0, 16).trim() || 'Player';
      const character = String(data?.character || 'soldier');
      const code = generateCode();
      rooms[code] = {
        code,
        hostId: socket.id,
        started: false,
        players: {
          [socket.id]: {
            id: socket.id,
            name,
            character,
            ready: true,
            isHost: true,
          },
        },
      };
      socket.join(code);
      currentRoom = code;
      cb?.({ ok: true, code });
      broadcastLobby(code);
    } catch (err) {
      console.error('createRoom error:', err);
      cb?.({ ok: false, error: 'Chyba serveru' });
    }
  });

  socket.on('joinRoom', (data, cb) => {
    try {
      if (currentRoom) leaveCurrentRoom();
      const code = String(data?.code || '').toUpperCase().trim();
      const name = String(data?.name || 'Player').slice(0, 16).trim() || 'Player';
      const character = String(data?.character || 'soldier');

      const room = rooms[code];
      if (!room) return cb?.({ ok: false, error: 'Místnost neexistuje' });
      if (room.started) return cb?.({ ok: false, error: 'Hra už začala' });
      if (Object.keys(room.players).length >= MAX_PLAYERS_PER_ROOM) {
        return cb?.({ ok: false, error: 'Místnost plná' });
      }

      room.players[socket.id] = {
        id: socket.id, name, character,
        ready: false, isHost: false,
      };
      socket.join(code);
      currentRoom = code;
      cb?.({ ok: true, code });
      broadcastLobby(code);
    } catch (err) {
      console.error('joinRoom error:', err);
      cb?.({ ok: false, error: 'Chyba serveru' });
    }
  });

  socket.on('setCharacter', (data) => {
    const room = rooms[currentRoom];
    if (!room || !room.players[socket.id] || room.started) return;
    const character = String(data?.character || 'soldier');
    room.players[socket.id].character = character;
    broadcastLobby(currentRoom);
  });

  socket.on('toggleReady', () => {
    const room = rooms[currentRoom];
    if (!room || !room.players[socket.id] || room.started) return;
    const p = room.players[socket.id];
    if (p.isHost) return;
    p.ready = !p.ready;
    broadcastLobby(currentRoom);
  });

  socket.on('chat', (data) => {
    const room = rooms[currentRoom];
    if (!room || !room.players[socket.id]) return;
    const text = String(data?.text || '').slice(0, 200).trim();
    if (!text) return;
    io.to(currentRoom).emit('chat', {
      from: room.players[socket.id].name,
      text,
      t: Date.now(),
    });
  });

  socket.on('startGame', () => {
    const room = rooms[currentRoom];
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.started) return;
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
    if (typeof s?.x !== 'number' || typeof s?.y !== 'number') return;

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

    prev.x = s.x; prev.y = s.y; prev.angle = s.angle ?? 0; prev.hp = s.hp ?? prev.hp;

    socket.to(currentRoom).emit('playerState', {
      id: socket.id, x: s.x, y: s.y, angle: prev.angle, hp: prev.hp, t: now,
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
      x: data?.x ?? p.x,
      y: data?.y ?? p.y,
      angle: data?.angle ?? 0,
      weapon: String(data?.weapon || 'pistol'),
    });
  });

  socket.on('hit', (data) => {
    const room = rooms[currentRoom];
    if (!room || !room.started) return;
    const target = room.players[socket.id];
    if (!target) return;
    const damage = Math.max(0, Math.min(100, Number(data?.damage) || 0));
    target.hp = Math.max(0, target.hp - damage);
    if (target.hp === 0) {
      target.hp = target.maxHp;
      target.x = 100 + Math.random() * (WORLD.w - 200);
      target.y = 100 + Math.random() * (WORLD.h - 200);
      io.to(currentRoom).emit('respawn', {
        id: socket.id, x: target.x, y: target.y, hp: target.hp,
      });
    }
  });

  socket.on('ability', (data) => {
    const room = rooms[currentRoom];
    if (!room || !room.started) return;
    socket.to(currentRoom).emit('ability', {
      id: socket.id,
      type: String(data?.type || ''),
      payload: data?.payload || {},
    });
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    leaveCurrentRoom();
  });
});

// globální error handler ať server nepadá
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on :${PORT}`));