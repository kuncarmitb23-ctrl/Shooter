const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

export const view = { canvas, ctx, w: canvas.width, h: canvas.height };

export function clear() {
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, view.w, view.h);
}

export function drawPlayer(p, isSelf = false) {
  const invisible = p.invisibleUntil && Date.now() < p.invisibleUntil;
  const shielded  = p.shieldUntil    && Date.now() < p.shieldUntil;

  ctx.save();
  ctx.globalAlpha = invisible ? (isSelf ? 0.35 : 0.1) : 1;

  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
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

  // hp bar
  const hpPct = Math.max(0, p.hp / p.maxHp);
  ctx.fillStyle = '#000';
  ctx.fillRect(p.x - 22, p.y - 32, 44, 6);
  ctx.fillStyle = '#5ec85e';
  ctx.fillRect(p.x - 22, p.y - 32, 44 * hpPct, 6);
}

export function drawBullet(b) {
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
  ctx.fill();
}
