export class Bullet {
  constructor({ x, y, angle, speed, life, damage, ownerId }) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = life;
    this.damage = damage;
    this.ownerId = ownerId;
    this.dead = false;
  }

  update(dt, worldW, worldH) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0 || this.x < 0 || this.x > worldW || this.y < 0 || this.y > worldH) {
      this.dead = true;
    }
  }
}