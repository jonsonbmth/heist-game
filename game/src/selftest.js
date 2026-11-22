// selftest.js — scripted playthroughs that drive the REAL game loop.
// ?selftest=win plays job 1 to a clean getaway with the autopilot below
// (sneak, wait when a warden has line of sight, grab, exit). ?selftest=caught
// walks into a warden three times and expects the failed screen. The
// result is written into #selftest-result and document.title so a headless
// run can read it with --dump-dom.

import { dist, findPath, segmentBlocked, segmentClear, sightBlockersOf, solidsOf } from './levels.js';
import { canSeeThief } from './guards.js';
import { throwCoin, useSmoke } from './gadgets.js';

const DT = 1 / 30;

function sleep() {
  return new Promise((r) => setTimeout(r, 0));
}

function setMove(input, dx, dy) {
  input.up = dy < -0.2;
  input.down = dy > 0.2;
  input.left = dx < -0.2;
  input.right = dx > 0.2;
}

function clearMove(input) {
  input.up = input.down = input.left = input.right = false;
}

// True when any warden is close with an open line of sight to the thief.
// The radius (5.0) is just past a warden's cone reach in lamplight, so the
// thief holds still only when a warden is near enough to spot it if it
// turns — a farther warden is walked past, not waited out.
function wardenNear(game) {
  const p = game.player;
  const blockers = sightBlockersOf(game.level, true);
  for (const g of game.guards) {
    if (dist(g.x, g.y, p.x, p.y) < 5.0 && !segmentBlocked(g.x, g.y, p.x, p.y, blockers)) {
      return true;
    }
  }
  for (const c of game.cameras) {
    if (dist(c.x, c.y, p.x, p.y) < 5.0 && canSeeThief(game, c.x, c.y, c.angle, 6.2, 0.44)) {
      return true;
    }
  }
  return false;
}

// The warden (or camera) that can see the thief right now, or is close
// enough to sense it — the thing the thief must get away from.
function exposed(game) {
  const p = game.player;
  const blockers = sightBlockersOf(game.level, true);
  for (const g of game.guards) {
    if (canSeeThief(game, g.x, g.y, g.angle, 5.6, 0.56)) return g;
    if (dist(g.x, g.y, p.x, p.y) < 2.5 && !segmentBlocked(g.x, g.y, p.x, p.y, blockers)) return g;
  }
  for (const c of game.cameras) {
    if (canSeeThief(game, c.x, c.y, c.angle, 6.2, 0.44)) return c;
  }
  return null;
}

// A point the thief can stand on without any warden seeing it right now.
// Samples a ring around the thief and asks the game's own vision test at
// each point (the thief's position is borrowed briefly, then restored).
// A point counts when no cone covers it and no warden is within 2.5 of it.
function retreatSpot(game) {
  const p = game.player;
  const ox = p.x, oy = p.y;
  const solids = solidsOf(game.level);
  let best = null, bestScore = -Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (const r of [2.5, 4]) {
      const cx = ox + Math.cos(a) * r;
      const cy = oy + Math.sin(a) * r;
      if (cx < 1 || cy < 1 || cx > game.level.w - 1 || cy > game.level.h - 1) continue;
      if (!segmentClear(cx, cy, cx, cy, solids, 0.32)) continue;
      p.x = cx; p.y = cy;
      let seen = false, minD = Infinity;
      for (const g of game.guards) {
        minD = Math.min(minD, dist(g.x, g.y, cx, cy));
        if (canSeeThief(game, g.x, g.y, g.angle, 5.6, 0.56)) { seen = true; break; }
      }
      if (!seen) {
        for (const c of game.cameras) {
          if (canSeeThief(game, c.x, c.y, c.angle, 6.2, 0.44)) { seen = true; break; }
        }
      }
      if (!seen && minD > 2.5) {
        const score = minD - dist(ox, oy, cx, cy) * 0.1;
        if (score > bestScore) { bestScore = score; best = { x: cx, y: cy }; }
      }
    }
  }
  p.x = ox; p.y = oy;
  return best;
}

// Nearest warden to the thief.
function nearestGuard(game) {
  let best = null, bestD = Infinity;
  for (const g of game.guards) {
    const d = dist(g.x, g.y, game.player.x, game.player.y);
    if (d < bestD) { best = g; bestD = d; }
  }
  return best;
}

// A pebble landing spot that pulls a warden AWAY from the route: near the
// warden (so it hears the clink), on open ground, and far from the leg's
// target. The warden it is meant for must be the NEAREST warden to the
// spot — otherwise another warden answers the clink and the threat stays.
function pebbleSpot(game, guard, tx, ty) {
  const solids = solidsOf(game.level);
  let best = null, bestScore = -Infinity;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const cx = guard.x + Math.cos(a) * 4;
    const cy = guard.y + Math.sin(a) * 4;
    if (cx < 1 || cy < 1 || cx > game.level.w - 1 || cy > game.level.h - 1) continue;
    if (!segmentClear(cx, cy, cx, cy, solids, 0.32)) continue;
    if (dist(guard.x, guard.y, cx, cy) > 5.5) continue;
    const dTarget = dist(tx, ty, cx, cy);
    if (dTarget < 4) continue;
    let nearest = true;
    for (const other of game.guards) {
      if (other !== guard && dist(other.x, other.y, cx, cy) < dist(guard.x, guard.y, cx, cy)) {
        nearest = false;
        break;
      }
    }
    if (!nearest) continue;
    if (dTarget > bestScore) { bestScore = dTarget; best = { x: cx, y: cy }; }
  }
  return best;
}

async function walkTo(game, input, tx, ty, maxSeconds) {
  const steps = Math.round(maxSeconds / DT);
  let path = findPath(game.level, game.player.x, game.player.y, tx, ty) || [{ x: tx, y: ty }];
  let pi = 0;
  let lastStrikes = game.strikes;
  let pebbled = false;
  let smoked = false;
  let detour = null; // retreat spot the thief is falling back to, or null
  for (let i = 0; i < steps; i++) {
    if (game.phase !== 'selftest') return 'phase-' + game.phase;
    const p = game.player;
    if (dist(p.x, p.y, tx, ty) < 0.35) { clearMove(input); return 'ok'; }
    // Re-path if caught (reset to the start) or the next leg is far away.
    if (game.strikes !== lastStrikes) {
      lastStrikes = game.strikes;
      path = findPath(game.level, p.x, p.y, tx, ty) || [{ x: tx, y: ty }];
      pi = 0;
      pebbled = false;
      smoked = false;
      detour = null;
    }
    // Seen by a warden: do not stand in the cone — fall back to a spot
    // no cone covers, then carry on once the room is clear.
    if (exposed(game) && !detour) {
      detour = retreatSpot(game);
      if (detour) {
        path = findPath(game.level, p.x, p.y, detour.x, detour.y) || [{ x: detour.x, y: detour.y }];
        pi = 0;
      }
    }
    if (detour && (dist(p.x, p.y, detour.x, detour.y) < 0.4 || !exposed(game))) {
      detour = null;
      path = findPath(game.level, p.x, p.y, tx, ty) || [{ x: tx, y: ty }];
      pi = 0;
    }
    while (pi < path.length && dist(p.x, p.y, path[pi].x, path[pi].y) < 0.4) pi++;
    let leg = pi < path.length ? path[pi] : { x: tx, y: ty };
    if (dist(p.x, p.y, leg.x, leg.y) > 6) {
      const dest = detour || { x: tx, y: ty };
      path = findPath(game.level, p.x, p.y, dest.x, dest.y) || [dest];
      pi = 0;
      leg = path[0];
    }
    if (detour) {
      // Retreating to the safe spot.
      input.sneak = true;
      setMove(input, leg.x - p.x, leg.y - p.y);
    } else if (wardenNear(game)) {
      // A warden is near but cannot see the thief: hold still. Waiting in
      // the open is how the thief gets spotted, so hide first: smoke
      // blinds every cone (one vial per leg at most), and a pebble pulls
      // a close warden away when the smoke is spent.
      clearMove(input);
      input.sneak = true;
      const g = nearestGuard(game);
      const dGuard = g ? dist(g.x, g.y, p.x, p.y) : Infinity;
      if (!smoked && game.player.smoke > 0 && dGuard < 4.5) {
        if (useSmoke(game)) smoked = true;
      } else if (!pebbled && game.player.coins > 0 && dGuard < 4.5) {
        const spot = pebbleSpot(game, g, tx, ty);
        if (spot && throwCoin(game, spot.x, spot.y)) pebbled = true;
      }
    } else {
      input.sneak = true;
      setMove(input, leg.x - p.x, leg.y - p.y);
    }
    game.step(DT);
    if (i % 120 === 0) await sleep();
  }
  clearMove(input);
  return 'timeout';
}

async function grabHere(game, input, maxSeconds) {
  const steps = Math.round(maxSeconds / DT);
  for (let i = 0; i < steps; i++) {
    if (game.phase !== 'selftest') return 'phase-' + game.phase;
    input.interact = true;
    game.step(DT);
    if (i % 120 === 0) await sleep();
  }
  input.interact = false;
  return 'done';
}

async function testWin(game, input) {
  game.phase = 'selftest';
  const route = [
    [2.5, 13.5], [7, 13.5], [7, 15.5], [11, 15.5], // relic: Jade Inkwell
  ];
  for (const [x, y] of route) {
    const r = await walkTo(game, input, x, y, 60);
    if (r !== 'ok') return `SELFTEST-WIN-FAIL walk-to-${x},${y}:${r}`;
  }
  await grabHere(game, input, 1.2); // the grab channel is 0.8s; no need to linger in the light
  if (game.player.relicsTaken < 1) return 'SELFTEST-WIN-FAIL relic-not-taken';
  const route2 = [
    [16, 13], [18, 12], [20, 12], [21, 9], [24.5, 8], [25, 7.2], // through the vault door
    [26.5, 3.8], // the Amber Ledger — stop close enough to grab it (range 1.3)
  ];
  for (const [x, y] of route2) {
    const r = await walkTo(game, input, x, y, 60);
    if (r !== 'ok') return `SELFTEST-WIN-FAIL walk-to-${x},${y}:${r}`;
  }
  await grabHere(game, input, 1.2); // the grab channel is 0.8s; no need to linger in the light
  if (!game.level.loot.taken) return 'SELFTEST-WIN-FAIL loot-not-taken';
  const route3 = [
    [25, 7.2], [24, 10], [18, 12], [10, 14], [2.5, 15.5], // the green exit
  ];
  for (const [x, y] of route3) {
    const r = await walkTo(game, input, x, y, 60);
    // Reaching the exit completes the job mid-walk: that is the pass.
    if (r === 'phase-complete') break;
    if (r !== 'ok') return `SELFTEST-WIN-FAIL walk-to-${x},${y}:${r}`;
  }
  // Step a few more frames so the exit trigger fires.
  for (let i = 0; i < 30; i++) game.step(DT);
  if (game.phase !== 'complete') return `SELFTEST-WIN-FAIL phase=${game.phase} strikes=${game.strikes}`;
  return `SELFTEST-WIN-PASS score=${game.score} time=${game.time.toFixed(1)} strikes=${game.strikes} ghost=${!game.player.everSpotted}`;
}

async function testCaught(game, input) {
  game.phase = 'selftest';
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = game.guards[0];
    // Step right in front of the warden, in the open, walking.
    game.player.x = g.x + 1.2;
    game.player.y = g.y;
    game.player.stance = 'walk';
    g.angle = Math.atan2(game.player.y - g.y, game.player.x - g.x);
    g.state = 'patrol';
    const before = game.strikes;
    let caught = false;
    for (let i = 0; i < Math.round(20 / DT); i++) {
      input.sneak = false;
      setMove(input, g.x - game.player.x, g.y - game.player.y);
      game.step(DT);
      if (game.strikes > before) { caught = true; break; }
      if (game.phase === 'failed') { caught = true; break; }
      if (i % 120 === 0) await sleep();
    }
    clearMove(input);
    if (!caught) return `SELFTEST-CAUGHT-FAIL attempt=${attempt} strikes=${game.strikes}`;
  }
  if (game.phase !== 'failed' || game.strikes !== 3) {
    return `SELFTEST-CAUGHT-FAIL phase=${game.phase} strikes=${game.strikes}`;
  }
  return `SELFTEST-CAUGHT-PASS strikes=3 phase=failed`;
}

export async function runSelfTest(kind, game, input) {
  try {
    if (kind === 'win') return await testWin(game, input);
    if (kind === 'caught') return await testCaught(game, input);
    return `SELFTEST-FAIL unknown-kind=${kind}`;
  } catch (e) {
    return `SELFTEST-FAIL error=${e && e.message ? e.message : e}`;
  }
}
