// player.js — the thief: movement, stance, noise and loot.
// Walk is quiet, sneak is slower and harder to see, sprint is fast and
// loud. Noise is a ring the wardens can hear; the louder the stance, the
// further it carries.

import { dist, resolveCircle } from './levels.js';
import { hearNoise } from './guards.js';

export const PLAYER_RADIUS = 0.32;
export const WALK_SPEED = 3.3;
export const SNEAK_SPEED = 1.9;
export const SPRINT_SPEED = 4.8;

export function makePlayer(level) {
  return {
    x: level.start.x, y: level.start.y,
    angle: 0,
    stance: 'walk', // walk | sneak | sprint
    moving: false,
    noise: 0, // 0 silent .. 1 loud, shown on the HUD
    noiseRadius: 0,
    noiseT: 0,
    coins: level.coins,
    smoke: level.smoke,
    loot: 0, // value taken this job
    lootCount: 0,
    relicsTaken: 0,
    everSpotted: false,
    smokeCovered: 0, // seconds of smoke cover remaining
    grabT: 0, // channel timer while grabbing loot
    grabTarget: null,
    steps: 0,
  };
}

export function updatePlayer(game, dt, input) {
  const p = game.player;
  const lvl = game.level;

  // Stance from held keys: SHIFT sneaks, SPACE sprints.
  p.stance = input.sneak ? 'sneak' : input.sprint ? 'sprint' : 'walk';
  const speed = p.stance === 'sneak' ? SNEAK_SPEED : p.stance === 'sprint' ? SPRINT_SPEED : WALK_SPEED;

  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  p.moving = mx !== 0 || my !== 0;
  if (p.moving) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    const nx = p.x + mx * speed * dt;
    const ny = p.y + my * speed * dt;
    const r = resolveCircle(nx, ny, PLAYER_RADIUS, game.solids);
    p.x = r.x; p.y = r.y;
    p.angle = Math.atan2(my, mx);
    p.steps += speed * dt;
    // Footfalls: sprint is heard across the room, walk barely at all.
    p.noiseRadius = p.stance === 'sprint' ? 4.2 : p.stance === 'sneak' ? 0.4 : 1.4;
    p.noise = p.stance === 'sprint' ? 1 : p.stance === 'sneak' ? 0.08 : 0.35;
    p.noiseT -= dt;
    if (p.stance === 'sprint' && p.noiseT <= 0) {
      p.noiseT = 0.55;
      game.ring(p.x, p.y, p.noiseRadius, 'noise');
      hearNoise(game, p.x, p.y, p.noiseRadius, 'footsteps');
    }
  } else {
    p.noise = 0;
    p.noiseRadius = 0;
  }
  p.smokeCovered = Math.max(0, p.smokeCovered - dt);

  // Grabbing loot or a relic: hold E beside it for a short channel.
  if (p.grabTarget) {
    p.grabT -= dt;
    if (dist(p.x, p.y, p.grabTarget.x, p.grabTarget.y) > 1.3) {
      p.grabTarget = null; p.grabT = 0;
    } else if (p.grabT <= 0) {
      game.takeLoot(p.grabTarget);
      p.grabTarget = null;
    }
  }

  // Tripwire-adjacent warning is handled in guards.js; the exit is in main.
}

export function nearestGrabbable(game) {
  const p = game.player;
  const lvl = game.level;
  const cands = [];
  if (!lvl.loot.taken) cands.push({ ...lvl.loot, kind: 'loot' });
  for (const r of lvl.relics) if (!r.taken) cands.push({ ...r, kind: 'relic' });
  let best = null, bestD = 1.3;
  for (const c of cands) {
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

// The nearest lamp the thief can douse (E beside a lit lamp).
export function nearestLamp(game) {
  const p = game.player;
  let best = null, bestD = 1.4;
  for (const lamp of game.level.lamps) {
    if (lamp.off) continue;
    const d = dist(p.x, p.y, lamp.x, lamp.y);
    if (d < bestD) { best = lamp; bestD = d; }
  }
  return best;
}
