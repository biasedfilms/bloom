const canvas = document.getElementById("scene");
let ctx = canvas.getContext("2d", { alpha: false });

const form = document.getElementById("bloomForm");
const input = document.getElementById("wordInput");
const stateLabel = document.getElementById("stateLabel");
const reveal = document.getElementById("reveal");
const downloadButton = document.getElementById("downloadButton");
const resultUi = document.querySelector(".result-ui");
const heroUi = document.querySelector(".hero-ui");
const footerUi = document.querySelector(".footer-ui");

const TAU = Math.PI * 2;
const BG = "#09090c";
const BLOOM_DURATION = 7;

let width = 0;
let height = 0;
let dpr = 1;
let lastFrame = performance.now();
let rafId = 0;
let running = false;
let resizeRaf = 0;
let dust = [];

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let bloom = createBloom("love", false);

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  t = clamp(t);
  return 1 - Math.pow(1 - t, 3);
}

function easeOutQuart(t) {
  t = clamp(t);
  return 1 - Math.pow(1 - t, 4);
}

function easeInOutSine(t) {
  t = clamp(t);
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeOutBack(t, overshoot = 1.55) {
  t = clamp(t);
  const c1 = overshoot;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function smoothstep(t) {
  t = clamp(t);
  return t * t * (3 - 2 * t);
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scheduleResize() {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(resize);
}

function getViewportSize() {
  // Use the layout viewport rather than visualViewport. This keeps the canvas
  // stable when Safari shows/hides its URL bar or opens the keyboard.
  return {
    width: Math.max(1, document.documentElement.clientWidth),
    height: Math.max(1, document.documentElement.clientHeight),
  };
}

function resize() {
  const viewport = getViewportSize();
  width = Math.round(viewport.width);
  height = Math.round(viewport.height);
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const mobile = width <= 700;
  const dustCount = mobile ? 24 : 38;
  dust = Array.from({ length: dustCount }, () => new Dust(true));

  layoutBloom();
  if (!running) render();
}

window.addEventListener("resize", scheduleResize, { passive: true });
window.addEventListener("orientationchange", scheduleResize, { passive: true });

function layoutBloom() {
  if (!width || !height || !bloom || !heroUi || !footerUi || !resultUi) return;

  const compact = width <= 700;
  const short = height <= 690;
  const heroRect = heroUi.getBoundingClientRect();
  const footerRect = footerUi.getBoundingClientRect();
  const resultRect = resultUi.getBoundingClientRect();

  const topGap = compact ? (short ? 18 : 26) : 34;
  const bottomGap = compact ? 12 : 18;
  const resultGap = compact ? 14 : 22;

  const stageTop = heroRect.bottom + topGap;
  const resultTop = resultRect.top - resultGap;
  const footerTop = footerRect.top - bottomGap;
  const stageBottom = Math.min(resultTop, footerTop);
  const available = Math.max(150, stageBottom - stageTop);

  // Fit the plant to the actual visual stage. The flower stays large on normal
  // phones, but gets proportionally smaller on short screens instead of
  // colliding with the UI.
  // Scale from both axes, but use the available middle stage as the hard limit.
  // This makes the flower feel larger without ever allowing its head to enter
  // the header/result zones.
  const scaleFromWidth = clamp(width / 410, 0.78, 1.1);
  const scaleFromHeight = clamp(available / 440, 0.72, 1.08);
  const scale = Math.min(scaleFromWidth, scaleFromHeight);
  const headRadius = 112 * scale;

  const topInset = Math.min(compact ? 18 : 28, available * 0.08);
  const bottomInset = Math.min(compact ? 10 : 16, available * 0.04);
  const safeTop = stageTop + topInset;
  const baseY = stageBottom - bottomInset;

  // The stem is deliberately taller than before. Its maximum is derived from
  // the safe top so the enlarged flower can never collide with the composer.
  const preferredStem = headRadius * (compact ? 2.72 : 2.78);
  const maxStem = Math.max(92, baseY - (safeTop + headRadius * 0.86));
  const stemHeight = Math.min(preferredStem, maxStem);

  bloom.centerX = width * 0.5;
  bloom.scale = scale;
  bloom.stemHeight = stemHeight;
  bloom.baseY = baseY;

  for (const petal of bloom.petals) {
    petal.radius = petal.baseRadius * scale;
  }
}

class Dust {
  constructor(initial = false) {
    this.reset(initial);
  }

  reset(initial = false) {
    this.x = Math.random() * width;
    this.y = initial ? Math.random() * height : height + 12;
    this.radius = 0.35 + Math.random() * 0.85;
    this.alpha = 0.016 + Math.random() * 0.06;
    this.speed = 1.5 + Math.random() * 3.8;
    this.phase = Math.random() * TAU;
    this.drift = (Math.random() - 0.5) * 2.4;
  }

  update(dt) {
    this.y -= this.speed * dt;
    this.x += Math.sin(bloom.idle * 0.18 + this.phase) * this.drift * dt;
    if (this.y < -10) this.reset(false);
  }

  draw() {
    const pulse = 0.8 + 0.2 * Math.sin(bloom.idle * 0.45 + this.phase);
    ctx.beginPath();
    ctx.fillStyle = `rgba(231, 211, 215, ${this.alpha * pulse})`;
    ctx.arc(this.x, this.y, this.radius, 0, TAU);
    ctx.fill();
  }
}

class Spark {
  constructor(x, y, angle, speed, life, size, warm) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = life;
    this.totalLife = life;
    this.size = size;
    this.warm = warm;
  }

  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt * 58;
    this.y += this.vy * dt * 58;
    this.vx *= Math.pow(0.2, dt);
    this.vy = this.vy * Math.pow(0.56, dt) + 1.55 * dt;
  }

  draw() {
    const progress = clamp(this.life / this.totalLife);
    const alpha = progress * progress;
    const color = this.warm ? "236, 124, 143" : "230, 215, 218";
    ctx.beginPath();
    ctx.fillStyle = `rgba(${color}, ${alpha * 0.48})`;
    ctx.arc(this.x, this.y, this.size * (0.55 + progress), 0, TAU);
    ctx.fill();
  }
}

function createBloom(text, active = true) {
  const source = text.trim() || "love";
  const random = seededRandom(hashString(source.toLowerCase()));
  const petals = [];

  // Fewer, broader petals than the original renderer. The flower remains
  // intricate, but the canvas does substantially less work per mobile frame.
  const rings = [
    { count: 11, radius: 106, width: 0.245, length: 1.0, delay: 2.18, drop: 0.28 },
    { count: 10, radius: 90, width: 0.225, length: 0.98, delay: 2.31, drop: 0.24 },
    { count: 9, radius: 75, width: 0.205, length: 0.95, delay: 2.44, drop: 0.2 },
    { count: 8, radius: 61, width: 0.185, length: 0.91, delay: 2.58, drop: 0.16 },
    { count: 7, radius: 47, width: 0.17, length: 0.86, delay: 2.72, drop: 0.12 },
    { count: 6, radius: 34, width: 0.15, length: 0.78, delay: 2.88, drop: 0.08 },
    { count: 5, radius: 22, width: 0.13, length: 0.68, delay: 3.02, drop: 0.04 },
  ];

  rings.forEach((ring, layer) => {
    const offset = (random() - 0.5) * 0.22;

    for (let i = 0; i < ring.count; i += 1) {
      petals.push({
        angle: (TAU * i) / ring.count + offset + (random() - 0.5) * 0.075,
        radius: ring.radius,
        baseRadius: ring.radius,
        width: ring.width + (random() - 0.5) * 0.022,
        length: ring.length + (random() - 0.5) * 0.05,
        delay: ring.delay + (random() - 0.5) * 0.04,
        curl: (random() - 0.5) * (layer > 3 ? 0.18 : 0.12),
        lean: (random() - 0.5) * 0.045,
        layer,
        drop: ring.drop,
        fold: 0.07 + random() * 0.085,
        tone: random(),
      });
    }
  });

  petals.sort((a, b) => a.layer - b.layer);

  return {
    text: source,
    time: active ? 0 : BLOOM_DURATION,
    idle: 0,
    active,
    locked: !active,
    centerX: width * 0.5,
    stemHeight: Math.min(Math.max(height * 0.34, 180), 520),
    baseY: height * 0.74,
    stemCurve: (random() - 0.5) * 0.065,
    leafSide: random() > 0.5 ? 1 : -1,
    scale: 1,
    petals,
    sparks: [],
    burstDone: false,
  };
}

function startBloom(value) {
  bloom = createBloom(value || "love", true);
  reveal.textContent = bloom.text.toLowerCase();
  reveal.classList.remove("show");
  resultUi.classList.remove("ready");
  downloadButton.hidden = true;
  downloadButton.innerHTML = '<span aria-hidden="true">↓</span> Download';
  stateLabel.textContent = reducedMotion.matches ? "BLOOMED" : "BLOOMING";

  layoutBloom();

  if (reducedMotion.matches) {
    bloom.time = BLOOM_DURATION;
    bloom.locked = true;
    stateLabel.textContent = "BLOOMED";
    reveal.classList.add("show");
    resultUi.classList.add("ready");
    downloadButton.hidden = false;
    render();
    return;
  }

  startLoop();
}

function startLoop() {
  if (running) return;
  running = true;
  lastFrame = performance.now();
  rafId = requestAnimationFrame(frame);
}

function stopLoop() {
  running = false;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

function stemPath() {
  const growth = easeInOutSine(bloom.time / 2.55);
  const points = [];
  const steps = 42;
  const wind = Math.sin(bloom.idle * 0.48 + bloom.stemCurve * 40) * 0.0024;
  const swayEnvelope = easeOutCubic((bloom.time - 1.6) / 1.45);

  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const bend =
      Math.sin(u * Math.PI * 0.95) *
      33 *
      (bloom.stemCurve + wind) *
      (0.38 + 0.62 * u);
    const x = bloom.centerX + bend;
    const y = bloom.baseY - bloom.stemHeight * growth * u;
    points.push([x, y]);
  }

  return { points, growth, swayEnvelope };
}

function drawStem(stem) {
  const { points, growth, swayEnvelope } = stem;
  if (points.length < 2 || growth <= 0.001) return;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const gradient = ctx.createLinearGradient(
    points[0][0],
    points[0][1],
    points[points.length - 1][0],
    points[points.length - 1][1],
  );
  gradient.addColorStop(0, "#274936");
  gradient.addColorStop(0.62, "#3f6e4d");
  gradient.addColorStop(1, "#688b68");

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 8.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.strokeStyle = "rgba(123, 171, 131, 0.7)";
  ctx.lineWidth = 1.55;
  ctx.stroke();

  const leafProgress = easeOutBack((bloom.time - 1.42) / 1.18, 1.28);
  if (leafProgress > 0) {
    drawLeaf(points, 0.58, bloom.leafSide, leafProgress, 80, 39, "#3d714c", "#6f9673", 3.25, swayEnvelope);
  }

  const secondProgress = easeOutBack((bloom.time - 2.0) / 1.08, 1.18);
  if (secondProgress > 0) {
    drawLeaf(points, 0.4, -bloom.leafSide, secondProgress, 59, 28, "#315f40", "#5f835f", 2.55, swayEnvelope);
  }
}

function drawLeaf(
  points,
  position,
  side,
  progress,
  widthPx,
  heightPx,
  fill,
  vein,
  lineWidth,
  swayEnvelope,
) {
  const p = clamp(progress);
  const index = Math.floor((points.length - 1) * position);
  const [baseX, baseY] = points[index];
  const tipX = baseX + widthPx * side * p;
  const tipY = baseY - heightPx * p;
  const midX = lerp(baseX, tipX, 0.5);
  const midY = lerp(baseY, tipY, 0.5) - 10;
  const drift = Math.sin(bloom.idle * 0.52 + position * 5) * 2.5 * swayEnvelope;

  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(midX + drift, midY, tipX, tipY);
  ctx.quadraticCurveTo(midX - 8 * side, midY + 12, baseX, baseY);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(midX + drift, midY + 1, tipX, tipY);
  ctx.strokeStyle = vein;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(tipX, tipY);
  ctx.strokeStyle = "rgba(183, 207, 181, 0.2)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function drawAmbientLight(x, y, radius, strength) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(195, 52, 78, ${0.075 * strength})`);
  gradient.addColorStop(0.34, `rgba(125, 22, 44, ${0.026 * strength})`);
  gradient.addColorStop(1, "rgba(125, 22, 44, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function drawBud(x, y) {
  const budProgress = smoothstep((bloom.time - 1.72) / 1.06);
  if (budProgress <= 0) return;

  const opening = easeOutCubic(budProgress);
  const visibility = 1 - smoothstep((bloom.time - 2.55) / 0.72);
  if (visibility <= 0) return;

  const widthBud = 17 + 24 * opening;
  const heightBud = 30 + 35 * opening;
  const tilt = Math.sin(bloom.idle * 0.48) * 0.018;

  ctx.save();
  ctx.translate(x, y - heightBud * 0.4);
  ctx.rotate(tilt);

  const gradient = ctx.createLinearGradient(0, -heightBud, 0, heightBud);
  gradient.addColorStop(0, `rgba(219, 83, 103, ${0.76 * visibility})`);
  gradient.addColorStop(0.54, `rgba(133, 24, 47, ${0.94 * visibility})`);
  gradient.addColorStop(1, `rgba(57, 8, 20, ${0.98 * visibility})`);

  ctx.beginPath();
  ctx.moveTo(0, -heightBud);
  ctx.bezierCurveTo(widthBud, -heightBud * 0.68, widthBud * 0.9, heightBud * 0.52, 0, heightBud * 0.62);
  ctx.bezierCurveTo(-widthBud * 0.9, heightBud * 0.52, -widthBud, -heightBud * 0.68, 0, -heightBud);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -heightBud * 0.78);
  ctx.quadraticCurveTo(widthBud * 0.25, -heightBud * 0.12, 0, heightBud * 0.46);
  ctx.quadraticCurveTo(-widthBud * 0.27, -heightBud * 0.1, 0, -heightBud * 0.78);
  ctx.strokeStyle = `rgba(249, 153, 166, ${0.16 * visibility})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function petalShape(cx, cy, petal, growth, breeze) {
  const open = clamp(growth);
  const radius = petal.radius;
  const angle = petal.angle + petal.lean + breeze * (0.6 + petal.layer * 0.06);
  const downward = petal.drop * radius * (0.28 + 0.72 * open);
  const reach = radius * (0.18 + open * petal.length);
  const base = radius * 0.06;
  const baseX = cx + Math.cos(angle) * base;
  const baseY = cy + Math.sin(angle) * base;
  const lift = Math.sin(open * Math.PI) * radius * petal.fold;
  const curl = petal.curl * (1 - open * 0.5);
  const side = petal.width * (0.84 + 0.16 * open);

  const left = {
    x: baseX + Math.cos(angle - side) * reach * 0.16,
    y: baseY + Math.sin(angle - side) * reach * 0.16 - lift * 0.12 + downward * 0.08,
  };
  const right = {
    x: baseX + Math.cos(angle + side) * reach * 0.16,
    y: baseY + Math.sin(angle + side) * reach * 0.16 - lift * 0.12 + downward * 0.08,
  };
  const tipAngle = angle + curl;
  const tip = {
    x: cx + Math.cos(tipAngle) * reach,
    y: cy + Math.sin(tipAngle) * reach - lift + downward,
  };
  const shoulder = reach * (0.56 + 0.11 * open);
  const leftControl = {
    x: cx + Math.cos(angle - side * 1.14) * shoulder,
    y: cy + Math.sin(angle - side * 1.14) * shoulder - lift * 0.44 + downward * 0.1,
  };
  const rightControl = {
    x: cx + Math.cos(angle + side * 1.04) * shoulder,
    y: cy + Math.sin(angle + side * 1.04) * shoulder - lift * 0.44 + downward * 0.1,
  };

  return { angle, reach, baseX, baseY, left, right, tip, leftControl, rightControl };
}

function tracePetal(shape) {
  ctx.beginPath();
  ctx.moveTo(shape.left.x, shape.left.y);
  ctx.bezierCurveTo(
    shape.leftControl.x,
    shape.leftControl.y,
    shape.tip.x - Math.cos(shape.angle) * shape.reach * 0.12,
    shape.tip.y - Math.sin(shape.angle) * shape.reach * 0.12,
    shape.tip.x,
    shape.tip.y,
  );
  ctx.bezierCurveTo(
    shape.tip.x - Math.cos(shape.angle) * shape.reach * 0.08,
    shape.tip.y - Math.sin(shape.angle) * shape.reach * 0.08,
    shape.rightControl.x,
    shape.rightControl.y,
    shape.right.x,
    shape.right.y,
  );
  ctx.quadraticCurveTo(
    shape.baseX + Math.cos(shape.angle + Math.PI) * 2,
    shape.baseY + Math.sin(shape.angle + Math.PI) * 2,
    shape.left.x,
    shape.left.y,
  );
  ctx.closePath();
}

function drawPetal(shape, petal) {
  const palettes = [
    ["#4a0819", "#7e1632"],
    ["#5a0a20", "#941c3d"],
    ["#6f1029", "#aa2346"],
    ["#7f1731", "#bc3153"],
    ["#91203a", "#cf4662"],
    ["#a52b46", "#dc6179"],
    ["#b53a54", "#e57c8d"],
  ];
  const palette = palettes[Math.min(petal.layer, palettes.length - 1)];
  const highlight = 0.38 + petal.tone * 0.22;

  tracePetal(shape);
  ctx.fillStyle = palette[0];
  ctx.fill();

  // A translucent inner sweep gives depth without creating a new gradient for
  // every petal on every frame, which is a major win on mobile GPUs.
  ctx.save();
  ctx.globalAlpha = highlight;
  ctx.beginPath();
  ctx.moveTo(shape.baseX, shape.baseY);
  ctx.quadraticCurveTo(
    (shape.baseX + shape.tip.x) * 0.5,
    (shape.baseY + shape.tip.y) * 0.5 - shape.reach * 0.08,
    shape.tip.x,
    shape.tip.y,
  );
  ctx.lineTo(shape.right.x, shape.right.y);
  ctx.quadraticCurveTo(
    (shape.baseX + shape.right.x) * 0.5,
    (shape.baseY + shape.right.y) * 0.5,
    shape.baseX,
    shape.baseY,
  );
  ctx.closePath();
  ctx.fillStyle = palette[1];
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(shape.baseX, shape.baseY);
  ctx.quadraticCurveTo(
    (shape.baseX + shape.tip.x) / 2,
    (shape.baseY + shape.tip.y) / 2 - shape.reach * 0.11,
    shape.tip.x,
    shape.tip.y,
  );
  ctx.strokeStyle = `rgba(255, 195, 204, ${0.04 + petal.layer * 0.004 + petal.tone * 0.014})`;
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function drawRose(x, y) {
  const bloomProgress = smoothstep((bloom.time - 1.92) / 4.15);
  if (bloomProgress <= 0) return;

  const revealAmount = easeInOutSine(bloomProgress);
  const breath = 1 + Math.sin(bloom.idle * 0.72) * 0.008 * revealAmount;
  const breeze = Math.sin(bloom.idle * 0.58) * 0.012 * revealAmount;
  const entranceLift = (1 - easeOutCubic((bloom.time - 2.0) / 1.6)) * 6;

  drawAmbientLight(x, y, 145 + revealAmount * 105, 0.76 + revealAmount * 0.24);
  drawBud(x, y + entranceLift * 0.25);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(breath, breath);
  ctx.translate(-x, -y);

  for (const petal of bloom.petals) {
    const local = clamp((bloom.time - petal.delay) / 1.52);
    if (local <= 0) continue;

    const open = easeOutBack(local, 1.12);
    const shape = petalShape(x, y + entranceLift, petal, open * bloomProgress, breeze);
    drawPetal(shape, petal);
  }

  const center = easeOutCubic((bloom.time - 4.18) / 1.25);
  if (center > 0) {
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * TAU) / 8 + 0.22 + Math.sin(i * 1.9) * 0.035;
      const radius = lerp(2.4, 13.5, center) * bloomProgress;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      ctx.beginPath();
      ctx.fillStyle = i % 2 ? "#6a0a20" : "#520719";
      ctx.arc(px, py, lerp(1.6, 5.2, center), 0, TAU);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 177, 189, 0.48)";
    ctx.arc(x, y, 3.8, 0, TAU);
    ctx.fill();
  }

  ctx.restore();

  if (bloom.time > 5.1) emitSparks(x, y);
}

function emitSparks(x, y) {
  if (bloom.burstDone) return;
  bloom.burstDone = true;

  const random = seededRandom(hashString(bloom.text) ^ 0x17c7);
  const count = width <= 700 ? 30 : 42;

  for (let i = 0; i < count; i += 1) {
    const angle = random() * TAU;
    bloom.sparks.push(
      new Spark(
        x,
        y,
        angle,
        0.12 + random() * 0.76,
        0.85 + random() * 1.15,
        0.28 + random() * 0.68,
        i % 4 === 0,
      ),
    );
  }
}

function drawBackground() {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  const center = ctx.createRadialGradient(
    width * 0.5,
    height * 0.43,
    0,
    width * 0.5,
    height * 0.43,
    Math.min(width, height) * 0.68,
  );
  center.addColorStop(0, "rgba(104, 23, 44, 0.05)");
  center.addColorStop(0.58, "rgba(104, 23, 44, 0.012)");
  center.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = center;
  ctx.fillRect(0, 0, width, height);

  const ground = ctx.createRadialGradient(
    width * 0.5,
    height * 0.83,
    0,
    width * 0.5,
    height * 0.83,
    Math.min(width, height) * 0.38,
  );
  ground.addColorStop(0, "rgba(48, 73, 55, 0.032)");
  ground.addColorStop(1, "rgba(48, 73, 55, 0)");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, width, height);
}

function render() {
  drawBackground();

  for (const particle of dust) particle.draw();

  const stem = stemPath();
  drawStem(stem);

  if (stem.points.length) {
    const top = stem.points[stem.points.length - 1];
    const settle = easeOutCubic((bloom.time - 2.35) / 2.7);
    const bob = Math.sin(bloom.idle * 0.58) * 1.05 * settle * (bloom.locked ? 0.7 : 1);
    drawRose(top[0], top[1] + bob);
  }

  for (const spark of bloom.sparks) spark.draw();
}

function update(dt) {
  if (!bloom.active) return;

  bloom.idle += dt;
  bloom.time = Math.min(BLOOM_DURATION, bloom.time + dt);

  for (const particle of dust) particle.update(dt);
  for (const spark of bloom.sparks) spark.update(dt);
  bloom.sparks = bloom.sparks.filter((spark) => spark.life > 0);

  if (bloom.time >= BLOOM_DURATION && !bloom.locked) {
    bloom.locked = true;
    stateLabel.textContent = "BLOOMED";
    reveal.classList.add("show");
    resultUi.classList.add("ready");
    downloadButton.hidden = false;
    layoutBloom();
  }
}

function fitCanvasText(context, text, maxWidth, startSize, family) {
  let size = startSize;
  context.font = `italic ${size}px ${family}`;
  while (context.measureText(text).width > maxWidth && size > 34) {
    size -= 2;
    context.font = `italic ${size}px ${family}`;
  }
  return size;
}

function drawExportDetails(context, exportWidth, exportHeight, text) {
  context.save();
  context.strokeStyle = "rgba(241, 235, 231, 0.12)";
  context.lineWidth = 2;
  context.strokeRect(112, 112, exportWidth - 224, exportHeight - 224);

  context.strokeStyle = "rgba(213, 107, 131, 0.34)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(exportWidth / 2 - 38, 350);
  context.lineTo(exportWidth / 2 + 38, 350);
  context.stroke();

  context.fillStyle = "rgba(241, 235, 231, 0.82)";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = '500 38px "SFMono-Regular", Menlo, monospace';
  context.fillText("B L O O M", exportWidth / 2, 220);

  context.fillStyle = "rgba(241, 235, 231, 0.7)";
  context.font = 'italic 70px "Iowan Old Style", "Baskerville", serif';
  context.fillText("A word, in flower.", exportWidth / 2, 310);

  context.fillStyle = "rgba(241, 235, 231, 0.92)";
  const textSize = fitCanvasText(
    context,
    text.toLowerCase(),
    exportWidth - 280,
    96,
    '"Iowan Old Style", "Baskerville", serif',
  );
  context.font = `italic ${textSize}px "Iowan Old Style", "Baskerville", serif`;
  context.fillText(text.toLowerCase(), exportWidth / 2, 2380);

  context.strokeStyle = "rgba(241, 235, 231, 0.18)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(exportWidth / 2 - 20, 2470);
  context.lineTo(exportWidth / 2 + 20, 2470);
  context.stroke();

  context.fillStyle = "rgba(241, 235, 231, 0.42)";
  context.font = '26px "SFMono-Regular", Menlo, monospace';
  context.fillText("Mikael Kalesaran · © 2026", exportWidth / 2, 2550);
  context.restore();
}

function downloadFlower() {
  if (!bloom || !bloom.text) return;

  const exportWidth = 2160;
  const exportHeight = 2700;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = exportWidth;
  exportCanvas.height = exportHeight;
  const exportContext = exportCanvas.getContext("2d", { alpha: false });

  const liveContext = ctx;
  const liveWidth = width;
  const liveHeight = height;
  const liveDpr = dpr;
  const liveBloom = bloom;
  const liveDust = dust;
  const exportText = liveBloom.text;

  ctx = exportContext;
  width = exportWidth;
  height = exportHeight;
  dpr = 1;
  dust = [];
  bloom = createBloom(exportText, false);
  bloom.time = BLOOM_DURATION;
  bloom.locked = true;
  bloom.baseY = 2040;
  bloom.centerX = exportWidth / 2;
  const exportFlowerScale = 1.82;
  bloom.scale = exportFlowerScale;
  bloom.petals.forEach((petal) => {
    petal.radius = petal.baseRadius * exportFlowerScale;
  });
  bloom.stemHeight = Math.min(1060, 780 * exportFlowerScale);
  bloom.burstDone = true;
  bloom.sparks = [];

  render();
  drawExportDetails(exportContext, exportWidth, exportHeight, bloom.text);

  ctx = liveContext;
  width = liveWidth;
  height = liveHeight;
  dpr = liveDpr;
  bloom = liveBloom;
  dust = liveDust;

  exportCanvas.toBlob((blob) => {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bloom-${sanitizeFilename(exportText)}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    downloadButton.innerHTML = '<span aria-hidden="true">✓</span> Saved';
    window.setTimeout(() => {
      downloadButton.innerHTML = '<span aria-hidden="true">↓</span> Download artwork';
    }, 1800);
  }, "image/png");
}

function sanitizeFilename(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "flower"
  );
}

function frame(timestamp) {
  if (!running) return;

  const dt = Math.min((timestamp - lastFrame) / 1000, 0.032);
  lastFrame = timestamp;
  update(dt);
  render();

  rafId = requestAnimationFrame(frame);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = input.value.trim().slice(0, 28);
  input.value = value;
  startBloom(value || "love");
});

downloadButton.addEventListener("click", downloadFlower);

reducedMotion.addEventListener?.("change", () => {
  if (reducedMotion.matches && bloom.active) {
    bloom.time = BLOOM_DURATION;
    bloom.locked = true;
    reveal.classList.add("show");
    resultUi.classList.add("ready");
    downloadButton.hidden = false;
    stateLabel.textContent = "BLOOMED";
    stopLoop();
    render();
  }
});

resize();
render();
