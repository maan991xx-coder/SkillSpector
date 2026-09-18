/* Dark Ember — audio engine
 * Everything here is synthesised at runtime with the Web Audio API: the fire is
 * filtered noise, the sparks are short bandpass bursts, and the score is a slow
 * modal chord pad over a drone. No audio files, no licensing, no downloads.
 *
 * Browsers block audio until the user interacts, so nothing is built until
 * unlock() is called from a real gesture.
 */
(() => {
  "use strict";

  const FX = {};
  const store = {
    get enabled() { return localStorage.getItem("de.sound") !== "off"; },
    set enabled(v) { localStorage.setItem("de.sound", v ? "on" : "off"); },
  };

  let ctx = null;
  let built = false;
  let enabled = store.enabled;
  let scene = "menu";

  // graph nodes
  let master, musicBus, fireBus, sfxBus, reverb;
  let fireLevel, fireFilter, heartTimer = null, crackleTimer = null, bellTimer = null;
  let fireTarget = 1;

  const now = () => ctx.currentTime;
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- buffers ----------
  let noiseBuf = null, brownBuf = null;

  function makeNoise(seconds, brown) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.021 * white) / 1.02;   // leaky integrator → brown noise
          d[i] = last * 3.2;
        } else {
          d[i] = white;
        }
      }
    }
    return buf;
  }

  /** Synthetic impulse response: noise with an exponential tail. */
  function makeImpulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function panner(pan) {
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      return p;
    }
    return ctx.createGain();            // older Safari: no panning, still audible
  }

  function noiseSource(brown) {
    const s = ctx.createBufferSource();
    s.buffer = brown ? brownBuf : noiseBuf;
    s.loop = true;
    return s;
  }

  // ---------- build ----------
  function build() {
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    master.connect(ctx.destination);

    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(3.2, 2.6);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.5;
    reverb.connect(reverbGain).connect(master);

    musicBus = ctx.createGain(); musicBus.gain.value = 0.34; musicBus.connect(master);
    fireBus = ctx.createGain();  fireBus.gain.value = 0.5;   fireBus.connect(master);
    sfxBus = ctx.createGain();   sfxBus.gain.value = 0.55;   sfxBus.connect(master);
    musicBus.connect(reverb);
    sfxBus.connect(reverb);

    noiseBuf = makeNoise(2, false);
    brownBuf = makeNoise(2, true);

    buildFire();
    buildMusic();
    scheduleCrackle();
    scheduleBell();
  }

  // ---------- fire bed ----------
  function buildFire() {
    fireLevel = ctx.createGain();
    fireLevel.gain.value = 0.0001;
    fireLevel.connect(fireBus);

    // low roar
    fireFilter = ctx.createBiquadFilter();
    fireFilter.type = "lowpass";
    fireFilter.frequency.value = 520;
    fireFilter.Q.value = 0.8;
    const roar = noiseSource(true);
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.9;
    roar.connect(roarGain).connect(fireFilter).connect(fireLevel);
    roar.start();

    // airy hiss on top
    const hiss = noiseSource(false);
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "bandpass";
    hissFilter.frequency.value = 2100;
    hissFilter.Q.value = 0.7;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.05;
    hiss.connect(hissFilter).connect(hissGain).connect(fireLevel);
    hiss.start();

    // slow breathing of the roar
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 210;
    lfo.connect(lfoAmt).connect(fireFilter.frequency);
    lfo.start();

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.31;
    const lfo2Amt = ctx.createGain();
    lfo2Amt.gain.value = 0.06;
    lfo2.connect(lfo2Amt).connect(fireLevel.gain);
    lfo2.start();

    fireLevel.gain.setTargetAtTime(0.28, now(), 2.5);
  }

  /** One crackle: a short resonant noise pop near the fire. */
  function crackle(strong) {
    const t = now();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = rnd(0.7, 1.4);

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = strong ? rnd(700, 1800) : rnd(1500, 4200);
    bp.Q.value = rnd(1.2, 4);

    const g = ctx.createGain();
    const peak = (strong ? rnd(0.18, 0.4) : rnd(0.05, 0.16)) * fireTarget;
    const dur = strong ? rnd(0.09, 0.22) : rnd(0.02, 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(bp).connect(g).connect(panner(rnd(-0.35, 0.35))).connect(fireBus);
    src.start(t, rnd(0, 1.5));
    src.stop(t + dur + 0.05);
  }

  function scheduleCrackle() {
    if (!built) return;
    clearTimeout(crackleTimer);
    const strong = Math.random() < 0.22;
    crackle(strong);
    // busier fire when the flame is strong
    const gap = rnd(40, 260) + (1 - fireTarget) * 420;
    crackleTimer = setTimeout(scheduleCrackle, gap);
  }

  // ---------- music ----------
  // D minor, slow and modal: Dm → Bb → Gm → A
  const CHORDS = [
    [50, 53, 57],
    [46, 50, 53],
    [43, 46, 50],
    [45, 48, 52],
  ];
  const PENTA = [62, 65, 67, 69, 72, 74];
  let chordIndex = 0;
  let chordTimer = null;

  function buildMusic() {
    // constant sub drone
    const drone = ctx.createOscillator();
    drone.type = "sawtooth";
    drone.frequency.value = midi(38);
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 190;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.09;
    drone.connect(droneFilter).connect(droneGain).connect(musicBus);
    drone.start();

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = midi(26);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.16;
    sub.connect(subGain).connect(musicBus);
    sub.start();

    playChord();
  }

  function padVoice(freq, at, dur, level) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 1.004;          // gentle detune

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(420, at);
    filt.frequency.linearRampToValueAtTime(900, at + dur * 0.5);
    filt.frequency.linearRampToValueAtTime(380, at + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + dur * 0.35);   // long swell
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    osc.connect(filt); osc2.connect(filt);
    filt.connect(g).connect(musicBus);
    osc.start(at); osc2.start(at);
    osc.stop(at + dur + 0.1); osc2.stop(at + dur + 0.1);
  }

  function playChord() {
    if (!built) return;
    const dur = scene === "playing" ? 11 : 15;
    const chord = CHORDS[chordIndex % CHORDS.length];
    chordIndex++;
    const at = now() + 0.05;
    chord.forEach((n, i) => padVoice(midi(n), at, dur, 0.075 - i * 0.012));
    chordTimer = setTimeout(playChord, (dur * 0.72) * 1000);
  }

  /** Sparse bell note — the melodic breath of the score. */
  function bell(note, level) {
    const t = now();
    const f = midi(note);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;

    const mod = ctx.createOscillator();     // FM gives it a struck, metallic edge
    mod.type = "sine";
    mod.frequency.value = f * 2.01;
    const modAmt = ctx.createGain();
    modAmt.gain.setValueAtTime(f * 1.4, t);
    modAmt.gain.exponentialRampToValueAtTime(1, t + 0.7);
    mod.connect(modAmt).connect(osc.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);

    osc.connect(g).connect(musicBus);
    g.connect(reverb);
    osc.start(t); mod.start(t);
    osc.stop(t + 3); mod.stop(t + 3);
  }

  function scheduleBell() {
    if (!built) return;
    clearTimeout(bellTimer);
    if (scene !== "over") {
      bell(PENTA[(Math.random() * PENTA.length) | 0], rnd(0.05, 0.11));
      if (Math.random() < 0.4) {
        setTimeout(() => built && bell(PENTA[(Math.random() * PENTA.length) | 0], 0.05), rnd(700, 1600));
      }
    }
    bellTimer = setTimeout(scheduleBell, scene === "playing" ? rnd(5000, 11000) : rnd(8000, 17000));
  }

  /** Low heartbeat that creeps in as the flame dies. */
  function heartbeat() {
    if (!built) return;
    clearTimeout(heartTimer);
    if (scene === "playing" && fireTarget < 0.42) {
      const thump = (delay, level) => {
        const t = now() + delay;
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(74, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(level, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g).connect(master);
        o.start(t); o.stop(t + 0.35);
      };
      const urgency = 1 - fireTarget;
      thump(0, 0.25 * urgency);
      thump(0.26, 0.17 * urgency);
      heartTimer = setTimeout(heartbeat, 1500 - urgency * 700);
    } else {
      heartTimer = setTimeout(heartbeat, 700);
    }
  }

  // ---------- public API ----------
  FX.unlock = function () {
    if (!enabled || built) { if (ctx && ctx.state === "suspended") ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    build();
    built = true;
    heartbeat();
    if (ctx.state === "suspended") ctx.resume();
  };

  FX.isEnabled = () => enabled;
  FX.isReady = () => built;

  FX.setEnabled = function (v) {
    enabled = v;
    store.enabled = v;
    if (!built) { if (v) FX.unlock(); return; }
    master.gain.cancelScheduledValues(now());
    master.gain.setTargetAtTime(v ? 0.9 : 0, now(), 0.15);
    if (v && ctx.state === "suspended") ctx.resume();
  };

  FX.toggle = function () { FX.setEnabled(!enabled); return enabled; };

  FX.setScene = function (name) {
    scene = name;
    if (!built) return;
    musicBus.gain.setTargetAtTime(name === "over" ? 0.16 : 0.34, now(), 1.2);
    fireBus.gain.setTargetAtTime(name === "playing" ? 0.62 : 0.5, now(), 0.8);
  };

  /** 0..1 — how alive the fire is; drives roar volume, brightness and crackle rate. */
  FX.setFire = function (ratio) {
    fireTarget = Math.max(0, Math.min(1, ratio));
    if (!built) return;
    fireLevel.gain.setTargetAtTime(0.1 + fireTarget * 0.3, now(), 0.4);
    fireFilter.frequency.setTargetAtTime(320 + fireTarget * 380, now(), 0.6);
  };

  let lastSpark = 0;
  /** pan: -1..1 (screen position), power: burst strength. */
  FX.spark = function (pan, power) {
    if (!built) return;
    const t = now();
    if (t - lastSpark < 0.05) return;            // keep rapid bursts from stacking
    lastSpark = t;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = rnd(0.9, 1.6);

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(rnd(2200, 3200), t);
    bp.frequency.exponentialRampToValueAtTime(rnd(5000, 9000), t + 0.12);   // upward fizz

    const g = ctx.createGain();
    const dur = 0.12 + power * 0.14;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1 + power * 0.16, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(bp).connect(g).connect(panner(pan)).connect(sfxBus);
    src.start(t, rnd(0, 1.5));
    src.stop(t + dur + 0.05);

    if (power > 0.9) crackle(true);
  };

  /** Collecting an ember: a bright bell climbing a pentatonic step per streak. */
  FX.collect = function (step) {
    if (!built) return;
    bell(PENTA[step % PENTA.length] + 12, 0.16);
    const t = now();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(hp).connect(g).connect(sfxBus);
    src.start(t, rnd(0, 1.5));
    src.stop(t + 0.22);
  };

  FX.uiHover = function () {
    if (!built) return;
    const t = now();
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(sfxBus);
    o.start(t); o.stop(t + 0.15);
  };

  FX.uiSelect = function () {
    if (!built) return;
    const t = now();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(5200, t + 0.22);   // ignition whoosh
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(lp).connect(g).connect(sfxBus);
    src.start(t, rnd(0, 1.5));
    src.stop(t + 0.5);

    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.3);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(og).connect(master);
    o.start(t); o.stop(t + 0.45);
  };

  /** The fire goes out: a downward hiss and a low toll. */
  FX.gameOver = function () {
    if (!built) return;
    const t = now();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    src.connect(lp).connect(g).connect(sfxBus);
    src.start(t, rnd(0, 1.5));
    src.stop(t + 1.9);

    bell(38, 0.3);
    bell(45, 0.16);
  };

  window.DarkEmberAudio = FX;
})();
