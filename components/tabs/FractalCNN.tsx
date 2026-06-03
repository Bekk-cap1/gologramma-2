"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useLang } from "@/components/LanguageContext";

// ─── constants ────────────────────────────────────────────────────────────────
const MESH_RES = 128;

// ─── Mandelbulb ray-marching GLSL shaders ─────────────────────────────────────
const MANDELBULB_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const MANDELBULB_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float camTheta;
uniform float camPhi;
uniform float camRadius;
uniform float power;
uniform float aspect;
uniform float time;

float mandelbulbSDF(vec3 p) {
  vec3 z = p;
  float dr = 1.0, r = 0.0;
  for (int i = 0; i < 20; i++) {
    r = length(z);
    if (r > 2.0) break;
    float theta = acos(clamp(z.z / r, -1.0, 1.0));
    float phi   = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    float zr = pow(r, power);
    theta *= power; phi *= power;
    z = zr * vec3(sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta)) + p;
  }
  return 0.5 * log(r) * r / dr;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(
    mandelbulbSDF(p+e.xyy) - mandelbulbSDF(p-e.xyy),
    mandelbulbSDF(p+e.yxy) - mandelbulbSDF(p-e.yxy),
    mandelbulbSDF(p+e.yyx) - mandelbulbSDF(p-e.yyx)
  ));
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= aspect;

  // Camera from orbit
  float cx = camRadius * sin(camTheta) * cos(camPhi);
  float cy = camRadius * sin(camPhi);
  float cz = camRadius * cos(camTheta) * cos(camPhi);
  vec3 ro = vec3(cx, cy, cz);
  vec3 fwd   = normalize(-ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up    = cross(fwd, right);
  vec3 rd    = normalize(uv.x * right + uv.y * up + 1.8 * fwd);

  // Ray march
  float t = 0.1;
  bool hit = false;
  for (int i = 0; i < 120; i++) {
    float d = mandelbulbSDF(ro + rd * t);
    if (d < 0.0008) { hit = true; break; }
    if (t > 8.0) break;
    t += d * 0.8;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 L1 = normalize(vec3(1.0, 2.0, 1.5));
    vec3 L2 = normalize(vec3(-1.0, -0.5, 1.0));
    float diff1 = max(dot(n, L1), 0.0);
    float diff2 = max(dot(n, L2), 0.0) * 0.4;
    float spec  = pow(max(dot(reflect(-L1, n), -rd), 0.0), 50.0);
    float ao    = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
    // Colour varies with position
    vec3 col = mix(vec3(0.05, 0.2, 0.8), vec3(0.8, 0.1, 0.9), ao);
    col = col * (diff1 + diff2) + vec3(1.0) * spec * 0.6;
    col += vec3(0.03, 0.01, 0.06); // ambient
    col = pow(col, vec3(0.45));    // gamma
    gl_FragColor = vec4(col, 1.0);
  } else {
    // Dark space background with subtle gradient
    float g = smoothstep(-1.0, 1.0, vUv.y * 2.0 - 1.0);
    vec3 bg = mix(vec3(0.01, 0.0, 0.04), vec3(0.0, 0.01, 0.12), g);
    gl_FragColor = vec4(bg, 1.0);
  }
}
`;
const THREE_W = 800;
const THREE_H = 400;

// ─── inline translations (keeps translations.ts clean) ────────────────────────
const TX = {
  circle:      { ru: "Circle -> Sphere", uz: "Circle -> Sphere" },
  square:      { ru: "Square -> Cube", uz: "Square -> Cube" },
  title:       { ru: "2D → 3D Реконструкция (Geometry-Aware Fractal CNN)", uz: "2D → 3D Rekonstruktsiya (Geometry-Aware Fractal CNN)" },
  subtitle:    { ru: "Загрузите любое изображение — приложение создаст карту глубины и трёхмерный рельеф на основе яркости пикселей, имитируя работу Fractal CNN.", uz: "Istalgan rasmni yuklang — ilova piksel yorqinligi asosida chuqurlik xaritasi va 3D rel'ef yaratadi, Fractal CNN ishini taqlid qiladi." },
  dropTitle:   { ru: "Перетащите изображение сюда", uz: "Rasmni bu yerga torting" },
  or:          { ru: "или", uz: "yoki" },
  chooseFile:  { ru: "Выбрать файл", uz: "Fayl tanlash" },
  samples:     { ru: "Примеры:", uz: "Namunalar:" },
  pyramid:     { ru: "Пирамида", uz: "Piramida" },
  sphere:      { ru: "Сфера", uz: "Sfera" },
  cube:        { ru: "Куб", uz: "Kub" },
  sierpinski:  { ru: "Фрактал (Серпинский)", uz: "Fraktal (Serpinski)" },
  mandelbrot:  { ru: "Мандельброт", uz: "Mandelbrot" },
  fractalHdr:  { ru: "Фракталы (для CNN):", uz: "Fraktallar (CNN uchun):" },
  simpleHdr:   { ru: "Простые формы:", uz: "Oddiy shakllar:" },
  reset:       { ru: "Сбросить", uz: "Qayta boshlash" },
  sourceImg:   { ru: "Исходное изображение", uz: "Asl rasm" },
  depthMap:    { ru: "Карта глубины", uz: "Chuqurlik xaritasi" },
  view3d:      { ru: "3D Объект", uz: "3D Obyekt" },
  depthScale:  { ru: "Масштаб глубины", uz: "Chuqurlik masshtabi" },
  smoothing:   { ru: "Сглаживание", uz: "Silliqlik" },
  wireframe:   { ru: "Каркас", uz: "Sxema" },
  autoRot:     { ru: "Авто-вращение", uz: "Avto-aylantirish" },
  dragHint:    { ru: "Тащить = вращать · Колёсико = масштаб", uz: "Torting = aylantirish · G'ildirak = masshtab" },
  modeHeight:  { ru: "Карта высот", uz: "Balandlik xaritasi" },
  modeFractal: { ru: "3D Фрактал", uz: "3D Fraktal" },
  fractalLvl:  { ru: "Детализация", uz: "Tafsilot" },
  archTitle:   { ru: "Архитектура Geometry-Aware Fractal CNN", uz: "Geometry-Aware Fractal CNN arxitekturasi" },
  archHint:    { ru: "Кликните на шаг для подробностей", uz: "Tafsilotlar uchun bosqichni bosing" },
  // CNN API panel
  cnnBtn:      { ru: "🧠 CNN Анализ", uz: "🧠 CNN Tahlil" },
  cnnLoading:  { ru: "Анализирую...", uz: "Tahlil qilinmoqda..." },
  cnnResult:   { ru: "Результат CNN", uz: "CNN natijasi" },
  cnnType:     { ru: "Тип фрактала:", uz: "Fraktal turi:" },
  cnnConf:     { ru: "Уверенность:", uz: "Ishonch:" },
  cnnModel:    { ru: "3D модель:", uz: "3D model:" },
  cnnParams:   { ru: "Параметры:", uz: "Parametrlar:" },
  cnnApply:    { ru: "Применить к 3D", uz: "3D ga qo'llash" },
  cnnOffline:  { ru: "API недоступен. Запустите: python scripts/api_server.py", uz: "API mavjud emas. Ishga tushiring: python scripts/api_server.py" },
  cnnScores:   { ru: "Оценки классов:", uz: "Sinf ballari:" },
  cnnShowParams: { ru: "Параметры", uz: "Parametrlar" },
  cnnParamsHint: { ru: "Предсказание параметров — обратная задача, точность низкая. Классификация надёжнее.", uz: "Parametrlarni bashorat qilish — teskari masala, aniqligi past." },
  pipeTitle:   { ru: "Пайплайн 2D → 3D: пошагово", uz: "2D → 3D quvuri: bosqichma-bosqich" },
  pipeHint:    { ru: "Как изображение превращается в 3D-модель — каждый этап с формулой", uz: "Tasvir qanday 3D-modelga aylanadi — har bosqich formula bilan" },
  pipeline:    { ru: "Полный конвейер:", uz: "To'liq quvur:" },
  // detection panel
  detPanel:    { ru: "Анализ изображения (ИИ)", uz: "Tasvil tahlili (AI)" },
  detType:     { ru: "Обнаруженный тип:", uz: "Aniqlangan tur:" },
  detConf:     { ru: "Уверенность:", uz: "Ishonch:" },
  detReason:   { ru: "Основание:", uz: "Asos:" },
  det3d:       { ru: "Сгенерированная 3D-модель:", uz: "Yaratilgan 3D-model:" },
  detPolys:    { ru: "Полигонов:", uz: "Poligonlar:" },
  detRecur:    { ru: "Глубина рекурсии:", uz: "Rekursiya chuqurligi:" },
  exportOBJ:   { ru: "Экспорт OBJ", uz: "OBJ eksport" },
  fractalLvl2: { ru: "Уровень рекурсии", uz: "Rekursiya darajasi" },
};

// ─── CNN architecture steps ────────────────────────────────────────────────────
const STEPS = [
  {
    num: 1, color: "#00E5FF",
    title: { ru: "Геом. объект", uz: "Geom. obyekt" },
    formula: "aᵢx+bᵢy+cᵢz+dᵢ=0",
    detail: { ru: "Каждая грань задаётся плоскостью. Нормаль nᵢ=(aᵢ,bᵢ,cᵢ), смещение dᵢ — параметры, выученные сетью. Тетраэдр = 4 плоскости.", uz: "Har bir qirra tekislik bilan berilgan. Normal nᵢ=(aᵢ,bᵢ,cᵢ), siljish dᵢ — tarmoq o'rganadigan parametrlar." },
  },
  {
    num: 2, color: "#9C27B0",
    title: { ru: "Индикатор F", uz: "Indikator F" },
    formula: "F = ∏ σ(aᵢx+bᵢy+cᵢz+dᵢ)",
    detail: { ru: "Мягкая (дифференцируемая) версия через сигмоид σ(t)=1/(1+e⁻ᵃᵗ). F≈1 внутри тела, F≈0 снаружи. α контролирует резкость границы.", uz: "Sigmoid σ(t)=1/(1+e⁻ᵃᵗ) orqali yumshoq versiya. Ichida F≈1, tashqarida F≈0. α chegara keskinligini boshqaradi." },
  },
  {
    num: 3, color: "#FF9800",
    title: { ru: "Градиент F", uz: "Gradient F" },
    formula: "∂F/∂x = Σ aᵢσᵢ(1−σᵢ) ∏ⱼ≠ᵢ σⱼ",
    detail: { ru: "Градиент велик вблизи граней тела — указывает сети, где именно находятся поверхности. Используется как дополнительный признак.", uz: "Gradient jism qirralari yaqinida katta — tarmoqqa sirtlar qayerda ekanligini ko'rsatadi." },
  },
  {
    num: 4, color: "#69F0AE",
    title: { ru: "Маскирование", uz: "Masklash" },
    formula: "X_masked = X ⊙ F",
    detail: { ru: "Пространственное внимание: поэлементное умножение признакового тензора на маску F. Подавляет нерелевантные регионы вне объекта.", uz: "Fazoviy diqqat: belgilar tenzorini F maskasiga element bo'yicha ko'paytirish. Ob'ektdan tashqari hududlarni bostiradi." },
  },
  {
    num: 5, color: "#FFB300",
    title: { ru: "Фракт. свёртка", uz: "Fraktal konv." },
    formula: "Y = Σₛ Wₛ × Xₛ",
    detail: { ru: "Три масштаба (fine/medium/coarse) обрабатываются параллельно и суммируются. Захватывает фрактальные самоподобные структуры на разных уровнях детализации.", uz: "Uch masshtab (fine/medium/coarse) parallel ishlangan va yig'ilgan. Turli darajalarda fraktal o'z-o'ziga o'xshash tuzilmalarni ushlaydi." },
  },
  {
    num: 6, color: "#FF5252",
    title: { ru: "Внимание", uz: "Diqqat" },
    formula: "A(x) = softmax(q(x)), Y = A ⊙ X",
    detail: { ru: "Веса внимания A(x) = exp(q(x)) / Σexp(qᵢ). Усиливает информативные вокселы, подавляет фон. Y = A ⊙ X.", uz: "A(x) = exp(q(x)) / Σexp(qᵢ). Muhim voksellarni kuchaytiradi, fon bostiradi." },
  },
  {
    num: 7, color: "#00BCD4",
    title: { ru: "Residual блок", uz: "Residual blok" },
    formula: "Y = F(X) + X",
    detail: { ru: "Conv3D→BN→ReLU→Conv3D→BN плюс skip-connection. Устраняет проблему затухающего градиента в глубоких сетях.", uz: "Conv3D→BN→ReLU→Conv3D→BN + skip-ulanish. Chuqur tarmoqlardagi yo'qoluvchi gradient muammosini hal qiladi." },
  },
  {
    num: 8, color: "#E040FB",
    title: { ru: "Потери L", uz: "Yo'qotish L" },
    formula: "L = Lclass + λLfractal + βLgeo",
    detail: { ru: "L_class = CrossEntropy. L_fractal = ‖D_pred−D_true‖² (размерность Хаусдорфа). L_geo = Σ‖∇Fᵢ‖² — штраф за размытые границы. λ, β — балансировочные веса.", uz: "L_class = CrossEntropy. L_fractal = ‖D_pred−D_true‖². L_geo = Σ‖∇Fᵢ‖² — noaniq chegara uchun jazo." },
  },
  {
    num: 9, color: "#4CAF50",
    title: { ru: "Adam оптим.", uz: "Adam optim." },
    formula: "θₜ₊₁ = θₜ − η · mₜ/√(vₜ+ε)",
    detail: { ru: "mₜ — первый момент (среднее градиента), vₜ — второй момент (дисперсия). Адаптивный шаг для каждого параметра. Быстрая сходимость.", uz: "mₜ — birinchi moment (o'rtacha gradient), vₜ — ikkinchi moment (dispersiya). Har bir parametr uchun adaptiv qadam." },
  },
  {
    num: 10, color: "#FF9800",
    title: { ru: "Архитектура", uz: "Arxitektura" },
    formula: "Voxel → Indicator → Mask → Conv×3 → FC → Output",
    detail: { ru: "Полный конвейер: 3D Voxel Grid → Indicator Layer (дифф. маска) → Masking (X⊙F) → Conv Block 1 (Residual) → Attention → Conv Block 2 (Residual) → Multi-Scale/Fractal Conv → Conv Block 3 → Global Pooling → FC → Class + Fractal Params", uz: "To'liq quvur: 3D Voxel Grid → Indikator → Masklash → Conv×3 + Diqqat + Fraktal → Global Pooling → FC → Natija" },
  },
] as const;

export type SampleType = "pyramid" | "circle" | "square" | "sphere" | "cube" | "sierpinski" | "mandelbrot";

// ─── Fractal classifier ────────────────────────────────────────────────────────
export type FractalKind =
  | "sphere"       // Circle in 2D -> sphere in 3D
  | "cube"         // Square in 2D -> cube in 3D
  | "sierpinski"   // Sierpinski triangle/tetrahedron
  | "menger"       // Menger sponge / Sierpinski carpet
  | "pythagoras"   // Pythagoras tree
  | "mandelbrot"   // Mandelbrot / Julia set
  | "koch"         // Koch snowflake / curve
  | "octahedron"   // Sierpinski octahedron (IFS)
  | "dodecahedron" // Dodecahedron fractal (IFS)
  | "icosahedron"  // Icosahedron fractal (IFS)
  | "cantor"       // 3D Cantor dust
  | "voxel";       // Unknown → voxel extrusion

export interface ClassifyResult {
  kind: FractalKind;
  name3d: string;
  confidence: number;  // 0-100
  reason: string;
}

function classifyFractal(depth: Float32Array, res: number): ClassifyResult {
  // ── 1. Basic pixel stats ────────────────────────────────────────────────
  let bright = 0, minX = res, maxX = 0, minY = res, maxY = 0;
  let sumTop = 0, sumBot = 0, sumLeft = 0, sumRight = 0;
  const half = res / 2;

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const d = depth[y * res + x];
      if (d > 0.25) {
        bright++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (y < half) sumTop++; else sumBot++;
        if (x < half) sumLeft++; else sumRight++;
      }
    }
  }

  if (bright < 30) return { kind: "voxel", name3d: "Voxel extrusion", confidence: 40, reason: "Too few bright pixels" };

  const density   = bright / (res * res);
  const bboxW     = maxX - minX + 1;
  const bboxH     = maxY - minY + 1;
  const aspect    = bboxW / bboxH;
  const topRatio  = sumTop / bright;          // fraction of bright pixels in top half
  const hSymm     = Math.min(sumLeft, sumRight) / Math.max(sumLeft, sumRight || 1);
  const vSymm     = Math.min(sumTop, sumBot) / Math.max(sumTop, sumBot || 1);
  const bboxFill  = bright / (bboxW * bboxH);

  // ── 2. Edge density (measures fractal boundary complexity) ─────────────
  let edges = 0;
  for (let y = 1; y < res - 1; y++) {
    for (let x = 1; x < res - 1; x++) {
      const d = depth[y * res + x];
      const diff =
        Math.abs(d - depth[(y - 1) * res + x]) +
        Math.abs(d - depth[(y + 1) * res + x]) +
        Math.abs(d - depth[y * res + x - 1]) +
        Math.abs(d - depth[y * res + x + 1]);
      if (diff > 0.5) edges++;
    }
  }
  const edgeDensity = edges / bright;

  // Simple geometric shapes: 2D circle -> 3D sphere, 2D square -> 3D cube.
  if (aspect > 0.78 && aspect < 1.28 && hSymm > 0.84 && vSymm > 0.84 && edgeDensity < 0.35) {
    if (bboxFill > 0.86) {
      return { kind: "cube", name3d: "Cube", confidence: 92, reason: "Simple square silhouette detected" };
    }
    if (bboxFill > 0.55 && bboxFill < 0.84) {
      return { kind: "sphere", name3d: "Sphere", confidence: 90, reason: "Simple circular silhouette detected" };
    }
  }

  // ── 3. Self-similarity at half-scale ───────────────────────────────────
  let selfSim = 0;
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      const s = depth[y * res + x];
      const t = depth[Math.floor(y * 2) * res + Math.floor(x * 2)];
      selfSim += 1 - Math.abs(s - t);
    }
  }
  selfSim /= (half * half);

  // ── 4. Classification rules ────────────────────────────────────────────
  // Triangular (more pixels at bottom, narrow top, ~1:1 aspect)
  if (topRatio < 0.35 && aspect > 0.6 && aspect < 1.6 && hSymm > 0.7) {
    return { kind: "sierpinski", name3d: "Sierpinski Tetrahedron", confidence: 82, reason: "Triangular distribution with bilateral symmetry" };
  }

  // Grid / carpet pattern (uniform high density, many edges, square aspect)
  if (density > 0.18 && density < 0.72 && edgeDensity > 0.4 && aspect > 0.75 && aspect < 1.35 && selfSim > 0.55) {
    return { kind: "menger", name3d: "Menger Sponge", confidence: 78, reason: "Grid-like pattern with self-similarity" };
  }

  // Complex fractal boundary (Mandelbrot/Julia have very high edge density)
  if (edgeDensity > 0.6 && density < 0.5) {
    return { kind: "mandelbrot", name3d: "Voxel fractal (Mandelbrot-class)", confidence: 71, reason: "Complex fractal boundary detected" };
  }

  // Koch / circular (high symmetry, moderate edge density, round bbox)
  if (hSymm > 0.88 && topRatio > 0.4 && topRatio < 0.6 && edgeDensity > 0.2) {
    return { kind: "koch", name3d: "Koch Snowflake Surface", confidence: 65, reason: "High symmetry + moderate edge complexity" };
  }

  // Branching / tree (tall vertical aspect, concentrated center-top)
  if (aspect < 0.7 && topRatio > 0.45) {
    return { kind: "pythagoras", name3d: "3D Pythagoras Tree", confidence: 62, reason: "Vertical branching structure" };
  }

  // Default
  return { kind: "voxel", name3d: "Voxel extrusion (unknown fractal)", confidence: 50, reason: "No known fractal pattern matched" };
}

// ─── Shared box helper ─────────────────────────────────────────────────────────
function pushBox(pos: number[], nrm: number[], cx: number, cy: number, cz: number, s: number) {
  const h = s / 2;
  const faces: [number, number, number, number, number, number][] = [
    [0,1,0,  0,h,0],   // top
    [0,-1,0, 0,-h,0],  // bottom
    [0,0,1,  0,0,h],   // front
    [0,0,-1, 0,0,-h],  // back
    [1,0,0,  h,0,0],   // right
    [-1,0,0, -h,0,0],  // left
  ];
  for (const [nx, ny, nz, ox, oy, oz] of faces) {
    // Two tangent axes
    const [tx, ty, tz] = nz !== 0 ? [1, 0, 0] : nx !== 0 ? [0, 1, 0] : [1, 0, 0];
    const [bx, by, bz] = [ny*tz - nz*ty, nz*tx - nx*tz, nx*ty - ny*tx];
    const a = [cx+ox + (-tx-bx)*h, cy+oy + (-ty-by)*h, cz+oz + (-tz-bz)*h];
    const b = [cx+ox + ( tx-bx)*h, cy+oy + ( ty-by)*h, cz+oz + ( tz-bz)*h];
    const c = [cx+ox + ( tx+bx)*h, cy+oy + ( ty+by)*h, cz+oz + ( tz+bz)*h];
    const d = [cx+ox + (-tx+bx)*h, cy+oy + (-ty+by)*h, cz+oz + (-tz+bz)*h];
    pos.push(...a,...b,...d, ...b,...c,...d);
    for (let i=0;i<6;i++) nrm.push(nx,ny,nz);
  }
}

// ─── Menger Sponge ─────────────────────────────────────────────────────────────
function buildMengerSponge(level: number): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [];
  function sub(x: number, y: number, z: number, s: number, d: number) {
    if (d === 0) { pushBox(pos, nrm, x + s/2, y + s/2, z + s/2, s * 0.97); return; }
    const t = s / 3;
    for (let ix = 0; ix < 3; ix++)
      for (let iy = 0; iy < 3; iy++)
        for (let iz = 0; iz < 3; iz++) {
          const mid = (ix===1?1:0)+(iy===1?1:0)+(iz===1?1:0);
          if (mid >= 2) continue;
          sub(x+ix*t, y+iy*t, z+iz*t, t, d-1);
        }
  }
  sub(-1, -1, -1, 2, Math.min(level, 3));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}

// ─── Koch Snowflake Surface (extruded, 3D) ─────────────────────────────────────
function buildKochSurface(level: number): THREE.BufferGeometry {
  // Build Koch snowflake as a 2D polygon, then extrude it
  type P2 = [number, number];
  function kochEdge(a: P2, b: P2, d: number): P2[] {
    if (d === 0) return [a, b];
    const [ax,ay]=[a[0],a[1]], [bx,by]=[b[0],b[1]];
    const p1: P2 = [ax+(bx-ax)/3, ay+(by-ay)/3];
    const p3: P2 = [ax+2*(bx-ax)/3, ay+2*(by-ay)/3];
    const mx=(p1[0]+p3[0])/2, my=(p1[1]+p3[1])/2;
    const dx=p3[0]-p1[0], dy=p3[1]-p1[1];
    const peak: P2 = [mx - dy*Math.sqrt(3)/2, my + dx*Math.sqrt(3)/2];
    return [...kochEdge(a,p1,d-1), ...kochEdge(p1,peak,d-1), ...kochEdge(peak,p3,d-1), ...kochEdge(p3,b,d-1)];
  }
  const R=1.8, lv=Math.min(level,4);
  const v0: P2=[0,R], v1: P2=[R*Math.sin(2*Math.PI/3),-R/2], v2: P2=[-R*Math.sin(2*Math.PI/3),-R/2];
  const pts=[...kochEdge(v0,v1,lv),...kochEdge(v1,v2,lv),...kochEdge(v2,v0,lv)];
  const pos: number[]=[], nrm: number[]=[];
  const depth=0.35;
  for (let i=0;i<pts.length;i++){
    const a=pts[i], b=pts[(i+1)%pts.length];
    // Side quad
    const dx=b[0]-a[0], dy=b[1]-a[1], len=Math.sqrt(dx*dx+dy*dy)||1;
    const nx=dy/len, nz=-dx/len;
    pos.push(a[0],depth,a[1], b[0],depth,b[1], b[0],-depth,b[1]);
    pos.push(a[0],depth,a[1], b[0],-depth,b[1], a[0],-depth,a[1]);
    for (let k=0;k<6;k++) nrm.push(nx,0,nz);
  }
  // Top cap (fan from centroid)
  const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length;
  const cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;
  for (let i=0;i<pts.length;i++){
    const a=pts[i], b=pts[(i+1)%pts.length];
    pos.push(cx,depth,cy, a[0],depth,a[1], b[0],depth,b[1]);
    for (let k=0;k<3;k++) nrm.push(0,1,0);
    pos.push(cx,-depth,cy, b[0],-depth,b[1], a[0],-depth,a[1]);
    for (let k=0;k<3;k++) nrm.push(0,-1,0);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute("normal",  new THREE.Float32BufferAttribute(nrm,3));
  return geo;
}

// ─── 3D Pythagoras Tree ────────────────────────────────────────────────────────
function buildPythagorasTree3D(level: number): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [];
  const SPLIT = Math.PI / 4;   // ±45° fork
  const SHRINK = 0.72;         // child / parent length

  // A branch = chain of small cubes (thin → looks like a real branch, not a blob)
  function segment(x: number, y: number, z: number, ex: number, ey: number, ez: number, thick: number) {
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pushBox(pos, nrm, x + (ex - x) * t, y + (ey - y) * t, z + (ez - z) * t, thick);
    }
  }

  function branch(x: number, y: number, z: number, dx: number, dy: number, dz: number, size: number, d: number) {
    if (d < 0 || size < 0.03) return;
    const ex = x + dx * size, ey = y + dy * size, ez = z + dz * size;
    segment(x, y, z, ex, ey, ez, Math.max(0.04, size * 0.16));
    if (d === 0) return;

    const c = Math.cos(SPLIT), s = Math.sin(SPLIT);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;   // rotate +45° around Z
    const rx = dx * c + dy * s, ry = -dx * s + dy * c;  // rotate -45° around Z
    const zt = (d % 2 === 0 ? 1 : -1) * 0.18;           // alternating Z-tilt → volumetric

    branch(ex, ey, ez, lx, ly, dz + zt, size * SHRINK, d - 1);
    branch(ex, ey, ez, rx, ry, dz - zt, size * SHRINK, d - 1);
  }

  branch(0, -1.9, 0, 0, 1, 0, 0.95, Math.min(level + 2, 9));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}

// ─── helper: draw a synthetic sample image on an offscreen canvas ─────────────
function drawSample(canvas: HTMLCanvasElement, type: SampleType) {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = "#050A14";
  ctx.fillRect(0, 0, w, h);

  if (type === "pyramid") {
    const grd = ctx.createRadialGradient(w / 2, h * 0.38, 6, w / 2, h * 0.55, h * 0.52);
    grd.addColorStop(0, "#FFFFFF");
    grd.addColorStop(0.35, "#BBBBBB");
    grd.addColorStop(1, "#111111");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.07);
    ctx.lineTo(w * 0.88, h * 0.86);
    ctx.lineTo(w * 0.12, h * 0.86);
    ctx.closePath();
    ctx.fill();
  } else if (type === "circle") {
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.41, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "square") {
    const s = h * 0.34;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(w / 2 - s, h / 2 - s, s * 2, s * 2);
  } else if (type === "sphere") {
    const grd = ctx.createRadialGradient(w * 0.37, h * 0.35, 3, w / 2, h / 2, h * 0.41);
    grd.addColorStop(0, "#FFFFFF");
    grd.addColorStop(0.45, "#DDDDDD");
    grd.addColorStop(1, "#080808");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.41, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "cube") {
    // Cube: flat solid faces so luminance → depth gives a clean box shape.
    // Top face = white (highest), right face = #AAAAAA (medium), front = #666666 (lower).
    const s = h * 0.28, cx = w * 0.44, cy = h * 0.56;
    const ox = s * 0.55, oy = -s * 0.42;
    // front face
    ctx.fillStyle = "#666666";
    ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
    // top face
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx - s + ox, cy - s + oy);
    ctx.lineTo(cx + s + ox, cy - s + oy); ctx.lineTo(cx + s, cy - s);
    ctx.closePath(); ctx.fill();
    // right face
    ctx.fillStyle = "#AAAAAA";
    ctx.beginPath();
    ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx + s + ox, cy - s + oy);
    ctx.lineTo(cx + s + ox, cy + s + oy); ctx.lineTo(cx + s, cy + s);
    ctx.closePath(); ctx.fill();

  } else if (type === "sierpinski") {
    // White Sierpinski triangle on dark background — bright = tall in 3D
    ctx.fillStyle = "#FFFFFF";
    const drawTri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, d: number) => {
      if (d === 0) {
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy);
        ctx.closePath(); ctx.fill();
        return;
      }
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const nx = (bx + cx) / 2, ny = (by + cy) / 2;
      const ox = (ax + cx) / 2, oy2 = (ay + cy) / 2;
      drawTri(ax, ay, mx, my, ox, oy2, d - 1);
      drawTri(mx, my, bx, by, nx, ny, d - 1);
      drawTri(ox, oy2, nx, ny, cx, cy, d - 1);
    };
    drawTri(w * 0.5, h * 0.04, w * 0.96, h * 0.94, w * 0.04, h * 0.94, 6);

  } else if (type === "mandelbrot") {
    // Mandelbrot set rendered as grayscale — creates a volcanic crater-like 3D
    const img = ctx.createImageData(w, h);
    const maxIter = 80;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const cr = (px / w) * 3.5 - 2.5;   // real axis: −2.5 … +1.0
        const ci = (py / h) * 2.4 - 1.2;   // imag axis: −1.2 … +1.2
        let zr = 0, zi = 0, n = 0;
        while (zr * zr + zi * zi < 4 && n < maxIter) {
          const tmp = zr * zr - zi * zi + cr;
          zi = 2 * zr * zi + ci;
          zr = tmp;
          n++;
        }
        // Points inside the set (n === maxIter) stay dark (not in fractal boundary)
        // Boundary points get bright — reveals the fractal edge structure
        const v = n === maxIter ? 0 : Math.round(255 * Math.sqrt(n / maxIter));
        const i4 = (py * w + px) * 4;
        img.data[i4] = v; img.data[i4 + 1] = v; img.data[i4 + 2] = v; img.data[i4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}


// ─── Voxel grid from depth map ────────────────────────────────────────────────
// Each pixel becomes a vertical box (column) whose height = depth * scale.
// Bright pixel → tall box, dark pixel → short / absent box.
// MeshNormalMaterial then colours every face by its surface normal:
//   top faces  → green   (normal Y+)
//   side faces → cyan / magenta / red / blue depending on direction
// → exactly the colourful 3D-fractal look from YouTube videos.
function buildVoxelGeometry(
  depth: Float32Array,
  srcRes: number,
  gridRes: number,   // boxes per side (= detail level)
  scale: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];

  const step   = srcRes / gridRes;
  const boxW   = (4 / gridRes) * 0.92;  // slight gap between boxes
  const halfCell = 4 / gridRes / 2;

  const getD = (col: number, row: number): number => {
    const px = Math.min(srcRes - 1, Math.floor((col + 0.5) * step));
    const py = Math.min(srcRes - 1, Math.floor((row + 0.5) * step));
    return depth[(srcRes - 1 - py) * srcRes + px] ?? 0;
  };

  // Push two triangles for one quad face (a,b,c,d CCW, normal n)
  const quad = (
    ax:number,ay:number,az:number, bx:number,by:number,bz:number,
    cx:number,cy:number,cz:number, dx:number,dy:number,dz:number,
    nx:number,ny:number,nz:number,
  ) => {
    pos.push(ax,ay,az, bx,by,bz, dx,dy,dz,  bx,by,bz, cx,cy,cz, dx,dy,dz);
    for (let i=0;i<6;i++) nrm.push(nx,ny,nz);
  };

  const hw = boxW / 2;

  for (let row = 0; row < gridRes; row++) {
    for (let col = 0; col < gridRes; col++) {
      const d = getD(col, row);
      if (d < 0.025) continue;          // skip near-black pixels
      const h = d * scale;
      const x = (col / gridRes) * 4 - 2 + halfCell;
      const z = (row / gridRes) * 4 - 2 + halfCell;

      // Top
      quad(x-hw,h,z-hw, x+hw,h,z-hw, x+hw,h,z+hw, x-hw,h,z+hw,  0,1,0);
      // Front +Z
      quad(x-hw,0,z+hw, x+hw,0,z+hw, x+hw,h,z+hw, x-hw,h,z+hw,  0,0,1);
      // Back  -Z
      quad(x+hw,0,z-hw, x-hw,0,z-hw, x-hw,h,z-hw, x+hw,h,z-hw,  0,0,-1);
      // Right +X
      quad(x+hw,0,z+hw, x+hw,0,z-hw, x+hw,h,z-hw, x+hw,h,z+hw,  1,0,0);
      // Left  -X
      quad(x-hw,0,z-hw, x-hw,0,z+hw, x-hw,h,z+hw, x-hw,h,z-hw, -1,0,0);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}

// ─── Chaos-game IFS fractals (octahedron / dodecahedron / icosahedron / cantor) ─
const PHI = (1 + Math.sqrt(5)) / 2;

function platonicVerts(kind: "octahedron" | "dodecahedron" | "icosahedron"): number[][] {
  if (kind === "octahedron")
    return [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  if (kind === "icosahedron") {
    const p = PHI, v: number[][] = [];
    for (const a of [-1, 1]) for (const b of [-p, p]) { v.push([0,a,b],[a,b,0],[b,0,a]); }
    return v;
  }
  // dodecahedron
  const p = PHI, ip = 1 / PHI, v: number[][] = [];
  for (const x of [-1,1]) for (const y of [-1,1]) for (const z of [-1,1]) v.push([x,y,z]);
  for (const a of [-ip, ip]) for (const b of [-p, p]) { v.push([0,a,b],[a,b,0],[b,0,a]); }
  return v;
}

// Render a point cloud as small cubes
function pointsToBoxes(pts: number[][], boxSize: number): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [];
  for (const [x, y, z] of pts) pushBox(pos, nrm, x, y, z, boxSize);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}

function buildIFSFractal(kind: "octahedron" | "dodecahedron" | "icosahedron", n = 5000): THREE.BufferGeometry {
  const verts = platonicVerts(kind);
  const ratio = kind === "octahedron" ? 0.5 : 1 / PHI;
  let px = 0, py = 0, pz = 0;
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const v = verts[(Math.random() * verts.length) | 0];
    px += (v[0] - px) * ratio; py += (v[1] - py) * ratio; pz += (v[2] - pz) * ratio;
    if (i > 30) pts.push([px * 1.6, py * 1.6, pz * 1.6]);
  }
  return pointsToBoxes(pts, 0.06);
}

function buildCantorDust(level: number): THREE.BufferGeometry {
  const pts: number[][] = [];
  const rec = (x: number, y: number, z: number, s: number, d: number) => {
    if (d === 0) { pts.push([x, y, z]); return; }
    const t = s / 3;
    for (const ix of [-1, 1]) for (const iy of [-1, 1]) for (const iz of [-1, 1])
      rec(x + ix * t, y + iy * t, z + iz * t, t, d - 1);
  };
  rec(0, 0, 0, 2.0, Math.min(level, 3));
  return pointsToBoxes(pts, 2.0 / Math.pow(3, Math.min(level, 3)) * 0.9);
}

// ─── helper: build Sierpinski tetrahedron BufferGeometry ─────────────────────
type V3 = [number, number, number];
function mid3(a: V3, b: V3): V3 { return [(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2]; }

function buildSierpinskiGeometry(level: number): THREE.BufferGeometry {
  const verts: number[] = [];
  const uvs: number[] = [];   // planar top-down UV (X-Z → U-V), used when image texture is applied

  function face(a: V3, b: V3, c: V3) {
    verts.push(...a, ...b, ...c);
    // Normalise X and Z from [-2, 2] to [0, 1]
    for (const v of [a, b, c]) uvs.push(v[0] / 4 + 0.5, v[2] / 4 + 0.5);
  }

  function subdivide(a: V3, b: V3, c: V3, d: V3, depth: number) {
    if (depth === 0) {
      face(a, c, b); face(a, b, d); face(a, d, c); face(b, c, d);
      return;
    }
    const ab=mid3(a,b), ac=mid3(a,c), ad=mid3(a,d);
    const bc=mid3(b,c), bd=mid3(b,d), cd=mid3(c,d);
    subdivide(a, ab, ac, ad, depth-1);
    subdivide(ab, b, bc, bd, depth-1);
    subdivide(ac, bc, c, cd, depth-1);
    subdivide(ad, bd, cd, d, depth-1);
  }

  // Regular tetrahedron, circumradius = 2
  const R = 2.0;
  const v0: V3 = [0, R, 0];
  const v1: V3 = [-R*0.8165, -R*0.3333,  R*0.4714];
  const v2: V3 = [ R*0.8165, -R*0.3333,  R*0.4714];
  const v3: V3 = [0,          -R*0.3333, -R*0.9428];
  subdivide(v0, v1, v2, v3, level);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("uv",       new THREE.Float32BufferAttribute(uvs,   2));
  geo.computeVertexNormals();
  return geo;
}

// ─── helper: luminance → depth array (with box-blur) ─────────────────────────
function buildDepth(imageData: ImageData, blurPasses: number): Float32Array {
  const { data, width, height } = imageData;
  const n = width * height;
  const depth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    depth[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  }
  const tmp = new Float32Array(n);
  for (let p = 0; p < blurPasses; p++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        tmp[i] = (
          depth[(y - 1) * width + (x - 1)] + depth[(y - 1) * width + x] + depth[(y - 1) * width + (x + 1)] +
          depth[y * width + (x - 1)] + depth[i] + depth[y * width + (x + 1)] +
          depth[(y + 1) * width + (x - 1)] + depth[(y + 1) * width + x] + depth[(y + 1) * width + (x + 1)]
        ) / 9;
      }
    }
    depth.set(tmp);
  }
  return depth;
}

// ─── helper: paint depth map as amber heat-map on canvas ─────────────────────
function paintDepthCanvas(canvas: HTMLCanvasElement, depth: Float32Array) {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(MESH_RES, MESH_RES);
  for (let i = 0; i < MESH_RES * MESH_RES; i++) {
    const v = Math.min(255, Math.round(depth[i] * 255));
    img.data[i * 4]     = v;                          // R
    img.data[i * 4 + 1] = Math.round(v * 0.65);       // G  → amber tone
    img.data[i * 4 + 2] = 0;                          // B
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// ─── CNN API response type ────────────────────────────────────────────────────
interface CNNResponse {
  type: string;
  type_3d: string;
  confidence: number;
  c_real: number;
  c_imag: number;
  zoom: number;
  iterations: number;
  all_scores: Record<string, number>;
}

// Map API type string → FractalKind
function apiTypeToKind(t: string): FractalKind {
  if (t === "circle") return "sphere";
  if (t === "square") return "cube";
  if (t === "mandelbrot" || t === "julia" || t === "spiral_julia") return "mandelbrot"; // Mandelbulb shader
  if (t === "burning_ship") return "voxel";       // Voxel — unique per image
  if (t === "sierpinski_triangle") return "sierpinski";
  if (t === "sierpinski_carpet" || t === "menger_sponge") return "menger";
  if (t === "pythagoras_tree" || t === "barnsley_fern") return "pythagoras"; // branching
  if (t === "koch_snowflake") return "koch";
  if (t === "dragon_curve") return "voxel";
  if (t === "octahedron_3d") return "octahedron";
  if (t === "dodecahedron_3d") return "dodecahedron";
  if (t === "icosahedron_3d") return "icosahedron";
  if (t === "cantor_dust_3d") return "cantor";
  return "voxel";
}

const CLASS_LABELS: Record<string, string> = {
  circle: "Circle",
  square: "Square",
  mandelbrot: "Mandelbrot",
  julia: "Julia",
  burning_ship: "Burning Ship",
  sierpinski_triangle: "Серпинский △",
  sierpinski_carpet: "Ковёр Серп.",
  menger_sponge: "Губка Менгера",
  pythagoras_tree: "Дерево Пифагора",
  koch_snowflake: "Снежинка Коха",
  barnsley_fern: "Папоротник",
  dragon_curve: "Кривая дракона",
  octahedron_3d: "Октаэдр-фрактал",
  dodecahedron_3d: "Додекаэдр-фрактал",
  icosahedron_3d: "Икосаэдр-фрактал",
  cantor_dust_3d: "Пыль Кантора",
  spiral_julia: "Спираль Жюлиа",
};

// ─── component ────────────────────────────────────────────────────────────────
function kindToName3d(kind: FractalKind): string {
  const names: Record<FractalKind, string> = {
    sphere: "Sphere",
    cube: "Cube",
    sierpinski: "Sierpinski Tetrahedron",
    menger: "Menger Sponge",
    pythagoras: "3D Pythagoras Tree",
    mandelbrot: "Mandelbulb",
    koch: "Koch Snowflake Surface",
    octahedron: "Sierpinski Octahedron",
    dodecahedron: "Dodecahedron Fractal",
    icosahedron: "Icosahedron Fractal",
    cantor: "Cantor Dust",
    voxel: "Voxel extrusion",
  };
  return names[kind];
}

export default function FractalCNN() {
  const { lang } = useLang();

  const [hasImage, setHasImage]         = useState(false);
  const [depthScale, setDepthScale]     = useState(1.8);
  const [smoothing, setSmoothing]       = useState(3);
  const [wireframe, setWireframe]       = useState(false);
  const [autoRot, setAutoRot]           = useState(true);
  const [activeStep, setActiveStep]     = useState<number | null>(null);
  const [isDragOver, setIsDragOver]     = useState(false);
  const [fractalMode, setFractalMode]   = useState(false);
  const [fractalLevel, setFractalLevel] = useState(3);
  const [detection, setDetection]         = useState<ClassifyResult | null>(null);
  const [polyCount, setPolyCount]         = useState(0);
  const [cnnApiResult, setCnnApiResult]   = useState<CNNResponse | null>(null);
  const [cnnLoading, setCnnLoading]       = useState(false);
  const [cnnError, setCnnError]           = useState<string | null>(null);
  const [showCnnParams, setShowCnnParams] = useState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const srcCanvasRef   = useRef<HTMLCanvasElement>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const pipeSrcRef     = useRef<HTMLCanvasElement>(null);
  const pipeDepthRef   = useRef<HTMLCanvasElement>(null);
  const pipeFeatRef    = useRef<HTMLCanvasElement>(null);
  const pipe3dRef      = useRef<HTMLCanvasElement>(null);

  // Three.js refs
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const meshRef      = useRef<THREE.Mesh | null>(null);
  const rafRef       = useRef<number>(0);
  const orbit        = useRef({ theta: 0.6, phi: 0.38, radius: 5, dragging: false, lx: 0, ly: 0 });

  // mutable refs so animation loop always reads latest value
  const wireframeRef  = useRef(wireframe);
  const autoRotRef    = useRef(autoRot);
  const depthDataRef  = useRef<Float32Array | null>(null);
  const depthScaleRef = useRef(depthScale);
  const fractalModeRef = useRef(fractalMode);
  const hasImageRef    = useRef(hasImage);
  // Mandelbulb shader refs
  const mandelbulbUniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
  const isMandelbulbRef       = useRef(false);

  useEffect(() => { wireframeRef.current   = wireframe;   }, [wireframe]);
  useEffect(() => { autoRotRef.current     = autoRot;     }, [autoRot]);
  useEffect(() => { depthScaleRef.current  = depthScale;  }, [depthScale]);
  useEffect(() => { fractalModeRef.current = fractalMode; }, [fractalMode]);
  useEffect(() => { hasImageRef.current    = hasImage;    }, [hasImage]);
  // CNN override: when set, rebuildFractal uses this kind instead of heuristic
  const forcedKindRef = useRef<FractalKind | null>(null);

  // ── Three.js initialisation (runs once) ─────────────────────────────────────
  useEffect(() => {
    const canvas = threeCanvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(THREE_W, THREE_H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x060B18);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    scene.add(new THREE.AmbientLight(0x334466, 0.7));
    const d1 = new THREE.DirectionalLight(0x00E5FF, 1.0);
    d1.position.set(3, 4, 3);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x9C27B0, 0.5);
    d2.position.set(-3, -2, -2);
    scene.add(d2);

    const camera = new THREE.PerspectiveCamera(50, THREE_W / THREE_H, 0.1, 100);
    cameraRef.current = camera;

    // Placeholder mesh (visible cyan wireframe grid)
    const geo = new THREE.PlaneGeometry(4, 4, 31, 31);
    const mat = new THREE.MeshStandardMaterial({ color: 0x00E5FF, wireframe: true, transparent: true, opacity: 0.25 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    meshRef.current = mesh;

    scene.add(new THREE.GridHelper(6, 12, 0x1E3A5F, 0x0D1F38));

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (autoRotRef.current && !orbit.current.dragging) {
        orbit.current.theta += 0.0008;
      }
      const { theta, phi, radius } = orbit.current;

      if (isMandelbulbRef.current && mandelbulbUniformsRef.current) {
        // Mandelbulb: camera is fixed, orbit fed into shader uniforms
        camera.position.set(0, 0, 1);
        camera.lookAt(0, 0, 0);
        const u = mandelbulbUniformsRef.current;
        u.camTheta.value = theta;
        u.camPhi.value   = phi;
        u.camRadius.value = Math.max(1.5, radius);
        u.time.value     += 0.016;
      } else {
        // Normal orbit camera
        camera.position.set(
          radius * Math.sin(theta) * Math.cos(phi),
          radius * Math.sin(phi),
          radius * Math.cos(theta) * Math.cos(phi),
        );
        camera.lookAt(0, 0, 0);
        if (meshRef.current) {
          (meshRef.current.material as unknown as { wireframe: boolean }).wireframe = wireframeRef.current;
        }
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
    };
  }, []);

  // ── rebuild the Three.js mesh from depth data ─────────────────────────────
  const rebuildMesh = useCallback((depth: Float32Array, scale: number, srcCanvas: HTMLCanvasElement) => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
    }

    const geo = new THREE.PlaneGeometry(4, 4, MESH_RES - 1, MESH_RES - 1);
    const pos = geo.attributes.position;

    // Vertex i maps to pixel (col = i % MESH_RES, row = floor(i / MESH_RES))
    // PlaneGeometry row 0 = y = +2 (top); canvas row 0 = top → flip row
    for (let i = 0; i < pos.count; i++) {
      const col = i % MESH_RES;
      const row = Math.floor(i / MESH_RES);
      const flippedRow = MESH_RES - 1 - row;
      pos.setZ(i, depth[flippedRow * MESH_RES + col] * scale);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const tex = new THREE.CanvasTexture(srcCanvas);
    tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      wireframe: wireframeRef.current,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    meshRef.current = mesh;
  }, []);

  // ── process an HTMLImageElement into depth + mesh ─────────────────────────
  const processImage = useCallback((img: HTMLImageElement) => {
    const src = srcCanvasRef.current;
    const dep = depthCanvasRef.current;
    if (!src || !dep) return;

    src.width = MESH_RES; src.height = MESH_RES;
    dep.width = MESH_RES; dep.height = MESH_RES;

    const sCtx = src.getContext("2d")!;
    sCtx.drawImage(img, 0, 0, MESH_RES, MESH_RES);

    const imgData = sCtx.getImageData(0, 0, MESH_RES, MESH_RES);
    const depth = buildDepth(imgData, smoothing);
    depthDataRef.current = depth;

    paintDepthCanvas(dep, depth);
    rebuildMesh(depth, depthScaleRef.current, src);
    setHasImage(true);
  }, [smoothing, rebuildMesh]);

  // ── re-run when smoothing changes ─────────────────────────────────────────
  useEffect(() => {
    const src = srcCanvasRef.current;
    if (!src || !hasImage) return;
    const sCtx = src.getContext("2d");
    if (!sCtx) return;
    const imgData = sCtx.getImageData(0, 0, MESH_RES, MESH_RES);
    const depth = buildDepth(imgData, smoothing);
    depthDataRef.current = depth;
    if (depthCanvasRef.current) paintDepthCanvas(depthCanvasRef.current, depth);
    rebuildMesh(depth, depthScaleRef.current, src);
  }, [smoothing, hasImage, rebuildMesh]);

  // ── re-run when depthScale changes ────────────────────────────────────────
  useEffect(() => {
    const src = srcCanvasRef.current;
    if (!depthDataRef.current || !src || fractalMode) return;
    rebuildMesh(depthDataRef.current, depthScale, src);
  }, [depthScale, rebuildMesh, fractalMode]);

  // ── build / rebuild the 3D fractal: classify image → pick generator ─────────
  const rebuildFractal = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
      meshRef.current = null;
    }

    const depth = depthDataRef.current;
    const mat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide, wireframe: wireframeRef.current });
    let geo: THREE.BufferGeometry;
    let r = 6, phi = 0.45;

    if (hasImageRef.current && depth) {
      // ── Step 1: classify (CNN override takes priority over heuristic) ─────
      let cls: ClassifyResult;
      if (forcedKindRef.current) {
        const k = forcedKindRef.current;
        cls = { kind: k, name3d: kindToName3d(k), confidence: 100, reason: "CNN API override" };
      } else {
        cls = classifyFractal(depth, MESH_RES);
      }
      setDetection(cls);

      // ── Step 2: generate matching 3D fractal ─────────────────────────────
      if (cls.kind === "mandelbrot") {
        // ── Mandelbulb ray-marching shader (fullscreen quad) ─────────────────
        isMandelbulbRef.current = true;
        const power = cls.kind === "mandelbrot" ? 8.0 : 3.0;
        const uniforms: Record<string, THREE.IUniform> = {
          camTheta:  { value: orbit.current.theta },
          camPhi:    { value: orbit.current.phi   },
          camRadius: { value: 3.2 },
          power:     { value: power },
          aspect:    { value: THREE_W / THREE_H },
          time:      { value: 0.0 },
        };
        mandelbulbUniformsRef.current = uniforms;
        const shaderMat = new THREE.ShaderMaterial({
          vertexShader:   MANDELBULB_VERT,
          fragmentShader: MANDELBULB_FRAG,
          uniforms,
        });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMat);
        quad.frustumCulled = false;
        scene.add(quad);
        meshRef.current = quad;
        orbit.current.radius = 3.2;
        setPolyCount(2); // 2 triangles for the fullscreen quad
        r = 3.2; phi = orbit.current.phi;
      } else {
        isMandelbulbRef.current = false;
        mandelbulbUniformsRef.current = null;
        switch (cls.kind) {
          case "sphere":
            geo = new THREE.SphereGeometry(1.35, 64, 32);
            r = 5; phi = 0.35; break;
          case "cube":
            geo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
            r = 5; phi = 0.35; break;
          case "sierpinski":
            geo = buildSierpinskiGeometry(Math.min(fractalLevel, 5));
            r = 6; phi = 0.45; break;
          case "menger":
            geo = buildMengerSponge(Math.min(fractalLevel, 3));
            r = 6; phi = 0.45; break;
          case "koch":
            geo = buildKochSurface(Math.min(fractalLevel, 4));
            r = 5; phi = 0.35; break;
          case "pythagoras":
            geo = buildPythagorasTree3D(Math.min(fractalLevel, 7));
            r = 7; phi = 0.3;  break;
          case "octahedron":
            geo = buildIFSFractal("octahedron", 4000 + fractalLevel * 1500);
            r = 6; phi = 0.4;  break;
          case "dodecahedron":
            geo = buildIFSFractal("dodecahedron", 4000 + fractalLevel * 1500);
            r = 6; phi = 0.4;  break;
          case "icosahedron":
            geo = buildIFSFractal("icosahedron", 4000 + fractalLevel * 1500);
            r = 6; phi = 0.4;  break;
          case "cantor":
            geo = buildCantorDust(Math.min(fractalLevel, 3));
            r = 6; phi = 0.4;  break;
          default: {
            const gridRes = (fractalLevel + 1) * 8;
            geo = buildVoxelGeometry(depth, MESH_RES, gridRes, depthScaleRef.current);
            r = 6; phi = 0.50; break;
          }
        }
      }
    } else {
      isMandelbulbRef.current = false;
      mandelbulbUniformsRef.current = null;
      setDetection(null);
      geo = buildSierpinskiGeometry(Math.min(fractalLevel, 5));
    }

    if (!isMandelbulbRef.current && geo!) {
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      meshRef.current = mesh;
    }

    orbit.current.radius = r;
    orbit.current.phi    = phi;
    if (geo!) setPolyCount(geo.attributes.position.count / 3);
  }, [fractalLevel, setDetection, setPolyCount]);

  // ── switch between heightmap and fractal mode ──────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (fractalMode) {
      rebuildFractal();
    } else {
      // Restore heightmap mesh or placeholder
      if (meshRef.current) {
        scene.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        (meshRef.current.material as THREE.Material).dispose();
        meshRef.current = null;
      }
      const src = srcCanvasRef.current;
      if (depthDataRef.current && src) {
        rebuildMesh(depthDataRef.current, depthScaleRef.current, src);
      } else {
        const geo = new THREE.PlaneGeometry(4, 4, 31, 31);
        const mat = new THREE.MeshStandardMaterial({ color: 0x00E5FF, wireframe: true, transparent: true, opacity: 0.25 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        meshRef.current = mesh;
        orbit.current.radius = 5;
        orbit.current.phi = 0.38;
      }
    }
  }, [fractalMode, rebuildFractal, rebuildMesh]);

  // ── rebuild fractal when level changes (only in fractal mode) ─────────────
  useEffect(() => {
    if (fractalMode) rebuildFractal();
  }, [fractalLevel, fractalMode, rebuildFractal]);

  // ── rebuild fractal texture when a new image is loaded ────────────────────
  useEffect(() => {
    if (fractalMode && hasImage) rebuildFractal();
  }, [hasImage, fractalMode, rebuildFractal]);

  // ── copy src/depth previews into the pipeline mini-canvases ───────────────
  useEffect(() => {
    if (!hasImage) return;
    const copy = (from: HTMLCanvasElement | null, to: HTMLCanvasElement | null) => {
      if (!from || !to) return;
      const ctx = to.getContext("2d");
      if (ctx) { ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, to.width, to.height); ctx.drawImage(from, 0, 0, to.width, to.height); }
    };
    copy(srcCanvasRef.current, pipeSrcRef.current);
    copy(depthCanvasRef.current, pipeDepthRef.current);

    // Feature-map heatmap: downsample depth → 8×8 grid of "activations"
    const feat = pipeFeatRef.current;
    const dCtx = depthCanvasRef.current?.getContext("2d");
    if (feat && dCtx) {
      const fctx = feat.getContext("2d");
      const data = dCtx.getImageData(0, 0, MESH_RES, MESH_RES).data;
      if (fctx) {
        const G = 8, cell = feat.width / G;
        for (let gy = 0; gy < G; gy++) {
          for (let gx = 0; gx < G; gx++) {
            let sum = 0, cnt = 0;
            const x0 = Math.floor(gx / G * MESH_RES), x1 = Math.floor((gx + 1) / G * MESH_RES);
            const y0 = Math.floor(gy / G * MESH_RES), y1 = Math.floor((gy + 1) / G * MESH_RES);
            for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) { sum += data[(y * MESH_RES + x) * 4]; cnt++; }
            const v = cnt ? sum / cnt / 255 : 0;
            // viridis-ish: blue→green→yellow
            const r = Math.round(60 + v * 195), g = Math.round(20 + v * 200), b = Math.round(120 - v * 100);
            fctx.fillStyle = `rgb(${r},${g},${b})`;
            fctx.fillRect(gx * cell, gy * cell, cell - 1, cell - 1);
          }
        }
      }
    }

    // 3D snapshot (only meaningful in fractal mode)
    if (fractalMode) copy(threeCanvasRef.current, pipe3dRef.current);
  }, [hasImage, smoothing, detection, cnnApiResult, fractalMode]);

  // ── file loading helpers ──────────────────────────────────────────────────
  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    forcedKindRef.current = null; // new image → clear CNN override
    setCnnApiResult(null);
    setCnnError(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { processImage(img); URL.revokeObjectURL(url); };
    img.src = url;
  }, [processImage]);

  const loadSample = useCallback((type: SampleType) => {
    forcedKindRef.current = null;
    setCnnApiResult(null);
    setCnnError(null);
    const off = document.createElement("canvas");
    off.width = MESH_RES; off.height = MESH_RES;
    drawSample(off, type);
    const img = new Image();
    img.onload = () => processImage(img);
    img.src = off.toDataURL();
  }, [processImage]);

  // ── Three.js orbit controls (mouse) ───────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    orbit.current.dragging = true;
    orbit.current.lx = e.clientX;
    orbit.current.ly = e.clientY;
  }, []);
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!orbit.current.dragging) return;
    orbit.current.theta -= (e.clientX - orbit.current.lx) * 0.012;
    orbit.current.phi    = Math.max(-1.3, Math.min(1.3, orbit.current.phi + (e.clientY - orbit.current.ly) * 0.012));
    orbit.current.lx = e.clientX;
    orbit.current.ly = e.clientY;
  }, []);
  const onMouseUp   = useCallback(() => { orbit.current.dragging = false; }, []);
  const onWheel     = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    orbit.current.radius = Math.max(1.5, Math.min(12, orbit.current.radius + e.deltaY * 0.006));
  }, []);

  // ── OBJ export ───────────────────────────────────────────────────────────────
  // ── Call Python CNN API ────────────────────────────────────────────────────
  const callCNN = useCallback(async () => {
    const src = srcCanvasRef.current;
    if (!src) return;
    setCnnLoading(true);
    setCnnError(null);
    try {
      // Get image as base64 JPEG (smaller than PNG)
      const b64 = src.toDataURL("image/jpeg", 0.92).split(",")[1];
      const res = await fetch("http://localhost:8000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CNNResponse = await res.json();
      setCnnApiResult(data);
    } catch {
      setCnnError("offline");
    } finally {
      setCnnLoading(false);
    }
  }, []);

  // Apply CNN result with heuristic cross-check
  const applyCNNto3D = useCallback(() => {
    if (!cnnApiResult) return;
    const cnnKind = apiTypeToKind(cnnApiResult.type);

    // Hybrid: run heuristic too and compare
    // For geometric fractals (sierpinski / menger), heuristic is more reliable
    // than CNN at 89.7% accuracy — prefer heuristic when it detects clear geometry.
    let finalKind: FractalKind = cnnKind;
    const depth = depthDataRef.current;
    if (depth) {
      const heuristic = classifyFractal(depth, MESH_RES);
      const geometricHeuristic = heuristic.kind === "sierpinski" || heuristic.kind === "menger";
      const cnnUncertain = cnnApiResult.confidence < 90;

      if (geometricHeuristic && (cnnUncertain || cnnKind === "voxel")) {
        // Heuristic clearly sees a geometric fractal — trust it
        finalKind = heuristic.kind;
      } else if (geometricHeuristic && heuristic.confidence >= 70 && cnnKind !== "sierpinski" && cnnKind !== "menger") {
        // Heuristic is confident about geometry even if CNN disagrees → heuristic wins
        finalKind = heuristic.kind;
      }
    }

    forcedKindRef.current = finalKind;
    if (fractalMode) {
      rebuildFractal();
    } else {
      setFractalMode(true);
    }
  }, [cnnApiResult, fractalMode, rebuildFractal]);

  const exportOBJ = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const p = mesh.geometry.attributes.position;
    const n = mesh.geometry.attributes.normal;
    let obj = "# Fractal 3D — Transmission Hologram\n# https://github.com/Bekk-cap1\n\n";
    for (let i = 0; i < p.count; i++)
      obj += `v ${p.getX(i).toFixed(5)} ${p.getY(i).toFixed(5)} ${p.getZ(i).toFixed(5)}\n`;
    if (n) for (let i = 0; i < n.count; i++)
      obj += `vn ${n.getX(i).toFixed(5)} ${n.getY(i).toFixed(5)} ${n.getZ(i).toFixed(5)}\n`;
    obj += "\n";
    for (let i = 0; i < p.count; i += 3)
      obj += `f ${i+1}//${i+1} ${i+2}//${i+2} ${i+3}//${i+3}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([obj], { type: "text/plain" }));
    a.download = `fractal-${detection?.kind ?? "3d"}.obj`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [detection]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--accent-cyan)" }}>
          {TX.title[lang]}
        </h2>
        <p style={{ color: "var(--text-secondary)" }}>{TX.subtitle[lang]}</p>
      </div>

      {/* ── Upload zone — shown before image loaded (CSS visibility, not conditional mount) ── */}
      <div style={{ display: hasImage ? "none" : "block" }}>
        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={e => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all mb-4"
          style={{
            minHeight: 220,
            background: isDragOver ? "#00E5FF0D" : "var(--bg-secondary)",
            border: `2px dashed ${isDragOver ? "#00E5FF" : "#1E3A5F"}`,
          }}
        >
          <span style={{ fontSize: 48 }}>🖼️</span>
          <div className="text-base font-semibold" style={{ color: isDragOver ? "#00E5FF" : "var(--text-primary)" }}>
            {TX.dropTitle[lang]}
          </div>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{TX.or[lang]}</span>
          <button
            onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: "#00E5FF22", border: "1px solid #00E5FF", color: "#00E5FF" }}
          >
            {TX.chooseFile[lang]}
          </button>
        </div>
        <div className="space-y-2">
          {/* Simple shapes — "без фрактала" */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold shrink-0" style={{ color: "var(--text-secondary)" }}>
              {TX.simpleHdr[lang]}
            </span>
            {(["pyramid", "circle", "square"] as const).map(s => (
              <button key={s} onClick={() => loadSample(s)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
              >
                {TX[s][lang]}
              </button>
            ))}
          </div>
          {/* Fractals — "с Fractal CNN" */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold shrink-0" style={{ color: "#FFB300" }}>
              {TX.fractalHdr[lang]}
            </span>
            {(["sierpinski", "mandelbrot"] as const).map(s => (
              <button key={s} onClick={() => loadSample(s)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{ background: "#FFB30011", border: "1px solid #FFB30055", color: "#FFB300" }}
              >
                {TX[s][lang]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Source + Depth + Controls — always in DOM, shown when hasImage ── */}
      <div className="flex gap-4 flex-wrap items-start" style={{ display: hasImage ? "flex" : "none" }}>
        {/* Source image canvas — always mounted */}
        <div className="rounded-xl p-3 shrink-0" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
          <div className="text-xs font-bold mb-2" style={{ color: "#00E5FF" }}>{TX.sourceImg[lang]}</div>
          <canvas
            ref={srcCanvasRef}
            style={{ display: "block", width: 160, height: 160, imageRendering: "pixelated", borderRadius: 6 }}
          />
        </div>

        {/* Depth map canvas — always mounted */}
        <div className="rounded-xl p-3 shrink-0" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
          <div className="text-xs font-bold mb-2" style={{ color: "#FFB300" }}>{TX.depthMap[lang]}</div>
          <canvas
            ref={depthCanvasRef}
            style={{ display: "block", width: 160, height: 160, imageRendering: "pixelated", borderRadius: 6 }}
          />
        </div>

        {/* Controls */}
        <div className="flex-1 min-w-60 rounded-xl p-4 space-y-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-secondary)" }}>
              {TX.depthScale[lang]}: <span style={{ color: "#00E5FF" }}>{depthScale.toFixed(1)}</span>
            </label>
            <input type="range" min={0.2} max={4} step={0.1} value={depthScale}
              onChange={e => setDepthScale(parseFloat(e.target.value))}
              className="w-full" style={{ accentColor: "#00E5FF" }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-secondary)" }}>
              {TX.smoothing[lang]}: <span style={{ color: "#00E5FF" }}>{smoothing}</span>
            </label>
            <input type="range" min={0} max={8} step={1} value={smoothing}
              onChange={e => setSmoothing(parseInt(e.target.value))}
              className="w-full" style={{ accentColor: "#9C27B0" }} />
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setWireframe(w => !w)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: wireframe ? "#00E5FF22" : "var(--bg-card)", border: `1px solid ${wireframe ? "#00E5FF" : "var(--border-color)"}`, color: wireframe ? "#00E5FF" : "var(--text-secondary)" }}
            >{TX.wireframe[lang]}</button>
            <button onClick={() => setAutoRot(a => !a)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: autoRot ? "#9C27B022" : "var(--bg-card)", border: `1px solid ${autoRot ? "#9C27B0" : "var(--border-color)"}`, color: autoRot ? "#9C27B0" : "var(--text-secondary)" }}
            >{TX.autoRot[lang]}</button>
            <button
              onClick={() => { setHasImage(false); depthDataRef.current = null; }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto transition-all"
              style={{ background: "#33000022", border: "1px solid #FF444444", color: "#FF6666" }}
            >{TX.reset[lang]}</button>
          </div>
        </div>
      </div>

      {/* ── CNN API Panel ── */}
      {hasImage && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: "var(--bg-secondary)", border: "1px solid #69F0AE44" }}
        >
          {/* Header + Analyse button */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold" style={{ color: "#69F0AE" }}>
              {TX.cnnResult[lang]}
              <span className="ml-2 text-xs font-normal" style={{ color: "#546E7A" }}>
                (Python API · localhost:8000)
              </span>
            </span>
            <button
              onClick={callCNN}
              disabled={cnnLoading}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all ml-auto"
              style={{
                background: cnnLoading ? "#1E3A5F" : "#69F0AE22",
                border: "1px solid #69F0AE88",
                color: cnnLoading ? "#546E7A" : "#69F0AE",
                cursor: cnnLoading ? "wait" : "pointer",
              }}
            >
              {cnnLoading ? TX.cnnLoading[lang] : TX.cnnBtn[lang]}
            </button>
          </div>

          {/* Error state */}
          {cnnError && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#FF000011", border: "1px solid #FF444444", color: "#FF6666" }}>
              {TX.cnnOffline[lang]}
            </div>
          )}

          {/* Results */}
          {cnnApiResult && !cnnError && (
            <div className="space-y-3">
              {/* Main result cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid #69F0AE33" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.cnnType[lang]}</div>
                  <div className="text-sm font-bold" style={{ color: "#69F0AE" }}>
                    {CLASS_LABELS[cnnApiResult.type] ?? cnnApiResult.type}
                  </div>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid #FFB30033" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.cnnConf[lang]}</div>
                  <div className="text-sm font-bold" style={{ color: cnnApiResult.confidence > 80 ? "#69F0AE" : cnnApiResult.confidence > 60 ? "#FFB300" : "#FF6666" }}>
                    {cnnApiResult.confidence.toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-lg p-3 col-span-2" style={{ background: "var(--bg-card)", border: "1px solid #00E5FF22" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.cnnModel[lang]}</div>
                  <div className="text-sm font-semibold" style={{ color: "#00E5FF" }}>{cnnApiResult.type_3d}</div>
                </div>
              </div>

              {/* Parameters — toggleable */}
              <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid #9C27B033" }}>
                <button
                  onClick={() => setShowCnnParams(v => !v)}
                  className="w-full flex items-center justify-between text-xs font-semibold transition-all"
                  style={{ color: "#9C27B0" }}
                >
                  <span>{TX.cnnParams[lang]} {showCnnParams ? "▲" : "▼"}</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      background: showCnnParams ? "#9C27B033" : "#1E3A5F",
                      color: showCnnParams ? "#9C27B0" : "#546E7A",
                    }}
                  >
                    {showCnnParams ? "ON" : "OFF"}
                  </span>
                </button>
                {showCnnParams && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-xs mt-2">
                      {[
                        { label: "c_real", value: cnnApiResult.c_real.toFixed(4) },
                        { label: "c_imag", value: cnnApiResult.c_imag.toFixed(4) },
                        { label: "zoom",   value: cnnApiResult.zoom.toFixed(3) },
                        { label: "iter",   value: String(cnnApiResult.iterations) },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <span style={{ color: "var(--text-secondary)" }}>{label}: </span>
                          <span style={{ color: "#E8EAF6" }}>{value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] mt-2 leading-snug" style={{ color: "#546E7A" }}>
                      ⚠ {TX.cnnParamsHint[lang]}
                    </div>
                  </>
                )}
              </div>

              {/* Class score bars */}
              <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                <div className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>{TX.cnnScores[lang]}</div>
                <div className="space-y-1.5">
                  {Object.entries(cnnApiResult.all_scores)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cls, score]) => (
                      <div key={cls} className="flex items-center gap-2">
                        <span className="text-xs w-28 shrink-0" style={{ color: cls === cnnApiResult.type ? "#69F0AE" : "var(--text-secondary)" }}>
                          {CLASS_LABELS[cls] ?? cls}
                        </span>
                        <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: "#1E3A5F" }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${score}%`, background: cls === cnnApiResult.type ? "#69F0AE" : "#1E3A5F88" }}
                          />
                        </div>
                        <span className="text-xs w-10 text-right font-mono" style={{ color: cls === cnnApiResult.type ? "#69F0AE" : "#546E7A" }}>
                          {score.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Apply button */}
              <button
                onClick={applyCNNto3D}
                className="w-full py-2.5 rounded-lg text-sm font-bold transition-all"
                style={{ background: "#69F0AE22", border: "1px solid #69F0AE88", color: "#69F0AE" }}
              >
                🔮 {TX.cnnApply[lang]} — {cnnApiResult.type_3d}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Mode switcher ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setFractalMode(false)}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: !fractalMode ? "#00E5FF22" : "var(--bg-card)",
            border: `1px solid ${!fractalMode ? "#00E5FF" : "var(--border-color)"}`,
            color: !fractalMode ? "#00E5FF" : "var(--text-secondary)",
          }}
        >
          📷 {TX.modeHeight[lang]}
        </button>
        <button
          onClick={() => setFractalMode(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: fractalMode ? "#FFB30022" : "var(--bg-card)",
            border: `1px solid ${fractalMode ? "#FFB300" : "var(--border-color)"}`,
            color: fractalMode ? "#FFB300" : "var(--text-secondary)",
          }}
        >
          🔮 {TX.modeFractal[lang]}
        </button>

        {fractalMode && (
          <div className="flex items-center gap-3 ml-2">
            <label className="text-xs" style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              {TX.fractalLvl2[lang]}:&nbsp;
              <span style={{ color: "#FFB300", fontWeight: 700 }}>{fractalLevel}</span>
              {detection && (
                <span style={{ color: "#546E7A" }}> — {detection.name3d}</span>
              )}
            </label>
            <input
              type="range" min={1} max={6} step={1}
              value={fractalLevel}
              onChange={e => setFractalLevel(parseInt(e.target.value))}
              style={{ accentColor: "#FFB300", width: 140 }}
            />
          </div>
        )}
      </div>

      {/* ── Three.js canvas — always in DOM ── */}
      <div className="rounded-xl overflow-hidden relative" style={{ border: "1px solid var(--border-color)", background: "#060B18" }}>
        <div className="absolute top-2 left-3 z-10 text-xs font-bold" style={{ color: "#9C27B0" }}>
          {hasImage ? TX.view3d[lang] : "3D"}
        </div>
        <canvas
          ref={threeCanvasRef}
          width={THREE_W}
          height={THREE_H}
          className="w-full"
          style={{ display: "block", cursor: "grab" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
        />
        <div className="absolute bottom-2 right-3 text-xs" style={{ color: "#546E7A" }}>
          {TX.dragHint[lang]}
        </div>
      </div>

      {/* ── Detection result panel (fractal mode + image) ── */}
      {fractalMode && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: "var(--bg-secondary)", border: `1px solid ${detection ? "#FFB30055" : "var(--border-color)"}` }}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-bold" style={{ color: "#FFB300" }}>
              🧠 {TX.detPanel[lang]}
            </span>
            {polyCount > 0 && (
              <button
                onClick={exportOBJ}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "#00E5FF22", border: "1px solid #00E5FF66", color: "#00E5FF" }}
              >
                ⬇ {TX.exportOBJ[lang]}
              </button>
            )}
          </div>

          {detection ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid #FFB30033" }}>
                <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.detType[lang]}</div>
                <div className="text-sm font-bold" style={{ color: "#FFB300" }}>{detection.kind.toUpperCase()}</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid #69F0AE33" }}>
                <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.detConf[lang]}</div>
                <div className="text-sm font-bold" style={{ color: detection.confidence > 70 ? "#69F0AE" : detection.confidence > 55 ? "#FFB300" : "#FF6666" }}>
                  {detection.confidence}%
                </div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid #9C27B033" }}>
                <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.detPolys[lang]}</div>
                <div className="text-sm font-bold font-mono" style={{ color: "#9C27B0" }}>{Math.round(polyCount).toLocaleString()}</div>
              </div>
              <div className="rounded-lg p-3 col-span-2" style={{ background: "var(--bg-card)", border: "1px solid #00E5FF22" }}>
                <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.det3d[lang]}</div>
                <div className="text-sm font-semibold" style={{ color: "#00E5FF" }}>{detection.name3d}</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.detRecur[lang]}</div>
                <div className="text-sm font-bold" style={{ color: "#E8EAF6" }}>{fractalLevel}</div>
              </div>
              <div className="rounded-lg p-3 col-span-full" style={{ background: "#FFB3000D", border: "1px solid #FFB30022" }}>
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{TX.detReason[lang]} </span>
                <span className="text-xs" style={{ color: "#FFB300" }}>{detection.reason}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {lang === "ru"
                ? "Загрузите изображение — ИИ определит тип фрактала и построит соответствующую 3D-модель."
                : "Rasm yuklang — AI fraktal turini aniqlab, mos 3D-model yaratadi."}
            </p>
          )}
        </div>
      )}

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }}
      />

      {/* ── 2D → 3D Pipeline (step-by-step with formulas + pictures) ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #00E5FF44" }}>
        <div className="px-5 py-4" style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-color)" }}>
          <div className="font-bold text-base" style={{ color: "#00E5FF" }}>🔬 {TX.pipeTitle[lang]}</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{TX.pipeHint[lang]}</div>
        </div>
        <div className="p-5 space-y-3" style={{ background: "var(--bg-card)" }}>
          {(() => {
            const detType = detection?.kind ?? "—";
            const gen3dFormula: Record<string, string> = {
              sphere: "circle mask -> SphereGeometry(r)",
              cube: "square mask -> BoxGeometry(w,h,d)",
              sierpinski: "P → ½(P + Vᵢ),  i = 1..4",
              menger: "удаление центр. кубов · 20ⁿ частей",
              koch: "ребро → 4 ребра, затем extrude в 3D",
              pythagoras: "ветвь → 2 ветви · cos(45°)",
              mandelbrot: "z → z⁸ + c  (Mandelbulb SDF, ray-march)",
              octahedron: "chaos game → 6 вершин · ratio ½",
              dodecahedron: "chaos game → 20 вершин · ratio 1/φ",
              icosahedron: "chaos game → 12 вершин · ratio 1/φ",
              cantor: "куб → 8 угловых под-кубов рекурсивно",
              voxel: "пиксель → воксель (высота ∝ яркость)",
            };
            const detName = detection ? (CLASS_LABELS[cnnApiResult?.type ?? ""] ?? detType) : null;
            const steps = [
              { n: 1, color: "#00E5FF", title: "Вход — 2D изображение", io: "вход", formula: "I(x, y) ∈ ℝ^(W×H)", desc: "Загруженная картинка фрактала (PNG / JPG).", out: hasImage ? "✓ изображение загружено" : "ожидание загрузки", canvas: "src", icon: "🖼️" },
              { n: 2, color: "#FFB300", title: "Препроцессинг", io: "обработка", formula: "x' = (x − μ) / σ   ·   resize 128×128 RGB", desc: "Нормализация пикселей + построение карты глубины по яркости.", out: hasImage ? "✓ тензор 3×128×128" : "—", canvas: "depth", icon: "⚙️" },
              { n: 3, color: "#9C27B0", title: "CNN — извлечение признаков", io: "нейросеть", formula: "f = Conv2D×4(x') → AvgPool → f ∈ ℝ²⁵⁶", desc: "4 свёрточных блока (Conv→BN→ReLU→Pool) сжимают картинку в вектор признаков. Слева — карта активаций.", out: "✓ вектор признаков 256-D", canvas: "feat", icon: "🧠" },
              { n: 4, color: "#69F0AE", title: "Классификация", io: "решение", formula: "P(class) = softmax(W·f) = exp(zᵢ) / Σ exp(zⱼ)", desc: "Полносвязный слой → вероятности по 17 классам. Справа — реальные оценки.", out: detName ? `✓ ${detName} — ${detection!.confidence}%` : "нажмите «CNN Анализ»", icon: "🎯", bars: true },
              { n: 5, color: "#FF6E40", title: "Генерация 3D-модели", io: "построение", formula: gen3dFormula[detType] ?? "—", desc: "По типу фрактала выбирается математический 3D-генератор (Three.js).", out: detection ? `✓ ${detection.name3d}` : "ожидание классификации", canvas: "three", icon: "🔮" },
              { n: 6, color: "#E040FB", title: "Выход — 3D mesh", io: "результат", formula: `${Math.round(polyCount).toLocaleString()} полигонов · экспорт .OBJ`, desc: "Готовая трёхмерная модель: вращение, масштаб, скачивание.", out: polyCount > 0 ? "✓ модель построена" : "—", canvas: "three", icon: "📦" },
            ];
            return steps.map((s, i) => (
              <div key={s.n}>
                <div className="rounded-xl flex flex-col sm:flex-row items-stretch gap-4 p-4" style={{ background: "var(--bg-secondary)", border: `1px solid ${s.color}44` }}>
                  {/* Left: number + picture */}
                  <div className="flex items-center gap-3 sm:flex-col sm:gap-2 shrink-0">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: `${s.color}22`, color: s.color, border: `2px solid ${s.color}66` }}>{s.n}</div>
                    <div className="rounded-lg flex items-center justify-center overflow-hidden" style={{ width: 72, height: 72, background: "#060B18", border: `1px solid ${s.color}33` }}>
                      {s.canvas === "src" && hasImage
                        ? <canvas ref={pipeSrcRef} width={68} height={68} style={{ width: 68, height: 68, imageRendering: "pixelated" }} />
                        : s.canvas === "depth" && hasImage
                        ? <canvas ref={pipeDepthRef} width={68} height={68} style={{ width: 68, height: 68, imageRendering: "pixelated" }} />
                        : s.canvas === "feat" && hasImage
                        ? <canvas ref={pipeFeatRef} width={68} height={68} style={{ width: 68, height: 68, imageRendering: "pixelated" }} />
                        : s.canvas === "three" && fractalMode
                        ? <canvas ref={pipe3dRef} width={68} height={68} style={{ width: 68, height: 68 }} />
                        : <span style={{ fontSize: 36 }}>{s.icon}</span>}
                    </div>
                  </div>
                  {/* Right: content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-sm font-bold" style={{ color: s.color }}>{s.title}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: `${s.color}18`, color: s.color }}>{s.io}</span>
                    </div>
                    <div className="rounded-lg px-3 py-2 mb-2 font-mono text-xs" style={{ background: "#0D1526", border: "1px solid #1E3A5F", color: "#E8EAF6" }}>{s.formula}</div>
                    <div className="text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>{s.desc}</div>
                    {/* Step 4: real top-4 probability bars */}
                    {s.bars && cnnApiResult && (
                      <div className="space-y-1 mb-2">
                        {Object.entries(cnnApiResult.all_scores).sort(([, a], [, b]) => b - a).slice(0, 4).map(([cls, sc]) => (
                          <div key={cls} className="flex items-center gap-2">
                            <span className="text-[10px] w-24 shrink-0 truncate" style={{ color: cls === cnnApiResult.type ? "#69F0AE" : "var(--text-secondary)" }}>{CLASS_LABELS[cls] ?? cls}</span>
                            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 5, background: "#1E3A5F" }}>
                              <div className="h-full rounded-full" style={{ width: `${sc}%`, background: cls === cnnApiResult.type ? "#69F0AE" : "#37474F" }} />
                            </div>
                            <span className="text-[10px] w-9 text-right font-mono" style={{ color: cls === cnnApiResult.type ? "#69F0AE" : "#546E7A" }}>{sc.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="text-xs font-semibold" style={{ color: s.out.startsWith("✓") ? "#69F0AE" : "#546E7A" }}>→ {s.out}</div>
                  </div>
                </div>
                {/* Arrow between steps */}
                {i < steps.length - 1 && (
                  <div className="flex justify-center py-1" style={{ color: s.color }}>
                    <span style={{ fontSize: 20 }}>↓</span>
                  </div>
                )}
              </div>
            ));
          })()}
        </div>
      </div>

      {/* ── CNN Architecture steps ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-color)" }}>
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-color)" }}
        >
          <div>
            <div className="font-bold text-base" style={{ color: "var(--accent-amber)" }}>{TX.archTitle[lang]}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{TX.archHint[lang]}</div>
          </div>
        </div>

        {/* Pipeline arrow */}
        <div className="px-5 py-3 overflow-x-auto" style={{ background: "var(--bg-card)" }}>
          <div className="flex items-center gap-1 min-w-max text-xs font-mono" style={{ color: "#546E7A" }}>
            <span style={{ color: "#90A4AE" }}>{TX.pipeline[lang]}</span>
            {["3D Voxel", "Indicator", "Mask", "Conv 1", "Attention", "Conv 2", "FractalConv", "Conv 3", "Pooling", "FC", "Output"].map((s, i, arr) => (
              <span key={s} className="flex items-center gap-1">
                <span className="px-2 py-0.5 rounded text-xs" style={{ background: "#0D1526", border: "1px solid #1E3A5F", color: "#E8EAF6", whiteSpace: "nowrap" }}>{s}</span>
                {i < arr.length - 1 && <span style={{ color: "#1E3A5F" }}>→</span>}
              </span>
            ))}
          </div>
        </div>

        {/* Step grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-0">
          {STEPS.map(step => (
            <div
              key={step.num}
              onClick={() => setActiveStep(activeStep === step.num ? null : step.num)}
              className="p-3 cursor-pointer transition-all"
              style={{
                background: activeStep === step.num ? `${step.color}12` : "var(--bg-secondary)",
                borderRight: "1px solid var(--border-color)",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: `${step.color}22`, color: step.color, border: `1px solid ${step.color}44` }}
                >
                  {step.num}
                </span>
                <span className="text-xs font-semibold" style={{ color: activeStep === step.num ? step.color : "var(--text-primary)" }}>
                  {step.title[lang]}
                </span>
              </div>
              <code className="text-xs" style={{ color: step.color, fontFamily: "monospace", wordBreak: "break-all" }}>
                {step.formula}
              </code>
            </div>
          ))}
        </div>

        {/* Expanded detail */}
        {activeStep !== null && (() => {
          const s = STEPS.find(s => s.num === activeStep)!;
          return (
            <div
              className="px-5 py-4 text-sm leading-relaxed transition-all"
              style={{ background: `${s.color}0A`, borderTop: `1px solid ${s.color}33`, color: "var(--text-secondary)" }}
            >
              <span className="font-bold mr-2" style={{ color: s.color }}>Шаг {s.num}.</span>
              {s.detail[lang]}
            </div>
          );
        })()}
      </div>

    </div>
  );
}
