"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as THREE from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useLang } from "@/components/LanguageContext";

// ─── bilingual strings ────────────────────────────────────────────────────────
const T = {
  title:         { ru: "360° Splatting", uz: "360° Splatting" },
  modeSynthetic: { ru: "Синтетика", uz: "Sintetika" },
  modePhoto:     { ru: "Реальное фото", uz: "Haqiqiy foto" },

  // Synthetic panel
  nViewsLabel:    { ru: "Количество видов (n_views)", uz: "Vidlar soni (n_views)" },
  elevLabel:      { ru: "Углы высоты (через запятую)", uz: "Balandlik burchaklari (vergul bilan)" },
  buildBtn:       { ru: "Построить 360° из текущего меша", uz: "Joriy meshdan 360° qurish" },
  synthNote:      { ru: "Использует последний построенный 3D-меш", uz: "Oxirgi qurilgan 3D-mesh ishlatiladi" },

  // Photo panel
  uploadLabel:    { ru: "Загрузите фотографию", uz: "Fotosuratni yuklang" },
  chooseFile:     { ru: "Выбрать файл", uz: "Fayl tanlash" },
  providerLabel:  { ru: "Провайдер", uz: "Provaydar" },
  providerAuto:   { ru: "Авто", uz: "Auto" },
  genBtn:         { ru: "Сгенерировать 360°", uz: "360° yaratish" },
  photoWarning:   { ru: "Невидимые стороны достраиваются генеративной моделью (правдоподобно, не измеренные данные)", uz: "Ko'rinmas tomonlar generativ model bilan to'ldiriladi (ishonchli, lekin o'lchanmagan ma'lumot emas)" },
  tokenNote:      { ru: "Требуется REPLICATE_API_TOKEN на сервере", uz: "Serverda REPLICATE_API_TOKEN kerak" },

  // Status / polling
  stateQueued:  { ru: "В очереди…", uz: "Navbatda…" },
  stateRunning: { ru: "Выполняется…", uz: "Bajarilmoqda…" },
  stateDone:    { ru: "Готово!", uz: "Tayyor!" },
  stateError:   { ru: "Ошибка", uz: "Xato" },
  logLabel:     { ru: "Лог:", uz: "Log:" },

  // Viewer / switcher
  viewMesh:       { ru: "Меш", uz: "Mesh" },
  viewPoints:     { ru: "Точки", uz: "Nuqtalar" },
  splatNote:      { ru: "Сплат-рендер требует gsplat (CUDA)", uz: "Splat-render gsplat (CUDA) talab qiladi" },

  // PLY viewer
  plyViewerTitle: { ru: "3D Point Cloud (PLY)", uz: "3D Nuqta bulutti (PLY)" },
  resetCamera:    { ru: "Сбросить камеру", uz: "Kamerani tiklash" },
  autoRot:        { ru: "Авто-вращение", uz: "Avto-aylantirish" },
  plyFailed:      { ru: "PLY не загружен — показываю кадры орбиты", uz: "PLY yuklanmadi — orbit kadrlar ko'rsatilmoqda" },

  // Orbit carousel
  carouselTitle: { ru: "Орбитные кадры (360°)", uz: "Orbit kadrlar (360°)" },
  prev:          { ru: "◀", uz: "◀" },
  next:          { ru: "▶", uz: "▶" },
  frameOf:       { ru: "кадр", uz: "kadr" },

  // Downloads
  downloadPly:    { ru: "Скачать .ply", uz: "Yuklab olish .ply" },
  downloadFrames: { ru: "Скачать кадры", uz: "Kadrlarni yuklab olish" },

  // Meta panel
  metaTitle:     { ru: "Метаданные", uz: "Meta ma'lumotlar" },
  metaBranch:    { ru: "Ветка:", uz: "Tarmoq:" },
  metaMethod:    { ru: "Метод:", uz: "Usul:" },
  metaProvider:  { ru: "Провайдер:", uz: "Provaydar:" },
  metaNViews:    { ru: "Видов:", uz: "Vidlar:" },
  metaNGauss:    { ru: "Гауссиан:", uz: "Gaussianlar:" },
  metaTimeSec:   { ru: "Время (сек):", uz: "Vaqt (sek):" },
  metaApiCost:   { ru: "Стоимость API:", uz: "API narxi:" },
  metaNote:      { ru: "Примечание:", uz: "Izoh:" },

  // Offline
  offline: { ru: "API недоступен. Запустите: python -m fractal_3d.api_server", uz: "API mavjud emas. Ishga tushiring: python -m fractal_3d.api_server" },
};

const BASE = "http://localhost:8000";

// ─── types ─────────────────────────────────────────────────────────────────────
type Mode = "synthetic" | "photo";
type JobState = "queued" | "running" | "done" | "error";
type ViewSource = "mesh" | "points";
type FractalType = "mandelbulb" | "menger3d" | "ifs3d" | "mesh";

interface JobStatus {
  state: JobState;
  progress: number;
  log_tail: string;
  manifest?: Record<string, unknown>;
  files?: { ply: string; orbit: string[]; mesh?: string };
  error?: string;
}

// ─── component ────────────────────────────────────────────────────────────────
export default function Splat360() {
  const { lang } = useLang();

  // sub-mode
  const [mode, setMode] = useState<Mode>("synthetic");

  // synthetic inputs
  const [nViews, setNViews] = useState(12);
  const [imgSize, setImgSize] = useState(256);
  const [elevations, setElevations] = useState("-20,0,20,40");
  const [fractalType, setFractalType] = useState<FractalType>("mandelbulb");
  const [fractalResolution, setFractalResolution] = useState(160);
  const [mandelPower, setMandelPower] = useState(8);
  const [mandelIter, setMandelIter] = useState(12);
  const [mengerLevel, setMengerLevel] = useState(4);
  const [ifsPoints, setIfsPoints] = useState(2000000);

  // photo inputs
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [provider, setProvider] = useState("auto");

  // job tracking
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [posting, setPosting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // PLY viewer
  const [plyFailed, setPlyFailed] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);

  // view source switcher — null means "auto" (derive from available files)
  const [userViewSource, setUserViewSource] = useState<ViewSource | null>(null);

  // Derived: if user hasn't explicitly chosen, default to mesh when available
  const viewSource: ViewSource = useMemo(() => {
    if (userViewSource !== null) return userViewSource;
    return status?.files?.mesh ? "mesh" : "points";
  }, [userViewSource, status?.files?.mesh]);

  // refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rafRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── photo file picker ────────────────────────────────────────────────────────
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (!file) { setPhotoPreviewUrl(null); return; }
    const reader = new FileReader();
    reader.onload = () => setPhotoPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  // ── resize photo → base64 ≤1024px ────────────────────────────────────────────
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const maxSide = 1024;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          const scale = maxSide / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        // strip "data:image/...;base64," prefix
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = reject;
      img.src = url;
    });
  }, []);

  // ── stop polling ─────────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── poll job status ───────────────────────────────────────────────────────────
  const startPolling = useCallback((id: string) => {
    stopPolling();
    const poll = async () => {
      try {
        const res = await fetch(`${BASE}/api/splat360/status/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: JobStatus = await res.json();
        setStatus(data);
        if (data.state === "done" || data.state === "error") {
          stopPolling();
        }
      } catch {
        // network error — keep polling, surface in UI only if we haven't seen any status yet
      }
    };
    poll();
    intervalRef.current = setInterval(poll, 1500);
  }, [stopPolling]);

  // ── POST synthetic ────────────────────────────────────────────────────────────
  const handleSynthetic = useCallback(async () => {
    setApiError(null);
    setPosting(true);
    setPlyFailed(false);
    setStatus(null);
    setJobId(null);
    setUserViewSource(null);
    try {
      const elevArr = elevations.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
      const res = await fetch(`${BASE}/api/splat360/synthetic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          n_views: nViews,
          img_size: imgSize,
          elevations: elevArr,
          fractal_type: fractalType,
          resolution: fractalType === "mesh" ? undefined : fractalResolution,
          power: mandelPower,
          max_iter: mandelIter,
          menger_level: mengerLevel,
          ifs_points: ifsPoints,
          ifs_warmup: 20,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { job_id } = await res.json();
      setJobId(job_id);
      startPolling(job_id);
    } catch {
      setApiError(T.offline[lang]);
    } finally {
      setPosting(false);
    }
  }, [nViews, imgSize, elevations, fractalType, fractalResolution, mandelPower, mandelIter, mengerLevel, ifsPoints, lang, startPolling]);

  // ── POST photo ────────────────────────────────────────────────────────────────
  const handlePhoto = useCallback(async () => {
    if (!photoFile) return;
    setApiError(null);
    setPosting(true);
    setPlyFailed(false);
    setStatus(null);
    setJobId(null);
    setUserViewSource(null);
    try {
      const b64 = await fileToBase64(photoFile);
      const res = await fetch(`${BASE}/api/splat360/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, provider }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { job_id } = await res.json();
      setJobId(job_id);
      startPolling(job_id);
    } catch {
      setApiError(T.offline[lang]);
    } finally {
      setPosting(false);
    }
  }, [photoFile, provider, lang, fileToBase64, startPolling]);

  // ── THREE.js viewer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!status || status.state !== "done") return;
    if (plyFailed && viewSource === "points") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Decide what we are rendering
    const meshUrl = status.files?.mesh ?? null;
    const plyUrl = status.files?.ply ?? null;
    const renderMesh = viewSource === "mesh" && !!meshUrl;
    const renderPoints = !renderMesh;

    // If points mode but no ply url, nothing to show
    if (renderPoints && !plyUrl) return;

    // Dispose previous
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const W = 520, H = 420;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a14);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, W / H, 0.001, 100);
    camera.position.set(0, 0, 3);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = autoRotate;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 2, 2);
    scene.add(dirLight);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      renderer.render(scene, camera);
    };

    // Helper: center + scale an object3D to fit ~2 units
    const fitObject = (obj: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(obj);
      const center = new THREE.Vector3();
      box.getCenter(center);
      obj.position.sub(center);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = 2 / maxDim;
      obj.scale.set(s, s, s);
    };

    // Helper: apply standard material to mesh objects lacking one
    const applyFallbackMaterial = (obj: THREE.Object3D) => {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          const hasUsable = mat && !(mat instanceof THREE.MeshBasicMaterial && (mat as THREE.MeshBasicMaterial).color.equals(new THREE.Color(0xffffff)));
          if (!hasUsable) {
            mesh.material = new THREE.MeshStandardMaterial({
              color: 0x8899aa,
              metalness: 0.1,
              roughness: 0.8,
              flatShading: true,
            });
          }
          if (mesh.geometry) {
            mesh.geometry.computeVertexNormals();
          }
        }
      });
    };

    const ensureGeometryColors = (geometry: THREE.BufferGeometry) => {
      if (geometry.getAttribute("color")) return true;
      const red = geometry.getAttribute("red") as THREE.BufferAttribute | undefined;
      const green = geometry.getAttribute("green") as THREE.BufferAttribute | undefined;
      const blue = geometry.getAttribute("blue") as THREE.BufferAttribute | undefined;
      if (!red || !green || !blue) return false;

      const n = red.count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        colors[i * 3] = red.getX(i) / 255;
        colors[i * 3 + 1] = green.getX(i) / 255;
        colors[i * 3 + 2] = blue.getX(i) / 255;
      }
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      return true;
    };

    if (renderMesh && meshUrl) {
      const ext = meshUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
      if (ext === "glb" || ext === "gltf") {
        const loader = new GLTFLoader();
        loader.load(
          meshUrl,
          (gltf) => {
            applyFallbackMaterial(gltf.scene);
            fitObject(gltf.scene);
            scene.add(gltf.scene);
            animate();
          },
          undefined,
          () => {
            // mesh failed → fall back to points
            setUserViewSource("points");
          },
        );
      } else if (ext === "ply") {
        const loader = new PLYLoader();
        loader.load(
          meshUrl,
          (geometry) => {
            ensureGeometryColors(geometry);
            geometry.computeVertexNormals();
            const mesh = new THREE.Mesh(
              geometry,
              new THREE.MeshStandardMaterial({
                color: geometry.getAttribute("color") ? 0xffffff : 0x8899aa,
                vertexColors: !!geometry.getAttribute("color"),
                metalness: 0.1,
                roughness: 0.8,
                flatShading: true,
              }),
            );
            fitObject(mesh);
            scene.add(mesh);
            animate();
          },
          undefined,
          () => {
            setUserViewSource("points");
          },
        );
      } else {
        // default: treat as OBJ
        const loader = new OBJLoader();
        loader.load(
          meshUrl,
          (group) => {
            applyFallbackMaterial(group);
            fitObject(group);
            scene.add(group);
            animate();
          },
          undefined,
          () => {
            // mesh failed → fall back to points
            setUserViewSource("points");
          },
        );
      }
    } else if (renderPoints && plyUrl) {
      const loader = new PLYLoader();
      loader.load(
        plyUrl,
        (geometry) => {
          // Center and scale
          geometry.computeBoundingBox();
          const bbox = geometry.boundingBox!;
          const center = new THREE.Vector3();
          bbox.getCenter(center);
          geometry.translate(-center.x, -center.y, -center.z);
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const scale = 2 / maxDim;
          geometry.scale(scale, scale, scale);

          // Compute point size from bounding box (after scale, maxDim is ~2)
          const pointSize = (maxDim * scale) / 200;

          // Vertex colors
          let mat: THREE.PointsMaterial;
          if (ensureGeometryColors(geometry)) {
            mat = new THREE.PointsMaterial({ size: pointSize, vertexColors: true, sizeAttenuation: true });
          } else {
            mat = new THREE.PointsMaterial({ size: pointSize, color: 0x00e5ff, sizeAttenuation: true });
          }

          const points = new THREE.Points(geometry, mat);
          scene.add(points);
          animate();
        },
        undefined,
        () => {
          // Load error → fallback to orbit carousel
          setPlyFailed(true);
        },
      );
    }

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      controls.dispose();
      renderer.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.state, status?.files?.ply, status?.files?.mesh, plyFailed, viewSource]);

  // auto-rotate toggle
  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (rendererRef.current) rendererRef.current.dispose();
    };
  }, [stopPolling]);

  // ── helpers ───────────────────────────────────────────────────────────────────
  const resetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(0, 0, 3);
    controlsRef.current.reset();
  };

  const stateLabel = (s: JobState) => {
    if (s === "queued")  return T.stateQueued[lang];
    if (s === "running") return T.stateRunning[lang];
    if (s === "done")    return T.stateDone[lang];
    return T.stateError[lang];
  };

  const metaVal = (v: unknown) => (v === null || v === undefined ? "—" : String(v));

  const orbitFrames: string[] = status?.files?.orbit ?? [];

  const isDone = status?.state === "done";
  const showViewer = isDone && !plyFailed && (viewSource === "mesh" ? !!status?.files?.mesh : !!status?.files?.ply);
  const showOrbit = isDone && (plyFailed || (!status?.files?.ply && !status?.files?.mesh)) && orbitFrames.length > 0;

  // ── button style helper ───────────────────────────────────────────────────────
  const activeBtn = (active: boolean): React.CSSProperties => ({
    padding: "6px 16px",
    borderRadius: "6px",
    fontWeight: active ? 700 : 400,
    cursor: "pointer",
    border: "1px solid var(--border-color)",
    background: active ? "var(--accent-cyan)" : "var(--bg-secondary)",
    color: active ? "#0a0a14" : "var(--text-secondary)",
    transition: "all 0.15s",
  });

  const disabledBtn: React.CSSProperties = {
    padding: "6px 16px",
    borderRadius: "6px",
    fontWeight: 400,
    cursor: "not-allowed",
    border: "1px solid var(--border-color)",
    background: "var(--bg-secondary)",
    color: "var(--text-secondary)",
    opacity: 0.4,
    transition: "all 0.15s",
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border-color)",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "16px",
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* Title */}
      <h2 style={{ color: "var(--accent-cyan)", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        {T.title[lang]}
      </h2>

      {/* Mode switcher */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button style={activeBtn(mode === "synthetic")} onClick={() => setMode("synthetic")}>
          {T.modeSynthetic[lang]}
        </button>
        <button style={activeBtn(mode === "photo")} onClick={() => setMode("photo")}>
          {T.modePhoto[lang]}
        </button>
      </div>

      {/* ── SYNTHETIC PANEL ── */}
      {mode === "synthetic" && (
        <div style={cardStyle}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", color: "var(--text-secondary)", fontSize: 13, marginBottom: 4 }}>
              {lang === "ru" ? "Тип фрактала (объёмный)" : "Fraktal turi (hajmli)"}
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {([
                { k: "mandelbulb", label: "Mandelbulb" },
                { k: "menger3d", label: lang === "ru" ? "Губка Менгера 3D" : "Menger 3D" },
                { k: "ifs3d", label: lang === "ru" ? "3D-IFS / Серпинский" : "3D-IFS / Sierpinski" },
                { k: "mesh", label: lang === "ru" ? "Текущий меш (2D→3D)" : "Joriy mesh (2D→3D)" },
              ] as const).map((o) => (
                <button
                  key={o.k}
                  onClick={() => setFractalType(o.k)}
                  style={{
                    padding: "5px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                    background: fractalType === o.k ? "#06b6d422" : "var(--bg-secondary)",
                    border: `1px solid ${fractalType === o.k ? "#06b6d4" : "var(--border-color)"}`,
                    color: fractalType === o.k ? "#06b6d4" : "var(--text-secondary)",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {fractalType === "mesh" && (
              <div style={{ fontSize: 12, color: "#FBBF24", marginTop: 4 }}>
                {lang === "ru"
                  ? "⚠ Меш реконструкции 2D→3D — это карта высот (может быть плоским)."
                  : "⚠ 2D→3D rekonstruksiya meshi — balandlik xaritasi (tekis bo‘lishi mumkin)."}
              </div>
            )}
          </div>
          {fractalType !== "mesh" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 12 }}>
              <label style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                <span style={{ display: "block", marginBottom: 4 }}>N</span>
                <input
                  type="number"
                  value={fractalResolution}
                  min={32}
                  max={256}
                  step={1}
                  onChange={(e) => setFractalResolution(parseInt(e.target.value) || 160)}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary, #e2e8f0)",
                    fontSize: 14,
                  }}
                />
              </label>
              {fractalType === "mandelbulb" && (
                <>
                  <label style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    <span style={{ display: "block", marginBottom: 4 }}>power</span>
                    <input
                      type="number"
                      value={mandelPower}
                      min={2}
                      max={12}
                      step={1}
                      onChange={(e) => setMandelPower(parseFloat(e.target.value) || 8)}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-secondary)",
                        color: "var(--text-primary, #e2e8f0)",
                        fontSize: 14,
                      }}
                    />
                  </label>
                  <label style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    <span style={{ display: "block", marginBottom: 4 }}>max_iter</span>
                    <input
                      type="number"
                      value={mandelIter}
                      min={4}
                      max={24}
                      step={1}
                      onChange={(e) => setMandelIter(parseInt(e.target.value) || 12)}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-secondary)",
                        color: "var(--text-primary, #e2e8f0)",
                        fontSize: 14,
                      }}
                    />
                  </label>
                </>
              )}
              {fractalType === "menger3d" && (
                <label style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>level</span>
                  <input
                    type="number"
                    value={mengerLevel}
                    min={1}
                    max={5}
                    step={1}
                    onChange={(e) => setMengerLevel(parseInt(e.target.value) || 4)}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-secondary)",
                      color: "var(--text-primary, #e2e8f0)",
                      fontSize: 14,
                    }}
                  />
                </label>
              )}
              {fractalType === "ifs3d" && (
                <label style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>points</span>
                  <input
                    type="number"
                    value={ifsPoints}
                    min={50000}
                    max={3000000}
                    step={50000}
                    onChange={(e) => setIfsPoints(parseInt(e.target.value) || 2000000)}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-secondary)",
                      color: "var(--text-primary, #e2e8f0)",
                      fontSize: 14,
                    }}
                  />
                </label>
              )}
            </div>
          )}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", color: "var(--text-secondary)", fontSize: 13, marginBottom: 4 }}>
              {T.nViewsLabel[lang]}
            </label>
            <input
              type="number"
              value={nViews}
              min={4}
              max={360}
              onChange={(e) => setNViews(parseInt(e.target.value) || 60)}
              style={{
                width: 100,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary, #e2e8f0)",
                fontSize: 14,
              }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", color: "var(--text-secondary)", fontSize: 13, marginBottom: 4 }}>
              img_size
            </label>
            <input
              type="number"
              value={imgSize}
              min={128}
              max={800}
              step={64}
              onChange={(e) => setImgSize(parseInt(e.target.value) || 256)}
              style={{
                width: 100,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary, #e2e8f0)",
                fontSize: 14,
              }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", color: "var(--text-secondary)", fontSize: 13, marginBottom: 4 }}>
              {T.elevLabel[lang]}
            </label>
            <input
              type="text"
              value={elevations}
              onChange={(e) => setElevations(e.target.value)}
              style={{
                width: 240,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary, #e2e8f0)",
                fontSize: 14,
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, fontStyle: "italic" }}>
            {T.synthNote[lang]}
          </div>
          <button
            onClick={handleSynthetic}
            disabled={posting}
            style={{
              padding: "8px 20px",
              borderRadius: 7,
              background: posting ? "var(--bg-secondary)" : "var(--accent-cyan)",
              color: posting ? "var(--text-secondary)" : "#0a0a14",
              fontWeight: 700,
              border: "none",
              cursor: posting ? "not-allowed" : "pointer",
              fontSize: 14,
            }}
          >
            {T.buildBtn[lang]}
          </button>
        </div>
      )}

      {/* ── PHOTO PANEL ── */}
      {mode === "photo" && (
        <div style={cardStyle}>
          {/* Amber honest warning */}
          <div style={{
            background: "rgba(251,191,36,0.12)",
            border: "1px solid #f59e0b",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 14,
            color: "#f59e0b",
            fontSize: 13,
          }}>
            ⚠ {T.photoWarning[lang]}
            <br />
            <span style={{ opacity: 0.7, fontSize: 11 }}>{T.tokenNote[lang]}</span>
          </div>

          {/* File upload */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", color: "var(--text-secondary)", fontSize: 13, marginBottom: 6 }}>
              {T.uploadLabel[lang]}
            </label>
            <label style={{
              display: "inline-block",
              padding: "6px 14px",
              borderRadius: 6,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
            }}>
              {T.chooseFile[lang]}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
            </label>
            {photoFile && (
              <span style={{ marginLeft: 10, fontSize: 12, color: "var(--text-secondary)" }}>{photoFile.name}</span>
            )}
          </div>

          {/* Preview */}
          {photoPreviewUrl && (
            <div style={{ marginBottom: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreviewUrl}
                alt="preview"
                style={{ maxWidth: 200, maxHeight: 160, borderRadius: 6, border: "1px solid var(--border-color)", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Provider */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", color: "var(--text-secondary)", fontSize: 13, marginBottom: 4 }}>
              {T.providerLabel[lang]}
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary, #e2e8f0)",
                fontSize: 14,
              }}
            >
              <option value="auto">{T.providerAuto[lang]}</option>
              <option value="replicate">Replicate</option>
              <option value="local">Local</option>
            </select>
          </div>

          <button
            onClick={handlePhoto}
            disabled={posting || !photoFile}
            style={{
              padding: "8px 20px",
              borderRadius: 7,
              background: posting || !photoFile ? "var(--bg-secondary)" : "var(--accent-cyan)",
              color: posting || !photoFile ? "var(--text-secondary)" : "#0a0a14",
              fontWeight: 700,
              border: "none",
              cursor: posting || !photoFile ? "not-allowed" : "pointer",
              fontSize: 14,
            }}
          >
            {T.genBtn[lang]}
          </button>
        </div>
      )}

      {/* ── API OFFLINE ERROR ── */}
      {apiError && (
        <div style={{
          background: "rgba(239,68,68,0.12)",
          border: "1px solid #ef4444",
          borderRadius: 8,
          padding: "10px 14px",
          color: "#ef4444",
          fontSize: 13,
          marginBottom: 16,
          fontFamily: "monospace",
        }}>
          {apiError}
        </div>
      )}

      {/* ── JOB STATUS ── */}
      {status && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          {/* Progress bar */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: status.state === "error" ? "#ef4444" : status.state === "done" ? "#22c55e" : "var(--accent-cyan)", fontSize: 14 }}>
                {stateLabel(status.state)}
              </span>
              <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                {Math.round(status.progress * 100)}%
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--bg-secondary)", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.round(status.progress * 100)}%`,
                borderRadius: 3,
                background: status.state === "error" ? "#ef4444" : "var(--accent-cyan)",
                transition: "width 0.3s",
              }} />
            </div>
          </div>

          {/* Job ID */}
          {jobId && (
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace", marginBottom: 6 }}>
              job: {jobId}
            </div>
          )}

          {/* Log tail */}
          {status.log_tail && (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>{T.logLabel[lang]}</div>
              <pre style={{
                fontSize: 11,
                fontFamily: "monospace",
                background: "var(--bg-secondary)",
                borderRadius: 6,
                padding: "8px 10px",
                maxHeight: 120,
                overflowY: "auto",
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
              }}>
                {status.log_tail}
              </pre>
            </div>
          )}

          {/* Error detail */}
          {status.state === "error" && status.error && (
            <div style={{ color: "#ef4444", fontSize: 13, marginTop: 6, fontFamily: "monospace" }}>
              {status.error}
            </div>
          )}
        </div>
      )}

      {/* ── VIEW SOURCE SWITCHER ── */}
      {isDone && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            style={status?.files?.mesh ? activeBtn(viewSource === "mesh") : disabledBtn}
            disabled={!status?.files?.mesh}
            onClick={() => { if (status?.files?.mesh) setUserViewSource("mesh"); }}
          >
            {T.viewMesh[lang]}
          </button>
          <button
            style={activeBtn(viewSource === "points")}
            onClick={() => setUserViewSource("points")}
          >
            {T.viewPoints[lang]}
          </button>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontStyle: "italic", marginLeft: 4 }}>
            {T.splatNote[lang]}
          </span>
        </div>
      )}

      {/* ── 3D VIEWER ── */}
      {showViewer && (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontWeight: 700, color: "var(--accent-cyan)", fontSize: 15 }}>{T.plyViewerTitle[lang]}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={resetCamera} style={activeBtn(false)}>{T.resetCamera[lang]}</button>
              <button onClick={() => setAutoRotate((v) => !v)} style={activeBtn(autoRotate)}>{T.autoRot[lang]}</button>
            </div>
          </div>
          <canvas
            ref={canvasRef}
            width={520}
            height={420}
            style={{ display: "block", borderRadius: 8, border: "1px solid var(--border-color)", width: "100%", maxWidth: 520, height: "auto" }}
          />
        </div>
      )}

      {/* PLY failed notice */}
      {isDone && plyFailed && (
        <div style={{ color: "#f59e0b", fontSize: 13, marginBottom: 8 }}>⚠ {T.plyFailed[lang]}</div>
      )}

      {/* ── ORBIT CAROUSEL ── */}
      {showOrbit && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, color: "var(--accent-cyan)", fontSize: 15, marginBottom: 10 }}>{T.carouselTitle[lang]}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setCarouselIdx((i) => (i - 1 + orbitFrames.length) % orbitFrames.length)}
              style={{ fontSize: 20, background: "none", border: "none", color: "var(--accent-cyan)", cursor: "pointer" }}
            >
              {T.prev[lang]}
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={orbitFrames[carouselIdx]}
              alt={`orbit frame ${carouselIdx}`}
              style={{ maxWidth: 400, maxHeight: 300, borderRadius: 8, border: "1px solid var(--border-color)", objectFit: "contain" }}
            />
            <button
              onClick={() => setCarouselIdx((i) => (i + 1) % orbitFrames.length)}
              style={{ fontSize: 20, background: "none", border: "none", color: "var(--accent-cyan)", cursor: "pointer" }}
            >
              {T.next[lang]}
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            {T.frameOf[lang]} {carouselIdx + 1} / {orbitFrames.length}
          </div>
        </div>
      )}

      {/* Hidden canvas when viewer not shown but needed for effect */}
      {isDone && !showViewer && !plyFailed && (status?.files?.ply || status?.files?.mesh) && (
        <canvas ref={canvasRef} width={520} height={420} style={{ display: "none" }} />
      )}

      {/* ── DOWNLOADS ── */}
      {isDone && (status?.files?.ply || (orbitFrames.length > 0)) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          {status?.files?.ply && (
            <a
              href={status.files.ply}
              download
              style={{
                padding: "7px 16px",
                borderRadius: 7,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--accent-cyan)",
                fontWeight: 600,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              ⬇ {T.downloadPly[lang]}
            </a>
          )}
          {orbitFrames.map((url, i) => (
            <a
              key={i}
              href={url}
              download
              style={{
                padding: "7px 12px",
                borderRadius: 7,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-secondary)",
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              ⬇ {T.downloadFrames[lang]} {i + 1}
            </a>
          ))}
        </div>
      )}

      {/* ── META PANEL ── */}
      {isDone && status?.manifest && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, color: "var(--accent-cyan)", fontSize: 15, marginBottom: 10 }}>{T.metaTitle[lang]}</div>
          <table style={{ fontSize: 13, borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {(
                [
                  [T.metaBranch[lang],   "branch"],
                  [T.metaMethod[lang],   "method"],
                  [T.metaProvider[lang], "provider"],
                  [T.metaNViews[lang],   "n_views"],
                  [T.metaNGauss[lang],   "n_gaussians"],
                  [T.metaTimeSec[lang],  "time_sec"],
                  [T.metaApiCost[lang],  "api_cost"],
                ] as [string, string][]
              ).map(([label, key]) => (
                <tr key={key}>
                  <td style={{ color: "var(--text-secondary)", paddingRight: 16, paddingBottom: 4 }}>{label}</td>
                  <td style={{ color: "var(--text-primary, #e2e8f0)", fontFamily: "monospace" }}>
                    {metaVal((status.manifest as Record<string, unknown>)[key])}
                  </td>
                </tr>
              ))}
              {!!(status.manifest as Record<string, unknown>).note && (
                <tr key="note">
                  <td style={{ color: "var(--text-secondary)", paddingRight: 16, paddingBottom: 4 }}>{T.metaNote[lang]}</td>
                  <td style={{ color: "var(--text-primary, #e2e8f0)", fontFamily: "monospace", fontStyle: "italic" }}>
                    {metaVal((status.manifest as Record<string, unknown>).note)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
