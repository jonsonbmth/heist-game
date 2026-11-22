// render.js — the Three.js scene, top-down through an orthographic camera.
// Dark slate floors, warm amber lamplight pools, translucent vision cones,
// and stylised (never boxy) figures built from cylinders, spheres and cones
// with readable silhouettes and facing wedges — the img2threejs approach:
// authored procedural forms, quality-gated by a screenshot review.
// No addons: the vendored three.min.js is the core build only, so bloom and
// vignette come from additive glow sprites and a CSS vignette overlay.

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
  return canvasTexture(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, 'rgba(200, 205, 215, 0.55)');
    grad.addColorStop(0.6, 'rgba(180, 185, 200, 0.32)');
    grad.addColorStop(1, 'rgba(170, 175, 195, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
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

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);

  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 120);
  camera.up.set(0, 0, -1);
  camera.position.set(0, 50, 0);
  camera.lookAt(0, 0, 0);

  // Lighting: a dim cool wash, a soft key light for shadows, and warm lamps.
  scene.add(new THREE.HemisphereLight(0x3d4f78, 0x0d101c, 1.25));
  const key = new THREE.DirectionalLight(0xbfd0ff, 0.7);
  key.position.set(-14, 26, -10);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  scene.add(key);
  scene.add(new THREE.AmbientLight(0x232c44, 0.95));

  const glowTex = glowTexture();
  const smokeTex = smokeTexture();
  const coneFadeTex = coneFadeTexture();
  let levelGroup = null;
  let dynamic = null; // per-job meshes: guards, thief, loot, cones, lamps...

  function fitCamera(level) {
    const rect = canvas.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    const pad = 1.6;
    const vw = level.w + pad * 2;
    const vh = level.h + pad * 2;
    let halfW = vw / 2, halfH = vh / 2;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    camera.left = -halfW; camera.right = halfW;
    camera.top = halfH; camera.bottom = -halfH;
    camera.position.set(level.w / 2, 50, level.h / 2);
    camera.lookAt(level.w / 2, 0, level.h / 2);
    camera.updateProjectionMatrix();
    key.shadow.camera.left = -level.w / 2 - 4;
    key.shadow.camera.right = level.w / 2 + 4;
    key.shadow.camera.top = level.h / 2 + 4;
    key.shadow.camera.bottom = -level.h / 2 - 4;
    key.shadow.camera.far = 80;
    key.target.position.set(level.w / 2, 0, level.h / 2);
    scene.add(key.target);
    key.position.set(level.w / 2 - 14, 26, level.h / 2 - 10);
    renderer.setSize(rect.width, rect.height, false);
  }

  function floorTexture(level) {
    return canvasTexture(1024, 1024, (g, w, h) => {
      g.fillStyle = '#161c2c';
      g.fillRect(0, 0, w, h);
      const tx = w / level.w, ty = h / level.h;
      // Checker of slate tiles with a little per-tile value jitter (seeded).
      const rnd = mulberry32(level.id * 7919 + 13);
      for (let y = 0; y < level.h; y++) {
        for (let x = 0; x < level.w; x++) {
          const v = rnd();
          g.fillStyle = (x + y) % 2 === 0
            ? `rgb(${22 + v * 6}, ${28 + v * 6}, ${44 + v * 8})`
            : `rgb(${18 + v * 5}, ${23 + v * 5}, ${36 + v * 7})`;
          g.fillRect(x * tx, y * ty, tx + 1, ty + 1);
          g.strokeStyle = 'rgba(8, 10, 18, 0.55)';
          g.strokeRect(x * tx + 0.5, y * ty + 0.5, tx, ty);
        }
      }
      // Faint mortar speckle.
      g.fillStyle = 'rgba(255, 255, 255, 0.02)';
      for (let i = 0; i < 500; i++) {
        g.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
    });
  }

  function buildLevel(level) {
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

    // Floor.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(level.w, level.h),
      new THREE.MeshStandardMaterial({ map: floorTexture(level), roughness: 0.95, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(level.w / 2, 0, level.h / 2);
    floor.receiveShadow = true;
    levelGroup.add(floor);

    // Carpets: thin coloured planes laid on the floor.
    for (const c of level.carpets || []) {
      const rug = new THREE.Mesh(
        new THREE.PlaneGeometry(c.w, c.h),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(c.color), roughness: 1 }),
      );
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(c.x + c.w / 2, 0.012, c.y + c.h / 2);
      rug.receiveShadow = true;
      levelGroup.add(rug);
    }

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.85 });
    const wallTopMat = new THREE.MeshStandardMaterial({ color: 0x3a4a6e, roughness: 0.8 });
    for (const b of level.walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(b.w, 1.0, b.h), wallMat);
      wall.position.set(b.x + b.w / 2, 0.5, b.y + b.h / 2);
      wall.castShadow = true; wall.receiveShadow = true;
      levelGroup.add(wall);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.06, 0.06, b.h + 0.06), wallTopMat);
      cap.position.set(b.x + b.w / 2, 1.02, b.y + b.h / 2);
      levelGroup.add(cap);
    }

    const crateMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
    const crateTopMat = new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.85 });
    for (const b of level.crates) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.7, b.h), crateMat);
      crate.position.set(b.x + b.w / 2, 0.35, b.y + b.h / 2);
      crate.castShadow = true; crate.receiveShadow = true;
      levelGroup.add(crate);
      const top = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.15, 0.06, b.h - 0.15), crateTopMat);
      top.position.set(b.x + b.w / 2, 0.73, b.y + b.h / 2);
      levelGroup.add(top);
    }

    const coverMat = new THREE.MeshStandardMaterial({ color: 0x2e4a3a, roughness: 1 });
    const coverTopMat = new THREE.MeshStandardMaterial({ color: 0x3d6248, roughness: 1 });
    for (const b of level.cover) {
      const cov = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.34, b.h), coverMat);
      cov.position.set(b.x + b.w / 2, 0.17, b.y + b.h / 2);
      cov.castShadow = true; cov.receiveShadow = true;
      levelGroup.add(cov);
      const top = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.1, 0.05, b.h - 0.1), coverTopMat);
      top.position.set(b.x + b.w / 2, 0.36, b.y + b.h / 2);
      levelGroup.add(top);
    }

    // Tall grass: clusters of small green cones (seeded positions).
    const rnd = mulberry32(level.id * 104729 + 7);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 1 });
    const grassMat2 = new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: 1 });
    for (const g of level.grass) {
      const n = Math.floor(g.w * g.h * 6);
      for (let i = 0; i < n; i++) {
        const gx = g.x + 0.2 + rnd() * (g.w - 0.4);
        const gy = g.y + 0.2 + rnd() * (g.h - 0.4);
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.09 + rnd() * 0.05, 0.42 + rnd() * 0.25, 5),
          rnd() > 0.5 ? grassMat : grassMat2,
        );
        cone.position.set(gx, 0.22, gy);
        cone.rotation.y = rnd() * Math.PI;
        cone.castShadow = true;
        levelGroup.add(cone);
      }
    }

    // Room labels, floating just above the floor.
    for (const lb of level.labels || []) {
      const spr = textSprite(lb.text, { size: 40 });
      spr.position.set(lb.x, 0.35, lb.y);
      levelGroup.add(spr);
    }

    // Lamps: pole, glowing head, point light and a warm pool on the floor.
    dynamic = { lamps: [], guards: [], cameras: [], rings: [], smokes: [], coins: [] };
    for (const lamp of level.lamps) {
      const group = new THREE.Group();
      group.position.set(lamp.x, 0, lamp.y);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, 1.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x1c2233, roughness: 0.7, metalness: 0.4 }),
      );
      pole.position.y = 0.75;
      pole.castShadow = true;
      group.add(pole);
      const headMat = new THREE.MeshStandardMaterial({
        color: 0xffc266, emissive: 0xffa63d, emissiveIntensity: 2.2, roughness: 0.4,
      });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), headMat);
      head.position.y = 1.58;
      group.add(head);
      const light = new THREE.PointLight(0xffb347, 26, lamp.r * 1.7, 1.8);
      light.position.y = 1.5;
      group.add(light);
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(lamp.r * 1.9, lamp.r * 1.9),
        new THREE.MeshBasicMaterial({
          map: glowTex, transparent: true, opacity: 0.34,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.02;
      group.add(pool);
      levelGroup.add(group);
      dynamic.lamps.push({ def: lamp, group, light, headMat, pool });
    }

    // Loot: a slowly turning gold octahedron with its own small light.
    const lootGroup = new THREE.Group();
    lootGroup.position.set(level.loot.x, 0, level.loot.y);
    const lootMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34),
      new THREE.MeshStandardMaterial({
        color: 0xffc93c, emissive: 0xa66f00, emissiveIntensity: 0.9,
        roughness: 0.25, metalness: 0.85,
      }),
    );
    lootMesh.position.y = 0.55;
    lootMesh.castShadow = true;
    lootGroup.add(lootMesh);
    const lootLight = new THREE.PointLight(0xffc93c, 10, 5, 1.8);
    lootLight.position.y = 0.8;
    lootGroup.add(lootLight);
    const lootRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.58, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    lootRing.rotation.x = -Math.PI / 2;
    lootRing.position.y = 0.03;
    lootGroup.add(lootRing);
    const lootLabel = textSprite(level.loot.label, { size: 40, color: '#ffd97a', w: 640, h: 96 });
    lootLabel.position.y = 1.25;
    lootGroup.add(lootLabel);
    levelGroup.add(lootGroup);
    dynamic.loot = { group: lootGroup, mesh: lootMesh, light: lootLight, ring: lootRing, label: lootLabel };

    dynamic.relics = [];
    for (const relic of level.relics) {
      const rg = new THREE.Group();
      rg.position.set(relic.x, 0, relic.y);
      const rm = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.2),
        new THREE.MeshStandardMaterial({
          color: 0xffe9a8, emissive: 0x8a6d1f, emissiveIntensity: 0.7,
          roughness: 0.3, metalness: 0.8,
        }),
      );
      rm.position.y = 0.4;
      rm.castShadow = true;
      rg.add(rm);
      levelGroup.add(rg);
      dynamic.relics.push({ def: relic, group: rg, mesh: rm });
    }

    // Exit hatch: a green pad with a pulsing ring and an EXIT label.
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
    const exitLabel = textSprite('EXIT', { size: 52, color: '#5cf59a', w: 320, h: 96 });
    exitLabel.position.y = 1.0;
    exitGroup.add(exitLabel);
    levelGroup.add(exitGroup);
    dynamic.exit = { group: exitGroup, pad, ring: exitRing, label: exitLabel };

    // Guards: stylised wardens — navy cloak, wide-brim hat, facing wedge,
    // a state ring underfoot and a translucent vision cone on the floor.
    dynamic.guards = [];
    for (const g of level.guards) {
      const group = new THREE.Group();
      const cloak = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.35, 0.55, 14),
        new THREE.MeshStandardMaterial({ color: 0x46608f, roughness: 0.85 }),
      );
      cloak.position.y = 0.28;
      cloak.castShadow = true;
      group.add(cloak);
      const trim = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.028, 8, 20),
        new THREE.MeshStandardMaterial({ color: 0xc9973f, roughness: 0.5, metalness: 0.6 }),
      );
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.06;
      group.add(trim);
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.36, 0.05, 16),
        new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.8 }),
      );
      brim.position.y = 0.6;
      brim.castShadow = true;
      group.add(brim);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x35446a, roughness: 0.8 }),
      );
      dome.position.y = 0.62;
      group.add(dome);
      // Facing wedge: a small gold chevron ahead of the warden.
      const wedge = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.34, 4),
        new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0x7a5a00, emissiveIntensity: 0.6 }),
      );
      wedge.rotation.x = Math.PI / 2;
      wedge.rotation.y = Math.PI / 4;
      wedge.position.set(0, 0.45, 0.34);
      group.add(wedge);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.38, 0.45, 32),
        new THREE.MeshBasicMaterial({ color: 0x8fa3c8, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      group.add(ring);
      const mark = textSprite('?', { size: 72, color: '#ffd24a', w: 128, h: 128 });
      mark.scale.set(0.9, 0.9, 1);
      mark.position.y = 1.25;
      mark.visible = false;
      group.add(mark);
      // Vision cone.
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xffb347, transparent: true, opacity: 0.34, alphaMap: coneFadeTex,
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
      dynamic.guards.push({ group, cone, coneMat, rim, rimMat, ring, mark });
    }

    // Cameras: a wall box, a lens, and a sweeping teal arc.
    dynamic.cameras = [];
    for (const c of level.cameras) {
      const group = new THREE.Group();
      group.position.set(c.x, 0, c.y);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.34, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x3a4a5e, roughness: 0.6, metalness: 0.5 }),
      );
      box.position.y = 0.9;
      box.castShadow = true;
      group.add(box);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 0.3, 10),
        new THREE.MeshStandardMaterial({ color: 0x11151f, emissive: 0x66d9e8, emissiveIntensity: 1.4 }),
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0.9, 0.22);
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
      beam.position.set((lz.x1 + lz.x2) / 2, 0.5, (lz.y1 + lz.y2) / 2);
      beam.rotation.y = -Math.atan2(lz.y2 - lz.y1, lz.x2 - lz.x1);
      group.add(beam);
      for (const [px, py] of [[lz.x1, lz.y1], [lz.x2, lz.y2]]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.09, 0.6, 8),
          new THREE.MeshStandardMaterial({ color: 0x3a2020, emissive: 0xff3b30, emissiveIntensity: 0.8 }),
        );
        post.position.set(px, 0.3, py);
        group.add(post);
      }
      levelGroup.add(group);
      dynamic.lasers.push({ group, beamMat });
    }

    // The thief: deep-teal cloak, gold trim, hood, gold facing wedge.
    const thief = new THREE.Group();
    const tcloak = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.32, 0.55, 14),
      new THREE.MeshStandardMaterial({ color: 0x1d7a64, roughness: 0.85 }),
    );
    tcloak.position.y = 0.28;
    tcloak.castShadow = true;
    thief.add(tcloak);
    const ttrim = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.025, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xd8a24a, roughness: 0.45, metalness: 0.7 }),
    );
    ttrim.rotation.x = Math.PI / 2;
    ttrim.position.y = 0.06;
    thief.add(ttrim);
    const hood = new THREE.Mesh(
      new THREE.ConeGeometry(0.19, 0.42, 12),
      new THREE.MeshStandardMaterial({ color: 0x27a37e, roughness: 0.9 }),
    );
    hood.position.y = 0.72;
    hood.castShadow = true;
    thief.add(hood);
    const twedge = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0x8a6d1f, emissiveIntensity: 0.7 }),
    );
    twedge.rotation.x = Math.PI / 2;
    twedge.rotation.y = Math.PI / 4;
    twedge.position.set(0, 0.42, 0.32);
    thief.add(twedge);
    const tshadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    tshadow.rotation.x = -Math.PI / 2;
    tshadow.position.y = 0.015;
    thief.add(tshadow);
    // A gold ring under the thief, so the player is always findable.
    const tring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.46, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    tring.rotation.x = -Math.PI / 2;
    tring.position.y = 0.03;
    thief.add(tring);
    levelGroup.add(thief);
    dynamic.thief = thief;

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
    dynamic.smokes = [];
    for (let i = 0; i < 3; i++) {
      const sm = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }),
      );
      sm.rotation.x = -Math.PI / 2;
      sm.position.y = 0.06;
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

    fitCamera(level);
  }

  function sync(game, time) {
    if (!dynamic) return;
    const p = game.player;
    dynamic.thief.position.set(p.x, 0, p.y);
    dynamic.thief.rotation.y = -p.angle + Math.PI / 2;
    // A sneaking thief crouches low; a sprinting one leans into the run.
    const targetScale = p.stance === 'sneak' ? 0.82 : 1;
    dynamic.thief.scale.y += (targetScale - dynamic.thief.scale.y) * 0.2;

    game.guards.forEach((g, i) => {
      const d = dynamic.guards[i];
      d.group.position.set(g.x, 0, g.y);
      d.group.rotation.y = -g.angle;
      const hunting = g.state === 'hunt';
      const suspicious = g.state === 'suspicious' || g.suspicion > 0.35;
      d.coneMat.color.setHex(hunting ? 0xff4d3d : suspicious ? 0xff9a2a : 0xffb347);
      d.coneMat.opacity = hunting ? 0.42 : suspicious ? 0.36 : 0.26;
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
        d.mark.position.y = 1.25 + Math.sin(time * 5) * 0.05;
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

    // Loot spins; taken loot vanishes.
    const loot = dynamic.loot;
    loot.group.visible = !game.level.loot.taken;
    if (loot.group.visible) {
      loot.mesh.rotation.y = time * 1.4;
      loot.mesh.position.y = 0.55 + Math.sin(time * 2.2) * 0.07;
      loot.ring.scale.setScalar(1 + Math.sin(time * 3) * 0.12);
      loot.light.intensity = 9 + Math.sin(time * 2.2) * 2;
    }
    dynamic.relics.forEach((r) => {
      r.group.visible = !r.def.taken;
      if (r.group.visible) {
        r.mesh.rotation.y = time * 1.8;
        r.mesh.position.y = 0.4 + Math.sin(time * 2.6 + r.def.x) * 0.05;
      }
    });

    // Exit: locked and dim until the loot is taken, then bright and pulsing.
    const open = game.level.loot.taken;
    dynamic.exit.ring.material.opacity = open ? 0.7 + Math.sin(time * 4) * 0.25 : 0.25;
    dynamic.exit.pad.material.emissiveIntensity = open ? 0.9 : 0.15;
    dynamic.exit.label.material.opacity = open ? 1 : 0.45;

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
        m.position.set(s.x, 0.06, s.y);
        const grow = Math.min(1, s.t * 3);
        m.scale.set(s.r * 2 * grow, s.r * 2 * grow, 1);
        m.material.opacity = k < 0.8 ? 0.85 : 0.85 * (1 - (k - 0.8) / 0.2);
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

  function resize(level) {
    fitCamera(level);
  }

  return { buildLevel, sync, render, resize, renderer, scene, camera };
}
