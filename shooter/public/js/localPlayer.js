export class LocalPlayer {
  constructor(x, y, character) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.character = character;
    this.speed = character.speed;
    this.maxHp = character.maxHp;
    this.hp = character.maxHp;
    this.color = character.color;
    this.fireCooldown = 0;
    this.abilityCooldown = 0;
    this.shieldUntil = 0;
    this.invisibleUntil = 0;
    this.name = '';
    // poslední pohybový směr (pro dash, atd.)
    this.moveDirX = 0;
    this.moveDirY = 0;
  }

  update(dt, input, mouse, worldW, worldH) {
    let dx = 0, dy = 0;
    if (input.up)    dy -= 1;
    if (input.down)  dy += 1;
    if (input.left)  dx -= 1;
    if (input.right) dx += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }

    // ulož směr pro abilities (dash atd.)
    this.moveDirX = dx;
    this.moveDirY = dy;

    this.x += dx * this.speed * dt;
    this.y += dy * this.speed * dt;

    this.x = Math.max(18, Math.min(worldW - 18, this.x));
    this.y = Math.max(18, Math.min(worldH - 18, this.y));

    this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);

    this.fireCooldown    = Math.max(0, this.fireCooldown - dt);
    this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
  }
}