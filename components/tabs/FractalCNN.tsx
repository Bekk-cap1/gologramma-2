"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useLang } from "@/components/LanguageContext";

// ─── constants ────────────────────────────────────────────────────────────────
const MESH_RES = 128; // vertices per side of the displaced plane
const THREE_W = 800;
const THREE_H = 400;

// ─── inline translations (keeps translations.ts clean) ────────────────────────
const TX = {
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
  fractalLvl:  { ru: "Уровень рекурсии", uz: "Rekursiya darajasi" },
  archTitle:   { ru: "Архитектура Geometry-Aware Fractal CNN", uz: "Geometry-Aware Fractal CNN arxitekturasi" },
  archHint:    { ru: "Кликните на шаг для подробностей", uz: "Tafsilotlar uchun bosqichni bosing" },
  pipeline:    { ru: "Полный конвейер:", uz: "To'liq quvur:" },
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

export type SampleType = "pyramid" | "sphere" | "cube" | "sierpinski" | "mandelbrot";

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

// ─── helper: build Sierpinski tetrahedron BufferGeometry ─────────────────────
type V3 = [number, number, number];
function mid3(a: V3, b: V3): V3 { return [(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2]; }

function buildSierpinskiGeometry(level: number): THREE.BufferGeometry {
  const verts: number[] = [];

  function face(a: V3, b: V3, c: V3) {
    verts.push(...a, ...b, ...c);
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

  // Regular tetrahedron, radius ≈ 2
  const R = 2.0;
  const v0: V3 = [0, R, 0];
  const v1: V3 = [-R*0.8165, -R*0.3333,  R*0.4714];
  const v2: V3 = [ R*0.8165, -R*0.3333,  R*0.4714];
  const v3: V3 = [0,          -R*0.3333, -R*0.9428];
  subdivide(v0, v1, v2, v3, level);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
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

// ─── component ────────────────────────────────────────────────────────────────
export default function FractalCNN() {
  const { lang } = useLang();

  const [hasImage, setHasImage]       = useState(false);
  const [depthScale, setDepthScale]   = useState(1.8);
  const [smoothing, setSmoothing]     = useState(3);
  const [wireframe, setWireframe]     = useState(false);
  const [autoRot, setAutoRot]         = useState(true);
  const [activeStep, setActiveStep]   = useState<number | null>(null);
  const [isDragOver, setIsDragOver]   = useState(false);
  const [fractalMode, setFractalMode] = useState(false);
  const [fractalLevel, setFractalLevel] = useState(4);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const srcCanvasRef   = useRef<HTMLCanvasElement>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);

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
  useEffect(() => { wireframeRef.current   = wireframe;   }, [wireframe]);
  useEffect(() => { autoRotRef.current     = autoRot;     }, [autoRot]);
  useEffect(() => { depthScaleRef.current  = depthScale;  }, [depthScale]);
  useEffect(() => { fractalModeRef.current = fractalMode; }, [fractalMode]);

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
        orbit.current.theta += 0.006;
      }
      const { theta, phi, radius } = orbit.current;
      camera.position.set(
        radius * Math.sin(theta) * Math.cos(phi),
        radius * Math.sin(phi),
        radius * Math.cos(theta) * Math.cos(phi),
      );
      camera.lookAt(0, 0, 0);
      if (meshRef.current) {
        // works for MeshStandardMaterial, MeshNormalMaterial, MeshPhongMaterial, etc.
        (meshRef.current.material as unknown as { wireframe: boolean }).wireframe = wireframeRef.current;
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

  // ── switch between heightmap and 3D fractal modes ─────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove current mesh
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
      meshRef.current = null;
    }

    if (fractalMode) {
      // MeshNormalMaterial: colours each face by its normal vector (R=X, G=Y, B=Z).
      // Requires NO lighting — always bright and visible at any orientation.
      const geo = buildSierpinskiGeometry(fractalLevel);
      const mat = new THREE.MeshNormalMaterial({
        side: THREE.DoubleSide,
        wireframe: wireframeRef.current,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      meshRef.current = mesh;
      orbit.current.radius = 6;
      orbit.current.phi = 0.45;
    } else {
      // Restore heightmap mesh or placeholder
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
  }, [fractalMode, fractalLevel, rebuildMesh]);

  // ── file loading helpers ──────────────────────────────────────────────────
  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { processImage(img); URL.revokeObjectURL(url); };
    img.src = url;
  }, [processImage]);

  const loadSample = useCallback((type: SampleType) => {
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
            {(["pyramid", "sphere", "cube"] as const).map(s => (
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
              {TX.fractalLvl[lang]}:&nbsp;
              <span style={{ color: "#FFB300", fontWeight: 700 }}>{fractalLevel}</span>
              <span style={{ color: "#546E7A" }}> (4ⁿ = {Math.pow(4, fractalLevel)} тетраэдров)</span>
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

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }}
      />

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
