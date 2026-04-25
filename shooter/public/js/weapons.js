export const WEAPONS = {
  pistol:  { slot: 'primary',   damage: 15, fireRate: 0.25, bulletSpeed: 600, bulletLife: 1.5, spread: 0.02, pellets: 1 },
  rifle:   { slot: 'primary',   damage: 12, fireRate: 0.10, bulletSpeed: 700, bulletLife: 1.5, spread: 0.05, pellets: 1 },
  shotgun: { slot: 'secondary', damage: 8,  fireRate: 0.7,  bulletSpeed: 550, bulletLife: 0.6, spread: 0.30, pellets: 6 },
  smg:     { slot: 'secondary', damage: 6,  fireRate: 0.07, bulletSpeed: 650, bulletLife: 1.0, spread: 0.10, pellets: 1 },
  grenade: { slot: 'grenade',   damage: 60, fireRate: 1.5,  bulletSpeed: 350, bulletLife: 1.2, spread: 0,    pellets: 1 },
};

export const LOADOUTS = {
  soldier: { primary: 'rifle',   secondary: 'pistol', grenade: 'grenade' },
  tank:    { primary: 'shotgun', secondary: 'pistol', grenade: 'grenade' },
  medic:   { primary: 'pistol',  secondary: 'smg',    grenade: 'grenade' },
  ghost:   { primary: 'rifle',   secondary: 'smg',    grenade: 'grenade' },
};