export const CHARACTERS = {
  soldier: {
    name: 'Soldier', color: '#4ecdc4', maxHp: 100, speed: 250,
    ability: { id: 'dash', cooldown: 4, distance: 140 },
    loadout: 'soldier',
  },
  tank: {
    name: 'Tank', color: '#a06cd5', maxHp: 150, speed: 200,
    ability: { id: 'shield', cooldown: 8, duration: 3 },
    loadout: 'tank',
  },
  medic: {
    name: 'Medic', color: '#5ec85e', maxHp: 90, speed: 240,
    ability: { id: 'heal', cooldown: 6, amount: 40 },
    loadout: 'medic',
  },
  ghost: {
    name: 'Ghost', color: '#888888', maxHp: 80, speed: 270,
    ability: { id: 'invisibility', cooldown: 10, duration: 4 },
    loadout: 'ghost',
  },
};

export const ABILITIES = {
  dash(player) {
    const d = player.character.ability.distance;
    // primárně směr pohybu (WASD), fallback k myši když stojí
    let dx = player.moveDirX;
    let dy = player.moveDirY;
    if (dx === 0 && dy === 0) {
      dx = Math.cos(player.angle);
      dy = Math.sin(player.angle);
    }
    player.x += dx * d;
    player.y += dy * d;
  },
  shield(player) {
    player.shieldUntil = Date.now() + player.character.ability.duration * 1000;
  },
  heal(player) {
    player.hp = Math.min(player.maxHp, player.hp + player.character.ability.amount);
  },
  invisibility(player) {
    player.invisibleUntil = Date.now() + player.character.ability.duration * 1000;
  },
};