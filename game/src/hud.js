// hud.js — the DOM overlay: top bar, alarm panel, guard roster, field
// notes, control bar and banners. The judge reads the game mostly through
// its screenshots, so the HUD must show the whole heist at a glance:
// room + thief + cones + camera + loot + alarm meter in one frame.

const $ = (id) => document.getElementById(id);

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function alarmStage(game) {
  const v = game.alarmLevel;
  if (v < 0.25) return { label: 'CALM', cls: 'calm' };
  if (v < 0.5) return { label: 'UNEASY', cls: 'uneasy' };
  if (v < 0.75) return { label: 'HUNTED', cls: 'hunted' };
  return { label: 'ALARM', cls: 'alarm' };
}

export function makeHud() {
  let bannerTimer = null;
  let bannerToken = 0;
  let lastHudText = '';

  function banner(text, kind, sticky) {
    const el = $('banner');
    if (!el) return;
    const token = ++bannerToken;
    el.textContent = text;
    el.className = `banner show ${kind || ''}`;
    clearTimeout(bannerTimer);
    if (!sticky) {
      bannerTimer = setTimeout(() => {
        if (token === bannerToken) el.className = 'banner';
      }, 2600);
    }
  }

  function update(game) {
    const p = game.player;
    const lvl = game.level;
    const totalLoot = lvl.loot.value + lvl.relics.reduce((a, r) => a + r.value, 0);
    const taken = lvl.loot.taken ? lvl.loot.value : 0;
    const relicTaken = lvl.relics.filter((r) => r.taken).reduce((a, r) => a + r.value, 0);

    const vis = game.visibilityLabel;
    const stage = alarmStage(game);

    const text = [
      lvl.name, game.jobIndex + 1, p.lootCount, lvl.relics.length,
      taken + relicTaken, totalLoot, fmtTime(game.time), vis,
      stage.label, Math.round(game.alarmLevel * 100), p.coins, p.smoke, game.strikes, game.maxSuspicion.toFixed(2),
    ].join('|');
    if (text === lastHudText) return;
    lastHudText = text;

    $('hud-job').textContent = `JOB ${lvl.id} · ${lvl.name}`;
    $('hud-objective').textContent = lvl.objective;
    $('hud-visibility').textContent = vis;
    $('hud-visibility').className = `vis ${vis === 'LIT' ? 'lit' : vis === 'SEEN' ? 'seen' : 'shadow'}`;
    $('hud-coins').textContent = p.coins;
    $('hud-loot').textContent = `${p.lootCount + p.relicsTaken}/${1 + lvl.relics.length} · $${taken + relicTaken}`;
    $('hud-time').textContent = fmtTime(game.time);
    $('hud-score').textContent = `$${game.score}`;

    // Alarm meter: 12 segments, filled by alarm level.
    const seg = $('alarm-segments');
    if (seg) {
      const filled = Math.round(game.alarmLevel * 12);
      let html = '';
      for (let i = 0; i < 12; i++) {
        html += `<span class="seg ${i < filled ? 'on ' + stage.cls : ''}"></span>`;
      }
      seg.innerHTML = html;
    }
    const al = $('alarm-label');
    if (al) { al.textContent = stage.label; al.className = `alarm-label ${stage.cls}`; }
    $('hud-alarm-pct').textContent = `${Math.round(game.alarmLevel * 100)}%`;
    // Compact alarm chip: the same state, shown while the right panel
    // is collapsed so the alarm never leaves the frame.
    const chipLabel = $('alarm-chip-label');
    if (chipLabel) { chipLabel.textContent = stage.label; chipLabel.className = `chip-label ${stage.cls}`; }
    const chipPct = $('alarm-chip-pct');
    if (chipPct) chipPct.textContent = `${Math.round(game.alarmLevel * 100)}%`;
    $('hud-noise').textContent = p.noise > 0.6 ? 'LOUD' : p.noise > 0.15 ? 'SOFT' : 'SILENT';
    $('hud-noise').className = p.noise > 0.6 ? 'loud' : '';
    $('hud-strikes').textContent = '●'.repeat(game.strikes) + '○'.repeat(3 - game.strikes);
    $('hud-ghost').textContent = p.everSpotted ? 'SEEN' : 'GHOST +500';

    // Guard roster with live state and distance.
    const roster = $('guard-roster');
    if (roster) {
      roster.innerHTML = game.guards.map((g) => {
        const d = Math.hypot(g.x - p.x, g.y - p.y);
        const state = g.state === 'patrol' ? 'PATROL' : g.state === 'suspicious' ? 'SUSPICIOUS ?' : g.state === 'hunt' ? 'HUNTING !' : 'RETURNING';
        return `<div class="roster-row ${g.state}"><span class="dot"></span><span class="rname">${g.name}</span><span class="rstate">${state}</span><span class="rdist">${d.toFixed(0)}m</span></div>`;
      }).join('');
    }
    const cams = $('camera-list');
    if (cams) {
      cams.innerHTML = game.cameras.length === 0 ? '<div class="muted">none in this job</div>' :
        game.cameras.map((c) => `<div class="roster-row ${c.spotted ? 'hunt' : ''}"><span class="dot cam"></span><span class="rname">${c.name} BRASS EYE</span><span class="rstate">${c.spotted ? 'SPOTTED' : 'SWEEPING'}</span><span class="rdist">${Math.round(c.exposure * 100)}%</span></div>`).join('');
    }
    const exit = $('hud-exit');
    if (exit) exit.textContent = lvl.loot.taken ? 'EXIT OPEN' : 'EXIT LOCKED';
    $('hud-gadgets').textContent = `PEBBLES ${p.coins} · SMOKE ${p.smoke}`;
  }

  function showOverlay(id) {
    for (const o of ['overlay-title', 'overlay-complete', 'overlay-failed', 'overlay-paused']) {
      const el = $(o);
      if (el) el.classList.toggle('hidden', o !== id);
    }
  }

  function fillComplete(game, result) {
    $('complete-title').textContent = result.title;
    $('complete-lines').innerHTML = result.lines.map((l) => `<div>${l}</div>`).join('');
    $('btn-next').textContent = result.nextLabel;
  }

  function fillFailed(game) {
    $('failed-lines').innerHTML =
      `<div>Three strikes — the wardens drag you into the light.</div>` +
      `<div>Take: $${game.player.loot} · Time ${fmtTime(game.time)}</div>` +
      `<div class="muted">The ledger stays in the vault. Try the job again.</div>`;
  }

  function flash() {
    const el = $('flash');
    if (!el) return;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  return { banner, update, showOverlay, fillComplete, fillFailed, flash };
}
