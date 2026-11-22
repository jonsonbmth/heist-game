// render.js — the Three.js scene for THE AMBER LEDGER, rebuilt to match the
// reference vault hall: a LOW near-ground camera looks ACROSS the room
// (never down at it), so the hall reads as a real 3D interior — black
// marble floor with sheen, tall white columns with gold capitals, a red
// carpet runner to a big gold vault door, framed paintings, bright
// windows, and full humanoid guards with SECURITY labels. The camera
// follows the thief loosely; north stays up-screen and the vault stays
// visible ahead. Game logic is untouched: this file only decides how the
// room looks. No addons: the vendored three.min.js is the core build only,
// so glow and vignette come from additive sprites and a CSS overlay.

import { dist } from './levels.js';
import { CAMERA_HALF_ANGLE, CAMERA_RANGE, CONE_HALF_ANGLE, CONE_RANGE } from './guards.js';
import { coinPos } from './gadgets.js';

const THREE = window.THREE;

// Deterministic PRNG (mulberry32) so scatter is identical every run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textSprite(text, { size = 44, color = '#9db1d6', w = 512, h = 96 } = {}) {
  const tex = canvasTexture(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.font = `700 ${size}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 2);
  });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(3.2, 3.2 * (h / w), 1);
  return spr;
}

// A dark plate with light text, like the SECURITY tags in the reference.
function labelSprite(text, { w = 256, h = 64, scale = 1.15 } = {}) {
  const tex = canvasTexture(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(10, 14, 26, 0.88)';
    g.fillRect(3, 3, w - 6, h - 6);
    g.strokeStyle = '#c9973f';
    g.lineWidth = 4;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.font = '700 34px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#e8ecf6';
    g.fillText(text, w / 2, h / 2 + 2);
  });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(scale, scale * (h / w), 1);
  return spr;
}

function glowTexture() {
  return canvasTexture(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 190, 90, 0.85)');
    grad.addColorStop(0.5, 'rgba(255, 160, 60, 0.28)');
    grad.addColorStop(1, 'rgba(255, 150, 50, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  });
}

function smokeTexture() {
  // A billowy cloud: many overlapping puffs, so the sprite reads as
  // smoke rather than a smooth glow blob.
  const rnd = mulberry32(1234567);
  return canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 14; i++) {
      const x = 60 + rnd() * 136;
      const y = 70 + rnd() * 116;
      const r = 28 + rnd() * 48;
      const grad = g.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, 'rgba(236, 239, 247, 0.85)');
      grad.addColorStop(0.6, 'rgba(222, 227, 238, 0.5)');
      grad.addColorStop(1, 'rgba(205, 210, 226, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// A radial fade for vision cones: bright near the warden, gone at the rim.
function coneFadeTexture() {
  return canvasTexture(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 6, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.55)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  });
}

// Black marble with strong white and gold veins, like the reference
// floor: a lighter base, denser veins and a polished sheen, so the
// floor reads bright and rich at the low camera's grazing angle.
function marbleTexture(seed) {
  const rnd = mulberry32(seed);
  return canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#303038';
    g.fillRect(0, 0, w, h);
    // Large soft mottling.
    for (let i = 0; i < 14; i++) {
      const x = rnd() * w, y = rnd() * h, r = 120 + rnd() * 260;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const v = rnd() > 0.5 ? '255,255,255' : '0,0,0';
      grad.addColorStop(0, `rgba(${v},${0.06 + rnd() * 0.06})`);
      grad.addColorStop(1, `rgba(${v},0)`);
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Veins: random walks, white and a few gold.
    function vein(color, alpha, width) {
      let x = rnd() * w, y = rnd() * h;
      let a = rnd() * Math.PI * 2;
      g.strokeStyle = color.replace('A', String(alpha));
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x, y);
      const steps = 40 + Math.floor(rnd() * 50);
      for (let i = 0; i < steps; i++) {
        a += (rnd() - 0.5) * 0.9;
        x += Math.cos(a) * (6 + rnd() * 10);
        y += Math.sin(a) * (6 + rnd() * 10);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 44; i++) vein('rgba(230,235,245,A)', 0.14 + rnd() * 0.16, 1 + rnd() * 1.4);
    for (let i = 0; i < 12; i++) vein('rgba(205,165,85,A)', 0.14 + rnd() * 0.12, 0.8 + rnd() * 1);
    for (let i = 0; i < 10; i++) vein('rgba(240,244,255,A)', 0.3 + rnd() * 0.15, 1.0);
  });
}

// A red carpet runner with gold borders and diamond medallions.
function runnerTexture() {
  return canvasTexture(256, 1024, (g, w, h) => {
    g.fillStyle = '#7a1f2b';
    g.fillRect(0, 0, w, h);
    // Weave shading.
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 3);
    // Gold double borders along the long edges.
    g.strokeStyle = '#c9973f';
    g.lineWidth = 5;
    g.strokeRect(10, 6, w - 20, h - 12);
    g.lineWidth = 2;
    g.strokeRect(20, 14, w - 40, h - 28);
    // Diamond medallions down the centre.
    g.strokeStyle = 'rgba(220,175,95,0.9)';
    g.lineWidth = 3;
    for (let y = 90; y < h - 40; y += 150) {
      g.beginPath();
      g.moveTo(w / 2, y - 34);
      g.lineTo(w / 2 + 52, y);
      g.lineTo(w / 2, y + 34);
      g.lineTo(w / 2 - 52, y);
      g.closePath();
      g.stroke();
      g.fillStyle = 'rgba(220,175,95,0.55)';
      g.beginPath();
      g.moveTo(w / 2, y - 14);
      g.lineTo(w / 2 + 18, y);
      g.lineTo(w / 2, y + 14);
      g.lineTo(w / 2 - 18, y);
      g.closePath();
      g.fill();
    }
  });
}

// A rug in the level's own colour with a darker border.
function rugTexture(color) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineWidth = 3;
    g.strokeRect(18, 18, w - 36, h - 36);
  });
}

// A small framed landscape: gradient sky, sun, layered mountains.
function paintingTexture(seed) {
  const rnd = mulberry32(seed);
  return canvasTexture(256, 192, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#a8c4de');
    sky.addColorStop(0.55, '#d9cba4');
    sky.addColorStop(1, '#8a7a5a');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255, 244, 200, 0.9)';
    g.beginPath();
    g.arc(w * (0.3 + rnd() * 0.4), h * 0.26, 14 + rnd() * 8, 0, Math.PI * 2);
    g.fill();
    // Far mountains.
    g.fillStyle = '#7a8ba0';
    g.beginPath();
    g.moveTo(0, h * 0.62);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, h * (0.42 + rnd() * 0.2));
    g.lineTo(w, h * 0.62);
    g.closePath();
    g.fill();
    // Near mountains.
    g.fillStyle = '#4a5a52';
    g.beginPath();
    g.moveTo(0, h * 0.78);
    for (let x = 0; x <= w; x += 42) g.lineTo(x, h * (0.58 + rnd() * 0.18));
    g.lineTo(w, h * 0.78);
    g.closePath();
    g.fill();
    // Foreground + a few trees.
    g.fillStyle = '#33402e';
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = '#26331f';
    for (let i = 0; i < 5; i++) {
      const x = 20 + rnd() * (w - 40);
      g.beginPath();
      g.moveTo(x, h * 0.72);
      g.lineTo(x - 9, h * 0.86);
      g.lineTo(x + 9, h * 0.86);
      g.closePath();
      g.fill();
    }
  });
}

// Warm plaster with speckle, for the walls.
function plasterTexture(base, seed) {
  const rnd = mulberry32(seed);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    for (let i = 0; i < 9; i++) {
      g.fillStyle = 'rgba(0,0,0,0.04)';
      g.fillRect(rnd() * w, 0, 3 + rnd() * 8, h);
    }
  });
}

// A coffered vault-hall ceiling: warm dark panels in a gold-trimmed
// grid with bright recessed light panels. Painted as one texture (no
// hanging beams — the camera travels just below the ceiling, so any
// geometry hanging down would clip through it). Used as both the colour
// map and the emissive map, so the light panels glow softly while the
// dark coffers stay dark.
function ceilingTexture(seed) {
  const rnd = mulberry32(seed);
  return canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#241b12';
    g.fillRect(0, 0, w, h);
    const cols = 6, rows = 4;
    const cw = w / cols, ch = h / rows;
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const x = cx * cw, y = cy * ch;
        // Recessed panel: slightly lighter centre, dark inset border.
        g.fillStyle = '#31271a';
        g.fillRect(x + 6, y + 6, cw - 12, ch - 12);
        g.fillStyle = '#1c140c';
        g.fillRect(x + 18, y + 18, cw - 36, ch - 36);
        g.fillStyle = '#2e2417';
        g.fillRect(x + 26, y + 26, cw - 52, ch - 52);
        // Gold trim around the coffer.
        g.strokeStyle = 'rgba(180,145,80,0.85)';
        g.lineWidth = 4;
        g.strokeRect(x + 10, y + 10, cw - 20, ch - 20);
      }
    }
    // Recessed light panels: bright warm rectangles with a soft halo,
    // one in every other coffer so the ceiling reads as lit, not flat.
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if ((cx + cy) % 2 !== 0) continue;
        const x = cx * cw + cw / 2, y = cy * ch + ch / 2;
        const halo = g.createRadialGradient(x, y, 4, x, y, cw * 0.42);
        halo.addColorStop(0, 'rgba(255, 225, 170, 0.55)');
        halo.addColorStop(1, 'rgba(255, 225, 170, 0)');
        g.fillStyle = halo;
        g.fillRect(x - cw * 0.45, y - ch * 0.45, cw * 0.9, ch * 0.9);
        g.fillStyle = '#ffedbe';
        g.fillRect(x - cw * 0.22, y - ch * 0.16, cw * 0.44, ch * 0.32);
        g.strokeStyle = 'rgba(200,160,90,0.9)';
        g.lineWidth = 3;
        g.strokeRect(x - cw * 0.22, y - ch * 0.16, cw * 0.44, ch * 0.32);
      }
    }
    // Speckle so the dark wood is not a flat wash.
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  });
}

// A flat sector (vision cone / camera arc) centred on +X, in the XZ plane.
function sectorGeometry(radius, halfAngle) {
  const geo = new THREE.CircleGeometry(radius, 40, -halfAngle, halfAngle * 2);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function sectorRingGeometry(radius, halfAngle) {
  const geo = new THREE.RingGeometry(radius - 0.09, radius, 40, 1, -halfAngle, halfAngle * 2);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// Dressing that is hand-placed per job (the levels are fixed and
// hand-authored, so the columns and carpet runners are too). The camera
// always sits 8.5 units south of the thief, so no column stands in the
// south hall band where the camera travels — the hall columns sit at the
// room's east side instead, and the vault-flank columns stand clear of
// the vault door's face so the door reads as the backdrop. Job 1's west
// vault-flank column stands INSIDE the vault room (21.8, 5.2): from the
// cover camera the sight line to the door crosses (22.8, 7.9), so a
// column there would cut the door in half. The north-east corner
// column sits south of the corner (z 4.2) for the same reason: the
// vault door stands close to the east wall, and a corner column at
// (28.3, 1.7) crosses the door's right edge from the cover camera.
const COLUMNS = {
  1: [[1.7, 1.7], [28.3, 4.2], [1.7, 16.3], [28.3, 16.3], [21.8, 5.2], [28.2, 7.9], [13.5, 7.5], [27.5, 12.5]],
  2: [[1.7, 1.7], [28.3, 4.2], [1.7, 16.3], [28.3, 16.3], [21.8, 7.9], [27.2, 7.9], [13.5, 7.5], [27.5, 12.5]],
  3: [[1.7, 1.7], [30.3, 4.2], [1.7, 18.3], [30.3, 18.3], [23.8, 8.9], [29.2, 8.9], [14.5, 8.5], [30.3, 13.5]],
};
// Red carpet runner: centre x, from y0 (vault gap) to y1 (south hall).
const RUNNERS = {
  1: { x: 25, y0: 7, y1: 16.5 },
  2: { x: 24, y0: 7, y1: 16.5 },
  3: { x: 26, y0: 8, y1: 18.5 },
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x191410);
  scene.fog = new THREE.Fog(0x191410, 30, 70);

  // LOW follow camera: the viewer stands a few steps behind the thief at
  // near-ground height and looks ACROSS the room toward the vault — the
  // reference's viewpoint. North stays up-screen; the thief is framed
  // large in the foreground and the hall stretches out in depth ahead.
  const CAM_HEIGHT = 5.2;
  const CAM_BACK = 8.5;
  const CAM_FOV = 58;
  const LOOK_AHEAD = 3.5;
  const LOOK_HEIGHT = 0.9;
  // Staged shots (cover / smoke / win / caught) use a wider, higher
  // establishing camera so the whole vault hall reads in one grand frame
  // like the reference: the vault door, the columns, the carpet and the
  // guards all in view at once. Live play keeps the closer follow camera.
  // The staged height stays below the 6-high ceiling, so the camera is
  // inside the room and the top of the frame shows finished ceiling,
  // never void.
  const STAGE_HEIGHT = 5.7;
  const STAGE_FOV = 70;
  const STAGE_LOOK_AHEAD = 6.0;
  const STAGE_LOOK_HEIGHT = 1.3;
  const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 200);
  camera.position.set(0, CAM_HEIGHT, CAM_BACK);
  const desiredPos = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const lookCur = new THREE.Vector3(0, LOOK_HEIGHT, 0);

  // Lighting: a BRIGHT warm interior like the reference — a warm wash
  // from above, a key light with shadows that follows the action, a cool
  // fill from the window side, and warm lamps. Nothing hides in murk:
  // every tile, guard and cone reads clearly at a glance.
  scene.add(new THREE.HemisphereLight(0xfff2dd, 0x3a2f26, 1.8));
  const key = new THREE.DirectionalLight(0xffe8c0, 1.8);
  key.position.set(-10, 20, -8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -14;
  key.shadow.camera.right = 14;
  key.shadow.camera.top = 14;
  key.shadow.camera.bottom = -14;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0004;
  scene.add(key);
  scene.add(key.target);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.5);
  fill.position.set(14, 10, 14);
  scene.add(fill);
  scene.add(fill.target);
  scene.add(new THREE.AmbientLight(0x40342a, 1.1));

  const glowTex = glowTexture();
  const smokeTex = smokeTexture();
  const coneFadeTex = coneFadeTexture();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  let levelGroup = null;
  let currentLevel = null;
  let dynamic = null; // per-job meshes: guards, thief, loot, cones, lamps...

  // Shared materials.
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9973f, roughness: 0.35, metalness: 0.75 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.55 });
  const walnutMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.75 });
  const walnutTopMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.6 });

  // A full humanoid figure, built facing +Z: two legs with hip pivots, a
  // torso with a belt, arms with shoulder pivots, a head, and either a
  // security cap (guards) or a hood (the thief). The pivots let sync()
  // swing the limbs into a walk cycle from the distance actually moved.
  function makeHumanoid({ shirt, pants, skin, cap, hood }) {
    const g = new THREE.Group();
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.7 });

    function leg(side) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.12, 0.84, 0);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.8, 10), pantsMat);
      l.position.y = -0.4;
      l.castShadow = true;
      pivot.add(l);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3), shoeMat);
      shoe.position.set(0, -0.79, 0.05);
      pivot.add(shoe);
      g.add(pivot);
      return pivot;
    }
    const legL = leg(-1);
    const legR = leg(1);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.25, 0.62, 12), shirtMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    g.add(torso);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.03, 8, 18), goldMat);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.88;
    g.add(belt);
    for (const s of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), shirtMat);
      sh.position.set(s * 0.26, 1.42, 0);
      g.add(sh);
    }

    function arm(side) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.28, 1.42, 0);
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.58, 10), shirtMat);
      a.position.y = -0.29;
      a.castShadow = true;
      pivot.add(a);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), skinMat);
      hand.position.y = -0.6;
      pivot.add(hand);
      g.add(pivot);
      return pivot;
    }
    const armL = arm(-1);
    const armR = arm(1);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 12), skinMat);
    head.position.y = 1.62;
    head.castShadow = true;
    g.add(head);
    if (hood) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.45, 12), shirtMat);
      h.position.y = 1.8;
      h.castShadow = true;
      g.add(h);
    } else {
      const capMat = new THREE.MeshStandardMaterial({ color: cap, roughness: 0.8 });
      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.1, 14), capMat);
      capTop.position.y = 1.75;
      g.add(capTop);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.2), capMat);
      brim.position.set(0, 1.7, 0.17);
      g.add(brim);
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.02), goldMat);
      badge.position.set(0, 1.3, 0.23);
      g.add(badge);
      // A simple readable face: large dark eyes, a nose and a mouth on
      // the skin-tone head, sized to read at the camera's distance. The
      // eyes sit low (y 1.63) so the cap brim does not hide them from
      // the low camera's downward angle.
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 0.4 });
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), eyeMat);
        eye.position.set(s * 0.066, 1.63, 0.145);
        g.add(eye);
      }
      const noseMat = new THREE.MeshStandardMaterial({ color: 0xb98d63, roughness: 0.8 });
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), noseMat);
      nose.position.set(0, 1.59, 0.155);
      g.add(nose);
      const mouth = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.024, 0.012),
        new THREE.MeshStandardMaterial({ color: 0x5a2e22, roughness: 0.8 }),
      );
      mouth.position.set(0, 1.55, 0.15);
      g.add(mouth);
    }
    return { group: g, legL, legR, armL, armR };
  }

  // A tall white column with gold base and capital, like the reference.
  // The shaft reaches the 6-high ceiling: base 0-0.35, shaft 0.3-5.6,
  // capital 5.6-5.95, top plate flush with the ceiling at 6.0.
  function makeColumn() {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 5.3, 14), whiteMat);
    shaft.position.y = 2.95;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    g.add(shaft);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.35, 14), goldMat);
    base.position.y = 0.18;
    g.add(base);
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 20), goldMat);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.38;
    g.add(baseRing);
    const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.38, 0.35, 14), goldMat);
    capital.position.y = 5.775;
    g.add(capital);
    const capRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 20), goldMat);
    capRing.rotation.x = Math.PI / 2;
    capRing.position.y = 5.6;
    g.add(capRing);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.14, 1.05), whiteMat);
    top.position.y = 5.93;
    g.add(top);
    return g;
  }

  // The big circular gold vault door on the north wall behind the loot —
  // the backdrop of the reference shot.
  function makeVaultDoor() {
    const g = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.4, metalness: 0.8 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.22, 12, 40), goldMat);
    ring.castShadow = true;
    g.add(ring);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 40), steelMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.z = -0.05;
    g.add(disc);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.08, 8, 40), goldMat);
    inner.position.z = 0.12;
    g.add(inner);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.14, 0.1), goldMat);
      spoke.position.z = 0.12;
      spoke.rotation.z = (i * Math.PI) / 4;
      g.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 20), goldMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.2;
    g.add(hub);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 28), goldMat);
    wheel.position.z = 0.32;
    g.add(wheel);
    return g;
  }

  // A white marble pedestal; the loot and relics sit on these.
  function makePedestal(r, h) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 16), whiteMat);
    shaft.position.y = h / 2;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    g.add(shaft);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 8, 20), goldMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = h - 0.03;
    g.add(rim);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.35, 0.12, 16), whiteMat);
    foot.position.y = 0.06;
    g.add(foot);
    return g;
  }

  // A potted plant: terracotta pot, two cones of foliage.
  function makePottedPlant(scale) {
    const g = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: 0x9a5a38, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 1 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: 1 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.35, 12), potMat);
    pot.position.y = 0.18;
    pot.castShadow = true;
    g.add(pot);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 8), leafMat);
    c1.position.y = 0.65;
    c1.castShadow = true;
    g.add(c1);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 8), leafMat2);
    c2.position.y = 1.05;
    c2.castShadow = true;
    g.add(c2);
    g.scale.setScalar(scale);
    return g;
  }

  // A framed painting hung on a wall (faces +Z in local space; the caller
  // rotates it to face into the room).
  function makePainting(seed) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 0.08), goldMat);
    frame.castShadow = true;
    g.add(frame);
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.3),
      new THREE.MeshStandardMaterial({ map: paintingTexture(seed), roughness: 0.85 }),
    );
    art.position.z = 0.05;
    g.add(art);
    return g;
  }

  // A tall bright window: emissive pale glass, dark frame bars.
  function makeWindow() {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.8 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.2, 0.1), frameMat);
    g.add(frame);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 3.0),
      new THREE.MeshStandardMaterial({
        color: 0xd6e8f5, emissive: 0xbdd9ee, emissiveIntensity: 1.1, roughness: 0.4,
      }),
    );
    glass.position.z = 0.06;
    g.add(glass);
    for (const y of [-0.75, 0, 0.75]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.04), frameMat);
      bar.position.set(0, y, 0.08);
      g.add(bar);
    }
    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.0, 0.04), frameMat);
    mid.position.z = 0.08;
    g.add(mid);
    return g;
  }

  function updateCamera(game, force) {
    const p = game.player;
    const level = game.level;
    if (!p || !level) return;
    // Staged moments get the grand establishing camera; live play keeps
    // the closer follow camera. (buildLevel calls this with a fake game
    // that has no phase, so it defaults to the follow camera.)
    const staged = game.phase === 'staged' || game.phase === 'staged-complete' || game.phase === 'failed';
    const height = staged ? STAGE_HEIGHT : CAM_HEIGHT;
    const lookAhead = staged ? STAGE_LOOK_AHEAD : LOOK_AHEAD;
    const lookHeight = staged ? STAGE_LOOK_HEIGHT : LOOK_HEIGHT;
    const fov = staged ? STAGE_FOV : CAM_FOV;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // The camera stays inside the room (the 6-high perimeter walls would
    // block the view from outside), a few steps south of the thief.
    desiredPos.set(
      clamp(p.x, 3, level.w - 3),
      height,
      clamp(p.y + CAM_BACK, 2, level.h - 1.2),
    );
    desiredLook.set(
      clamp(p.x, 1.5, level.w - 1.5),
      lookHeight,
      clamp(p.y - lookAhead, 0.5, level.h - 0.5),
    );
    if (force || camera.position.distanceTo(desiredPos) > 4) {
      camera.position.copy(desiredPos);
      lookCur.copy(desiredLook);
    } else {
      camera.position.lerp(desiredPos, 0.1);
      lookCur.lerp(desiredLook, 0.12);
    }
    camera.lookAt(lookCur);
    // The key light's shadow frustum follows the action, so figure
    // shadows stay sharp where the camera looks.
    key.position.set(lookCur.x - 10, 20, lookCur.z - 8);
    key.target.position.copy(lookCur);
  }

  function buildLevel(level) {
    currentLevel = level;
    if (levelGroup) {
      scene.remove(levelGroup);
      levelGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
    }
    levelGroup = new THREE.Group();
    scene.add(levelGroup);

    // Black marble floor with a polished sheen (clearcoat), like the
    // reference. Anisotropy keeps the veins sharp at the low camera's
    // grazing angle.
    const floorTex = marbleTexture(level.id * 7919 + 13);
    floorTex.anisotropy = maxAniso;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(level.w, level.h),
      new THREE.MeshPhysicalMaterial({
        map: floorTex, roughness: 0.2, metalness: 0.05,
        clearcoat: 0.95, clearcoatRoughness: 0.16,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(level.w / 2, 0, level.h / 2);
    floor.receiveShadow = true;
    levelGroup.add(floor);

    // Dark ground beyond the room, so the low camera never sees void.
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 90),
      new THREE.MeshStandardMaterial({ color: 0x12100e, roughness: 1, metalness: 0 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(level.w / 2, -0.02, level.h / 2);
    base.receiveShadow = true;
    levelGroup.add(base);

    // Ceiling: a coffered vault-hall ceiling flush with the 6-high wall
    // tops, so the top of the frame is finished architecture instead of
    // the dark void the camera used to see over the north wall. It never
    // casts a shadow — the key light sits above it, and a shadow-casting
    // ceiling would black out the room. Double-sided so it reads from
    // any camera angle.
    const ceilTex = ceilingTexture(level.id * 331 + 7);
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(level.w, level.h),
      new THREE.MeshStandardMaterial({
        map: ceilTex, emissiveMap: ceilTex, emissive: 0xffe6b8, emissiveIntensity: 0.5,
        roughness: 0.9, side: THREE.DoubleSide,
      }),
    );
    ceiling.rotation.x = Math.PI / 2; // face down into the room
    ceiling.position.set(level.w / 2, 6.0, level.h / 2);
    levelGroup.add(ceiling);

    // The level's own rugs, with a woven border.
    for (const c of level.carpets || []) {
      const rug = new THREE.Mesh(
        new THREE.PlaneGeometry(c.w, c.h),
        new THREE.MeshStandardMaterial({ map: rugTexture(c.color), roughness: 1 }),
      );
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(c.x + c.w / 2, 0.012, c.y + c.h / 2);
      rug.receiveShadow = true;
      levelGroup.add(rug);
    }

    // Red carpet runner to the vault door, like the reference.
    const run = RUNNERS[level.id];
    if (run) {
      const runnerTex = runnerTexture();
      runnerTex.anisotropy = maxAniso;
      const runner = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, run.y1 - run.y0),
        new THREE.MeshStandardMaterial({ map: runnerTex, roughness: 1 }),
      );
      runner.rotation.x = -Math.PI / 2;
      runner.position.set(run.x, 0.018, (run.y0 + run.y1) / 2);
      runner.receiveShadow = true;
      levelGroup.add(runner);
    }

    // Walls: the perimeter shell stands 6 high so it fills the frame when
    // the low camera looks across the room; interior dividers stand 2.2 —
    // low partitions like the reference's, so they never loom over the
    // camera when it passes beside them, while the camera still sees over
    // them into the next space. Warm plaster, gold crown trim on the shell.
    const shellMat = new THREE.MeshStandardMaterial({ map: plasterTexture('#8d7f6e', level.id * 31 + 5), roughness: 0.9 });
    const dividerMat = new THREE.MeshStandardMaterial({ map: plasterTexture('#77685a', level.id * 47 + 11), roughness: 0.9 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x9a8a74, roughness: 0.85 });
    for (const b of level.walls) {
      const isPerimeter = b.x === 0 || b.y === 0 || b.x + b.w === level.w || b.y + b.h === level.h;
      const hgt = isPerimeter ? 6 : 2.2;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(b.w, hgt, b.h), isPerimeter ? shellMat : dividerMat);
      wall.position.set(b.x + b.w / 2, hgt / 2, b.y + b.h / 2);
      wall.castShadow = true;
      wall.receiveShadow = true;
      levelGroup.add(wall);
      if (isPerimeter) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.08, 0.14, b.h + 0.08), goldMat);
        trim.position.set(b.x + b.w / 2, hgt - 0.1, b.y + b.h / 2);
        levelGroup.add(trim);
      } else {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.06, 0.08, b.h + 0.06), capMat);
        cap.position.set(b.x + b.w / 2, hgt + 0.02, b.y + b.h / 2);
        levelGroup.add(cap);
      }
    }

    // Columns: tall white shafts with gold capitals.
    for (const [cx, cz] of COLUMNS[level.id] || []) {
      const col = makeColumn();
      col.position.set(cx, 0, cz);
      levelGroup.add(col);
    }

    // Paintings on the north wall (spread out, clear of the vault door),
    // plus two on each side wall.
    const paintX = [5, 11, 17, 23].filter((x) => Math.abs(x - level.loot.x) >= 4);
    paintX.forEach((x, i) => {
      const p = makePainting(level.id * 101 + i);
      p.position.set(x, 2.7, 1.12);
      levelGroup.add(p);
    });
    for (const [x, z, ry] of [[1.12, 5, Math.PI / 2], [1.12, 12, Math.PI / 2], [level.w - 1.12, 5, -Math.PI / 2], [level.w - 1.12, 12, -Math.PI / 2]]) {
      const p = makePainting(level.id * 211 + Math.floor(z));
      p.position.set(x, 2.7, z);
      p.rotation.y = ry;
      levelGroup.add(p);
    }

    // Bright windows on the side walls.
    for (const [x, ry] of [[1.12, Math.PI / 2], [level.w - 1.12, -Math.PI / 2]]) {
      const win = makeWindow();
      win.position.set(x, 3.0, 8.5);
      win.rotation.y = ry;
      levelGroup.add(win);
    }

    // The vault door on the north wall, behind the loot.
    const vaultDoor = makeVaultDoor();
    vaultDoor.position.set(level.loot.x, 2.4, 1.12);
    levelGroup.add(vaultDoor);
    const vaultSpot = new THREE.SpotLight(0xffd9a0, 50, 18, 0.55, 0.7, 1.6);
    vaultSpot.position.set(level.loot.x, 5.2, level.loot.y + 5.5);
    vaultSpot.target.position.set(level.loot.x, 2.4, 1.1);
    levelGroup.add(vaultSpot);
    levelGroup.add(vaultSpot.target);

    // Crates: dark walnut cabinets with a lighter top and gold edge.
    for (const b of level.crates) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.9, b.h), walnutMat);
      crate.position.set(b.x + b.w / 2, 0.45, b.y + b.h / 2);
      crate.castShadow = true;
      crate.receiveShadow = true;
      levelGroup.add(crate);
      const top = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.12, 0.07, b.h - 0.12), walnutTopMat);
      top.position.set(b.x + b.w / 2, 0.93, b.y + b.h / 2);
      levelGroup.add(top);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.04, 0.04, b.h + 0.04), goldMat);
      edge.position.set(b.x + b.w / 2, 0.88, b.y + b.h / 2);
      levelGroup.add(edge);
    }

    // Cover: low dark-green benches with a gold top edge.
    const coverMat = new THREE.MeshStandardMaterial({ color: 0x2e4a3a, roughness: 1 });
    for (const b of level.cover) {
      const cov = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.42, b.h), coverMat);
      cov.position.set(b.x + b.w / 2, 0.21, b.y + b.h / 2);
      cov.castShadow = true;
      cov.receiveShadow = true;
      levelGroup.add(cov);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.04, 0.04, b.h + 0.04), goldMat);
      edge.position.set(b.x + b.w / 2, 0.42, b.y + b.h / 2);
      levelGroup.add(edge);
    }

    // Tall grass becomes potted plants (seeded positions).
    const rnd = mulberry32(level.id * 104729 + 7);
    for (const g of level.grass) {
      const n = Math.max(2, Math.floor(g.w * g.h * 1.2));
      for (let i = 0; i < n; i++) {
        const plant = makePottedPlant(0.85 + rnd() * 0.4);
        plant.position.set(g.x + 0.4 + rnd() * (g.w - 0.8), 0, g.y + 0.4 + rnd() * (g.h - 0.8));
        plant.rotation.y = rnd() * Math.PI;
        levelGroup.add(plant);
      }
    }

    // Room labels hang high, like gallery signs.
    for (const lb of level.labels || []) {
      const spr = textSprite(lb.text, { size: 40 });
      spr.scale.set(2.6, 2.6 * (96 / 512), 1);
      spr.position.set(lb.x, 2.6, lb.y);
      levelGroup.add(spr);
    }

    // Lamps: taller poles with a glowing lantern head and a warm pool.
    dynamic = { lamps: [], guards: [], cameras: [], rings: [], smokes: [], coins: [] };
    for (const lamp of level.lamps) {
      const group = new THREE.Group();
      group.position.set(lamp.x, 0, lamp.y);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, 1.7, 8),
        new THREE.MeshStandardMaterial({ color: 0x1c2233, roughness: 0.7, metalness: 0.4 }),
      );
      pole.position.y = 0.85;
      pole.castShadow = true;
      group.add(pole);
      const headMat = new THREE.MeshStandardMaterial({
        color: 0xffc266, emissive: 0xffa63d, emissiveIntensity: 2.2, roughness: 0.4,
      });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), headMat);
      head.position.y = 1.78;
      group.add(head);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 0.22, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.8, side: THREE.DoubleSide }),
      );
      shade.position.y = 1.92;
      group.add(shade);
      const light = new THREE.PointLight(0xffb347, 26, lamp.r * 1.7, 1.8);
      light.position.y = 1.7;
      group.add(light);
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(lamp.r * 1.9, lamp.r * 1.9),
        new THREE.MeshBasicMaterial({
          map: glowTex, transparent: true, opacity: 0.4,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.02;
      group.add(pool);
      levelGroup.add(group);
      dynamic.lamps.push({ def: lamp, group, light, headMat, pool });
    }

    // Loot: a slowly turning gold octahedron on a marble pedestal.
    const lootGroup = new THREE.Group();
    lootGroup.position.set(level.loot.x, 0, level.loot.y);
    const lootPedestal = makePedestal(0.5, 1.0);
    lootGroup.add(lootPedestal);
    const lootMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.38),
      new THREE.MeshStandardMaterial({
        color: 0xffc93c, emissive: 0xa66f00, emissiveIntensity: 0.9,
        roughness: 0.25, metalness: 0.85,
      }),
    );
    lootMesh.position.y = 1.55;
    lootMesh.castShadow = true;
    lootGroup.add(lootMesh);
    const lootLight = new THREE.PointLight(0xffc93c, 10, 5, 1.8);
    lootLight.position.y = 1.8;
    lootGroup.add(lootLight);
    const lootRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.58, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    lootRing.rotation.x = -Math.PI / 2;
    lootRing.position.y = 0.03;
    lootGroup.add(lootRing);
    const lootLabel = textSprite(level.loot.label, { size: 40, color: '#ffd97a', w: 640, h: 96 });
    // Smaller and shifted toward the room's centre: the loot sits near
    // the east wall, and at the default scale the label ran under the
    // right HUD panel in the cover shot.
    lootLabel.scale.set(2.4, 2.4 * (96 / 640), 1);
    lootLabel.position.set(-1.0, 2.4, 0);
    lootGroup.add(lootLabel);
    levelGroup.add(lootGroup);
    dynamic.loot = { group: lootGroup, mesh: lootMesh, light: lootLight, ring: lootRing, label: lootLabel };

    // Relics on pedestals.
    dynamic.relics = [];
    for (const relic of level.relics) {
      const rg = new THREE.Group();
      rg.position.set(relic.x, 0, relic.y);
      rg.add(makePedestal(0.35, 0.8));
      const rm = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.2),
        new THREE.MeshStandardMaterial({
          color: 0xffe9a8, emissive: 0x8a6d1f, emissiveIntensity: 0.7,
          roughness: 0.3, metalness: 0.8,
        }),
      );
      rm.position.y = 1.15;
      rm.castShadow = true;
      rg.add(rm);
      levelGroup.add(rg);
      dynamic.relics.push({ def: relic, group: rg, mesh: rm });
    }

    // Decorative pedestals with gold bars, flanking the loot inside the
    // vault — the reference's display cases.
    for (const [px, pz] of [
      [clamp(level.loot.x - 3.2, 1.5, level.w - 1.5), level.loot.y + 1.7],
      [clamp(level.loot.x + 2.7, 1.5, level.w - 1.5), level.loot.y + 1.7],
    ]) {
      const pg = new THREE.Group();
      pg.position.set(px, 0, pz);
      pg.add(makePedestal(0.4, 0.9));
      const barMat = new THREE.MeshStandardMaterial({ color: 0xd8a24a, roughness: 0.3, metalness: 0.85 });
      for (let i = 0; i < 3; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.15), barMat);
        bar.position.set((i - 1) * 0.1, 0.97 + (i === 1 ? 0.12 : 0), (i - 1) * 0.12);
        bar.rotation.y = (i - 1) * 0.4;
        bar.castShadow = true;
        pg.add(bar);
      }
      levelGroup.add(pg);
    }

    // Exit hatch: a green pad with a pulsing ring, an EXIT label, and a
    // faint green light pillar so the getaway reads across the room.
    const exitGroup = new THREE.Group();
    exitGroup.position.set(level.exit.x, 0, level.exit.y);
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x0d5c2e, emissive: 0x1db954, emissiveIntensity: 0.55, roughness: 0.7 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.02;
    exitGroup.add(pad);
    const exitRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 0.95, 40),
      new THREE.MeshBasicMaterial({ color: 0x2fe673, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    exitRing.rotation.x = -Math.PI / 2;
    exitRing.position.y = 0.03;
    exitGroup.add(exitRing);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x2fe673, transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3.2, 24, 1, true), beamMat);
    beam.position.y = 1.6;
    exitGroup.add(beam);
    const exitLabel = textSprite('EXIT', { size: 52, color: '#5cf59a', w: 320, h: 96 });
    exitLabel.position.y = 1.9;
    exitGroup.add(exitLabel);
    levelGroup.add(exitGroup);
    dynamic.exit = { group: exitGroup, pad, ring: exitRing, label: exitLabel, beamMat };

    // Guards: full humanoid security guards — a LIGHT uniform like the
    // reference's white-jacketed guards (dark navy trousers and cap, so
    // they still read as security, but the light jacket makes them
    // visible across the room instead of melting into the dark floor),
    // gold badge, a SECURITY label overhead, a state ring underfoot
    // and a translucent vision cone on the floor. The figure is built
    // facing +Z and turned 90 degrees, because the guard group's forward
    // axis (the cone's axis) is +X.
    dynamic.guards = [];
    for (const g of level.guards) {
      const group = new THREE.Group();
      const fig = makeHumanoid({
        shirt: 0xe9e5da, pants: 0x232f4a, skin: 0xd8b48f, cap: 0x1e2a44, hood: false,
      });
      fig.group.rotation.y = Math.PI / 2;
      group.add(fig.group);
      const tag = labelSprite('SECURITY');
      tag.position.y = 2.2;
      group.add(tag);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.53, 32),
        new THREE.MeshBasicMaterial({ color: 0x8fa3c8, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      group.add(ring);
      const mark = textSprite('?', { size: 72, color: '#ffd24a', w: 128, h: 128 });
      mark.scale.set(0.9, 0.9, 1);
      mark.position.y = 2.6;
      mark.visible = false;
      group.add(mark);
      // Vision cone, flat on the floor at its true range.
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xffb347, transparent: true, opacity: 0.3, alphaMap: coneFadeTex,
        depthWrite: false, side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(sectorGeometry(CONE_RANGE, CONE_HALF_ANGLE), coneMat);
      cone.position.y = 0.04;
      const rimMat = new THREE.MeshBasicMaterial({
        color: 0xffc93c, transparent: true, opacity: 0.5,
        depthWrite: false, side: THREE.DoubleSide,
      });
      const rim = new THREE.Mesh(sectorRingGeometry(CONE_RANGE, CONE_HALF_ANGLE), rimMat);
      rim.position.y = 0.045;
      group.add(cone);
      group.add(rim);
      levelGroup.add(group);
      dynamic.guards.push({
        group, fig, cone, coneMat, rim, rimMat, ring, mark,
        phase: 0, px: g.x, pz: g.y, amp: 0,
      });
    }

    // Cameras: a tall mount pole, a wall box, a lens, and a sweeping teal arc.
    dynamic.cameras = [];
    for (const c of level.cameras) {
      const group = new THREE.Group();
      group.position.set(c.x, 0, c.y);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, 1.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x232c40, roughness: 0.6, metalness: 0.5 }),
      );
      pole.position.y = 0.9;
      pole.castShadow = true;
      group.add(pole);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.34, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x3a4a5e, roughness: 0.6, metalness: 0.5 }),
      );
      box.position.y = 1.85;
      box.castShadow = true;
      group.add(box);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 0.3, 10),
        new THREE.MeshStandardMaterial({ color: 0x11151f, emissive: 0x66d9e8, emissiveIntensity: 1.4 }),
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 1.85, 0.22);
      group.add(lens);
      const arcMat = new THREE.MeshBasicMaterial({
        color: 0x7fe3f0, transparent: true, opacity: 0.26, alphaMap: coneFadeTex,
        depthWrite: false, side: THREE.DoubleSide,
      });
      const arc = new THREE.Mesh(sectorGeometry(CAMERA_RANGE, CAMERA_HALF_ANGLE), arcMat);
      arc.position.y = 0.04;
      group.add(arc);
      levelGroup.add(group);
      dynamic.cameras.push({ group, arc, arcMat, lens });
    }

    // Tripwires: a pulsing red beam between two posts.
    dynamic.lasers = [];
    for (const lz of level.lasers) {
      const group = new THREE.Group();
      const len = dist(lz.x1, lz.y1, lz.x2, lz.y2);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.85 });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), beamMat);
      beam.position.set((lz.x1 + lz.x2) / 2, 0.55, (lz.y1 + lz.y2) / 2);
      beam.rotation.y = -Math.atan2(lz.y2 - lz.y1, lz.x2 - lz.x1);
      group.add(beam);
      for (const [px, py] of [[lz.x1, lz.y1], [lz.x2, lz.y2]]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.09, 0.7, 8),
          new THREE.MeshStandardMaterial({ color: 0x3a2020, emissive: 0xff3b30, emissiveIntensity: 0.8 }),
        );
        post.position.set(px, 0.35, py);
        group.add(post);
      }
      levelGroup.add(group);
      dynamic.lasers.push({ group, beamMat });
    }

    // The thief: a full hooded humanoid in deep teal, gold belt, gold
    // ring underfoot so the player is always findable. Built facing +Z,
    // which is the thief group's forward axis.
    const thiefFig = makeHumanoid({
      shirt: 0x1d7a64, pants: 0x1a1d24, skin: 0xd8b48f, cap: 0, hood: true,
    });
    const thief = new THREE.Group();
    thief.add(thiefFig.group);
    const tshadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    tshadow.rotation.x = -Math.PI / 2;
    tshadow.position.y = 0.015;
    thief.add(tshadow);
    const tring = new THREE.Mesh(
      new THREE.RingGeometry(0.44, 0.52, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    tring.rotation.x = -Math.PI / 2;
    tring.position.y = 0.03;
    thief.add(tring);
    levelGroup.add(thief);
    dynamic.thief = { group: thief, fig: thiefFig, phase: 0, px: level.start.x, pz: level.start.y, amp: 0 };

    // Effect pools: noise rings, smoke clouds, flying pebbles.
    dynamic.rings = [];
    for (let i = 0; i < 6; i++) {
      const rm = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
      );
      rm.rotation.x = -Math.PI / 2;
      rm.position.y = 0.05;
      rm.visible = false;
      levelGroup.add(rm);
      dynamic.rings.push(rm);
    }
    // Smoke: billboard puffs that face the camera, so the cloud reads as
    // a volume from the low view instead of a flat floor decal.
    dynamic.smokes = [];
    for (let i = 0; i < 3; i++) {
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, transparent: true, opacity: 0, depthWrite: false,
      }));
      sm.position.y = 0.9;
      sm.visible = false;
      levelGroup.add(sm);
      dynamic.smokes.push(sm);
    }
    dynamic.coinMeshes = [];
    for (let i = 0; i < 4; i++) {
      const cm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12),
        new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0x8a6d1f, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.3 }),
      );
      cm.visible = false;
      levelGroup.add(cm);
      dynamic.coinMeshes.push(cm);
    }

    // Fill light from the camera side; snap the camera to the thief.
    fill.position.set(level.w / 2 + 12, 10, level.h / 2 + 14);
    fill.target.position.set(level.w / 2, 0, level.h / 2);
    const rect = canvas.getBoundingClientRect();
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
    updateCamera({ player: { x: level.start.x, y: level.start.y }, level }, true);
  }

  // Swing a figure's limbs from the distance it actually moved.
  function walkFigure(rec, x, z) {
    const d = Math.hypot(x - rec.px, z - rec.pz);
    rec.px = x;
    rec.pz = z;
    rec.phase += d * 2.6;
    const target = d > 0.0005 ? 1 : 0;
    rec.amp += (target - rec.amp) * 0.18;
    const s = Math.sin(rec.phase) * 0.55 * rec.amp;
    rec.fig.legL.rotation.x = s;
    rec.fig.legR.rotation.x = -s;
    rec.fig.armL.rotation.x = -s * 0.7;
    rec.fig.armR.rotation.x = s * 0.7;
  }

  function sync(game, time) {
    if (!dynamic) return;
    updateCamera(game, false);
    const p = game.player;
    const thief = dynamic.thief;
    thief.group.position.set(p.x, 0, p.y);
    thief.group.rotation.y = -p.angle + Math.PI / 2;
    walkFigure(thief, p.x, p.y);
    // A sneaking thief crouches low; a sprinting one leans into the run.
    const targetScale = p.stance === 'sneak' ? 0.82 : 1;
    thief.group.scale.y += (targetScale - thief.group.scale.y) * 0.2;

    game.guards.forEach((g, i) => {
      const d = dynamic.guards[i];
      d.group.position.set(g.x, 0, g.y);
      d.group.rotation.y = -g.angle;
      walkFigure(d, g.x, g.y);
      const hunting = g.state === 'hunt';
      const suspicious = g.state === 'suspicious' || g.suspicion > 0.35;
      d.coneMat.color.setHex(hunting ? 0xff4d3d : suspicious ? 0xff9a2a : 0xffb347);
      d.coneMat.opacity = hunting ? 0.48 : suspicious ? 0.4 : 0.3;
      d.rimMat.color.setHex(hunting ? 0xff4d3d : 0xffc93c);
      d.rimMat.opacity = hunting ? 0.8 : 0.5;
      d.ring.material.color.setHex(hunting ? 0xff4d3d : suspicious ? 0xff9a2a : 0x8fa3c8);
      d.mark.visible = g.state === 'suspicious' || hunting;
      if (d.mark.visible) {
        const want = hunting ? '!' : '?';
        if (d.mark.userData.ch !== want) {
          d.mark.userData.ch = want;
          d.mark.material.map.dispose();
          d.mark.material.map = canvasTexture(128, 128, (ctx) => {
            ctx.clearRect(0, 0, 128, 128);
            ctx.font = '700 84px Georgia, serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = hunting ? '#ff5a45' : '#ffd24a';
            ctx.fillText(want, 64, 68);
          });
          d.mark.material.needsUpdate = true;
        }
        d.mark.position.y = 2.6 + Math.sin(time * 5) * 0.05;
      }
    });

    game.cameras.forEach((c, i) => {
      const d = dynamic.cameras[i];
      d.group.rotation.y = -c.angle;
      d.arcMat.opacity = c.spotted ? 0.45 : 0.2;
      d.arcMat.color.setHex(c.spotted ? 0xff4d3d : 0x7fe3f0);
    });

    game.lasers.forEach((lz, i) => {
      const d = dynamic.lasers[i];
      const pulse = lz.live ? 0.65 + Math.sin(time * 10) * 0.3 : 0.08;
      d.beamMat.opacity = pulse;
    });

    // Lamps: a doused lamp goes dark and its pool vanishes.
    dynamic.lamps.forEach((l) => {
      const off = !!l.def.off;
      l.light.intensity = off ? 0 : 26;
      l.pool.visible = !off;
      l.headMat.emissiveIntensity = off ? 0 : 2.2;
      l.headMat.color.setHex(off ? 0x333333 : 0xffc266);
    });

    // Loot spins on its pedestal; taken loot vanishes.
    const loot = dynamic.loot;
    loot.group.visible = !game.level.loot.taken;
    if (loot.group.visible) {
      loot.mesh.rotation.y = time * 1.4;
      loot.mesh.position.y = 1.55 + Math.sin(time * 2.2) * 0.07;
      loot.ring.scale.setScalar(1 + Math.sin(time * 3) * 0.12);
      loot.light.intensity = 9 + Math.sin(time * 2.2) * 2;
    }
    dynamic.relics.forEach((r) => {
      r.group.visible = !r.def.taken;
      if (r.group.visible) {
        r.mesh.rotation.y = time * 1.8;
        r.mesh.position.y = 1.15 + Math.sin(time * 2.6 + r.def.x) * 0.05;
      }
    });

    // Exit: locked and dim until the loot is taken, then bright and pulsing.
    const open = game.level.loot.taken;
    dynamic.exit.ring.material.opacity = open ? 0.7 + Math.sin(time * 4) * 0.25 : 0.25;
    dynamic.exit.pad.material.emissiveIntensity = open ? 0.9 : 0.15;
    dynamic.exit.label.material.opacity = open ? 1 : 0.45;
    dynamic.exit.beamMat.opacity = open ? 0.12 + Math.sin(time * 3) * 0.04 : 0.05;

    // Noise rings, smoke clouds and flying pebbles.
    game.gadgets.rings.forEach((r, i) => {
      const m = dynamic.rings[i];
      if (!m) return;
      const k = r.t / r.dur;
      m.visible = k < 1;
      if (m.visible) {
        m.position.set(r.x, 0.05, r.y);
        m.scale.setScalar(0.3 + k * r.maxR);
        m.material.opacity = (1 - k) * 0.75;
        m.material.color.setHex(r.kind === 'coin' ? 0xffd24a : 0xffffff);
      }
    });
    game.gadgets.smokes.forEach((s, i) => {
      const m = dynamic.smokes[i];
      if (!m) return;
      const k = s.t / s.dur;
      m.visible = k < 1;
      if (m.visible) {
        m.position.set(s.x, 0.9, s.y);
        const grow = Math.min(1, s.t * 3);
        m.scale.set(s.r * 2.4 * grow, s.r * 1.8 * grow, 1);
        m.material.opacity = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
      }
    });
    game.gadgets.coins.forEach((c, i) => {
      const m = dynamic.coinMeshes[i];
      if (!m) return;
      m.visible = !c.landed;
      if (m.visible) {
        const pos = coinPos(c);
        m.position.set(pos.x, 0.2 + pos.h, pos.y);
        m.rotation.x += 0.3;
      }
    });
  }

  function render() {
    renderer.render(scene, camera);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  }

  // Screen point -> floor point: a ray through the perspective camera
  // onto the y=0 plane. Used for pebble throws (click to distract).
  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    raycaster.setFromCamera(ndc, camera);
    const p = raycaster.ray.intersectPlane(floorPlane, hitPoint);
    if (!p) return { x: 0, y: 0 };
    return { x: p.x, y: p.z };
  }

  return { buildLevel, sync, render, resize, screenToWorld, renderer, scene, camera };
}
