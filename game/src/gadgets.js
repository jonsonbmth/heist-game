// gadgets.js — the thief's tools, each with a cost.
// A pebble (CLICK) arcs to the mouse and clinks: the nearest warden walks
// over to look. A smoke vial (Q) blooms into a cloud no cone can see
// through. Dousing a lamp (E beside it) kills its pool of light for a while.

import { dist } from './levels.js';
import { hearNoise } from './guards.js';

export function makeGadgets() {
  return {
    coins: [], // {x, y, tx, ty, t, dur, landed}
    smokes: [], // {x, y, t, dur, r}
    rings: [], // {x, y, t, dur, maxR, kind}
  };
}

export function throwCoin(game, wx, wy) {
  const p = game.player;
  if (p.coins <= 0) {
    game.banner('No pebbles left', 'warn');
    return false;
  }
  p.coins -= 1;
  game.gadgets.coins.push({
    x: p.x, y: p.y, tx: wx, ty: wy, t: 0, dur: 0.45, landed: false,
  });
  game.audio.coin();
  return true;
}

export function useSmoke(game) {
  const p = game.player;
  if (p.smoke <= 0) {
    game.banner('No smoke vials left', 'warn');
    return false;
  }
  p.smoke -= 1;
  game.gadgets.smokes.push({ x: p.x, y: p.y, t: 0, dur: 6, r: 2.6 });
  p.smokeCovered = 2.2;
  game.audio.smoke();
  game.banner('Smoke — the cones cannot see through it', 'good');
  return true;
}

export function updateGadgets(game, dt) {
  const g = game.gadgets;
  for (const c of g.coins) {
    if (c.landed) continue;
    c.t += dt;
    if (c.t >= c.dur) {
      c.landed = true;
      c.x = c.tx; c.y = c.ty;
      game.ring(c.x, c.y, 6, 'coin');
      game.audio.clink();
      hearNoise(game, c.x, c.y, 6, 'pebble');
    }
  }
  g.coins = g.coins.filter((c) => !c.landed || c.t < c.dur + 0.4);
  for (const s of g.smokes) s.t += dt;
  g.smokes = g.smokes.filter((s) => s.t < s.dur);
  for (const r of g.rings) r.t += dt;
  g.rings = g.rings.filter((r) => r.t < r.dur);

  // The thief standing inside their own smoke is unseen.
  const p = game.player;
  p.smokeCovered = 0;
  for (const s of g.smokes) {
    if (dist(p.x, p.y, s.x, s.y) < s.r) { p.smokeCovered = 0.2; break; }
  }
}

// Arc position of a flying pebble (a simple parabola, cosmetic only).
export function coinPos(c) {
  const k = Math.min(1, c.t / c.dur);
  return { x: c.x + (c.tx - c.x) * k, y: c.y + (c.ty - c.y) * k, h: Math.sin(k * Math.PI) * 1.1 };
}
