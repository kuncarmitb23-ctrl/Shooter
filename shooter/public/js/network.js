export const socket = io();

export const net = {
  selfId: null,
  world: { w: 960, h: 600 },
  remotes: {},   // id -> RemotePlayer
  onInit: null,
  onShoot: null,
  onAbility: null,
  onCorrection: null,
};

socket.on('init', (data) => {
  net.selfId = data.id;
  net.world = data.world;
  for (const id in data.players) {
    if (id !== net.selfId) net.onInit?.(data.players[id]);
  }
});

socket.on('playerJoined', (p) => { if (p.id !== net.selfId) net.onInit?.(p); });
socket.on('playerLeft',   (id) => { delete net.remotes[id]; });

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
