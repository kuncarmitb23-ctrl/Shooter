const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const WORLD = { w: 960, h: 600 };
const MAX_SPEED = 320;          // px/s — mírně nad nejrychlejší postavou
const MAX_FIRE_RATE = 15;       // výstřelů/s globální limit
const STATE_RATE_LIMIT = 40;    // updatů/s na hráče

const players = {}; // id -> last validated snapshot

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  players[socket.id] = {
    id: socket.id,
    x: Math.random() * WORLD.w,
    y: Math.random() * WORLD.h,
    angle: 0,
    hp: 100,
    maxHp: 100,
    character: 'soldier',
    color: '#4ecdc4',
    lastUpdate: Date.now(),
    shotTimes: [],
  };

  socket.emit('init', { id: socket.id, world: WORLD, players });
  socket.broadcast.emit('playerJoined', players[socket.id]);

  socket.on('state', (s) => {
    const prev = players[socket.id];
    if (!prev) return;

    const now = Date.now();
    const dt = (now - prev.lastUpdate) / 1000;
    if (dt < 1 / STATE_RATE_LIMIT) return; // rate limit
    prev.lastUpdate = now;

    // sanity: vzdálenost musí být věrohodná
    const dist = Math.hypot(s.x - prev.x, s.y - prev.y);
    if (dt > 0 && dist / dt > MAX_SPEED * 1.5) {
      // odmítni — pošli korekci
      socket.emit('correction', { x: prev.x, y: prev.y });
      return;
    }
    // sanity: zůstaň ve světě
    s.x = Math.max(0, Math.min(WORLD.w, s.x));
    s.y = Math.max(0, Math.min(WORLD.h, s.y));

    prev.x = s.x;
    prev.y = s.y;
    prev.angle = s.angle;
    prev.hp = s.hp;

    socket.broadcast.emit('playerState', {
      id: socket.id,
      x: s.x,
      y: s.y,
      angle: s.angle,
      hp: s.hp,
      t: now,
    });
  });

  socket.on('shoot', (data) => {
    const p = players[socket.id];
    if (!p) return;
    const now = Date.now();
    // rate limit výstřelů
    p.shotTimes = p.shotTimes.filter((t) => now - t < 1000);
    if (p.shotTimes.length >= MAX_FIRE_RATE) return;
    p.shotTimes.push(now);

    socket.broadcast.emit('shoot', {
      ownerId: socket.id,
      x: data.x,
      y: data.y,
      angle: data.angle,
      weapon: data.weapon,
    });
  });

  socket.on('hit', (data) => {
    // "dostal jsem zásah" — hráč hlásí vlastní damage
    const target = players[socket.id];
    if (!target) return;
    target.hp = Math.max(0, target.hp - data.damage);
    if (target.hp === 0) {
      target.hp = target.maxHp;
      target.x = Math.random() * WORLD.w;
      target.y = Math.random() * WORLD.h;
      io.emit('respawn', { id: socket.id, x: target.x, y: target.y, hp: target.hp });
    }
  });

  socket.on('ability', (data) => {
    // jen relay — klienti si pustí vizuální efekt sami
    socket.broadcast.emit('ability', { id: socket.id, type: data.type, payload: data.payload });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
    console.log('disconnect', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on :${PORT}`));
