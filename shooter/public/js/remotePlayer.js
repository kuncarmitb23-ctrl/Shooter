const INTERP_DELAY = 150;

export class RemotePlayer {
  constructor(initial) {
    this.id = initial.id;
    this.x = initial.x ?? 0;
    this.y = initial.y ?? 0;
    this.angle = initial.angle ?? 0;
    this.hp = initial.hp ?? 100;
    this.maxHp = initial.maxHp ?? 100;
    this.color = initial.color ?? '#ff6b6b';
    this.shieldUntil = 0;
    this.invisibleUntil = 0;
    this.name = '';
    this.snapshots = [];
  }

  pushSnapshot(s) {
    this.snapshots.push({
      t: s.t ?? Date.now(),
      x: s.x, y: s.y,
      angle: s.angle ?? this.angle,
      hp: s.hp ?? this.hp,
    });
    const cutoff = Date.now() - 1000;
    while (this.snapshots.length > 2 && this.snapshots[0].t < cutoff) {
      this.snapshots.shift();
    }
  }

  update() {
    const renderTime = Date.now() - INTERP_DELAY;
    const snaps = this.snapshots;
    if (snaps.length === 0) return;
    if (snaps.length === 1) {
      const s = snaps[0];
      this.x = s.x; this.y = s.y; this.angle = s.angle; this.hp = s.hp;
      return;
    }

    const last = snaps[snaps.length - 1];
    const prev = snaps[snaps.length - 2];

    // Pokud render time je za posledním snímkem, extrapoluj (max 100ms)
    if (renderTime > last.t) {
      const ahead = Math.min(100, renderTime - last.t);
      const span = last.t - prev.t;
      if (span > 0) {
        const vx = (last.x - prev.x) / span;
        const vy = (last.y - prev.y) / span;
        this.x = last.x + vx * ahead;
        this.y = last.y + vy * ahead;
      } else {
        this.x = last.x; this.y = last.y;
      }
      this.angle = last.angle;
      this.hp = last.hp;
      return;
    }

    // Najdi dva snímky obklopující render time
    let a = snaps[0], b = snaps[1];
    for (let i = 0; i < snaps.length - 1; i++) {
      if (snaps[i].t <= renderTime && snaps[i + 1].t >= renderTime) {
        a = snaps[i]; b = snaps[i + 1];
        break;
      }
    }
    const span = b.t - a.t;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - a.t) / span)) : 1;
    this.x = a.x + (b.x - a.x) * t;
    this.y = a.y + (b.y - a.y) * t;
    let da = b.angle - a.angle;
    while (da >  Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.angle = a.angle + da * t;
    this.hp = b.hp;
  }
}