export const CHARACTERS = {
  soldier: {
    name: 'Soldier', color: '#4ecdc4', maxHp: 100, speed: 250,
    ability: { id: 'dash',         cooldown: 4,  distance: 140 },
    loadout: 'soldier',
  },
  tank: {
    name: 'Tank',    color: '#a06cd5', maxHp: 150, speed: 200,
    ability: { id: 'shield',       cooldown: 8,  duration: 3 },
    loadout: 'tank',
  },
  medic: {
    name: 'Medic',   color: '#5ec85e', maxHp: 90,  speed: 240,
    ability: { id: 'heal',         cooldown: 6,  amount: 40 },
    loadout: 'medic',
  },
  ghost: {
    name: 'Ghost',   color: '#888',    maxHp: 80,  speed: 270,
    ability: { id: 'invisibility', cooldown: 10, duration: 4 },
    loadout: 'ghost',
  },
};

// Jedna funkce na ability id. Bere hráče, mutuje stav.
export const ABILITIES = {
  dash(player) {
    player.x += Math.cos(player.angle) * player.character.ability.distance;
    player.y += Math.sin(player.angle) * player.character.ability.distance;
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
