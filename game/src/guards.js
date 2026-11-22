// guards.js — warden patrol, vision, suspicion and the hunt.
// A warden patrols its waypoints, pauses to look around, and reads the
// room through a vision cone: range, angle and line of sight. Seeing the
// thief fills suspicion; a full meter turns the warden to the hunt. Noise
// (a sprint, a thrown pebble) pulls a warden to investigate. Catching the
// thief costs the thief a strike — after a short, visible warning.

import { boxContains, dist, findPath, resolveCircle, segmentBlocked, sightBlockersOf } from './levels.js';

export const CONE_RANGE = 5.6;
export const CONE_HALF_ANGLE = 0.56; // ~32 degrees each side
export const CAMERA_RANGE = 6.2;
export const CAMERA_HALF_ANGLE = 0.44;
export const CATCH_DISTANCE = 0.62;
export const SUSPICION_FILL = 0.8; // per second while the thief is seen —
// a full meter takes 1.25 s of continuous sight, so a thief who slips
// out of a cone in time is not instantly hunted: a fair caught moment.
export const SUSPICION_DECAY = 0.22; // per second while unseen

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

// Visibility of the thief as a 0..1.6 multiplier on cone range, from stance,
// light and cover. Lamplight exposes; shadow, sneaking and tall grass hide.
export function thiefVisibility(game) {
  const p = game.player;
  const lvl = game.level;
  let v = 1.0;
  if (p.stance === 'sneak') v *= 0.55;
  else if (p.stance === 'sprint') v *= 1.25;
  let inLamp = false;
  for (const lamp of lvl.lamps) {
    if (lamp.off) continue;
    if (dist(p.x, p.y, lamp.x, lamp.y) < lamp.r) { inLamp = true; break; }
  }
  if (inLamp) v *= 1.45;
  else v *= 0.6; // shadow is the thief's friend
  for (const g of lvl.grass) {
    if (boxContains(g, p.x, p.y)) { v *= 0.4; break; }
  }
  if (p.smokeCovered > 0) v = 0;
  return Math.min(v, 1.6);
}

// True when `seer` (guard or camera) can see the thief right now.
export function canSeeThief(game, sx, sy, angle, range, halfAngle) {
  const p = game.player;
  const d = dist(sx, sy, p.x, p.y);
  const vis = thiefVisibility(game);
  if (d > range * vis) return false;
  // Very close up, a warden senses the thief even outside the cone — but
  // only at arm's length (1.5), so sneaking up behind one stays fair.
  if (d > 1.5 && Math.abs(angleDiff(angleTo(sx, sy, p.x, p.y), angle)) > halfAngle) return false;
  const blockers = sightBlockersOf(game.level, game.player.stance === 'sneak');
  if (segmentBlocked(sx, sy, p.x, p.y, blockers)) return false;
  return true;
}

export function makeGuard(def) {
  return {
    name: def.name,
    x: def.x, y: def.y,
    homeX: def.x, homeY: def.y,
    angle: def.angle,
    waypoints: def.waypoints.map(([x, y]) => ({ x, y })),
    wpIndex: 0,
    pause: def.pause,
    speed: def.speed,
    state: 'patrol', // patrol | suspicious | hunt | return
    suspicion: 0,
    pauseT: 0,
    targetX: def.x, targetY: def.y,
    investigateX: 0, investigateY: 0,
    lookT: 0,
    catchWarnT: 0,
    path: [], pathI: 0, pathKey: '',
    stuckT: 0, lastX: def.x, lastY: def.y,
  };
}

// Walk toward (tx,ty) along a path that routes around furniture. The path
// is (re)computed when the goal or its target moves; the guard follows one
// path point at a time. Returns true when the guard is on top of the goal.
// A stuck guard (no progress for 2 s) gets a fresh path from where it is.
function followPath(game, g, tx, ty, key, speed, dt) {
  const end = g.path.length ? g.path[g.path.length - 1] : null;
  if (g.pathKey !== key || !end || dist(end.x, end.y, tx, ty) > 0.6) {
    const pts = findPath(game.level, g.x, g.y, tx, ty);
    g.path = pts && pts.length ? pts : [{ x: tx, y: ty }];
    g.pathI = 0;
    g.pathKey = key;
  }
  if (dist(g.x, g.y, tx, ty) < 0.4) { g.path = []; return true; }
  const pt = g.path[Math.min(g.pathI, g.path.length - 1)];
  if (moveTowardGuard(game, g, pt.x, pt.y, speed, dt) && g.pathI < g.path.length - 1) g.pathI++;
  if (dist(g.x, g.y, g.lastX, g.lastY) > 0.02) { g.stuckT = 0; g.lastX = g.x; g.lastY = g.y; }
  else {
    g.stuckT += dt;
    if (g.stuckT > 2) { g.pathKey = ''; g.stuckT = 0; }
  }
  return dist(g.x, g.y, tx, ty) < 0.4;
}

function moveTowardGuard(game, g, tx, ty, speed, dt) {
  const d = dist(g.x, g.y, tx, ty);
  if (d < 0.05) return true;
  const step = Math.min(d, speed * dt);
  const nx = g.x + ((tx - g.x) / d) * step;
  const ny = g.y + ((ty - g.y) / d) * step;
  const r = resolveCircle(nx, ny, 0.32, game.solids);
  g.x = r.x; g.y = r.y;
  g.angle = angleTo(g.x, g.y, tx, ty);
  return d <= step + 0.01;
}

// A noise event at (x,y) with radius: the nearest warden in range turns.
export function hearNoise(game, x, y, radius, cause) {
  let best = null, bestD = Infinity;
  for (const g of game.guards) {
    const d = dist(g.x, g.y, x, y);
    if (d < radius && d < bestD) { best = g; bestD = d; }
  }
  if (!best) return null;
  if (best.state === 'hunt') return best;
  best.state = 'suspicious';
  best.investigateX = x; best.investigateY = y;
  best.suspicion = Math.max(best.suspicion, 0.55);
  game.banner(`? HEARD ${cause.toUpperCase()} — ${best.name.split(' ')[0]} off to look`, 'noise');
  return best;
}

export function updateGuards(game, dt) {
  const p = game.player;
  let maxSuspicion = 0;
  for (const g of game.guards) {
    const seen = canSeeThief(game, g.x, g.y, g.angle, CONE_RANGE, CONE_HALF_ANGLE);
    if (seen) {
      g.suspicion = Math.min(1, g.suspicion + SUSPICION_FILL * dt);
      if (g.state !== 'hunt') {
        g.state = 'suspicious';
        g.investigateX = p.x; g.investigateY = p.y;
      }
      if (g.suspicion >= 1 && g.state !== 'hunt') {
        g.state = 'hunt';
        game.banner(`${g.name} HAS YOU — RUN!`, 'alarm');
        game.audio.alert();
      }
      if (!p.everSpotted) { p.everSpotted = true; }
    } else {
      g.suspicion = Math.max(0, g.suspicion - SUSPICION_DECAY * dt);
    }
    maxSuspicion = Math.max(maxSuspicion, g.suspicion);

    if (g.state === 'patrol') {
      const wp = g.waypoints[g.wpIndex];
      if (g.pauseT > 0) {
        g.pauseT -= dt;
        g.lookT += dt;
        g.angle += Math.sin(g.lookT * 1.4) * 0.35 * dt; // scan the room
      } else if (followPath(game, g, wp.x, wp.y, `patrol:${g.wpIndex}`, g.speed, dt)) {
        g.wpIndex = (g.wpIndex + 1) % g.waypoints.length;
        g.pauseT = g.pause;
        g.lookT = 0;
      }
    } else if (g.state === 'suspicious') {
      if (g.pauseT > 0) {
        // Stood at the spot, scanning: if the thief is still visible once
        // the look is over, keep after them; otherwise give up and patrol.
        g.pauseT -= dt;
        g.lookT += dt;
        g.angle += Math.sin(g.lookT * 1.4) * 0.35 * dt;
        if (g.pauseT <= 0) {
          if (seen) { g.investigateX = p.x; g.investigateY = p.y; }
          else {
            g.state = 'patrol';
            g.wpIndex = nearestWaypoint(g);
            g.suspicion = Math.max(0, g.suspicion - 0.35);
            g.pathKey = '';
          }
        }
      } else if (followPath(game, g, g.investigateX, g.investigateY, 'suspicious', g.speed * 1.15, dt)) {
        if (seen) g.pauseT = 0.8;
        else {
          g.pauseT = 1.6;
          g.state = 'patrol';
          g.wpIndex = nearestWaypoint(g);
          g.suspicion = Math.max(0, g.suspicion - 0.35);
          g.pathKey = '';
        }
      }
    } else if (g.state === 'hunt') {
      if (seen) { g.targetX = p.x; g.targetY = p.y; }
      const arrived = followPath(game, g, g.targetX, g.targetY, 'hunt', g.speed * 1.65, dt);
      if (dist(g.x, g.y, p.x, p.y) < CATCH_DISTANCE) {
        game.onCaught(g);
        return;
      }
      if (arrived && !seen) {
        g.state = 'suspicious';
        g.investigateX = g.targetX; g.investigateY = g.targetY;
        g.pathKey = '';
      }
      if (g.suspicion <= 0.05 && !seen) {
        g.state = 'return';
        g.pathKey = '';
      }
    } else if (g.state === 'return') {
      if (followPath(game, g, g.homeX, g.homeY, 'return', g.speed, dt)) {
        g.state = 'patrol';
        g.wpIndex = nearestWaypoint(g);
        g.pathKey = '';
      }
    }
  }
  game.maxSuspicion = maxSuspicion;
}

function nearestWaypoint(g) {
  let best = 0, bestD = Infinity;
  g.waypoints.forEach((wp, i) => {
    const d = dist(g.x, g.y, wp.x, wp.y);
    if (d < bestD) { best = i; bestD = d; }
  });
  return best;
}

// Security cameras: a sweeping arc. Being seen by one spikes suspicion.
export function makeCamera(def) {
  return {
    name: def.name, x: def.x, y: def.y,
    baseAngle: def.angle, angle: def.angle,
    sweep: def.sweep, speed: def.speed,
    t: 0, exposure: 0, spotted: false,
  };
}

export function updateCameras(game, dt) {
  for (const cam of game.cameras) {
    cam.t += dt;
    cam.angle = cam.baseAngle + Math.sin(cam.t * cam.speed) * cam.sweep;
    const seen = canSeeThief(game, cam.x, cam.y, cam.angle, CAMERA_RANGE, CAMERA_HALF_ANGLE);
    cam.spotted = seen;
    if (seen) {
      cam.exposure = Math.min(1, cam.exposure + dt * 0.9);
      for (const g of game.guards) {
        if (g.state !== 'hunt') {
          g.suspicion = Math.min(1, g.suspicion + dt * 0.8);
          g.state = 'suspicious';
          g.investigateX = game.player.x; g.investigateY = game.player.y;
        }
      }
      if (cam.exposure > 0.4 && !game.player.everSpotted) game.player.everSpotted = true;
    } else {
      cam.exposure = Math.max(0, cam.exposure - dt * 0.3);
    }
  }
}

// Tripwires: a pulsing beam. Cross it while it is live and the alarm jumps.
export function makeLaser(def) {
  return { ...def, t: def.phase || 0, live: true, tripped: false, coolT: 0 };
}

export function updateLasers(game, dt) {
  for (const lz of game.lasers) {
    lz.t += dt;
    const cycle = lz.onTime + lz.offTime;
    lz.live = (lz.t % cycle) < lz.onTime;
    lz.coolT = Math.max(0, lz.coolT - dt);
    if (!lz.live || lz.coolT > 0) continue;
    const p = game.player;
    if (segmentHitsPoint(lz, p.x, p.y, 0.3)) {
      lz.tripped = true;
      lz.coolT = 3;
      game.alarm = Math.min(1, game.alarm + 0.34);
      game.banner('TRIPWIRE! The alarm climbs', 'alarm');
      game.audio.alert();
      for (const g of game.guards) {
        if (g.state === 'patrol') {
          g.state = 'suspicious';
          g.investigateX = p.x; g.investigateY = p.y;
          g.suspicion = Math.max(g.suspicion, 0.6);
        }
      }
    }
  }
}

function segmentHitsPoint(lz, px, py, pad) {
  // Distance from point to the laser segment.
  const dx = lz.x2 - lz.x1, dy = lz.y2 - lz.y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - lz.x1) * dx + (py - lz.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = lz.x1 + t * dx, cy = lz.y1 + t * dy;
  return dist(px, py, cx, cy) < pad;
}
