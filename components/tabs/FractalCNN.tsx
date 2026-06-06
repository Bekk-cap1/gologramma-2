"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { useLang } from "@/components/LanguageContext";

// ─── constants ────────────────────────────────────────────────────────────────
const MESH_RES = 128;

function createWebGLRenderer(params: THREE.WebGLRendererParameters): THREE.WebGLRenderer {
  const originalConsoleError = console.error;
  let mutedWebglMessage: string | null = null;
  console.error = (...args: unknown[]) => {
    const message = args.map(String).join(" ");
    if (message.includes("THREE.WebGLRenderer") && message.includes("WebGL context")) {
      mutedWebglMessage = message;
      return;
    }
    originalConsoleError(...args);
  };

  try {
    return new THREE.WebGLRenderer(params);
  } catch (err) {
    if (mutedWebglMessage) {
      throw new Error(mutedWebglMessage);
    }
    throw err;
  } finally {
    console.error = originalConsoleError;
  }
}

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
  cnnOffline:  { ru: "API недоступен. Запустите: python -m fractal_3d.api_server", uz: "API mavjud emas. Ishga tushiring: python -m fractal_3d.api_server" },
  cnnScores:   { ru: "Оценки классов:", uz: "Sinf ballari:" },
  cnnShowParams: { ru: "Параметры", uz: "Parametrlar" },
  cnnParamsHint: { ru: "Предсказание параметров — обратная задача, точность низкая. Классификация надёжнее.", uz: "Parametrlarni bashorat qilish — teskari masala, aniqligi past." },
  // Step-by-step reconstruction panel
  stepsTitle:   { ru: "🔬 Пошаговая реконструкция (4 слоя)", uz: "🔬 Bosqichma-bosqich rekonstruksiya (4 qatlam)" },
  stepsBtn:     { ru: "▶ Запустить разбор", uz: "▶ Tahlilni boshlash" },
  stepsLoading: { ru: "Анализирую слои...", uz: "Qatlamlar tahlil qilinmoqda..." },
  stepsOffline: { ru: "API недоступен. Запустите: python -m fractal_3d.api_server", uz: "API mavjud emas. Ishga tushiring: python -m fractal_3d.api_server" },
  finalVerdict: { ru: "Итоговое решение", uz: "Yakuniy qaror" },
  depthTitle:   { ru: "Карта глубины (из бэкенда)", uz: "Chuqurlik xaritasi" },
  escParams:    { ru: "Параметры escape", uz: "Escape parametrlari" },
  escSsim:      { ru: "SSIM к эталону", uz: "Etalonga SSIM" },
  escMethod:    { ru: "Метод", uz: "Usul" },
  escView:      { ru: "Вид (zoom/центр)", uz: "Ko'rinish (zoom/markaz)" },
  layerLbl:     { ru: "Слой", uz: "Qatlam" },
  build3dBtn:   { ru: "🔮 Построить реальный 3D меш", uz: "🔮 Haqiqiy 3D mesh qurish" },
  build3dLoad:  { ru: "Реконструирую меш на бэкенде...", uz: "Backendda mesh rekonstruksiya qilinmoqda..." },
  build3dTpl:   { ru: "Шаблон (быстро)", uz: "Shablon (tez)" },
  build3dHint:  { ru: "Финальный шаг: строит 3D объект ниже из самого изображения (IFS/глубина → marching cubes)", uz: "Yakuniy bosqich: 3D obyekt rasmning o'zidan quriladi (IFS/chuqurlik → marching cubes)" },
  build3dLow:   { ru: "⚠ Низкая уверенность — будет построена приблизительная модель", uz: "⚠ Past ishonch — taxminiy model quriladi" },
  meshBackend:  { ru: "✅ реальный меш из бэкенда", uz: "✅ backenddan haqiqiy mesh" },
  meshTemplate: { ru: "▢ шаблонный генератор", uz: "▢ shablon generatori" },
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
  // ── stage-5: tie-break / recovery / pose / generation ──────────────────────
  tbTitle:       { ru: "Тай-брейк: геометрия переопределила CNN", uz: "Tay-brek: geometriya CNN ni qayta belgiladi" },
  tbReason:      { ru: "Причина", uz: "Sabab" },
  tbCnnThought:  { ru: "CNN считал", uz: "CNN deb hisobladi" },
  tbGeoDecided:  { ru: "Геометрия решила", uz: "Geometriya qaror qildi" },
  recCanonical:  { ru: "📐 Каноничная IFS", uz: "📐 Kanonik IFS" },
  recBlind:      { ru: "🔍 Blind Recovery", uz: "🔍 Blind Recovery" },
  recSkipped:    { ru: "⏭ IFS пропущен", uz: "⏭ IFS o'tkazildi" },
  poseTitle:     { ru: "Подгонка позы", uz: "Poza moslash" },
  poseScale:     { ru: "Масштаб", uz: "Masshtab" },
  poseAngle:     { ru: "Поворот", uz: "Burilish" },
  poseShift:     { ru: "Сдвиг", uz: "Siljish" },
  poseFit:       { ru: "IoU подгонки", uz: "IoU mosligi" },
  theoDim:       { ru: "Теоретич. D", uz: "Nazariy D" },
  transformsLbl: { ru: "Преобразования (матрицы)", uz: "Almashtirishlar (matritsalar)" },
  showAll:       { ru: "показать все", uz: "barchasini ko'rsatish" },
  collapse:      { ru: "свернуть", uz: "yig'ish" },
  evidenceLbl:   { ru: "Доказательства", uz: "Dalillar" },
  moreN:         { ru: "ещё", uz: "yana" },
  genMethodLbl:  { ru: "Метод генерации", uz: "Yaratish usuli" },
  genChaos:      { ru: "Chaos Game (100K точек)", uz: "Chaos Game (100K nuqta)" },
  genBoundary:   { ru: "Рекурсивная граница + extrusion", uz: "Rekursiv chegara + extrusion" },
  genEscape:     { ru: "Escape-time карта глубины", uz: "Escape-time chuqurlik xaritasi" },
  recMethodLbl:  { ru: "Метод восстановления", uz: "Tiklash usuli" },
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

// ─── Step-by-step reconstruction API types ────────────────────────────────────
interface StepMetric {
  label: { ru: string; uz: string };
  value: string;
}
interface IFSTransform {
  matrix: number[][];        // 2×2 linear part
  translation: number[];     // 2-vector
  probability: number;
}
interface IFSPose {
  scale: number;
  angle_deg: number;
  tx: number;
  ty: number;
  fit_score: number;
}
interface StepImage {
  id: string;
  title: string;
  description?: string;
  data: string;
}
interface PipelineStep {
  id: string;
  layer: number;
  title: { ru: string; uz: string };
  confidence: number;
  hint: string;
  metrics: StepMetric[];
  // ── stage-5 extras (present only on specific cards) ───────────────────────
  recovery_method?: string;            // ifs_recovery card
  theoretical_dimension?: number | null;
  transforms?: IFSTransform[];
  pose?: IFSPose;
  tiebreak_applied?: boolean;          // tiebreak card
  evidence?: string[];
  images?: StepImage[];
  formula?: string;
}
interface AnalyzeStepsResponse {
  final: {
    type: string;
    type_3d: string;
    category: string;
    confidence: number;
    is_escape_time: boolean;
    fractal_dimension: number;
    low_confidence: boolean;
    agreement: number;
    // ── stage-5 extras ────────────────────────────────────────────────────
    recovery_method?: string;
    theoretical_dimension?: number | null;
    generation_method?: string;
    tiebreak_applied?: boolean;
    tiebreak_reason?: string | null;
    cnn_original_class?: string;
    pose_fit_score?: number | null;
    // ── stage-10: neural depth routing ───────────────────────────────────────
    depth_method?: string;
    photo_detection?: { is_photo: boolean; confidence: number; evidence?: string[] } | null;
    depth_routing_reason?: string | null;
  };
  depth_image: string;
  escape_params?: EscapeParams | null;
  steps: PipelineStep[];
}

interface EscapeParams {
  c_real: number;
  c_imag: number;
  center_x: number;
  center_y: number;
  zoom: number;
  similarity: number;
  optimization_method: string;
  search_log?: Record<string, number | number[] | boolean>;
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
function StepImages({ images }: { images: StepImage[] }) {
  if (!images || images.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      {images.map((img) => (
        <div key={img.id} className="rounded-lg p-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
          <div className="text-xs font-semibold mb-1" style={{ color: "#06b6d4" }}>{img.title}</div>
          <img src={img.data} alt={img.title} className="w-full rounded" style={{ imageRendering: "auto", border: "1px solid var(--border-color)" }} />
          {img.description && <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{img.description}</div>}
        </div>
      ))}
    </div>
  );
}

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

// ─── Display-settings types + presets ─────────────────────────────────────────
interface PipelineSettings {
  showBoxCounting: boolean; showIFS: boolean; showFourier: boolean;
  showLacunarity: boolean; showMultifractal: boolean; showCNN: boolean;
  showEnsemble: boolean; showTiebreak: boolean; showDepthSteps: boolean;
  showVerification: boolean;
  showPipeline: boolean; showArchitecture: boolean; generateImages: boolean;
}
const ALL_ON: PipelineSettings = { showBoxCounting:false, showIFS:false, showFourier:false, showLacunarity:false, showMultifractal:false, showCNN:true, showEnsemble:false, showTiebreak:false, showDepthSteps:true, showVerification:false, showPipeline:false, showArchitecture:false, generateImages:false };
const MINIMAL: PipelineSettings = { showBoxCounting:false, showIFS:false, showFourier:false, showLacunarity:false, showMultifractal:false, showCNN:false, showEnsemble:false, showTiebreak:false, showDepthSteps:true, showVerification:false, showPipeline:false, showArchitecture:false, generateImages:false };
const MATH_ONLY: PipelineSettings = { showBoxCounting:true, showIFS:true, showFourier:true, showLacunarity:true, showMultifractal:true, showCNN:false, showEnsemble:false, showTiebreak:false, showDepthSteps:false, showVerification:false, showPipeline:false, showArchitecture:false, generateImages:true };

// ─── Toggle presentational component ─────────────────────────────────────────
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none text-xs"
      style={{ color: checked ? "var(--text-primary)" : "var(--text-secondary)" }}>
      <input
        type="checkbox"
        className="accent-cyan-500"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

// ─── Step visibility map ──────────────────────────────────────────────────────
const STEP_VISIBLE: Record<string, (s: PipelineSettings) => boolean> = {
  box_counting:  s => s.showBoxCounting,
  ifs_recovery:  s => s.showIFS,
  fourier:       s => s.showFourier,
  lacunarity:    s => s.showLacunarity,
  multifractal:  s => s.showMultifractal,
  cnn:           s => s.showCNN,
  fusion:        s => s.showEnsemble,
  tiebreak:      s => s.showTiebreak,
  depth:         s => s.showDepthSteps,
  verification:  s => s.showVerification,
};

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
  const [steps, setSteps]                 = useState<AnalyzeStepsResponse | null>(null);
  const [stepsLoading, setStepsLoading]   = useState(false);
  const [stepsError, setStepsError]       = useState<string | null>(null);
  const [revealedSteps, setRevealedSteps] = useState(0);
  const [showAllTransforms, setShowAllTransforms] = useState(false);
  const [showAllEvidence, setShowAllEvidence]     = useState(false);
  const [build3dLoading, setBuild3dLoading] = useState(false);
  const [meshSource, setMeshSource]         = useState<"backend" | "template" | null>(null);
  const [settings, setSettings]             = useState<PipelineSettings>(ALL_ON);
  const [settingsOpen, setSettingsOpen]     = useState(false);
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null);
  const [webglError, setWebglError]         = useState<string | null>(null);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const srcCanvasRef   = useRef<HTMLCanvasElement>(null);
  // Full-resolution (<=1024) copy of the upload — used for the crisp preview and
  // for what we send to the backend (srcCanvasRef stays 128px for the local mesh).
  const hiResCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
  // Real backend-reconstructed mesh (from /reconstruct OBJ). When set + enabled,
  // rebuildFractal renders THIS geometry instead of a client-side template.
  const backendGeoRef    = useRef<THREE.BufferGeometry | null>(null);
  const useBackendMeshRef = useRef(false);

  // ── Three.js initialisation (runs once) ─────────────────────────────────────
  useEffect(() => {
    const canvas = threeCanvasRef.current;
    if (!canvas) return;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(rafRef.current);
      setWebglError("WebGL context lost. Reload this tab or close other 3D/browser GPU-heavy pages.");
    };
    const handleContextRestored = () => {
      setWebglError(null);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createWebGLRenderer({ canvas, antialias: true });
    } catch (err) {
      window.setTimeout(() => {
        setWebglError(err instanceof Error ? err.message : "WebGL renderer could not be created.");
      }, 0);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      return;
    }
    setWebglError(null);
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
      try {
        renderer.render(scene, camera);
      } catch (err) {
        cancelAnimationFrame(rafRef.current);
        setWebglError(err instanceof Error ? err.message : "WebGL render failed.");
      }
    };
    tick();

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      rendererRef.current = null;
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
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

    // High-resolution copy (<=1024, aspect preserved) for the preview + backend.
    const HIRES_MAX = 1024;
    const iw = img.naturalWidth || img.width || MESH_RES;
    const ih = img.naturalHeight || img.height || MESH_RES;
    const scale = Math.min(1, HIRES_MAX / Math.max(iw, ih));
    if (!hiResCanvasRef.current) hiResCanvasRef.current = document.createElement("canvas");
    const hi = hiResCanvasRef.current;
    hi.width = Math.max(1, Math.round(iw * scale));
    hi.height = Math.max(1, Math.round(ih * scale));
    hi.getContext("2d")!.drawImage(img, 0, 0, hi.width, hi.height);

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

    // ── Priority: real mesh reconstructed by the Python backend (no template) ──
    if (useBackendMeshRef.current && backendGeoRef.current) {
      isMandelbulbRef.current = false;
      mandelbulbUniformsRef.current = null;
      const bgeo = backendGeoRef.current.clone();  // clone so future rebuilds don't dispose the source
      const bmat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide, wireframe: wireframeRef.current });
      const bmesh = new THREE.Mesh(bgeo, bmat);
      scene.add(bmesh);
      meshRef.current = bmesh;
      orbit.current.radius = 4.5;
      orbit.current.phi    = 0.4;
      setPolyCount(bgeo.attributes.position.count / 3);
      return;
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
    useBackendMeshRef.current = false; backendGeoRef.current = null; setMeshSource(null);
    setSteps(null); setStepsError(null); setRevealedSteps(0);
    setCnnApiResult(null);
    setCnnError(null);
    const url = URL.createObjectURL(file);
    // Keep the object URL alive so the preview shows the ORIGINAL (full-res) image.
    setPreviewUrl((prev) => { if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev); return url; });
    const img = new Image();
    img.onload = () => { processImage(img); };
    img.src = url;
  }, [processImage]);

  const loadSample = useCallback((type: SampleType) => {
    forcedKindRef.current = null;
    useBackendMeshRef.current = false; backendGeoRef.current = null; setMeshSource(null);
    setSteps(null); setStepsError(null); setRevealedSteps(0);
    setCnnApiResult(null);
    setCnnError(null);
    const off = document.createElement("canvas");
    off.width = MESH_RES; off.height = MESH_RES;
    drawSample(off, type);
    const dataUrl = off.toDataURL();
    setPreviewUrl((prev) => { if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev); return dataUrl; });
    const img = new Image();
    img.onload = () => processImage(img);
    img.src = dataUrl;
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
      const b64 = (hiResCanvasRef.current ?? src).toDataURL("image/png").split(",")[1];
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

  // ── Step-by-step reconstruction (4-layer pipeline) ──────────────────────────
  const runSteps = useCallback(async () => {
    const src = srcCanvasRef.current;
    if (!src) return;
    setStepsLoading(true);
    setStepsError(null);
    setSteps(null);
    setRevealedSteps(0);
    try {
      const b64 = (hiResCanvasRef.current ?? src).toDataURL("image/png").split(",")[1];
      const res = await fetch("http://localhost:8000/analyze_steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, generate_images: settings.generateImages }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AnalyzeStepsResponse = await res.json();
      setSteps(data);
      // Staggered reveal animation
      let n = 0;
      const total = data.steps.length;
      const timer = setInterval(() => {
        n += 1;
        setRevealedSteps(n);
        if (n >= total) clearInterval(timer);
      }, 250);
    } catch {
      setStepsError("offline");
    } finally {
      setStepsLoading(false);
    }
  }, [settings]);

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
    useBackendMeshRef.current = false; backendGeoRef.current = null; setMeshSource("template");
    if (fractalMode) {
      rebuildFractal();
    } else {
      setFractalMode(true);
    }
  }, [cnnApiResult, fractalMode, rebuildFractal]);

  // Build the 3D model from the step-by-step pipeline verdict.
  // Primary path: fetch the REAL mesh reconstructed by the backend (/reconstruct,
  // built from the image's IFS transforms / depth map — NOT a class template).
  // Fallback: if the backend is unreachable or returns no mesh, use the client-side
  // template generator. Always builds — even on low_confidence (best-effort, per TZ).
  const buildTemplate = useCallback(() => {
    if (!steps) return;
    useBackendMeshRef.current = false;
    backendGeoRef.current = null;
    forcedKindRef.current = apiTypeToKind(steps.final.type);
    setMeshSource("template");
    if (fractalMode) rebuildFractal();
    else setFractalMode(true);
  }, [steps, fractalMode, rebuildFractal]);

  const applyStepsTo3D = useCallback(async () => {
    if (!steps) return;
    const src = srcCanvasRef.current;
    setBuild3dLoading(true);
    try {
      if (!src) throw new Error("no canvas");
      const b64 = (hiResCanvasRef.current ?? src).toDataURL("image/png").split(",")[1];
      const res = await fetch("http://localhost:8000/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, quality: "fast" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { obj_file?: string } = await res.json();
      if (!data.obj_file) throw new Error("no obj");

      const objText = atob(data.obj_file);
      const group = new OBJLoader().parse(objText);
      let geo: THREE.BufferGeometry | null = null;
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!geo && m.isMesh && (m.geometry as THREE.BufferGeometry)?.attributes?.position) {
          geo = m.geometry as THREE.BufferGeometry;
        }
      });
      if (!geo) throw new Error("empty mesh");

      // recenter + normalise scale so it fits the orbit camera, recompute normals for shading
      const g: THREE.BufferGeometry = geo;
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const center = new THREE.Vector3();
      bb.getCenter(center);
      g.translate(-center.x, -center.y, -center.z);
      const size = new THREE.Vector3();
      bb.getSize(size);
      const maxd = Math.max(size.x, size.y, size.z) || 1;
      const s = 3.2 / maxd;
      g.scale(s, s, s);
      g.computeVertexNormals();

      backendGeoRef.current = g;
      useBackendMeshRef.current = true;
      setMeshSource("backend");
      setDetection({
        kind: apiTypeToKind(steps.final.type),
        name3d: steps.final.type_3d,
        confidence: Math.round(steps.final.confidence),
        reason: "Backend reconstruction (real mesh from image)",
      });
      if (fractalMode) rebuildFractal();
      else setFractalMode(true);
    } catch {
      // backend unavailable → graceful fallback to template generator
      buildTemplate();
    } finally {
      setBuild3dLoading(false);
    }
  }, [steps, fractalMode, rebuildFractal, buildTemplate]);

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

      {/* ── Display settings panel ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-color)", background: "var(--bg-card)" }}>
        <button
          onClick={() => setSettingsOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-all"
          style={{ color: "var(--text-primary)", background: "var(--bg-card)" }}
        >
          <span>⚙️ Настройки отображения</span>
          <span style={{ color: "var(--text-secondary)" }}>{settingsOpen ? "▲" : "▼"}</span>
        </button>
        {settingsOpen && (
          <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid var(--border-color)" }}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-3">
              <Toggle label="Box-counting"        checked={settings.showBoxCounting}  onChange={v => setSettings(s => ({ ...s, showBoxCounting: v }))} />
              <Toggle label="IFS recovery"        checked={settings.showIFS}          onChange={v => setSettings(s => ({ ...s, showIFS: v }))} />
              <Toggle label="Фурье-спектр"        checked={settings.showFourier}      onChange={v => setSettings(s => ({ ...s, showFourier: v }))} />
              <Toggle label="Лакунарность"        checked={settings.showLacunarity}   onChange={v => setSettings(s => ({ ...s, showLacunarity: v }))} />
              <Toggle label="Мультифрактал"       checked={settings.showMultifractal} onChange={v => setSettings(s => ({ ...s, showMultifractal: v }))} />
              <Toggle label="CNN"                 checked={settings.showCNN}          onChange={v => setSettings(s => ({ ...s, showCNN: v }))} />
              <Toggle label="Ансамбль"            checked={settings.showEnsemble}     onChange={v => setSettings(s => ({ ...s, showEnsemble: v }))} />
              <Toggle label="Тай-брейк"           checked={settings.showTiebreak}     onChange={v => setSettings(s => ({ ...s, showTiebreak: v }))} />
              <Toggle label="Карта глубины"       checked={settings.showDepthSteps}   onChange={v => setSettings(s => ({ ...s, showDepthSteps: v }))} />
              <Toggle label="Верификация"         checked={settings.showVerification} onChange={v => setSettings(s => ({ ...s, showVerification: v }))} />
              <Toggle label="Пайплайн 2D→3D"      checked={settings.showPipeline}     onChange={v => setSettings(s => ({ ...s, showPipeline: v }))} />
              <Toggle label="Архитектура CNN"     checked={settings.showArchitecture} onChange={v => setSettings(s => ({ ...s, showArchitecture: v }))} />
              <Toggle label="Промежут. картинки"  checked={settings.generateImages}   onChange={v => setSettings(s => ({ ...s, generateImages: v }))} />
            </div>
            <div className="flex gap-2 flex-wrap pt-1">
              <button
                onClick={() => setSettings(ALL_ON)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "#00E5FF22", border: "1px solid #00E5FF66", color: "#00E5FF" }}
              >Показать всё</button>
              <button
                onClick={() => setSettings(MINIMAL)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}
              >Минимум</button>
              <button
                onClick={() => setSettings(MATH_ONLY)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "#FFB30022", border: "1px solid #FFB30066", color: "#FFB300" }}
              >Только математика</button>
            </div>
          </div>
        )}
      </div>

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
          {/* Crisp preview = the ORIGINAL upload (not the 128px mesh canvas). */}
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={TX.sourceImg[lang]}
              style={{ display: "block", width: 160, height: 160, objectFit: "contain",
                       imageRendering: "auto", borderRadius: 6, background: "#000" }}
            />
          )}
          {/* 128px canvas kept mounted (hidden) — feeds the local depth heightmap mesh. */}
          <canvas ref={srcCanvasRef} style={{ display: "none" }} />
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
              onChange={e => {
                const v = parseFloat(e.target.value);
                setDepthScale(v);
                depthScaleRef.current = v;
                const src = srcCanvasRef.current;
                if (depthDataRef.current && src && !fractalModeRef.current) {
                  rebuildMesh(depthDataRef.current, v, src);
                }
              }}
              className="w-full" style={{ accentColor: "#00E5FF" }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-secondary)" }}>
              {TX.smoothing[lang]}: <span style={{ color: "#00E5FF" }}>{smoothing}</span>
            </label>
            <input type="range" min={0} max={8} step={1} value={smoothing}
              onChange={e => {
                const v = parseInt(e.target.value);
                setSmoothing(v);
                const src = srcCanvasRef.current;
                if (!src || !hasImage) return;
                const sCtx = src.getContext("2d");
                if (!sCtx) return;
                const imgData = sCtx.getImageData(0, 0, MESH_RES, MESH_RES);
                const depth = buildDepth(imgData, v);
                depthDataRef.current = depth;
                if (depthCanvasRef.current) paintDepthCanvas(depthCanvasRef.current, depth);
                rebuildMesh(depth, depthScaleRef.current, src);
              }}
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

      {/* ── Step-by-step Reconstruction Panel ── */}
      {hasImage && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: "var(--bg-secondary)", border: "1px solid #00E5FF44" }}
        >
          {/* Header + Run button */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold" style={{ color: "#00E5FF" }}>
              {TX.stepsTitle[lang]}
              <span className="ml-2 text-xs font-normal" style={{ color: "#546E7A" }}>
                (Python API · localhost:8000)
              </span>
            </span>
            <button
              onClick={runSteps}
              disabled={stepsLoading}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all ml-auto"
              style={{
                background: stepsLoading ? "#1E3A5F" : "#00E5FF22",
                border: "1px solid #00E5FF88",
                color: stepsLoading ? "#546E7A" : "#00E5FF",
                cursor: stepsLoading ? "wait" : "pointer",
              }}
            >
              {stepsLoading ? TX.stepsLoading[lang] : TX.stepsBtn[lang]}
            </button>
          </div>

          {/* Error state */}
          {stepsError && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#FF000011", border: "1px solid #FF444444", color: "#FF6666" }}>
              {TX.stepsOffline[lang]}
            </div>
          )}

          {/* Final verdict + depth + timeline */}
          {steps && !stepsError && (
            <div className="space-y-3">
              {/* Final verdict card */}
              <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid #69F0AE44" }}>
                <div className="text-xs font-semibold mb-2 flex items-center gap-2" style={{ color: "#69F0AE" }}>
                  ✅ {TX.finalVerdict[lang]}
                  {steps.final.low_confidence && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: "#FFB30022", color: "#FFB300", border: "1px solid #FFB30066" }}>
                      ⚠ low confidence
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>3D</div>
                    <div className="font-bold" style={{ color: "#00E5FF" }}>{steps.final.type_3d}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>type</div>
                    <div className="font-bold" style={{ color: "#E8EAF6" }}>{steps.final.type}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>confidence</div>
                    <div className="font-bold" style={{ color: steps.final.confidence > 80 ? "#69F0AE" : steps.final.confidence > 60 ? "#FFB300" : "#FF6666" }}>
                      {steps.final.confidence.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>category</div>
                    <div className="font-semibold" style={{ color: "#9C27B0" }}>{steps.final.category}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>fractal_dim</div>
                    <div className="font-mono font-semibold" style={{ color: "#FFB300" }}>{steps.final.fractal_dimension.toFixed(3)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>escape-time</div>
                    <div className="font-semibold" style={{ color: steps.final.is_escape_time ? "#69F0AE" : "#546E7A" }}>
                      {steps.final.is_escape_time ? "yes" : "no"}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>agreement</div>
                    <div className="font-mono font-semibold" style={{ color: "#00E5FF" }}>{steps.final.agreement.toFixed(0)}%</div>
                  </div>
                </div>

                {/* Neural depth routing notice (photo / non-fractal → DCNF CRF) */}
                {steps.final.photo_detection?.is_photo && (
                  <div className="rounded-lg p-2 mt-3 text-xs" style={{ background: "#78350F33", border: "1px solid #D97706" }}>
                    📷 {lang === "ru"
                      ? "Обнаружено фото / природный объект → Neural Depth (DCNF CRF)"
                      : "Foto / tabiiy obyekt aniqlandi → Neural Depth (DCNF CRF)"}
                    {steps.final.depth_routing_reason && (
                      <span className="ml-2" style={{ color: "#FBBF24" }}>{steps.final.depth_routing_reason}</span>
                    )}
                  </div>
                )}

                {/* Recovery-method + generation badges */}
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {steps.final.recovery_method && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        background: steps.final.recovery_method === "canonical_fitted" ? "#00E5FF22"
                          : steps.final.recovery_method === "full_affine" ? "#9C27B022" : "#37474F44",
                        color: steps.final.recovery_method === "canonical_fitted" ? "#00E5FF"
                          : steps.final.recovery_method === "full_affine" ? "#CE93D8" : "#90A4AE",
                        border: `1px solid ${steps.final.recovery_method === "canonical_fitted" ? "#00E5FF66"
                          : steps.final.recovery_method === "full_affine" ? "#9C27B066" : "#546E7A55"}`,
                      }}>
                      {steps.final.recovery_method === "canonical_fitted" ? TX.recCanonical[lang]
                        : steps.final.recovery_method === "full_affine" ? TX.recBlind[lang]
                        : TX.recSkipped[lang]}
                    </span>
                  )}
                  {steps.final.generation_method && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: "#1E3A5F", color: "#90CAF9", border: "1px solid #2E4A6F" }}>
                      {steps.final.generation_method === "recursive_boundary" ? TX.genBoundary[lang]
                        : steps.final.generation_method === "escape_depth" ? TX.genEscape[lang]
                        : TX.genChaos[lang]}
                    </span>
                  )}
                </div>

                {/* Tie-break plaque (amber) — geometry overrode the CNN */}
                {steps.final.tiebreak_applied && (
                  <div className="rounded-lg px-3 py-2 mt-3 text-xs"
                    style={{ background: "#F59E0B14", border: "1px solid #F59E0B66" }}>
                    <div className="font-bold mb-1" style={{ color: "#F59E0B" }}>
                      🔄 {TX.tbTitle[lang]}
                    </div>
                    {steps.final.tiebreak_reason && (
                      <div className="mb-0.5" style={{ color: "#E8EAF6" }}>
                        <span style={{ color: "var(--text-secondary)" }}>{TX.tbReason[lang]}: </span>
                        {steps.final.tiebreak_reason}
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap font-mono">
                      {steps.final.cnn_original_class && (
                        <span style={{ color: "#90A4AE" }}>
                          {TX.tbCnnThought[lang]}: <span style={{ color: "#FF8A65" }}>{steps.final.cnn_original_class}</span>
                        </span>
                      )}
                      <span style={{ color: "#546E7A" }}>→</span>
                      <span style={{ color: "#90A4AE" }}>
                        {TX.tbGeoDecided[lang]}: <span style={{ color: "#69F0AE" }}>{steps.final.type}</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Final step → actually build the 3D object from the verdict */}
                <div className="mt-3 pt-3 flex flex-col gap-1.5" style={{ borderTop: "1px solid var(--border-color)" }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={applyStepsTo3D}
                      disabled={build3dLoading}
                      className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                      style={{
                        background: build3dLoading ? "#1E3A5F" : "#00E5FF22",
                        border: "1px solid #00E5FF88",
                        color: build3dLoading ? "#546E7A" : "#00E5FF",
                        cursor: build3dLoading ? "wait" : "pointer",
                      }}
                    >
                      {build3dLoading ? TX.build3dLoad[lang] : `${TX.build3dBtn[lang]} → ${steps.final.type_3d}`}
                    </button>
                    <button
                      onClick={buildTemplate}
                      disabled={build3dLoading}
                      className="px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", color: "var(--text-secondary)", cursor: build3dLoading ? "wait" : "pointer" }}
                    >
                      {TX.build3dTpl[lang]}
                    </button>
                    {meshSource && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: meshSource === "backend" ? "#69F0AE22" : "#1E3A5F",
                          color: meshSource === "backend" ? "#69F0AE" : "#90A4AE",
                          border: `1px solid ${meshSource === "backend" ? "#69F0AE66" : "var(--border-color)"}`,
                        }}>
                        {meshSource === "backend" ? TX.meshBackend[lang] : TX.meshTemplate[lang]}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{TX.build3dHint[lang]}</span>
                  {steps.final.low_confidence && (
                    <span className="text-[11px] font-semibold" style={{ color: "#FFB300" }}>{TX.build3dLow[lang]}</span>
                  )}
                </div>
              </div>

              {/* Depth map from backend */}
              {steps.depth_image && (
                <div className="rounded-lg p-3 flex flex-col items-center" style={{ background: "var(--bg-card)", border: "1px solid #FFB30033" }}>
                  <div className="text-xs font-semibold mb-2 self-start" style={{ color: "var(--text-secondary)" }}>{TX.depthTitle[lang]}</div>
                  <img
                    src={"data:image/png;base64," + steps.depth_image}
                    alt={TX.depthTitle[lang]}
                    style={{ height: 160, width: "auto", imageRendering: "pixelated", borderRadius: 8, border: "1px solid #FFB30044" }}
                  />
                  {/* Escape-time params: estimated Julia c + search diagnostics
                      (only present for escape-time fractals). */}
                  {steps.escape_params && (
                    <div className="mt-3 w-full rounded-lg p-3 text-xs space-y-1"
                      style={{ background: "#00E5FF0D", border: "1px solid #00E5FF22" }}>
                      <div className="font-semibold mb-1" style={{ color: "#00E5FF" }}>{TX.escParams[lang]}</div>
                      <div className="font-mono" style={{ color: "#E8EAF6" }}>
                        c = ({steps.escape_params.c_real >= 0 ? "" : "−"}{Math.abs(steps.escape_params.c_real).toFixed(4)}
                        {steps.escape_params.c_imag >= 0 ? " + " : " − "}{Math.abs(steps.escape_params.c_imag).toFixed(4)}i)
                      </div>
                      <div style={{ color: "var(--text-secondary)" }}>
                        {TX.escSsim[lang]}: <span className="font-mono" style={{ color: steps.escape_params.similarity > 0.5 ? "#69F0AE" : "#FFB300" }}>
                          {steps.escape_params.similarity.toFixed(3)}
                        </span>
                      </div>
                      <div style={{ color: "var(--text-secondary)" }}>
                        {TX.escMethod[lang]}: <span style={{ color: "#90A4AE" }}>{steps.escape_params.optimization_method}</span>
                      </div>
                      {(steps.escape_params.zoom !== 1 || steps.escape_params.center_x !== 0 || steps.escape_params.center_y !== 0) && (
                        <div className="font-mono" style={{ color: "var(--text-secondary)" }}>
                          {TX.escView[lang]}: zoom {steps.escape_params.zoom.toFixed(2)}, c=({steps.escape_params.center_x.toFixed(2)}, {steps.escape_params.center_y.toFixed(2)})
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step timeline */}
              <div className="space-y-2">
                {steps.steps.slice(0, revealedSteps).filter(st => (STEP_VISIBLE[st.id]?.(settings)) ?? true).map((step, i) => {
                  const layerColor = step.layer === 1 ? "#00E5FF" : step.layer === 2 ? "#9C27B0" : step.layer === 3 ? "#FFB300" : "#69F0AE";
                  const confColor  = step.confidence > 80 ? "#69F0AE" : step.confidence > 60 ? "#FFB300" : "#FF6666";
                  // Tie-break card: orange frame if it changed the decision, green if it confirmed.
                  const isTiebreak = step.id === "tiebreak";
                  const tbColor = step.tiebreak_applied ? "#F59E0B" : "#10B981";
                  return (
                    <div
                      key={step.id}
                      className="rounded-lg p-3 transition-all duration-300"
                      style={{
                        background: "var(--bg-card)",
                        borderLeft: `3px solid ${layerColor}`,
                        border: `1px solid ${isTiebreak ? tbColor + "88" : "var(--border-color)"}`,
                        borderLeftWidth: 3,
                        borderLeftColor: layerColor,
                        opacity: 1,
                        transform: "translateY(0)",
                      }}
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="flex items-center justify-center rounded-full text-[10px] font-bold shrink-0"
                          style={{ width: 20, height: 20, background: layerColor + "22", color: layerColor, border: `1px solid ${layerColor}66` }}>
                          {i + 1}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: layerColor + "22", color: layerColor, border: `1px solid ${layerColor}66` }}>
                          {TX.layerLbl[lang]} {step.layer}
                        </span>
                        <span className="text-sm font-bold" style={{ color: "#E8EAF6" }}>{step.title[lang]}</span>
                        <span className="text-xs font-mono font-bold ml-auto" style={{ color: confColor }}>
                          {step.confidence.toFixed(1)}%
                        </span>
                      </div>

                      {/* Confidence mini-bar */}
                      <div className="rounded-full overflow-hidden mb-2" style={{ height: 5, background: "#1E3A5F" }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(0, Math.min(100, step.confidence))}%`, background: confColor }}
                        />
                      </div>

                      {/* Hint chip */}
                      {step.hint && (
                        <div className="inline-block px-2 py-0.5 rounded-full text-[10px] mb-2"
                          style={{ background: "#1E3A5F", color: "var(--text-secondary)" }}>
                          {step.hint}
                        </div>
                      )}

                      {/* Metrics grid */}
                      {step.metrics.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          {step.metrics.map((m, mi) => (
                            <div key={mi} className="flex items-baseline gap-1 min-w-0">
                              <span className="shrink-0" style={{ color: "var(--text-secondary)" }}>{m.label[lang]}:</span>
                              <span className="font-mono font-semibold truncate" style={{ color: "#E8EAF6" }}>{m.value}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* IFS recovery: pose-fitting sub-box */}
                      {step.pose && (
                        <div className="rounded-lg px-3 py-2 mt-2 text-xs" style={{ background: "#00E5FF0D", border: "1px solid #00E5FF33" }}>
                          <div className="font-semibold mb-1" style={{ color: "#00E5FF" }}>{TX.poseTitle[lang]}</div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
                            <div><span style={{ color: "var(--text-secondary)" }}>{TX.poseScale[lang]}: </span><span style={{ color: "#E8EAF6" }}>{step.pose.scale.toFixed(2)}</span></div>
                            <div><span style={{ color: "var(--text-secondary)" }}>{TX.poseAngle[lang]}: </span><span style={{ color: "#E8EAF6" }}>{step.pose.angle_deg.toFixed(1)}°</span></div>
                            <div><span style={{ color: "var(--text-secondary)" }}>{TX.poseShift[lang]}: </span><span style={{ color: "#E8EAF6" }}>({step.pose.tx.toFixed(2)}, {step.pose.ty.toFixed(2)})</span></div>
                            <div><span style={{ color: "var(--text-secondary)" }}>{TX.poseFit[lang]}: </span><span style={{ color: "#69F0AE" }}>{step.pose.fit_score.toFixed(2)}</span></div>
                          </div>
                        </div>
                      )}

                      {/* IFS recovery: collapsible transform matrices */}
                      {step.transforms && step.transforms.length > 0 && (
                        <div className="mt-2 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{TX.transformsLbl[lang]}</span>
                            {step.transforms.length > 4 && (
                              <button onClick={() => setShowAllTransforms(v => !v)}
                                className="text-[10px] px-2 py-0.5 rounded-full"
                                style={{ background: "#1E3A5F", color: "#00E5FF", border: "1px solid #00E5FF44" }}>
                                {showAllTransforms ? TX.collapse[lang] : `${TX.showAll[lang]} (${step.transforms.length})`}
                              </button>
                            )}
                          </div>
                          <div className="space-y-0.5 font-mono" style={{ color: "#90CAF9" }}>
                            {(showAllTransforms ? step.transforms : step.transforms.slice(0, 4)).map((t, ti) => (
                              <div key={ti} className="truncate">
                                T{ti + 1}: [[{t.matrix[0][0]}, {t.matrix[0][1]}], [{t.matrix[1][0]}, {t.matrix[1][1]}]] + [{t.translation[0]}, {t.translation[1]}]
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tie-break: evidence list (max 5, "ещё N") */}
                      {step.evidence && step.evidence.length > 0 && (
                        <div className="mt-2 text-xs">
                          <div className="font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>{TX.evidenceLbl[lang]}:</div>
                          <ul className="space-y-0.5" style={{ color: "#E8EAF6" }}>
                            {(showAllEvidence ? step.evidence : step.evidence.slice(0, 5)).map((e, ei) => (
                              <li key={ei} className="flex gap-1.5"><span style={{ color: tbColor }}>•</span><span className="font-mono">{e}</span></li>
                            ))}
                          </ul>
                          {step.evidence.length > 5 && (
                            <button onClick={() => setShowAllEvidence(v => !v)}
                              className="text-[10px] mt-1 px-2 py-0.5 rounded-full"
                              style={{ background: "#1E3A5F", color: tbColor, border: `1px solid ${tbColor}44` }}>
                              {showAllEvidence ? TX.collapse[lang] : `${TX.moreN[lang]} ${step.evidence.length - 5}`}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Formula */}
                      {step.formula && (
                        <div className="rounded px-3 py-2 mt-2 font-mono text-xs" style={{ background: "#0a0e1a", border: "1px solid var(--border-color)", color: "#fcd34d" }}>
                          {step.formula}
                        </div>
                      )}

                      {/* Debug images */}
                      {step.images && step.images.length > 0 && <StepImages images={step.images} />}
                    </div>
                  );
                })}
              </div>
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
        {webglError && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm"
            style={{ background: "#060B18", color: "#f59e0b" }}>
            {webglError}
          </div>
        )}
        <div className="absolute bottom-2 right-3 text-xs" style={{ color: "#546E7A" }}>
          {TX.dragHint[lang]}
        </div>
        {steps?.final.generation_method && (
          <div className="absolute bottom-2 left-3 text-[11px] font-semibold px-2 py-0.5 rounded-full z-10"
            style={{ background: "#060B18CC", color: "#90CAF9", border: "1px solid #2E4A6F" }}>
            {steps.final.generation_method === "recursive_boundary" ? TX.genBoundary[lang]
              : steps.final.generation_method === "escape_depth" ? TX.genEscape[lang]
              : TX.genChaos[lang]}
          </div>
        )}
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
                {/* Show the final fractal TYPE (after tie-break) — not the 3D render-kind,
                    which maps e.g. spiral_julia → "mandelbrot" shader and misled the display. */}
                <div className="text-sm font-bold" style={{ color: "#FFB300" }}>
                  {(steps?.final.type ?? detection.kind).toUpperCase()}
                </div>
                {steps?.final.tiebreak_applied && steps.final.cnn_original_class && (
                  <div className="text-[10px] mt-0.5" style={{ color: "#90A4AE" }}>
                    CNN предсказал: <span style={{ color: "#FF8A65" }}>{steps.final.cnn_original_class}</span>
                    {" → "}геометрия: <span style={{ color: "#69F0AE" }}>{steps.final.type}</span>
                  </div>
                )}
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
                <div className="text-sm font-semibold" style={{ color: "#00E5FF" }}>{steps?.final.type_3d ?? detection.name3d}</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.detRecur[lang]}</div>
                <div className="text-sm font-bold" style={{ color: "#E8EAF6" }}>{fractalLevel}</div>
              </div>
              {/* ── stage-5: backend recovery / pose / dimensions ── */}
              {steps?.final.recovery_method && (
                <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid #00E5FF33" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.recMethodLbl[lang]}</div>
                  <div className="text-sm font-semibold" style={{ color: "#00E5FF" }}>
                    {steps.final.recovery_method === "canonical_fitted" ? TX.recCanonical[lang]
                      : steps.final.recovery_method === "full_affine" ? TX.recBlind[lang] : TX.recSkipped[lang]}
                  </div>
                </div>
              )}
              {steps?.final.pose_fit_score != null && (
                <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid #69F0AE33" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.poseTitle[lang]}</div>
                  <div className="text-sm font-bold font-mono" style={{ color: "#69F0AE" }}>IoU {steps.final.pose_fit_score.toFixed(2)}</div>
                </div>
              )}
              {steps?.final.theoretical_dimension != null && (
                <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid #FFB30033" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{TX.theoDim[lang]}</div>
                  <div className="text-sm font-bold font-mono" style={{ color: "#FFB300" }}>{steps.final.theoretical_dimension.toFixed(3)}</div>
                </div>
              )}
              {steps?.final.fractal_dimension != null && (
                <div className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid #9C27B033" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>D (измер.)</div>
                  <div className="text-sm font-bold font-mono" style={{ color: "#CE93D8" }}>{steps.final.fractal_dimension.toFixed(3)}</div>
                </div>
              )}
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
      {settings.showPipeline && <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #00E5FF44" }}>
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
            // Step-5 generation formula/description reflect the REAL backend method
            // (canonical IFS / Koch recursive boundary / escape-time depth) when known.
            const beFinal = steps?.final ?? null;
            const genMethod = beFinal?.generation_method;
            let step5formula = gen3dFormula[detType] ?? "—";
            let step5desc = "По типу фрактала выбирается математический 3D-генератор (Three.js).";
            if (genMethod === "recursive_boundary") {
              step5formula = "Koch(p₀,p₁,d) = Koch(p₀,a,d−1) ∪ Koch(a,b,d−1) ∪ …";
              step5desc = "Рекурсивная граница depth=6, 12288 сегментов → extrusion.";
            } else if (genMethod === "escape_depth") {
              step5formula = "z → z² + c,  depth = smooth_iter";
              step5desc = "Escape-time карта глубины → marching cubes.";
            } else if (genMethod === "chaos_game") {
              const nT = beFinal?.recovery_method === "canonical_fitted" ? " (canonical)" : "";
              step5formula = "Tᵢ(x) = Aᵢ·x + tᵢ,  i = 1..N  (Canonical IFS)";
              step5desc = `Каноничные аффинные преобразования${beFinal?.recovery_method === "canonical_fitted" ? " + подгонка позы" : " (blind recovery)"}. Chaos game 100K точек → marching cubes → mesh.${nT}`;
            }
            const step5out = beFinal
              ? `✓ ${beFinal.type} (${genMethod === "recursive_boundary" ? "recursive boundary" : genMethod === "escape_depth" ? "escape depth" : beFinal.recovery_method === "canonical_fitted" ? "canonical" : "chaos game"})`
              : detection ? `✓ ${detection.name3d}` : "ожидание классификации";
            // Step 4 = RAW CNN classification (BEFORE the geometric tie-break). Make that
            // explicit so it isn't confused with the post-tie-break final_type.
            const cnnRaw = cnnApiResult ? (CLASS_LABELS[cnnApiResult.type] ?? cnnApiResult.type) : null;
            const step4out = cnnRaw
              ? `✓ ${cnnRaw} — ${cnnApiResult!.confidence.toFixed(0)}%  (RAW CNN, до тай-брейка)`
                + (beFinal?.tiebreak_applied ? `  → геометрия: ${beFinal.type}` : "")
              : detName ? `✓ ${detName} — ${detection!.confidence}%` : "нажмите «CNN Анализ»";
            const pipeSteps = [
              { n: 1, color: "#00E5FF", title: "Вход — 2D изображение", io: "вход", formula: "I(x, y) ∈ ℝ^(W×H)", desc: "Загруженная картинка фрактала (PNG / JPG).", out: hasImage ? "✓ изображение загружено" : "ожидание загрузки", canvas: "src", icon: "🖼️" },
              { n: 2, color: "#FFB300", title: "Препроцессинг", io: "обработка", formula: "x' = (x − μ) / σ   ·   resize 128×128 RGB", desc: "Нормализация пикселей + построение карты глубины по яркости.", out: hasImage ? "✓ тензор 3×128×128" : "—", canvas: "depth", icon: "⚙️" },
              { n: 3, color: "#9C27B0", title: "CNN — извлечение признаков", io: "нейросеть", formula: "f = Conv2D×4(x') → AvgPool → f ∈ ℝ²⁵⁶", desc: "4 свёрточных блока (Conv→BN→ReLU→Pool) сжимают картинку в вектор признаков. Слева — карта активаций.", out: "✓ вектор признаков 256-D", canvas: "feat", icon: "🧠" },
              { n: 4, color: "#69F0AE", title: "Классификация (CNN, raw)", io: "решение", formula: "P(class) = softmax(W·f) = exp(zᵢ) / Σ exp(zⱼ)", desc: "Полносвязный слой → вероятности по 17 классам (сырой выход CNN, ДО геометрического тай-брейка). Справа — реальные оценки.", out: step4out, icon: "🎯", bars: true },
              { n: 5, color: "#FF6E40", title: "Генерация 3D-модели", io: "построение", formula: step5formula, desc: step5desc, out: step5out, canvas: "three", icon: "🔮" },
              { n: 6, color: "#E040FB", title: "Выход — 3D mesh", io: "результат", formula: `${Math.round(polyCount).toLocaleString()} полигонов · экспорт .OBJ`, desc: "Готовая трёхмерная модель: вращение, масштаб, скачивание.", out: polyCount > 0 ? "✓ модель построена" : "—", canvas: "three", icon: "📦" },
            ];
            return pipeSteps.map((s, i) => (
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
                {i < pipeSteps.length - 1 && (
                  <div className="flex justify-center py-1" style={{ color: s.color }}>
                    <span style={{ fontSize: 20 }}>↓</span>
                  </div>
                )}
              </div>
            ));
          })()}
        </div>
      </div>}

      {/* ── CNN Architecture steps ── */}
      {settings.showArchitecture && <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-color)" }}>
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
            {["3D Voxel", "Indicator", "Mask", "Conv 1", "Attention", "Conv 2", "FractalConv", "Conv 3", "Pooling", "FC", "Output", "Tiebreak", "Canonical IFS", "Pose Fit", "Mesh"].map((s, i, arr) => {
              // Geometric post-processing blocks (after the CNN Output) get an amber tint.
              const isGeo = i >= 11;
              return (
                <span key={s} className="flex items-center gap-1">
                  <span className="px-2 py-0.5 rounded text-xs" style={{
                    background: isGeo ? "#F59E0B14" : "#0D1526",
                    border: `1px solid ${isGeo ? "#F59E0B55" : "#1E3A5F"}`,
                    color: isGeo ? "#F5B544" : "#E8EAF6",
                    whiteSpace: "nowrap",
                  }}>{s}</span>
                  {i < arr.length - 1 && <span style={{ color: isGeo ? "#F59E0B55" : "#1E3A5F" }}>→</span>}
                </span>
              );
            })}
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
      </div>}

    </div>
  );
}
