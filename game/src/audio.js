// Canyon Postman — every sound is synthesised with Web Audio: no audio files,
// so the game loads nothing over the network and stays inside its size budget.
// The engine hum follows the throttle, the wind follows the speed.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSrc = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: a low sawtooth through a low-pass, pitch and loudness by throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      // Wind: looped noise through a band-pass, loudness by airspeed.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSrc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, gain, when = 0) {
    if (!ctx || muted) return;
    try {
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    /** Call on the first user gesture (the start button). */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    /** Per-frame: engine and wind follow the flight state. */
    update(throttle, speed, airborne) {
      if (!ctx || muted) return;
      try {
        const t = ctx.currentTime;
        engineOsc.frequency.setTargetAtTime(58 + throttle * 84, t, 0.1);
        engineGain.gain.setTargetAtTime(airborne ? 0.03 + throttle * 0.075 : 0.012 + throttle * 0.03, t, 0.1);
        windGain.gain.setTargetAtTime(Math.min(0.09, (speed / 55) * 0.09), t, 0.15);
        windFilter.frequency.setTargetAtTime(500 + speed * 14, t, 0.15);
      } catch {
        // Ignore audio errors.
      }
    },
    ring() {
      blip(880, 0.35, 'sine', 0.16);
      blip(1318, 0.5, 'sine', 0.12, 0.09);
    },
    drop() {
      blip(660, 0.25, 'sine', 0.14);
      blip(990, 0.4, 'sine', 0.12, 0.08);
    },
    alarm() {
      blip(1180, 0.12, 'square', 0.06);
    },
    thud() {
      blip(58, 0.3, 'sine', 0.3);
      blip(120, 0.18, 'triangle', 0.14, 0.02);
    },
    crash() {
      if (!ctx || muted) return;
      try {
        const t = ctx.currentTime;
        const len = ctx.sampleRate * 0.7;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = 0.35;
        src.connect(g);
        g.connect(ctx.destination);
        src.start(t);
        blip(48, 0.6, 'sine', 0.3);
      } catch {
        // Ignore.
      }
    },
    toggleMute() {
      muted = !muted;
      if (ctx) {
        try {
          engineGain.gain.value = 0;
          windGain.gain.value = 0;
        } catch {
          // Ignore.
        }
      }
      return muted;
    },
  };
}
