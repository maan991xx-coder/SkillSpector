/* Dark Ember
 * A game front-end built on a single image: living fire, flying sparks, ash and fog.
 * Everything is painted on one canvas over the photo; the HTML layer sits on top.
 */
(() => {
  "use strict";

  // ---------- Scene constants ----------
  const IMAGE_SRC = "assets/bonfire.jpg";
  const IMAGE_W = 700;
  const IMAGE_H = 420;
  // Bonfire position inside the image (0..1), so sparks stay pinned to it at any screen size.
  const FIRE = { x: 0.503, y: 0.845 };
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d", { alpha: false });

  let W = 0, H = 0, DPR = 1;
  let quality = localStorage.getItem("de.quality") || (REDUCED ? "low" : "high");

  const q = () => (quality === "high" ? 1 : 0.45);

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const box = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(box.width) || window.innerWidth);
    H = Math.max(1, Math.round(box.height) || window.innerHeight);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- Background image ----------
  const img = new Image();
  let imgReady = false;
  img.onload = () => { imgReady = true; };
  img.src = IMAGE_SRC;

  /** Cover-fit rect for the image, with a slow zoom/drift (Ken Burns). */
  let rect = { x: 0, y: 0, w: 0, h: 0 };
  function updateRect(t) {
    const zoom = REDUCED ? 1.02 : 1.05 + Math.sin(t * 0.00009) * 0.03;
    const s = Math.max(W / IMAGE_W, H / IMAGE_H) * zoom;
    const w = IMAGE_W * s, h = IMAGE_H * s;
    const px = REDUCED ? 0 : Math.sin(t * 0.00006) * (w - W) * 0.12;
    const py = REDUCED ? 0 : Math.cos(t * 0.00005) * (h - H) * 0.10;
    rect = { x: (W - w) / 2 + px, y: (H - h) / 2 + py, w, h };
  }
  const toX = (nx) => rect.x + nx * rect.w;
  const toY = (ny) => rect.y + ny * rect.h;

  // ---------- Particle sprites (pre-rendered; far cheaper than a gradient per particle) ----------
  function makeSprite(inner, outer) {
    const size = 64, c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, outer);
    grad.addColorStop(1, "rgba(255,80,10,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }
  const SPR = {
    hot:  makeSprite("rgba(255,244,214,1)", "rgba(255,170,60,.55)"),
    warm: makeSprite("rgba(255,196,110,1)", "rgba(255,120,30,.5)"),
    deep: makeSprite("rgba(255,132,44,1)",  "rgba(200,60,15,.45)"),
    ash:  makeSprite("rgba(225,215,200,.9)", "rgba(150,140,128,.25)"),
  };
  const EMBER_SPR = [SPR.hot, SPR.warm, SPR.warm, SPR.deep];

  // ---------- Particles ----------
  const embers = [];      // embers rising from the fire
  const sparks = [];      // fast spark bursts
  const ashes = [];       // falling ash
  const fog = [];         // drifting fog
  const orbs = [];        // collectible embers (gameplay)
  const rnd = (a, b) => a + Math.random() * (b - a);
  /** Keeps particle size sane from phone portrait to desktop. */
  const pScale = () => Math.min(1.25, Math.max(0.6, Math.min(W, H) / 820));

  function spawnEmber() {
    const fx = toX(FIRE.x), fy = toY(FIRE.y);
    const spread = rect.w * 0.035;
    embers.push({
      x: fx + rnd(-spread, spread),
      y: fy + rnd(-rect.h * 0.012, rect.h * 0.012),
      vx: rnd(-14, 14),
      vy: rnd(-95, -38),
      life: 0,
      max: rnd(1.9, 4.6),
      size: rnd(0.75, 2.3) * pScale(),
      phase: Math.random() * 6.28,
      wob: rnd(0.8, 2.4),
      spr: EMBER_SPR[(Math.random() * EMBER_SPR.length) | 0],
    });
  }

  function burst(x, y, n, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(40, 200) * power;
      sparks.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - rnd(10, 70),
        life: 0,
        max: rnd(0.45, 1.25),
        size: rnd(1, 2.6) * pScale(),
        spr: Math.random() < 0.55 ? SPR.hot : SPR.warm,
      });
    }
  }

  function seedAmbient() {
    ashes.length = 0;
    fog.length = 0;
    const ashCount = Math.round(70 * q());
    for (let i = 0; i < ashCount; i++) {
      ashes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vy: rnd(6, 22),
        vx: rnd(-10, 10),
        size: rnd(0.7, 2),
        alpha: rnd(0.08, 0.3),
        phase: Math.random() * 6.28,
      });
    }
    for (let i = 0; i < 6; i++) {
      fog.push({
        x: Math.random() * W,
        y: H * rnd(0.45, 0.95),
        r: rnd(160, 420),
        vx: rnd(8, 26) * (Math.random() < 0.5 ? -1 : 1),
        alpha: rnd(0.015, 0.05),
      });
    }
  }
  seedAmbient();

  // ---------- Game state ----------
  const state = {
    mode: "menu",          // menu | playing | over
    flame: 100,
    score: 0,
    elapsed: 0,
    best: Number(localStorage.getItem("de.best") || 0),
    flicker: 0.8,
    orbTimer: 0,
  };

  // ---------- UI elements ----------
  const el = {
    hud: document.getElementById("hud"),
    flameFill: document.getElementById("flameFill"),
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    finalScore: document.getElementById("finalScore"),
    finalTime: document.getElementById("finalTime"),
    qualityLabel: document.getElementById("qualityLabel"),
    screens: {
      menu: document.getElementById("screenMenu"),
      howto: document.getElementById("screenHowto"),
      over: document.getElementById("screenOver"),
    },
  };
  el.best.textContent = state.best;
  el.qualityLabel.textContent = quality === "high" ? "High" : "Lite";

  function showScreen(name) {
    for (const [key, node] of Object.entries(el.screens)) {
      node.classList.toggle("is-active", key === name);
    }
  }

  // title ignites letter by letter
  (function splitTitle() {
    const node = document.getElementById("title");
    const text = node.textContent.trim();
    node.textContent = "";
    [...text].forEach((chr, i) => {
      const span = document.createElement("span");
      span.className = chr === " " ? "ch ch--space" : "ch";
      span.textContent = chr === " " ? " " : chr;
      span.style.setProperty("--d", (0.35 + i * 0.07).toFixed(2) + "s");
      node.appendChild(span);
    });
  })();

  document.querySelectorAll(".menu__item").forEach((btn, i) => {
    btn.style.setProperty("--i", i);
    btn.addEventListener("click", () => {
      const fx = toX(FIRE.x), fy = toY(FIRE.y);
      burst(fx, fy, Math.round(26 * q()), 1.1);
      const action = btn.dataset.action;
      if (action === "play") startGame();
      else if (action === "menu") toMenu();
      else if (action === "howto") showScreen("howto");
      else if (action === "quality") toggleQuality();
    });
  });

  document.getElementById("backBtn").addEventListener("click", toMenu);

  function toggleQuality() {
    quality = quality === "high" ? "low" : "high";
    localStorage.setItem("de.quality", quality);
    el.qualityLabel.textContent = quality === "high" ? "High" : "Lite";
    seedAmbient();
  }

  function startGame() {
    state.mode = "playing";
    state.flame = 100;
    state.score = 0;
    state.elapsed = 0;
    state.orbTimer = 0;
    orbs.length = 0;
    el.score.textContent = "0";
    el.hud.hidden = false;
    showScreen(null);
    burst(toX(FIRE.x), toY(FIRE.y), Math.round(60 * q()), 1.6);
  }

  function toMenu() {
    state.mode = "menu";
    el.hud.hidden = true;
    orbs.length = 0;
    showScreen("menu");
  }

  function endGame() {
    state.mode = "over";
    el.hud.hidden = true;
    orbs.length = 0;
    el.finalScore.textContent = state.score;
    el.finalTime.textContent = Math.floor(state.elapsed);
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem("de.best", String(state.best));
      el.best.textContent = state.best;
    }
    showScreen("over");
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.mode !== "menu") toMenu();
    if (e.key === "Enter" && state.mode !== "playing") startGame();
  });

  // ---------- Input ----------
  function pointerAt(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }

  canvas.addEventListener("pointerdown", (e) => {
    const p = pointerAt(e);
    if (state.mode === "playing") {
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        if (Math.hypot(o.x - p.x, o.y - p.y) < o.r + 22) {
          orbs.splice(i, 1);
          state.score++;
          state.flame = Math.min(100, state.flame + 11);
          el.score.textContent = state.score;
          burst(o.x, o.y, Math.round(24 * q()), 1);
          return;
        }
      }
    }
    burst(p.x, p.y, Math.round(14 * q()), 0.8);
  });

  let lastTrail = 0;
  canvas.addEventListener("pointermove", (e) => {
    const now = performance.now();
    if (now - lastTrail < 34) return;            // light trail following the pointer
    lastTrail = now;
    const p = pointerAt(e);
    sparks.push({
      x: p.x, y: p.y,
      vx: rnd(-18, 18), vy: rnd(-40, -8),
      life: 0, max: rnd(0.4, 0.9), size: rnd(0.8, 1.8) * pScale(), spr: SPR.hot,
    });
  });

  // ---------- Drawing ----------
  function drawBackground() {
    if (!imgReady) {
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, W, H);
      return;
    }
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
  }

  function drawFireLight(t) {
    const fx = toX(FIRE.x), fy = toY(FIRE.y);
    const base = Math.min(W, H);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // wide halo pulsing with the flame
    const halo = base * (0.34 + state.flicker * 0.1) * (0.6 + flameRatio() * 0.6);
    const g1 = ctx.createRadialGradient(fx, fy, 0, fx, fy, halo);
    g1.addColorStop(0, `rgba(255,165,70,${0.30 * state.flicker * flameRatio()})`);
    g1.addColorStop(0.45, `rgba(255,110,30,${0.12 * state.flicker * flameRatio()})`);
    g1.addColorStop(1, "rgba(255,70,10,0)");
    ctx.fillStyle = g1;
    ctx.fillRect(fx - halo, fy - halo, halo * 2, halo * 2);

    // flame core
    const core = base * 0.075 * (0.75 + state.flicker * 0.45) * (0.5 + flameRatio() * 0.5);
    const g2 = ctx.createRadialGradient(fx, fy - core * 0.25, 0, fx, fy, core);
    g2.addColorStop(0, `rgba(255,238,200,${0.55 * state.flicker * flameRatio()})`);
    g2.addColorStop(0.5, `rgba(255,150,50,${0.28 * state.flicker * flameRatio()})`);
    g2.addColorStop(1, "rgba(255,90,20,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(fx - core, fy - core * 1.6, core * 2, core * 3);
    ctx.restore();
  }

  function drawParticles(list) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of list) {
      const k = p.life / p.max;
      const a = Math.sin(Math.min(1, k) * Math.PI) * (p.alpha ?? 1);
      if (a <= 0.01) continue;
      const s = p.size * 11 * (1 - k * 0.3);
      ctx.globalAlpha = a;
      ctx.drawImage(p.spr, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }

  function drawOrbs(t) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const o of orbs) {
      const k = o.life / o.max;
      const a = Math.min(1, Math.sin(Math.min(1, k) * Math.PI) * 1.6);
      const pulse = 1 + Math.sin(t * 0.006 + o.phase) * 0.18;
      const s = o.r * 5 * pulse;
      ctx.globalAlpha = a * 0.9;
      ctx.drawImage(SPR.hot, o.x - s / 2, o.y - s / 2, s, s);
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 0.42 * pulse, 0, 6.283);
      ctx.fillStyle = "rgba(255,246,222,.95)";
      ctx.fill();
      ctx.globalAlpha = a * 0.55;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 1.15 * pulse, 0, 6.283);
      ctx.strokeStyle = "rgba(255,214,150,.9)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAsh(t) {
    ctx.save();
    for (const p of ashes) {
      ctx.globalAlpha = p.alpha * (0.6 + 0.4 * Math.sin(t * 0.002 + p.phase));
      const s = p.size * 10;
      ctx.drawImage(SPR.ash, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }

  function drawFog() {
    if (quality !== "high") return;
    ctx.save();
    for (const f of fog) {
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, `rgba(190,205,220,${f.alpha})`);
      g.addColorStop(1, "rgba(190,205,220,0)");
      ctx.fillStyle = g;
      ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
    ctx.restore();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.25, W / 2, H * 0.52, Math.max(W, H) * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.62, "rgba(0,0,0,.42)");
    g.addColorStop(1, "rgba(0,0,0,.88)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // darkness creeping in as the flame weakens
    const dark = 1 - flameRatio();
    if (dark > 0.02) {
      ctx.fillStyle = `rgba(2,2,6,${dark * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  const flameRatio = () => (state.mode === "playing" ? Math.max(0.12, state.flame / 100) : 1);

  if (location.hash === "#play") startGame();

  // ---------- Main loop ----------
  let last = performance.now();
  let emberDebt = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateRect(now);

    // fire flicker: layered waves plus a small random jitter
    const target = 0.72 + Math.sin(now * 0.011) * 0.14 + Math.sin(now * 0.027 + 1.3) * 0.09 + (Math.random() - 0.5) * 0.08;
    state.flicker += (target - state.flicker) * Math.min(1, dt * 12);

    // spawn embers at a rate that follows the flame
    emberDebt += dt * 46 * q() * state.flicker * flameRatio();
    while (emberDebt >= 1) { spawnEmber(); emberDebt -= 1; }

    // embers
    for (let i = embers.length - 1; i >= 0; i--) {
      const p = embers[i];
      p.life += dt;
      if (p.life >= p.max) { embers.splice(i, 1); continue; }
      p.vy -= 12 * dt;                                  // heat lifts them
      p.x += (p.vx + Math.sin(now * 0.001 * p.wob + p.phase) * 26) * dt;
      p.y += p.vy * dt;
    }

    // sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life += dt;
      if (p.life >= p.max) { sparks.splice(i, 1); continue; }
      p.vy += 190 * dt;                                 // gravity
      p.vx *= 1 - 1.6 * dt;                             // air drag
      p.vy *= 1 - 1.1 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // ash and fog
    for (const p of ashes) {
      p.y += p.vy * dt;
      p.x += (p.vx + Math.sin(now * 0.0006 + p.phase) * 8) * dt;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
    }
    for (const f of fog) {
      f.x += f.vx * dt;
      if (f.x < -f.r) f.x = W + f.r; else if (f.x > W + f.r) f.x = -f.r;
    }

    // gameplay
    if (state.mode === "playing") {
      state.elapsed += dt;
      state.flame = Math.max(0, state.flame - 7 * dt);
      el.flameFill.style.width = state.flame + "%";
      el.flameFill.classList.toggle("is-low", state.flame < 28);

      state.orbTimer -= dt;
      if (state.orbTimer <= 0) {
        state.orbTimer = Math.max(0.42, 0.95 - state.elapsed * 0.012);
        const fx = toX(FIRE.x), fy = toY(FIRE.y);
        orbs.push({
          x: fx + rnd(-rect.w * 0.06, rect.w * 0.06),
          y: fy,
          vx: rnd(-26, 26),
          vy: rnd(-88, -44),
          r: rnd(11, 17) * Math.max(0.85, pScale()),
          life: 0,
          max: rnd(3.4, 5),
          phase: Math.random() * 6.28,
        });
      }
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        o.life += dt;
        if (o.life >= o.max || o.y < -60) { orbs.splice(i, 1); continue; }
        o.x += (o.vx + Math.sin(now * 0.0015 + o.phase) * 30) * dt;
        o.y += o.vy * dt;
      }
      if (state.flame <= 0) endGame();
    }

    // draw order
    drawBackground();
    drawFireLight(now);
    drawParticles(embers);
    drawOrbs(now);
    drawParticles(sparks);
    drawAsh(now);
    drawFog();
    drawVignette();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
