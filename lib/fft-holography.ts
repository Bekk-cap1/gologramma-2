// Layer-based CGH + ASM reconstruction
// Based on: Kumano et al. "CGH based on 3D Gaussian Splatting" (2025)
// Pipeline: depth map → Fresnel layers → phase hologram → ASM → reconstructed image

export const LAMBDA_R = 638e-9; // m
export const LAMBDA_G = 520e-9; // m
export const LAMBDA_B = 450e-9; // m
export const PIXEL_PITCH = 8e-6; // m (SLM pixel pitch from paper)

// ── Cooley-Tukey radix-2 FFT (in-place) ──────────────────────────────────────
function fft1d(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 1 : -1) * 2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curRe = 1.0, curIm = 0.0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = i + k + half;
        const uRe = re[a], uIm = im[a];
        const vRe = re[b] * curRe - im[b] * curIm;
        const vIm = re[b] * curIm + im[b] * curRe;
        re[a] = uRe + vRe; im[a] = uIm + vIm;
        re[b] = uRe - vRe; im[b] = uIm - vIm;
        const nr = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

// ── 2D FFT via row-column ──────────────────────────────────────────────────────
function fft2d(re: Float64Array, im: Float64Array, W: number, H: number, inv: boolean): void {
  const rowRe = new Float64Array(W), rowIm = new Float64Array(W);
  for (let y = 0; y < H; y++) {
    rowRe.set(re.subarray(y * W, y * W + W));
    rowIm.set(im.subarray(y * W, y * W + W));
    fft1d(rowRe, rowIm, inv);
    re.set(rowRe, y * W); im.set(rowIm, y * W);
  }
  const colRe = new Float64Array(H), colIm = new Float64Array(H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) { colRe[y] = re[y * W + x]; colIm[y] = im[y * W + x]; }
    fft1d(colRe, colIm, inv);
    for (let y = 0; y < H; y++) { re[y * W + x] = colRe[y]; im[y * W + x] = colIm[y]; }
  }
}

// ── fftshift: swap quadrants so DC is at centre ───────────────────────────────
function fftshift(re: Float64Array, im: Float64Array, W: number, H: number): void {
  const hw = W >> 1, hh = H >> 1;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      let a = y * W + x, b = (y + hh) * W + (x + hw);
      let t = re[a]; re[a] = re[b]; re[b] = t;
      t = im[a]; im[a] = im[b]; im[b] = t;
      a = y * W + (x + hw); b = (y + hh) * W + x;
      t = re[a]; re[a] = re[b]; re[b] = t;
      t = im[a]; im[a] = im[b]; im[b] = t;
    }
  }
}

// ── Angular Spectrum Method (ASM) propagation ─────────────────────────────────
// Propagates complex wavefront U by distance z metres.
function asmPropagate(
  inRe: Float64Array, inIm: Float64Array,
  W: number, H: number,
  z: number, lambda: number, pitch: number,
): { re: Float64Array; im: Float64Array } {
  const re = new Float64Array(inRe);
  const im = new Float64Array(inIm);

  fft2d(re, im, W, H, false);
  fftshift(re, im, W, H);

  const il2 = 1 / (lambda * lambda);
  const dfx = 1 / (W * pitch), dfy = 1 / (H * pitch);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fx = (x - W / 2) * dfx;
      const fy = (y - H / 2) * dfy;
      const f2 = fx * fx + fy * fy;
      const i = y * W + x;
      if (f2 > il2) {
        re[i] = 0; im[i] = 0; // evanescent — discard
      } else {
        const kz = 2 * Math.PI * Math.sqrt(il2 - f2);
        const ph = kz * z;
        const hRe = Math.cos(ph), hIm = Math.sin(ph);
        const r = re[i], g = im[i];
        re[i] = r * hRe - g * hIm;
        im[i] = r * hIm + g * hRe;
      }
    }
  }

  fftshift(re, im, W, H);
  fft2d(re, im, W, H, true);
  return { re, im };
}

// ── Pad / crop to nearest power-of-2 ─────────────────────────────────────────
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function padToPow2(src: Float32Array, W: number, H: number): { data: Float64Array; PW: number; PH: number } {
  const PW = nextPow2(W), PH = nextPow2(H);
  const out = new Float64Array(PW * PH);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      out[y * PW + x] = src[y * W + x];
    }
  }
  return { data: out, PW, PH };
}

function cropFromPow2(src: Float64Array, PW: number, W: number, H: number): Float64Array {
  const out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      out[y * W + x] = src[y * PW + x];
    }
  }
  return out;
}

// ── Layer-based CGH ────────────────────────────────────────────────────────────
export interface LayerCGHResult {
  phaseG: Float32Array; // phase in [-π, π] for green channel
  ampG: Float32Array;   // normalised amplitude [0, 1]
  W: number; H: number;
}

export function layerBasedCGH(
  depthNorm: Float32Array,  // H×W, [0=far, 1=near]
  lumG: Float32Array,       // H×W, [0,1] green luminance
  W: number, H: number,
  nLayers = 8,
  lambda = LAMBDA_G,
  pitch = PIXEL_PITCH,
  zNear = 0.05e-3,  // 0.05 mm — closest layer
  zFar  = 0.60e-3,  // 0.60 mm — farthest layer (matches paper)
): LayerCGHResult {
  const { PW, PH } = padToPow2(lumG, W, H); // get power-of-2 dims
  const n = PW * PH;
  const holRe = new Float64Array(n);
  const holIm = new Float64Array(n);

  for (let l = 0; l < nLayers; l++) {
    const dMin = l / nLayers;
    const dMax = (l + 1) / nLayers;
    // Close pixels (high depth) → small z (near hologram plane)
    const t = 1 - (l + 0.5) / nLayers; // invert: layer 0 = near = small z
    const z = zNear + t * (zFar - zNear);

    // Extract pixels in this depth band
    const layAmp = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (depthNorm[i] >= dMin && depthNorm[i] < dMax) {
        layAmp[i] = lumG[i];
      }
    }

    const { data: padRe, PW: pw, PH: ph } = padToPow2(layAmp, W, H);
    const padIm = new Float64Array(pw * ph);

    const prop = asmPropagate(padRe, padIm, pw, ph, z, lambda, pitch);
    for (let i = 0; i < n; i++) {
      holRe[i] += prop.re[i];
      holIm[i] += prop.im[i];
    }
  }

  // Crop back to original size and extract phase + amplitude
  const croppedRe = cropFromPow2(holRe, PW, W, H);
  const croppedIm = cropFromPow2(holIm, PW, W, H);
  const nn = W * H;
  const phaseG = new Float32Array(nn);
  const ampG = new Float32Array(nn);
  let maxA = 0;
  for (let i = 0; i < nn; i++) {
    phaseG[i] = Math.atan2(croppedIm[i], croppedRe[i]);
    const a = Math.sqrt(croppedRe[i] * croppedRe[i] + croppedIm[i] * croppedIm[i]);
    ampG[i] = a;
    if (a > maxA) maxA = a;
  }
  if (maxA > 0) for (let i = 0; i < nn; i++) ampG[i] /= maxA;

  return { phaseG, ampG, W, H };
}

// ── ASM Reconstruction ─────────────────────────────────────────────────────────
export interface ASMReconResult {
  intensity: Float32Array; // normalised [0, 1]
  W: number; H: number;
}

export function asmReconstruct(
  phase: Float32Array,
  W: number, H: number,
  z: number,
  lambda = LAMBDA_G,
  pitch = PIXEL_PITCH,
): ASMReconResult {
  const { PW, PH } = padToPow2(phase, W, H);
  const re = new Float64Array(PW * PH);
  const im = new Float64Array(PW * PH);
  // Phase-only hologram: unit amplitude
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * PW + x;
      re[i] = Math.cos(phase[y * W + x]);
      im[i] = Math.sin(phase[y * W + x]);
    }
  }

  const prop = asmPropagate(re, im, PW, PH, z, lambda, pitch);
  const intensity = new Float32Array(W * H);
  let maxI = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, pi = y * PW + x;
      const v = prop.re[pi] * prop.re[pi] + prop.im[pi] * prop.im[pi];
      intensity[i] = v;
      if (v > maxI) maxI = v;
    }
  }
  if (maxI > 0) for (let i = 0; i < W * H; i++) intensity[i] /= maxI;
  return { intensity, W, H };
}

// ── Canvas rendering helpers ───────────────────────────────────────────────────

// HSV cyclic colormap for phase — shows interference fringes as color, not gray bands
function hsvPhase(phase: number): [number, number, number] {
  const h = ((phase + Math.PI) / (2 * Math.PI)) * 6; // 0..6
  const i = Math.floor(h) % 6;
  const f = h - Math.floor(h);
  const q = 1 - f;
  switch (i) {
    case 0: return [255, Math.round(f * 255), 0];
    case 1: return [Math.round(q * 255), 255, 0];
    case 2: return [0, 255, Math.round(f * 255)];
    case 3: return [0, Math.round(q * 255), 255];
    case 4: return [Math.round(f * 255), 0, 255];
    default: return [255, 0, Math.round(q * 255)];
  }
}

export function phaseToImageData(
  phase: Float32Array, W: number, H: number,
  ctx: CanvasRenderingContext2D,
): ImageData {
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = hsvPhase(phase[i]);
    img.data[i * 4] = r; img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  return img;
}

export function intensityToImageData(
  intensity: Float32Array, W: number, H: number,
  ctx: CanvasRenderingContext2D,
  greenTint = true,
): ImageData {
  const n = W * H;

  // Remove zero-order (DC) — the bright uniform background from unit-amplitude hologram
  let mean = 0;
  for (let i = 0; i < n; i++) mean += intensity[i];
  mean /= n;

  // Use deviation from mean as signal; boost contrast via local normalisation
  const sig = new Float32Array(n);
  let maxS = 0;
  for (let i = 0; i < n; i++) {
    sig[i] = Math.abs(intensity[i] - mean);
    if (sig[i] > maxS) maxS = sig[i];
  }

  const img = ctx.createImageData(W, H);
  for (let i = 0; i < n; i++) {
    const v = maxS > 0 ? Math.round(Math.sqrt(sig[i] / maxS) * 255) : 0; // gamma 0.5
    img.data[i * 4]     = greenTint ? Math.round(v * 0.1) : v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = greenTint ? Math.round(v * 0.1) : v;
    img.data[i * 4 + 3] = 255;
  }
  return img;
}
