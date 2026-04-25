# 2D Multiplayer Shooter

Jednoduchá kostra 2D top-down střílečky pro více hráčů. Klient-autoritativní architektura s relay serverem.

## Spuštění

```bash
npm install
npm start
```

Pak otevři `http://localhost:3000` ve více tabech (nebo v různých prohlížečích) a hraj proti sobě.

## Ovládání

- **WASD** — pohyb
- **Myš** — míření
- **Levé tlačítko myši** — střelba
- **1 / 2 / 3** — primární / sekundární / granát
- **Q** — schopnost postavy

## Struktura

```
.
├── package.json
├── server.js                 # relay server + sanity checks
└── public/
    ├── index.html
    └── js/
        ├── main.js           # vstupní bod + game loop
        ├── input.js          # klávesnice + myš
        ├── network.js        # socket.io wrapper
        ├── renderer.js       # canvas drawing
        ├── localPlayer.js    # já (plná simulace)
        ├── remotePlayer.js   # ostatní (interpolace)
        ├── bullet.js         # střely
        ├── characters.js     # postavy + ability handlery
        └── weapons.js        # zbraně + loadouty
```

## Jak přidat novou postavu

1. Přidej záznam do `CHARACTERS` v `characters.js`
2. Přidej loadout do `LOADOUTS` ve `weapons.js`
3. Pokud má novou ability, přidej funkci do `ABILITIES`

## Jak přidat novou zbraň

Přidej záznam do `WEAPONS` ve `weapons.js`. Hotovo.

## Architektura

- **Klient** simuluje pohyb, střelbu, kolize a schopnosti
- **Server** validuje (max rychlost, rate limit) a přeposílá stav ostatním
- **Vzdálení hráči** se renderují s 100ms delay a interpolací mezi snapshoty pro plynulý pohyb
- **Detekce zásahu** běží lokálně: když mě někoho zasáhne, ohlásím si vlastní damage serveru

## Co dál

- Snapshot batching — server posílá jeden balík za tick místo zprávy na hráče
- Delta komprese — jen měněná pole
- Lag compensation — server ověřuje zásah proti pozici, kterou střelec viděl
- Server reconciliation — replay vstupů po korekci místo snap-backu
