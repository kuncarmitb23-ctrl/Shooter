import { socket } from './lobby.js';

export { socket };

export const net = {
  selfId: null,
  world: { w: 960, h: 600 },
  remotes: {},
  initialPlayers: [],     // hráči z lobby (jména, postavy)
  onShoot: null,
  onAbility: null,
  onCorrection: null,
  onPlayerLeft: null,
};

socket.on('playerLeft', (id) => {
  delete net.remotes[id];
  net.onPlayerLeft?.(id);
});

socket.on('playerState', (s) => {
  const r = net.remotes[s.id];
  if (r) r.pushSnapshot(s);
});

socket.on('shoot',   (d) => net.onShoot?.(d));
socket.on('ability', (d) => net.onAbility?.(d));

socket.on('respawn', (d) => {
  if (d.id === net.selfId) net.onCorrection?.(d);
  else if (net.remotes[d.id]) net.remotes[d.id].pushSnapshot({ ...d, t: Date.now() });
});
socket.on('correction', (d) => net.onCorrection?.(d));

export function sendState(p) {
  socket.emit('state', { x: p.x, y: p.y, angle: p.angle, hp: p.hp });
}
export function sendShoot(p, weaponName) {
  socket.emit('shoot', { x: p.x, y: p.y, angle: p.angle, weapon: weaponName });
}
export function sendHit(damage) {
  socket.emit('hit', { damage });
}
export function sendAbility(type, payload = {}) {
  socket.emit('ability', { type, payload });
}