/**
 * SFX ligeros con Web Audio (sin archivos). Requiere gesto de usuario para desbloquear AudioContext.
 */

let ctx = null;

export function ensureJuiceAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function playBeep(freq, durSec, vol = 0.07, type = 'sine') {
  const c = ensureJuiceAudioContext();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = 0;
  o.connect(g);
  g.connect(c.destination);
  const t = c.currentTime;
  const v = Math.min(0.14, Math.max(0, vol));
  g.gain.linearRampToValueAtTime(v, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, t + Math.max(0.02, durSec));
  o.start(t);
  o.stop(t + durSec + 0.03);
}

let lastShootMs = 0;

export const juiceSfx = {
  killDrone() {
    playBeep(380, 0.055, 0.065, 'square');
  },
  shieldCatch() {
    playBeep(920, 0.038, 0.048, 'sine');
  },
  fusion() {
    playBeep(200, 0.045, 0.055, 'triangle');
    setTimeout(() => playBeep(440, 0.075, 0.05, 'sine'), 45);
  },
  missionPickup() {
    playBeep(660, 0.065, 0.058, 'sine');
  },
  missionDeliver() {
    playBeep(523, 0.1, 0.06, 'triangle');
  },
  victory() {
    playBeep(392, 0.09, 0.055, 'sine');
    setTimeout(() => playBeep(659, 0.14, 0.055, 'sine'), 90);
  },
  /** Limitado para no saturar con muchas balas. */
  enemyShootMaybe() {
    const now = performance.now();
    if (now - lastShootMs < 70) return;
    lastShootMs = now;
    playBeep(1350, 0.018, 0.022, 'triangle');
  },
};
