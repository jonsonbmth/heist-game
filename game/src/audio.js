// audio.js — tiny procedural WebAudio bleeps. No audio files, no network:
// every sound is an oscillator shaped in code. M mutes everything.

export function makeAudio() {
  let ctx = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol || 0.08, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
    unlock() { ensure(); },
    click() { tone(660, 0.06, 'square', 0.04); },
    coin() { tone(1180, 0.09, 'sine', 0.06, 1560); },
    clink() { tone(2093, 0.16, 'triangle', 0.07); tone(2637, 0.12, 'triangle', 0.04); },
    pickup() { tone(523, 0.1, 'sine', 0.08); setTimeout(() => tone(784, 0.14, 'sine', 0.08), 90); },
    smoke() { tone(320, 0.4, 'sawtooth', 0.03, 90); },
    douse() { tone(440, 0.25, 'sine', 0.05, 110); },
    alert() { tone(220, 0.3, 'square', 0.06, 440); setTimeout(() => tone(220, 0.3, 'square', 0.06, 440), 180); },
    caught() { tone(196, 0.5, 'sawtooth', 0.09, 98); },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sine', 0.08), i * 110));
    },
    fail() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.07), i * 160)); },
  };
}
