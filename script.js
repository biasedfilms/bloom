const canvas = document.getElementById("scene");
let ctx = canvas.getContext("2d", { alpha: false });
const form = document.getElementById("bloomForm");
const input = document.getElementById("wordInput");
const stateLabel = document.getElementById("stateLabel");
const reveal = document.getElementById("reveal");
const downloadButton = document.getElementById("downloadButton");
const resultUi = document.querySelector(".result-ui");

const TAU = Math.PI * 2;
const BG = "#09090c";

let width = 0;
let height = 0;
let dpr = 1;
let time = 0;
let lastFrame = performance.now();
let dust = [];
let rafId = 0;
let running = false;
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

function easeInCubic(t) {
  t = clamp(t);
  return t * t * t;
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

function resize() {
  const previousWidth = width || window.innerWidth;
  const offsetFromCenter = bloom.centerX - previousWidth * 0.5;

  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  dust = Array.from({ length: 44 }, () => new Dust(true));
  bloom.centerX = width * 0.5 + offsetFromCenter;
  bloom.baseY = height * 0.74;

  if (!running) render();
}

window.addEventListener("resize", resize);

class Dust {
  constructor(initial = false) {
    this.reset(initial);
  }

  reset(initial = false) {
    this.x = Math.random() * width;
    this.y = initial ? Math.random() * height : height + 10;
    this.radius = 0.35 + Math.random() * 1.05;
    this.alpha = 0.018 + Math.random() * 0.072;
    this.speed = 2 + Math.random() * 5.5;
    this.phase = Math.random() * TAU;
    this.drift = (Math.random() - 0.5) * 3;
  }

  update(dt) {
    this.y -= this.speed * dt;
    this.x += Math.sin(time * 0.15 + this.phase) * this.drift * dt;
    if (this.y < -8) this.reset(false);
  }

  draw() {
    const pulse = 0.78 + 0.22 * Math.sin(time * 0.35 + this.phase);
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
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    this.vx *= Math.pow(0.24, dt);
    this.vy = this.vy * Math.pow(0.52, dt) + 2.0 * dt;
  }

  draw() {
    const p = clamp(this.life / this.totalLife);
    const alpha = p * p;
    const color = this.warm ? "236, 124, 143" : "230, 215, 218";
    ctx.beginPath();
    ctx.fillStyle = `rgba(${color}, ${alpha * 0.52})`;
    ctx.arc(this.x, this.y, this.size * (0.55 + p), 0, TAU);
    ctx.fill();
  }
}

function createBloom(text, active = true) {
  const source = text.trim() || "love";
  const random = seededRandom(hashString(source.toLowerCase()));
  const petals = [];
  const scale = clamp(Math.min(width, height) / 460, 1.12, 1.7);

  // Outer rings are broad and open; inner rings are smaller and more curled.
  const rings = [
    {
      count: 13,
      radius: 106,
      width: 0.265,
      length: 0.96,
      delay: 2.3,
      drop: 0.33,
    },
    {
      count: 13,
      radius: 91,
      width: 0.245,
      length: 0.98,
      delay: 2.44,
      drop: 0.29,
    },
    {
      count: 12,
      radius: 76,
      width: 0.225,
      length: 0.96,
      delay: 2.57,
      drop: 0.24,
    },
    {
      count: 11,
      radius: 61,
      width: 0.208,
      length: 0.92,
      delay: 2.72,
      drop: 0.19,
    },
    {
      count: 10,
      radius: 47,
      width: 0.188,
      length: 0.86,
      delay: 2.87,
      drop: 0.14,
    },
    {
      count: 9,
      radius: 34,
      width: 0.165,
      length: 0.76,
      delay: 3.02,
      drop: 0.09,
    },
    {
      count: 8,
      radius: 22,
      width: 0.145,
      length: 0.64,
      delay: 3.17,
      drop: 0.04,
    },
  ];

  rings.forEach((ring, layer) => {
    const offset = (random() - 0.5) * 0.28;
    for (let i = 0; i < ring.count; i += 1) {
      petals.push({
        angle: (TAU * i) / ring.count + offset + (random() - 0.5) * 0.09,
        radius: ring.radius * scale,
        width: ring.width + (random() - 0.5) * 0.028,
        length: ring.length + (random() - 0.5) * 0.06,
        delay: ring.delay + (random() - 0.5) * 0.045,
        curl: (random() - 0.5) * (layer > 3 ? 0.17 : 0.12),
        lean: (random() - 0.5) * 0.048,
        layer,
        drop: ring.drop,
        fold: 0.08 + random() * 0.09,
        tone: (random() - 0.5) * 0.08,
      });
    }
  });

  return {
    text: source,
    time: 0,
    active,
    locked: !active,
    centerX: width * 0.5 + (random() - 0.5) * 9,
    stemHeight: Math.min(Math.max(height * 0.34, 290), 520),
    baseY: height * 0.74,
    stemCurve: (random() - 0.5) * 0.065,
    leafSide: random() > 0.5 ? 1 : -1,
    headScale: 0.08,
    petals,
    sparks: [],
    burstDone: false,
    lockTime: 0,
    revealReady: false,
    scale,
  };
}

function startBloom(value) {
  bloom = createBloom(value || "love", true);
  if (reducedMotion.matches) bloom.time = 7.05;
  reveal.textContent = bloom.text.toLowerCase();
  reveal.classList.remove("show");
  resultUi.classList.remove("ready");
  downloadButton.hidden = true;
  downloadButton.textContent = "↓ Download artwork";
  stateLabel.textContent = reducedMotion.matches ? "BLOOMED" : "BLOOMING";
  if (reducedMotion.matches) {
    bloom.locked = true;
    reveal.classList.add("show");
    resultUi.classList.add("ready");
    downloadButton.hidden = false;
    render();
  } else {
    startLoop();
  }
}

function startLoop() {
  if (running) return;
  running = true;
  lastFrame = performance.now();
  rafId = requestAnimationFrame(frame);
}

function stopLoop() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function stemPath() {
  const progress = easeOutQuart(bloom.time / 2.32);
  const points = [];
  const steps = 44;
  const sway =
    Math.sin(bloom.time * 0.9) * 0.003 * clamp((bloom.time - 1.3) / 1.2);

  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const curve =
      Math.sin(u * Math.PI * 0.95) *
      29 *
      (bloom.stemCurve + sway) *
      (0.48 + 0.52 * u);
    const x = bloom.centerX + curve;
    const y = bloom.baseY - bloom.stemHeight * progress * u;
    points.push([x, y]);
  }

  return points;
}

function drawStem(points) {
  if (points.length < 2) return;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1)
    ctx.lineTo(points[i][0], points[i][1]);
  ctx.strokeStyle = "#274936";
  ctx.lineWidth = 9;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1)
    ctx.lineTo(points[i][0], points[i][1]);
  ctx.strokeStyle = "#5b8b68";
  ctx.lineWidth = 2;
  ctx.stroke();

  const leafProgress = easeOutCubic((bloom.time - 1.55) / 1.24);
  if (leafProgress > 0) {
    drawLeaf(
      points,
      0.61,
      bloom.leafSide,
      leafProgress,
      84,
      42,
      "#3d714c",
      "#557f5f",
      3.4,
    );
  }

  const secondProgress = easeOutCubic((bloom.time - 2.1) / 1.05);
  if (secondProgress > 0) {
    drawLeaf(
      points,
      0.42,
      -bloom.leafSide,
      secondProgress,
      61,
      29,
      "#315f40",
      "#456f50",
      2.7,
    );
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
) {
  const index = Math.floor((points.length - 1) * position);
  const [baseX, baseY] = points[index];
  const p = clamp(progress);
  const tipX = baseX + widthPx * side * p;
  const tipY = baseY - heightPx * p;
  const midX = (baseX + tipX) / 2;
  const midY = (baseY + tipY) / 2 - 12;

  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(midX, midY, tipX, tipY);
  ctx.strokeStyle = vein;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(midX - 9 * side, midY + 14, tipX, tipY);
  ctx.quadraticCurveTo(midX + 8 * side, midY - 10, baseX, baseY);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(tipX, tipY);
  ctx.strokeStyle = "rgba(160, 190, 162, 0.22)";
  ctx.lineWidth = 0.9;
  ctx.stroke();
}

function drawAmbientLight(x, y, radius, strength) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(190, 47, 74, ${0.085 * strength})`);
  gradient.addColorStop(0.34, `rgba(125, 22, 44, ${0.032 * strength})`);
  gradient.addColorStop(1, "rgba(125, 22, 44, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function drawBud(x, y) {
  const budProgress = clamp((bloom.time - 1.88) / 1.12);
  if (budProgress <= 0) return;

  const opening = smoothstep(budProgress);
  const visibility = 1 - smoothstep(clamp((bloom.time - 2.45) / 0.9));
  if (visibility <= 0) return;

  const widthBud = 18 + 27 * opening;
  const heightBud = 33 + 40 * opening;
  const tilt = Math.sin(bloom.time * 0.65) * 0.015;

  ctx.save();
  ctx.translate(x, y - heightBud * 0.42);
  ctx.rotate(tilt);

  const gradient = ctx.createLinearGradient(0, -heightBud, 0, heightBud);
  gradient.addColorStop(0, `rgba(211, 67, 88, ${0.8 * visibility})`);
  gradient.addColorStop(0.55, `rgba(125, 20, 42, ${0.96 * visibility})`);
  gradient.addColorStop(1, `rgba(55, 7, 19, ${0.98 * visibility})`);

  ctx.beginPath();
  ctx.moveTo(0, -heightBud);
  ctx.bezierCurveTo(
    widthBud,
    -heightBud * 0.68,
    widthBud * 0.9,
    heightBud * 0.55,
    0,
    heightBud * 0.62,
  );
  ctx.bezierCurveTo(
    -widthBud * 0.9,
    heightBud * 0.55,
    -widthBud,
    -heightBud * 0.68,
    0,
    -heightBud,
  );
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -heightBud * 0.78);
  ctx.quadraticCurveTo(widthBud * 0.28, -heightBud * 0.15, 0, heightBud * 0.46);
  ctx.quadraticCurveTo(
    -widthBud * 0.3,
    -heightBud * 0.15,
    0,
    -heightBud * 0.78,
  );
  ctx.strokeStyle = `rgba(245, 144, 159, ${0.15 * visibility})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function petalShape(cx, cy, petal, growth, breeze) {
  const open = clamp(growth);
  const angle = petal.angle + petal.lean + breeze;
  const radius = petal.radius;

  // Outer petals stay lower and wider; inner petals stay lifted and curled.
  const downward = petal.drop * radius * (0.35 + 0.65 * open);
  const reach = radius * (0.22 + open * petal.length);
  const base = radius * 0.065;
  const baseX = cx + Math.cos(angle) * base;
  const baseY = cy + Math.sin(angle) * base;

  const lift = Math.sin(open * Math.PI) * radius * petal.fold;
  const curl = petal.curl * (1 - open * 0.45);
  const side = petal.width * (0.88 + 0.12 * open);

  const left = {
    x: baseX + Math.cos(angle - side) * reach * 0.15,
    y:
      baseY +
      Math.sin(angle - side) * reach * 0.15 -
      lift * 0.1 +
      downward * 0.1,
  };
  const right = {
    x: baseX + Math.cos(angle + side) * reach * 0.15,
    y:
      baseY +
      Math.sin(angle + side) * reach * 0.15 -
      lift * 0.1 +
      downward * 0.1,
  };

  const tipAngle = angle + curl;
  const tip = {
    x: cx + Math.cos(tipAngle) * reach,
    y: cy + Math.sin(tipAngle) * reach - lift + downward,
  };

  const shoulder = reach * (0.57 + 0.11 * open);
  const leftControl = {
    x: cx + Math.cos(angle - side * 1.18) * shoulder,
    y:
      cy +
      Math.sin(angle - side * 1.18) * shoulder -
      lift * 0.4 +
      downward * 0.13,
  };
  const rightControl = {
    x: cx + Math.cos(angle + side * 1.05) * shoulder,
    y:
      cy +
      Math.sin(angle + side * 1.05) * shoulder -
      lift * 0.4 +
      downward * 0.13,
  };

  return {
    angle,
    reach,
    baseX,
    baseY,
    left,
    right,
    tip,
    leftControl,
    rightControl,
  };
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
    shape.baseX + Math.cos(shape.angle + Math.PI) * 1.8,
    shape.baseY + Math.sin(shape.angle + Math.PI) * 1.8,
    shape.left.x,
    shape.left.y,
  );
  ctx.closePath();
}

function drawPetal(shape, layer, tone) {
  const palettes = [
    ["#4b0819", "#72132c"],
    ["#5d0b21", "#8f1838"],
    ["#6e1028", "#a92042"],
    ["#801630", "#ba2f50"],
    ["#921c38", "#cb405b"],
    ["#a62645", "#db5a73"],
    ["#b43855", "#e2788c"],
  ];
  const palette = palettes[Math.min(layer, palettes.length - 1)];

  const baseColor = palette[0];
  const highlightColor = palette[1];
  const gradient = ctx.createLinearGradient(
    shape.baseX,
    shape.baseY,
    shape.tip.x,
    shape.tip.y,
  );
  gradient.addColorStop(0, baseColor);
  gradient.addColorStop(0.52, highlightColor);
  gradient.addColorStop(1, `rgba(45, 4, 15, ${0.12 + layer * 0.01})`);

  tracePetal(shape);
  ctx.fillStyle = gradient;
  ctx.fill();

  // A softly bent fold line keeps the petal feeling like material.
  ctx.beginPath();
  ctx.moveTo(shape.baseX, shape.baseY);
  ctx.quadraticCurveTo(
    (shape.baseX + shape.tip.x) / 2,
    (shape.baseY + shape.tip.y) / 2 - shape.reach * 0.105,
    shape.tip.x,
    shape.tip.y,
  );
  ctx.strokeStyle = `rgba(255, 188, 197, ${0.045 + layer * 0.004 + Math.abs(tone) * 0.015})`;
  ctx.lineWidth = 0.9;
  ctx.stroke();
}

function drawRose(x, y) {
  const outerProgress = clamp((bloom.time - 1.98) / 4.35);
  if (outerProgress <= 0) return;

  const reveal = easeInOutSine(outerProgress);
  const headPulse = 1 + Math.sin((bloom.time - 2.2) * 1.15) * 0.006 * reveal;
  const breeze = Math.sin(bloom.time * 0.65) * 0.008 * reveal;

  drawAmbientLight(x, y, 170 + reveal * 115, 0.75 + reveal * 0.25);
  drawBud(x, y);

  const petals = [...bloom.petals].sort((a, b) => a.layer - b.layer);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(headPulse, headPulse);
  ctx.translate(-x, -y);

  for (const petal of petals) {
    const growth = easeOutCubic(clamp((bloom.time - petal.delay) / 1.55));
    if (growth <= 0) continue;

    const shape = petalShape(x, y, petal, growth * outerProgress, breeze);
    drawPetal(shape, petal.layer, petal.tone);
  }

  // Center curls: the smallest layers unfurl last, revealing the signature rose spiral.
  const center = clamp((bloom.time - 4.25) / 1.45);
  if (center > 0) {
    for (let i = 0; i < 10; i += 1) {
      const angle = (i * TAU) / 10 + 0.18 + Math.sin(i * 1.7) * 0.03;
      const radius = lerp(2.8, 15.5, center);
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      ctx.beginPath();
      ctx.fillStyle = i % 2 === 0 ? "#4f0718" : "#620a1e";
      ctx.arc(px, py, lerp(1.8, 5.9, center), 0, TAU);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 174, 185, 0.44)";
    ctx.arc(x, y, 4.1, 0, TAU);
    ctx.fill();
  }

  ctx.restore();

  if (bloom.time > 5.15) emitSparks(x, y);
}

function emitSparks(x, y) {
  if (bloom.burstDone) return;
  bloom.burstDone = true;

  const random = seededRandom(hashString(bloom.text) ^ 0x17c7);
  for (let i = 0; i < 58; i += 1) {
    const angle = random() * TAU;
    bloom.sparks.push(
      new Spark(
        x,
        y,
        angle,
        0.14 + random() * 0.82,
        0.95 + random() * 1.5,
        0.3 + random() * 0.8,
        i % 4 === 0,
      ),
    );
  }
}

function drawBackground() {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  const center = ctx.createRadialGradient(
    width / 2,
    height * 0.43,
    0,
    width / 2,
    height * 0.43,
    Math.min(width, height) * 0.66,
  );
  center.addColorStop(0, "rgba(104, 23, 44, 0.046)");
  center.addColorStop(0.58, "rgba(104, 23, 44, 0.010)");
  center.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = center;
  ctx.fillRect(0, 0, width, height);

  const ground = ctx.createRadialGradient(
    width / 2,
    height * 0.85,
    0,
    width / 2,
    height * 0.85,
    Math.min(width, height) * 0.35,
  );
  ground.addColorStop(0, "rgba(48, 73, 55, 0.03)");
  ground.addColorStop(1, "rgba(48, 73, 55, 0)");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, width, height);
}

function render() {
  drawBackground();

  for (const particle of dust) particle.draw();

  const stem = stemPath();
  drawStem(stem);

  if (stem.length) {
    const top = stem[stem.length - 1];
    const settle = clamp((bloom.time - 2.0) / 2.5);
    const motion = bloom.locked ? 0 : 1;
    const bob = Math.sin(bloom.time * 0.9) * 1.45 * settle * motion;
    drawRose(top[0], top[1] + bob);
  }

  for (const spark of bloom.sparks) spark.draw();
}

function update(dt) {
  if (!bloom.active) return;

  bloom.time += bloom.locked ? dt * 0.12 : dt;

  for (const particle of dust) particle.update(dt);
  for (const spark of bloom.sparks) spark.update(dt);
  bloom.sparks = bloom.sparks.filter((spark) => spark.life > 0);

  if (bloom.time >= 7.05) {
    bloom.locked = true;
    stateLabel.textContent = "BLOOMED";
    reveal.classList.add("show");
    resultUi.classList.add("ready");
    downloadButton.hidden = false;
  }
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
  context.font = "500 38px SFMono-Regular, Menlo, monospace";
  context.fillText("B L O O M", exportWidth / 2, 220);

  context.fillStyle = "rgba(241, 235, 231, 0.7)";
  context.font = "italic 70px Iowan Old Style, Baskerville, serif";
  context.fillText("A word, in flower.", exportWidth / 2, 310);

  context.fillStyle = "rgba(241, 235, 231, 0.92)";
  context.font = "italic 92px Iowan Old Style, Baskerville, serif";
  context.fillText(text.toLowerCase(), exportWidth / 2, 2380);

  context.strokeStyle = "rgba(241, 235, 231, 0.18)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(exportWidth / 2 - 20, 2470);
  context.lineTo(exportWidth / 2 + 20, 2470);
  context.stroke();

  context.fillStyle = "rgba(241, 235, 231, 0.42)";
  context.font = "26px SFMono-Regular, Menlo, monospace";
  context.fillText("Mikael Kalesaran · © 2026", exportWidth / 2, 2550);
  context.restore();
}

function downloadFlower() {
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
  const liveTime = time;
  const exportText = bloom.text;

  ctx = exportContext;
  width = exportWidth;
  height = exportHeight;
  dpr = 1;
  time = 7.05;
  dust = [];
  bloom = createBloom(exportText, false);
  bloom.time = 7.05;
  bloom.locked = true;
  bloom.baseY = 2040;
  const exportFlowerScale = 1.45;
  bloom.petals.forEach((petal) => {
    petal.radius *= exportFlowerScale;
  });
  bloom.stemHeight *= exportFlowerScale;
  bloom.scale *= exportFlowerScale;
  bloom.burstDone = true;
  bloom.sparks = [];
  render();
  drawExportDetails(exportContext, exportWidth, exportHeight, exportText);

  ctx = liveContext;
  width = liveWidth;
  height = liveHeight;
  dpr = liveDpr;
  bloom = liveBloom;
  dust = liveDust;
  time = liveTime;

  exportCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bloom-${sanitizeFilename(exportText)}.png`;
    link.click();
    URL.revokeObjectURL(url);
    downloadButton.textContent = "Saved";
    window.setTimeout(() => {
      downloadButton.textContent = "↓ Download artwork";
    }, 1800);
  }, "image/png");
}

function frame(timestamp) {
  if (!running) return;

  const dt = Math.min((timestamp - lastFrame) / 1000, 0.033);
  lastFrame = timestamp;
  time += dt;

  update(dt);
  render();

  if (running) rafId = requestAnimationFrame(frame);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  startBloom(input.value.trim() || "love");
});

downloadButton.addEventListener("click", downloadFlower);

resize();
render();
