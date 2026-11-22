# THE AMBER LEDGER — a gentleman thief's heist game

[![Make.fun competition](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/c/best-heist-game-20261122-0559)
[![Rank](https://make.fun/badge/best-heist-game-20261122-0559/jonsonbmth/heist-game/rank.svg)](https://make.fun/c/best-heist-game-20261122-0559)
[![Reward](https://make.fun/badge/best-heist-game-20261122-0559/jonsonbmth/heist-game/reward.svg)](https://make.fun/c/best-heist-game-20261122-0559)

A top-down stealth heist game, rendered with Three.js through an orthographic camera: dark slate rooms, warm amber lamplight, translucent warden vision cones, sweeping brass-eye cameras, tripwires, and a green exit that only opens once you hold the prize.

**Three jobs:** The Counting House, The Lantern Bank, The Gilded Archive — each a distinct room with several routes, patrolling wardens, cameras, loot and optional relics. Sneak in shadow, throw pebbles to pull wardens away, blind cones with smoke, douse lamps, and vanish unseen for the ghost bonus. Three strikes and the heist fails.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

WASD / arrows move · SHIFT sneak · SPACE sprint · CLICK throw a pebble · Q smoke · E grab / douse a lamp · R retry · M mute · ESC pause.

## Files

- `game/index.html` — the page and HUD
- `game/src/main.js` — boot, loop, input, scoring
- `game/src/levels.js` — the three hand-authored jobs
- `game/src/guards.js` — warden patrol, vision, suspicion, cameras, tripwires
- `game/src/player.js` — the thief: stance, noise, grabbing
- `game/src/gadgets.js` — pebbles, smoke, doused lamps
- `game/src/render.js` — the Three.js scene, lights and figures
- `game/src/hud.js` — alarm meter, roster, banners
- `game/src/audio.js` — procedural WebAudio sounds
- `game/src/selftest.js` — scripted win/caught playthroughs (`?selftest=win|caught`)

No network anywhere: every file the game loads lives under `game/`. Three.js is vendored as `game/vendor/three.min.js`.

MIT licensed. Built for the [make.fun best heist game bounty](https://make.fun/c/best-heist-game-20261122-0559).
