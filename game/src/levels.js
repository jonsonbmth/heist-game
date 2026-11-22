// levels.js — the three jobs of THE AMBER LEDGER.
// Every job is a fixed, hand-authored room: walls, cover, lamps, patrols,
// cameras, tripwires, loot and the green exit. No randomness: the same job
// always plays the same way, so a screenshot can be staged and replayed.
// Coordinates are world units; 1 unit = 1 floor tile. x grows east, y grows
// south. A box is {x, y, w, h} with x/y its north-west corner.

export const TILE = 1;

// AABB helpers shared by movement, sight and the tripwire test.
export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function boxContains(box, px, py, pad = 0) {
  return px >= box.x - pad && px <= box.x + box.w + pad &&
    py >= box.y - pad && py <= box.y + box.h + pad;
}

// Does segment (x1,y1)-(x2,y2) cross any box in `boxes`?
export function segmentBlocked(x1, y1, x2, y2, boxes) {
  for (const b of boxes) {
    if (segmentHitsBox(x1, y1, x2, y2, b)) return true;
  }
  return false;
}

function segmentHitsBox(x1, y1, x2, y2, b) {
  // Slab test; a segment starting inside the box counts as blocked.
  if (boxContains(b, x1, y1) || boxContains(b, x2, y2)) return true;
  const dx = x2 - x1, dy = y2 - y1;
  let tmin = 0, tmax = 1;
  if (dx === 0) {
    if (x1 < b.x || x1 > b.x + b.w) return false;
  } else {
    let t1 = (b.x - x1) / dx, t2 = (b.x + b.w - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dy === 0) {
    if (y1 < b.y || y1 > b.y + b.h) return false;
  } else {
    let t1 = (b.y - y1) / dy, t2 = (b.y + b.h - y1) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// Circle (px,py,r) pushed out of every solid box. Returns true if it hit.
export function resolveCircle(px, py, r, solids) {
  let hit = false;
  for (const b of solids) {
    const cx = Math.max(b.x, Math.min(px, b.x + b.w));
    const cy = Math.max(b.y, Math.min(py, b.y + b.h));
    const dx = px - cx, dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        px = cx + (dx / d) * r;
        py = cy + (dy / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = px - b.x, pr = b.x + b.w - px;
        const pt = py - b.y, pb = b.y + b.h - py;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) px = b.x - r;
        else if (m === pr) px = b.x + b.w + r;
        else if (m === pt) py = b.y - r;
        else py = b.y + b.h + r;
      }
    }
  }
  return { x: px, y: py, hit };
}

function border(w, h, t = 1) {
  return [
    { x: 0, y: 0, w, h: t },
    { x: 0, y: h - t, w, h: t },
    { x: 0, y: 0, w: t, h },
    { x: w - t, y: 0, w: t, h },
  ];
}

// ---------------------------------------------------------------------------
// JOB 1 — THE COUNTING HOUSE. Two wardens, one brass eye, a vault with the
// Amber Ledger. Teaches: cones, lamplight, pebble distraction, exit.
// ---------------------------------------------------------------------------
const JOB1 = {
  id: 1,
  name: 'THE COUNTING HOUSE',
  place: 'Merrow & Sons Counting House',
  objective: 'Lift the Amber Ledger, then reach the green exit',
  w: 30, h: 18,
  par: 90,
  walls: [
    ...border(30, 18),
    // Vault room, north-east: door gap in its south wall (x 24..26).
    { x: 20, y: 1, w: 1, h: 5 },
    { x: 20, y: 6, w: 4, h: 1 },
    { x: 26, y: 6, w: 3, h: 1 },
    // Counting-hall divider with two gaps.
    { x: 12, y: 8, w: 1, h: 4 },
    { x: 12, y: 14, w: 1, h: 3 },
  ],
  crates: [
    { x: 5, y: 4, w: 3, h: 2 },   // coin chests, west hall
    { x: 9, y: 12, w: 2, h: 2 },  // counting tables — leaves the divider gap (x 11..13) open as a second route east
    { x: 15, y: 9, w: 4, h: 2 },
    { x: 23, y: 12, w: 3, h: 2 },
  ],
  cover: [
    { x: 4, y: 12, w: 3, h: 1 },  // low ledgers — crouch to hide
    { x: 17, y: 4, w: 3, h: 1 },
  ],
  grass: [
    { x: 24, y: 12, w: 4, h: 2 }, // potted ferns, south-east
    { x: 2, y: 12, w: 2, h: 2 },
  ],
  carpets: [
    { x: 21, y: 1, w: 8, h: 6, color: '#5a1f2b' }, // vault carpet
    // No hall runner: the dark navy rug used to cover the whole south
    // hall and hide the bright marble in the foreground. The marble
    // floor shows instead, like the reference's bright floor.
  ],
  labels: [
    { x: 6.5, y: 2.5, text: 'COIN HALL' },
    { x: 24.5, y: 1.6, text: 'THE VAULT' },
    { x: 6.5, y: 15.5, text: 'ENTRANCE' },
  ],
  lamps: [
    { x: 6, y: 3, r: 4.2 },
    { x: 15, y: 5, r: 4.2 },
    { x: 25, y: 10, r: 4.2 },
    { x: 10, y: 14, r: 3.8 },
  ],
  guards: [
    {
      name: 'W-1 BRAM', x: 8, y: 9, angle: 0, pause: 1.4, speed: 2.1,
      // East waypoint pulled 2 tiles north of the counting tables: the
      // warden no longer pauses on the thief's route into the vault.
      waypoints: [[8, 9], [16, 8], [16, 11], [8, 13]],
    },
    {
      name: 'W-2 ODETTE', x: 18, y: 3, angle: Math.PI / 2, pause: 1.8, speed: 2.0,
      // Door waypoints sit 2 tiles west of the vault door (x 24): the
      // warden still covers the east hall, but no longer pauses on the
      // door itself, so the thief gets a fair timing window to slip in.
      // The east loop runs along the south wall (y 15) instead of the
      // exit corridor (y 10-12), so the way out stays open too.
      waypoints: [[18, 3], [18, 12], [23, 15], [20, 15]],
    },
  ],
  cameras: [
    { name: 'C1', x: 15, y: 1.2, angle: Math.PI / 2, sweep: 0.7, speed: 0.45 },
  ],
  lasers: [],
  loot: { x: 26.5, y: 3.5, value: 500, label: 'AMBER LEDGER' },
  relics: [
    { x: 22.5, y: 3, value: 150, label: 'Silver Seal' },
    { x: 11, y: 15.5, value: 150, label: 'Jade Inkwell' },
  ],
  exit: { x: 2.5, y: 15.5 },
  start: { x: 2.5, y: 9 },
  coins: 5, smoke: 2,
};

// ---------------------------------------------------------------------------
// JOB 2 — THE LANTERN BANK. Three wardens, two brass eyes, one tripwire
// across the vault door. Teaches: camera arcs, timed laser gaps.
// ---------------------------------------------------------------------------
const JOB2 = {
  id: 2,
  name: 'THE LANTERN BANK',
  place: 'First Lantern Bank, Night Vault',
  objective: 'Lift the Gilded Note, dodge the tripwire, reach the exit',
  w: 30, h: 18,
  par: 120,
  walls: [
    ...border(30, 18),
    // Vault, north-east, door gap x 23..25 in south wall.
    { x: 19, y: 1, w: 1, h: 5 },
    { x: 19, y: 6, w: 4, h: 1 },
    { x: 25, y: 6, w: 4, h: 1 },
    // Teller row, west, with a gap at y 8..10.
    { x: 9, y: 1, w: 1, h: 7 },
    { x: 9, y: 10, w: 1, h: 7 },
    // Strong-room divider, south.
    { x: 16, y: 12, w: 1, h: 5 },
  ],
  crates: [
    { x: 4, y: 4, w: 3, h: 2 },
    { x: 13, y: 3, w: 3, h: 2 },
    { x: 13, y: 13, w: 4, h: 2 },
    { x: 22, y: 12, w: 3, h: 2 },
    { x: 26, y: 9, w: 2, h: 2 },
  ],
  cover: [
    { x: 5, y: 10, w: 3, h: 1 },
    { x: 18, y: 9, w: 3, h: 1 },
    { x: 24, y: 15, w: 3, h: 1 },
  ],
  grass: [
    { x: 2, y: 13, w: 3, h: 2 },
    { x: 27, y: 14, w: 2, h: 2 },
  ],
  carpets: [
    { x: 20, y: 1, w: 9, h: 6, color: '#5a1f2b' },
    // No navy strip: the bright marble floor shows across the room.
  ],
  labels: [
    { x: 5.5, y: 2.5, text: 'TELLER ROW' },
    { x: 24.5, y: 1.6, text: 'NIGHT VAULT' },
    { x: 14.5, y: 16.5, text: 'STRONG ROOM' },
  ],
  lamps: [
    { x: 5, y: 8, r: 4.2 },
    { x: 14, y: 6, r: 4.2 },
    { x: 24, y: 9, r: 4.2 },
    { x: 12, y: 15, r: 3.8 },
    { x: 27, y: 4, r: 3.8 },
  ],
  guards: [
    {
      name: 'W-1 BRAM', x: 6, y: 7, angle: 0, pause: 1.2, speed: 2.2,
      waypoints: [[6, 7], [6, 13], [12, 15.5], [13, 6]],
    },
    {
      name: 'W-2 ODETTE', x: 17, y: 4, angle: Math.PI / 2, pause: 1.6, speed: 2.1,
      waypoints: [[17, 4], [17, 10], [23, 10], [23, 4]],
    },
    {
      name: 'W-3 IVO', x: 26, y: 13, angle: Math.PI, pause: 2.0, speed: 2.0,
      waypoints: [[26, 13], [20, 13], [20, 16], [26, 16]],
    },
  ],
  cameras: [
    { name: 'C1', x: 12, y: 1.2, angle: Math.PI / 2, sweep: 0.8, speed: 0.5 },
    { name: 'C2', x: 28.8, y: 9, angle: Math.PI, sweep: 0.6, speed: 0.4 },
  ],
  lasers: [
    // Across the vault door; pulses: 2.2 s on, 1.4 s off.
    { x1: 23, y1: 7, x2: 25, y2: 7, onTime: 2.2, offTime: 1.4, phase: 0 },
  ],
  loot: { x: 26.5, y: 3.5, value: 700, label: 'GILDED NOTE' },
  relics: [
    { x: 21.5, y: 3, value: 200, label: 'Brass Key' },
    { x: 5.5, y: 7.5, value: 200, label: 'Ivory Abacus' },
    { x: 27.5, y: 15, value: 200, label: 'Lantern Ruby' },
  ],
  exit: { x: 2.5, y: 15.5 },
  start: { x: 2.5, y: 9 },
  coins: 5, smoke: 2,
};

// ---------------------------------------------------------------------------
// JOB 3 — THE GILDED ARCHIVE. Four wardens, two brass eyes, two tripwires,
// three relics. The full route: gallery, reading room, archive vault.
// ---------------------------------------------------------------------------
const JOB3 = {
  id: 3,
  name: 'THE GILDED ARCHIVE',
  place: 'The Gilded Archive, Meridian Wing',
  objective: 'Lift the Hollow Star, then vanish through the exit',
  w: 32, h: 20,
  par: 150,
  walls: [
    ...border(32, 20),
    // Archive vault, north-east, door gap x 25..27.
    { x: 21, y: 1, w: 1, h: 6 },
    { x: 21, y: 7, w: 4, h: 1 },
    { x: 27, y: 7, w: 4, h: 1 },
    // Gallery wall, west, gap y 9..11.
    { x: 10, y: 1, w: 1, h: 8 },
    { x: 10, y: 11, w: 1, h: 8 },
    // Reading-room divider, south, gap x 18..20.
    { x: 14, y: 14, w: 4, h: 1 },
    { x: 20, y: 14, w: 1, h: 5 },
  ],
  crates: [
    { x: 4, y: 4, w: 3, h: 2 },
    { x: 14, y: 4, w: 3, h: 2 },
    { x: 14, y: 10, w: 4, h: 2 },
    { x: 24, y: 12, w: 3, h: 2 },
    { x: 28, y: 10, w: 2, h: 2 },
    { x: 6, y: 16, w: 3, h: 2 },
  ],
  cover: [
    { x: 5, y: 11, w: 3, h: 1 },
    { x: 18, y: 10, w: 3, h: 1 },
    { x: 26, y: 16, w: 3, h: 1 },
  ],
  grass: [
    { x: 2, y: 15, w: 3, h: 2 },
    { x: 29, y: 16, w: 2, h: 2 },
    { x: 18, y: 17, w: 3, h: 1 },
  ],
  carpets: [
    { x: 22, y: 1, w: 9, h: 7, color: '#5a1f2b' },
    { x: 1, y: 1, w: 9, h: 8, color: '#2c2417' },
    // No navy strip: the bright marble floor shows across the room.
  ],
  labels: [
    { x: 5.5, y: 2.5, text: 'GALLERY' },
    { x: 26.5, y: 1.6, text: 'ARCHIVE VAULT' },
    { x: 16.5, y: 18.5, text: 'READING ROOM' },
  ],
  lamps: [
    { x: 5, y: 7, r: 4.2 },
    { x: 15, y: 7, r: 4.2 },
    { x: 26, y: 10, r: 4.2 },
    { x: 12, y: 16, r: 3.8 },
    { x: 29, y: 4, r: 3.8 },
    { x: 20, y: 18, r: 3.8 },
  ],
  guards: [
    {
      name: 'W-1 BRAM', x: 6, y: 7, angle: 0, pause: 1.2, speed: 2.3,
      waypoints: [[6, 7], [6, 14], [13, 14], [13, 6]],
    },
    {
      name: 'W-2 ODETTE', x: 16, y: 3, angle: Math.PI / 2, pause: 1.5, speed: 2.2,
      waypoints: [[16, 3], [16, 13], [22, 13], [23, 4]],
    },
    {
      name: 'W-3 IVO', x: 28, y: 14, angle: Math.PI, pause: 1.8, speed: 2.1,
      waypoints: [[28, 14], [22, 14], [22, 17], [28, 17]],
    },
    {
      name: 'W-4 SABLE', x: 18, y: 17, angle: -Math.PI / 2, pause: 2.2, speed: 2.0,
      waypoints: [[18, 17], [12, 17], [12, 12], [19, 12.5]],
    },
  ],
  cameras: [
    { name: 'C1', x: 13, y: 1.2, angle: Math.PI / 2, sweep: 0.8, speed: 0.5 },
    { name: 'C2', x: 30.8, y: 10, angle: Math.PI, sweep: 0.7, speed: 0.45 },
  ],
  lasers: [
    { x1: 25, y1: 8, x2: 27, y2: 8, onTime: 2.0, offTime: 1.5, phase: 0 },
    { x1: 11, y1: 9, x2: 11, y2: 11, onTime: 1.8, offTime: 1.6, phase: 0.9 },
  ],
  loot: { x: 28.5, y: 3.5, value: 1000, label: 'HOLLOW STAR' },
  relics: [
    { x: 23.5, y: 3, value: 250, label: 'Gilt Orrery' },
    { x: 5.5, y: 7.5, value: 250, label: 'Meridian Seal' },
    { x: 15.5, y: 13.5, value: 250, label: 'Star Chart' },
  ],
  exit: { x: 2.5, y: 17.5 },
  start: { x: 2.5, y: 10 },
  coins: 6, smoke: 3,
};

export const JOBS = [JOB1, JOB2, JOB3];

export function solidsOf(level) {
  return [...level.walls, ...level.crates, ...level.cover];
}

export function sightBlockersOf(level, playerSneaking) {
  const list = [...level.walls, ...level.crates];
  if (playerSneaking) list.push(...level.cover);
  return list;
}

// ---------------------------------------------------------------------------
// Pathfinding — a small grid A* so wardens (and the scripted playthrough)
// walk AROUND furniture instead of pushing against it. A cell is open when
// a circle of `radius` centred on it clears every solid; moves between
// neighbouring cells are checked the same way, and the returned path is
// shortcut into straight legs. Deterministic: fixed grid, fixed neighbour
// order, no randomness.
// ---------------------------------------------------------------------------
const PATH_CELL = 0.25; // fine enough to thread the 0.36-wide lane between
// a crate and the cover below it, and the diagonal squeeze between two
// crate corners (a 0.5 grid misses both and A* wrongly reports no path).

function pointClear(x, y, solids, radius) {
  for (const b of solids) {
    if (boxContains(b, x, y, radius)) return false;
  }
  return true;
}

// True when a circle of `radius` can travel the segment without touching
// a solid (sampled; the step is far smaller than the radius).
export function segmentClear(x1, y1, x2, y2, solids, radius) {
  const d = dist(x1, y1, x2, y2);
  const n = Math.max(1, Math.ceil(d / 0.1));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!pointClear(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, solids, radius)) return false;
  }
  return true;
}

export function findPath(level, sx, sy, tx, ty, radius = 0.32) {
  const solids = solidsOf(level);
  const cols = Math.ceil(level.w / PATH_CELL);
  const rows = Math.ceil(level.h / PATH_CELL);
  const cellOf = (x, y) => ({
    cx: Math.max(0, Math.min(cols - 1, Math.floor(x / PATH_CELL))),
    cy: Math.max(0, Math.min(rows - 1, Math.floor(y / PATH_CELL))),
  });
  const centre = (cx, cy) => ({ x: (cx + 0.5) * PATH_CELL, y: (cy + 0.5) * PATH_CELL });
  const open = (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
    const c = centre(cx, cy);
    return pointClear(c.x, c.y, solids, radius);
  };
  // Nearest open cell to a point (spiral search, bounded).
  const nearestOpen = (x, y) => {
    const s = cellOf(x, y);
    if (open(s.cx, s.cy)) return s;
    for (let r = 1; r <= 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (open(s.cx + dx, s.cy + dy)) return { cx: s.cx + dx, cy: s.cy + dy };
        }
      }
    }
    return null;
  };
  const start = nearestOpen(sx, sy);
  const goal = nearestOpen(tx, ty);
  if (!start || !goal) return null;
  const key = (cx, cy) => cy * cols + cx;
  const gScore = new Map([[key(start.cx, start.cy), 0]]);
  const came = new Map();
  const openSet = [{ cx: start.cx, cy: start.cy, f: 0 }];
  const inOpen = new Set([key(start.cx, start.cy)]);
  const closed = new Set();
  const h = (cx, cy) => {
    const dx = Math.abs(cx - goal.cx), dy = Math.abs(cy - goal.cy);
    return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
  };
  const DIRS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
  ];
  let pops = 0;
  while (openSet.length) {
    if (++pops > 6000) return null; // bound a failed search; caller falls back
    let bi = 0;
    for (let i = 1; i < openSet.length; i++) if (openSet[i].f < openSet[bi].f) bi = i;
    const cur = openSet.splice(bi, 1)[0];
    inOpen.delete(key(cur.cx, cur.cy));
    if (cur.cx === goal.cx && cur.cy === goal.cy) {
      const cells = [];
      let c = { cx: cur.cx, cy: cur.cy };
      while (c) {
        cells.push(centre(c.cx, c.cy));
        const p = came.get(key(c.cx, c.cy));
        c = p ? { cx: p[0], cy: p[1] } : null;
      }
      cells.reverse();
      // Shortcut: keep only the farthest point reachable in a straight line.
      const pts = [];
      let i = 0;
      let from = { x: sx, y: sy };
      while (i < cells.length) {
        let j = cells.length - 1;
        while (j > i && !segmentClear(from.x, from.y, cells[j].x, cells[j].y, solids, radius)) j--;
        pts.push(cells[j]);
        from = cells[j];
        i = j + 1;
      }
      if (segmentClear(from.x, from.y, tx, ty, solids, radius)) pts.push({ x: tx, y: ty });
      return pts;
    }
    closed.add(key(cur.cx, cur.cy));
    for (const [dx, dy, cost] of DIRS) {
      const nx = cur.cx + dx, ny = cur.cy + dy;
      if (!open(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!open(cur.cx + dx, cur.cy) || !open(cur.cx, cur.cy + dy))) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = gScore.get(key(cur.cx, cur.cy)) + cost;
      if (gScore.has(nk) && ng >= gScore.get(nk)) continue;
      gScore.set(nk, ng);
      came.set(nk, [cur.cx, cur.cy]);
      const nf = ng + h(nx, ny);
      if (!inOpen.has(nk)) { openSet.push({ cx: nx, cy: ny, f: nf }); inOpen.add(nk); }
      else {
        const e = openSet.find((o) => o.cx === nx && o.cy === ny);
        if (e) e.f = nf;
      }
    }
  }
  return null;
}
