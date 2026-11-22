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
    { x: 9, y: 12, w: 4, h: 2 },  // counting tables
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
    { x: 13, y: 8, w: 16, h: 9, color: '#233246' }, // hall runner
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
      waypoints: [[8, 9], [16, 9], [16, 13], [8, 13]],
    },
    {
      name: 'W-2 ODETTE', x: 18, y: 4, angle: Math.PI / 2, pause: 1.8, speed: 2.0,
      waypoints: [[18, 4], [18, 10], [24, 10], [24, 4]],
    },
  ],
  cameras: [
    { name: 'C1', x: 15, y: 1.2, angle: Math.PI / 2, sweep: 0.7, speed: 0.45 },
  ],
  lasers: [],
  loot: { x: 26.5, y: 3.5, value: 500, label: 'AMBER LEDGER' },
  relics: [
    { x: 22.5, y: 3, value: 150, label: 'Silver Seal' },
    { x: 11, y: 13, value: 150, label: 'Jade Inkwell' },
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
    { x: 1, y: 8, w: 28, h: 2, color: '#233246' },
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
      name: 'W-1 BRAM', x: 6, y: 6, angle: 0, pause: 1.2, speed: 2.2,
      waypoints: [[6, 6], [6, 13], [13, 13], [13, 6]],
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
    { x: 5.5, y: 5, value: 200, label: 'Ivory Abacus' },
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
    { x: 11, y: 9, w: 20, h: 2, color: '#233246' },
    { x: 1, y: 1, w: 9, h: 8, color: '#2c2417' },
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
      name: 'W-1 BRAM', x: 6, y: 6, angle: 0, pause: 1.2, speed: 2.3,
      waypoints: [[6, 6], [6, 14], [13, 14], [13, 6]],
    },
    {
      name: 'W-2 ODETTE', x: 16, y: 4, angle: Math.PI / 2, pause: 1.5, speed: 2.2,
      waypoints: [[16, 4], [16, 11], [22, 11], [22, 4]],
    },
    {
      name: 'W-3 IVO', x: 28, y: 14, angle: Math.PI, pause: 1.8, speed: 2.1,
      waypoints: [[28, 14], [22, 14], [22, 17], [28, 17]],
    },
    {
      name: 'W-4 SABLE', x: 18, y: 17, angle: -Math.PI / 2, pause: 2.2, speed: 2.0,
      waypoints: [[18, 17], [12, 17], [12, 12], [18, 12]],
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
    { x: 5.5, y: 5, value: 250, label: 'Meridian Seal' },
    { x: 15.5, y: 11, value: 250, label: 'Star Chart' },
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
