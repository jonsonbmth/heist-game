// selftest.js — scripted playthroughs that drive the REAL game loop.
// ?selftest=win plays job 1 to a clean getaway with the autopilot below
// (sneak, wait when a warden has line of sight, grab, exit). ?selftest=caught
// walks into a warden three times and expects the failed screen. The
// result is written into #selftest-result and document.title so a headless
// run can read it with --dump-dom.

import { dist, segmentBlocked, sightBlockersOf } from './levels.js';
import { canSeeThief } from './guards.js';

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
function wardenNear(game) {
  const p = game.player;
  const blockers = sightBlockersOf(game.level, true);
  for (const g of game.guards) {
    if (dist(g.x, g.y, p.x, p.y) < 4.5 && !segmentBlocked(g.x, g.y, p.x, p.y, blockers)) {
      return true;
    }
  }
  for (const c of game.cameras) {
    if (dist(c.x, c.y, p.x, p.y) < 4.5 && canSeeThief(game, c.x, c.y, c.angle, 6.2, 0.44)) {
      return true;
    }
  }
  return false;
}

async function walkTo(game, input, tx, ty, maxSeconds) {
  const steps = Math.round(maxSeconds / DT);
  for (let i = 0; i < steps; i++) {
    if (game.phase !== 'selftest') return 'phase-' + game.phase;
    const p = game.player;
    if (dist(p.x, p.y, tx, ty) < 0.35) { clearMove(input); return 'ok'; }
    if (wardenNear(game)) {
      // Hold still, sneaking, until the room is clear again.
      clearMove(input);
      input.sneak = true;
    } else {
      input.sneak = true;
      setMove(input, tx - p.x, ty - p.y);
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
    [2.5, 13.5], [7, 13.5], [11, 13], // relic: Jade Inkwell
  ];
  for (const [x, y] of route) {
    const r = await walkTo(game, input, x, y, 60);
    if (r !== 'ok') return `SELFTEST-WIN-FAIL walk-to-${x},${y}:${r}`;
  }
  await grabHere(game, input, 3);
  if (game.player.relicsTaken < 1) return 'SELFTEST-WIN-FAIL relic-not-taken';
  const route2 = [
    [16, 13], [18, 11], [21, 9], [24.5, 8], [25, 7.2], // through the vault door
    [26.5, 4.5], // the Amber Ledger
  ];
  for (const [x, y] of route2) {
    const r = await walkTo(game, input, x, y, 60);
    if (r !== 'ok') return `SELFTEST-WIN-FAIL walk-to-${x},${y}:${r}`;
  }
  await grabHere(game, input, 3);
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
