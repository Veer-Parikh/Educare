import * as THREE from "three";

// Procedural planet surfaces painted onto small canvases (no external textures).
// Equirectangular 512×256 maps; blobs wrap horizontally so there is no seam.

const W = 512;
const H = 256;

/** Small seeded PRNG (mulberry32) so every planet looks the same on every visit. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w = W, h = H) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Ellipse that wraps around the left/right edges. */
function blob(g, x, y, rx, ry, rot = 0) {
  for (const dx of [-W, 0, W]) {
    if (x + dx + rx < 0 || x + dx - rx > W) continue;
    g.beginPath();
    g.ellipse(x + dx, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2);
    g.fill();
  }
}

/** Seam-free blur: blur a 3× tiled copy, then take the middle tile. */
function blur(g, px) {
  if (!px || !("filter" in g)) return;
  const [tmp, tg] = makeCanvas(W * 3, H);
  for (let i = 0; i < 3; i++) tg.drawImage(g.canvas, W * i, 0);
  const [out, og] = makeCanvas(W * 3, H);
  og.filter = `blur(${px}px)`;
  og.drawImage(tmp, 0, 0);
  g.save();
  g.globalAlpha = 1;
  g.drawImage(out, W, 0, W, H, 0, 0, W, H);
  g.restore();
}

function polarCaps(g, r, color, size) {
  g.fillStyle = color;
  for (let x = 0; x <= W; x += 10) {
    g.globalAlpha = 0.85;
    blob(g, x, 0, 14 + r() * 10, H * size * (0.6 + r() * 0.8));
    blob(g, x, H, 14 + r() * 10, H * size * (0.5 + r() * 0.7));
  }
}

function bands(g, r, palette) {
  let y = 0;
  while (y < H) {
    const h = 4 + r() * 18;
    g.globalAlpha = 1;
    g.fillStyle = palette[Math.floor(r() * palette.length)];
    g.fillRect(0, y, W, h + 1);
    y += h;
  }
  // Turbulent streaks along the bands.
  for (let i = 0; i < 320; i++) {
    g.globalAlpha = 0.06 + r() * 0.14;
    g.fillStyle = palette[Math.floor(r() * palette.length)];
    blob(g, r() * W, r() * H, 10 + r() * 70, 1 + r() * 3.5);
  }
}

function paint(body) {
  const [c, g] = makeCanvas();
  const r = rng(body.seed);
  const pal = body.palette ?? [body.color];

  if (body.surface === "sun") {
    g.fillStyle = "#ffae00";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1100; i++) {
      g.globalAlpha = 0.08 + r() * 0.22;
      g.fillStyle = r() > 0.5 ? "#ffe27a" : "#ff8200";
      blob(g, r() * W, r() * H, 2 + r() * 9, 2 + r() * 7, r() * Math.PI);
    }
    blur(g, 1.5);
  } else if (body.surface === "earth") {
    g.fillStyle = "#1c5688";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      g.globalAlpha = 0.12;
      g.fillStyle = r() > 0.5 ? "#2a78b4" : "#123f6a";
      blob(g, r() * W, r() * H, 20 + r() * 60, 10 + r() * 30);
    }
    const land = ["#3d7a3a", "#56883f", "#6f9650", "#a08d5c", "#8a7a4f"];
    for (let k = 0; k < 7; k++) {
      const cx = r() * W;
      const cy = H * (0.22 + r() * 0.56);
      const spread = 26 + r() * 46;
      for (let i = 0; i < 46; i++) {
        g.globalAlpha = 0.95;
        g.fillStyle = land[Math.floor(r() * land.length)];
        const s = 5 + r() * 15;
        blob(g, cx + (r() - 0.5) * spread * 2.2, cy + (r() - 0.5) * spread, s, s * 0.7, r() * 3);
      }
    }
    blur(g, 1.2);
    polarCaps(g, r, "#f3f7fa", 0.07);
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 170; i++) {
      g.globalAlpha = 0.1 + r() * 0.22;
      blob(g, r() * W, r() * H, 8 + r() * 42, 2 + r() * 6, (r() - 0.5) * 0.4);
    }
  } else if (body.surface === "rocky") {
    g.fillStyle = pal[0];
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 520; i++) {
      g.globalAlpha = 0.1 + r() * 0.25;
      g.fillStyle = pal[1 + Math.floor(r() * (pal.length - 1))];
      const s = 3 + r() * 26;
      blob(g, r() * W, r() * H, s, s * (0.5 + r() * 0.5), r() * Math.PI);
    }
    blur(g, 2);
    for (let i = 0; i < (body.craters ?? 0); i++) {
      const x = r() * W;
      const y = H * 0.1 + r() * H * 0.8;
      const s = 1.5 + r() * 6;
      g.globalAlpha = 0.28;
      g.fillStyle = "#000000";
      blob(g, x, y, s, s * 0.8);
      g.globalAlpha = 0.18;
      g.fillStyle = "#ffffff";
      blob(g, x - s * 0.25, y - s * 0.2, s * 0.6, s * 0.45);
    }
    if (body.polarCaps) polarCaps(g, r, "#f4efe8", 0.06);
  } else {
    bands(g, r, pal);
    blur(g, body.blur ?? 1.5);
    if (body.spot) {
      const { x, y, rx, ry, color } = body.spot;
      g.globalAlpha = 0.35;
      g.fillStyle = "#f3e2c8";
      blob(g, x * W, y * H, rx * 1.35, ry * 1.5);
      g.globalAlpha = 0.9;
      g.fillStyle = color;
      blob(g, x * W, y * H, rx, ry);
      blur(g, 1);
    }
  }
  g.globalAlpha = 1;
  return c;
}

export function makePlanetTexture(body) {
  return toTexture(paint(body));
}

/** Soft radial glow for the Sun's corona (used on an additive sprite). */
export function makeGlowTexture() {
  const [c, g] = makeCanvas(256, 256);
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,240,190,1)");
  grd.addColorStop(0.22, "rgba(255,206,90,0.9)");
  grd.addColorStop(0.42, "rgba(255,160,30,0.32)");
  grd.addColorStop(0.7, "rgba(255,120,0,0.08)");
  grd.addColorStop(1, "rgba(255,110,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return toTexture(c);
}

/** 1-D ring profile (u = inner→outer radius) with a Cassini-style gap. */
export function makeRingTexture(seed = 5) {
  const w = 512;
  const [c, g] = makeCanvas(w, 4);
  const r = rng(seed);
  const smooth = (a, b, t) => {
    const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  let x = 0;
  while (x < w) {
    const seg = 3 + Math.floor(r() * 18);
    const base = 0.35 + r() * 0.55;
    const tone = 190 + Math.floor(r() * 45);
    for (let i = x; i < Math.min(w, x + seg); i++) {
      const t = i / (w - 1);
      let a = base * (0.85 + r() * 0.15);
      if (t > 0.6 && t < 0.66) a *= 0.1; // Cassini division
      a *= smooth(0, 0.06, t) * (1 - smooth(0.92, 1, t));
      g.fillStyle = `rgba(${tone + 20},${tone},${tone - 45},${a.toFixed(3)})`;
      g.fillRect(i, 0, 1, 4);
    }
    x += seg;
  }
  const t = toTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}
