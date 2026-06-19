"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useLang } from "@/components/LanguageContext";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createHologramScene } from "@/lib/hologram-renderer";
import type { HologramControls } from "@/lib/hologram-renderer";
import { createSplatPoints, sortSplatPoints } from "@/lib/splat-renderer";
import {
  layerBasedCGH, asmReconstruct,
  phaseToImageData, intensityToImageData,
  PIXEL_PITCH, LAMBDA_G,
  type LayerCGHResult, type ASMReconResult,
} from "@/lib/fft-holography";

// ─── Inline translations ───────────────────────────────────────────────────────
const T = {
  title:          { ru: "DCNF-CRF: Оценка глубины",                   uz: "DCNF-CRF: Chuqurlikni baholash",          en: "DCNF-CRF: Depth Estimation"              },
  subtitle:       { ru: "Загрузите изображение и исследуйте карту глубины DCNF, сравнение методов и ablation-анализ.", uz: "Rasm yuklang va DCNF chuqurlik xaritasi, usullarni taqqoslash hamda ablation tahlilini o'rganing.", en: "Upload an image and explore the DCNF depth map, method comparison, and ablation analysis." },
  dropTitle:      { ru: "Перетащите изображение сюда",                 uz: "Rasmni bu yerga torting",                 en: "Drop image here"                          },
  or:             { ru: "или",                                          uz: "yoki",                                    en: "or"                                       },
  chooseFile:     { ru: "Выбрать файл",                                 uz: "Fayl tanlash",                            en: "Choose file"                              },
  sourceImg:      { ru: "Исходное изображение",                         uz: "Asl rasm",                                en: "Source image"                             },
  reset:          { ru: "Сбросить",                                     uz: "Qayta boshlash",                          en: "Reset"                                    },
  depthLabel:     { ru: "Глубина:",                                     uz: "Chuqurlik:",                              en: "Depth:"                                   },
  crfLabel:       { ru: "CRF:",                                         uz: "CRF:",                                    en: "CRF:"                                     },
  depthBtn:       { ru: "Карта глубины (DCNF)",                        uz: "Chuqurlik xaritasi (DCNF)",               en: "Depth map (DCNF)"                         },
  depthLoading:   { ru: "Анализирую...",                                uz: "Tahlil qilinmoqda...",                    en: "Analysing..."                             },
  compareBtn:     { ru: "📊 Сравнить методы depth",                    uz: "📊 Usullarni taqqoslash",                 en: "📊 Compare depth methods"                },
  compareLoading: { ru: "Сравниваю...",                                 uz: "Taqqoslanmoqda...",                       en: "Comparing..."                             },
  ablationBtn:    { ru: "🔬 Ablation: вклад признаков",                 uz: "🔬 Ablation: belgilar hissasi",           en: "🔬 Ablation: feature contribution"        },
  ablationLoading:{ ru: "Считаю...",                                    uz: "Hisoblanmoqda...",                        en: "Computing..."                             },
  offline:        { ru: "API недоступен. Запустите: python -m fractal_3d.api_server", uz: "API mavjud emas. Ishga tushiring: python -m fractal_3d.api_server", en: "API offline. Run: python -m fractal_3d.api_server" },
  mAuto:          { ru: "🧠 Авто",                                      uz: "🧠 Avto",                                 en: "🧠 Auto"                                  },
  mNeural:        { ru: "🔬 Neural (DCNF CRF)",                         uz: "🔬 Neural (DCNF CRF)",                    en: "🔬 Neural (DCNF CRF)"                    },
  mMath:          { ru: "📐 Математический",                            uz: "📐 Matematik",                            en: "📐 Mathematical"                          },
  crfAuto:        { ru: "Авто",                                         uz: "Avto",                                    en: "Auto"                                     },
  crfNone:        { ru: "DA V2 (чистый)",                               uz: "DA V2 (sof)",                             en: "DA V2 (pure)"                             },
  crfLight:       { ru: "+ лёгкий CRF",                                 uz: "+ yengil CRF",                            en: "+ light CRF"                              },
  crfFull:        { ru: "CRF-style",                                    uz: "CRF-uslub",                               en: "CRF-style"                                },
  photoDetected:  { ru: "📷 Обнаружено фото → Neural Depth",           uz: "📷 Foto aniqlandi → Neural Depth",        en: "📷 Photo detected → Neural Depth"        },
  depthMethod:    { ru: "Метод глубины:",                               uz: "Chuqurlik usuli:",                        en: "Depth method:"                            },
  compTitle:      { ru: "Сравнение методов (Liu et al. CVPR)",     uz: "Usullarni taqqoslash (Liu et al. CVPR)", en: "Method comparison (Liu et al. CVPR)" },
  compCaption:    { ru: "Unary only (y*=z) vs Full CRF (y*=A⁻¹z, A=I+D−R)", uz: "Unary only vs Full CRF",           en: "Unary only (y*=z) vs Full CRF (y*=A⁻¹z, A=I+D−R)" },
  compNumTitle:   { ru: "Числовое сравнение",                           uz: "Raqamli taqqoslash",                      en: "Numerical comparison"                     },
  compNote:       { ru: "Сравнение по Liu et al. (Figure 4): эффект CRF на слабом unary. DA V2 — нейросеть-reference (потолок).", uz: "Liu et al. bo'yicha taqqoslash (4-rasm): CRF ta'siri. DA V2 — neyroset-reference (chegara).", en: "Comparison per Liu et al. (Figure 4): CRF effect on weak unary. DA V2 — neural reference (quality ceiling)." },
  compMake3dNote: { ru: "Make3D (Saxena et al.) — классический плоскостной бейзлайн (кусочно-плоская модель + MRF), прямой предшественник Liu et al. Сравнение показывает место DCNF CRF относительно плоскостного подхода.", uz: "Make3D (Saxena et al.) — klassik tekislikka asoslangan baza. Liu et al. ning bevosita salafi. DCNF CRF ning tekislik yondashuviga nisbatan o'rnini ko'rsatadi.", en: "Make3D (Saxena et al.) — classic piecewise-planar baseline (MRF), direct predecessor of Liu et al. Shows where DCNF CRF stands vs the planar approach." },
  effectTitle:    { ru: "Эффект DCNF CRF (vs сырой unary)",            uz: "DCNF CRF ta'siri (xom unary vs)",        en: "DCNF CRF effect (vs raw unary)"           },
  edgeAlign:      { ru: "Совпадение границ",                            uz: "Chegara mos kelishi",                     en: "Edge alignment"                           },
  usefulDetail:   { ru: "Полезные детали",                              uz: "Foydali tafsilotlar",                     en: "Useful detail"                            },
  texCoh:         { ru: "Текстурная связность",                         uz: "Tekstura bog'liqligi",                    en: "Texture coherence"                        },
  smoothness:     { ru: "Гладкость",                                    uz: "Silliqlik",                               en: "Smoothness"                               },
  gradEnergy:     { ru: "Детализация",                                  uz: "Tafsilotlilik",                           en: "Gradient energy"                          },
  depthRange:     { ru: "Диапазон",                                     uz: "Diapazon",                                en: "Depth range"                              },
  metricLbl:      { ru: "Метрика",                                      uz: "Ko'rsatkich",                             en: "Metric"                                   },
  crfVsUnary:     { ru: "CRF изменил Unary",                           uz: "CRF Unaryni o'zgartirdi",                 en: "CRF vs Unary delta"                       },
  daVsCrf:        { ru: "DA V2 vs CRF",                                 uz: "DA V2 vs CRF",                            en: "DA V2 vs CRF"                             },
  daVsUnary:      { ru: "DA V2 vs Unary",                               uz: "DA V2 vs Unary",                          en: "DA V2 vs Unary"                           },
  relNote:        { ru: "Относительные метрики (без ground truth). Зелёным — лучший из Unary/CRF; DA V2 — reference (серым).", uz: "Nisbiy ko'rsatkichlar (ground truth'siz). Yashil — Unary/CRF ichida eng yaxshi; DA V2 — reference (kulrang).", en: "Relative metrics (no ground truth). Green — best of Unary/CRF; DA V2 — reference (grey)." },
  ablTitle:       { ru: "Ablation study нашего метода (Liu Table 2 style)", uz: "Bizning usulning ablation tadqiqoti (Liu Jadval 2)", en: "Ablation study of our method (Liu Table 2 style)" },
  ablConfig:      { ru: "Конфигурация",                                 uz: "Konfiguratsiya",                          en: "Configuration"                            },
  ablEdge:        { ru: "Совпадение границ",                            uz: "Chegara mos kelishi",                     en: "Edge alignment"                           },
  ablSmooth:      { ru: "Гладкость",                                    uz: "Silliqlik",                               en: "Smoothness"                               },
  ablTex:         { ru: "Текстурная связность",                         uz: "Tekstura bog'liqligi",                    en: "Texture coherence"                        },
  ablRange:       { ru: "Диапазон",                                     uz: "Diapazon",                                en: "Depth range"                              },
  ablCaption:     { ru: "Каждая строка добавляет один pairwise-признак нашего метода (color → histogram → LBP → spatial).", uz: "Har bir satr bizning usulning bitta pairwise-belgisini qo'shadi (color → histogram → LBP → spatial).", en: "Each row adds one pairwise feature of our method (color → histogram → LBP → spatial)." },
  depthImagesTitle: { ru: "Карта глубины (DCNF)",                      uz: "Chuqurlik xaritasi (DCNF)",               en: "Depth map (DCNF)"                         },
  liuTable1Title:  { ru: "Таблица 1. Сравнение методов (Make3D dataset, Liu et al. CVPR)", uz: "Jadval 1. Usullarni taqqoslash (Make3D dataset, Liu et al. CVPR)", en: "Table 1. Method comparison (Make3D dataset, Liu et al. CVPR)" },
  liuTable2Title:  { ru: "Таблица 2. Ablation study (Make3D dataset, Liu et al. CVPR)",    uz: "Jadval 2. Ablation tadqiqoti (Make3D dataset, Liu et al. CVPR)",    en: "Table 2. Ablation study (Make3D dataset, Liu et al. CVPR)"   },
  liuTable1Cap:   { ru: "Стандартные метрики глубины: ↓ меньше — лучше, ↑ больше — лучше. Жирным — лучший результат в каждом столбце.", uz: "Standart chuqurlik ko'rsatkichlari: ↓ kichik — yaxshi, ↑ katta — yaxshi. Qalin — har bir ustundagi eng yaxshi natija.", en: "Standard depth metrics: ↓ lower — better, ↑ higher — better. Bold — best in each column." },
  liuTable2Cap:   { ru: "Каждая строка: добавляется один компонент. DA V2 используется как псевдо-эталон (нет реального GT для фракталов).", uz: "Har bir satr: bitta komponent qo'shiladi. DA V2 psevdo-etalon sifatida ishlatiladi (fraktallar uchun haqiqiy GT yo'q).", en: "Each row adds one component. DA V2 used as pseudo ground truth (no real GT for fractals)." },
  lowerBetter:    { ru: "Ошибки (↓ меньше — лучше)",                   uz: "Xatolar (↓ kichik — yaxshi)",             en: "Errors (↓ lower — better)"               },
  higherBetter:   { ru: "Точность (↑ больше — лучше)",                  uz: "Aniqlik (↑ katta — yaxshi)",              en: "Accuracy (↑ higher — better)"            },
  methodCol:      { ru: "Метод",                                         uz: "Usul",                                    en: "Method"                                   },
  pseudoGtNote:   { ru: "* Псевдо-GT: Depth Anything V2 с выравниванием по масштабу и сдвигу (min-max нормализация).", uz: "* Psevdo-GT: Depth Anything V2, masshtab va siljish bo'yicha moslashtirish (min-max normalizatsiya).", en: "* Pseudo-GT: Depth Anything V2 with scale-and-shift alignment (min-max normalisation)." },
  holBtn:         { ru: "🔮 Показать как голограмму",                   uz: "🔮 Gologramma sifatida ko'rsatish",        en: "🔮 Show as hologram"                     },
  holLoading:     { ru: "Строю голограмму...",                           uz: "Gologramma qurilmoqda...",                 en: "Building hologram..."                     },
  holDesc:        { ru: "CRF depth → 3D голограмма. Водите мышью для поворота на 150°.", uz: "CRF depth → 3D gologramma. Sichqoncha bilan 150° aylantiring.", en: "CRF depth → 3D hologram. Drag to rotate 150°." },
  splatBtn:       { ru: "✦ Gaussian Splat",                             uz: "✦ Gaussian Splat",                        en: "✦ Gaussian Splat"                         },
  splatLoading:   { ru: "Строю сплаты...",                               uz: "Splatlar qurilmoqda...",                   en: "Building splats..."                       },
  splatDesc:      { ru: "Каждый пиксель → 3D-гауссиан. Размер по градиенту глубины. Вращайте мышью.", uz: "Har piksel → 3D-gaussian. O'lcham chuqurlik gradientidan. Sichqoncha bilan aylantiring.", en: "Each pixel → 3D Gaussian. Size from depth gradient. Drag to rotate." },
  cghBtn:         { ru: "〰 Layer CGH (Fresnel)",                        uz: "〰 Layer CGH (Fresnel)",                   en: "〰 Layer CGH (Fresnel)"                   },
  cghLoading:     { ru: "Считаю CGH...",                                 uz: "CGH hisoblanmoqda...",                     en: "Computing CGH..."                         },
  cghDesc:        { ru: "Глубина → слои → фазовая голограмма (метод из статьи Kumano et al. 2025)", uz: "Chuqurlik → qatlamlar → faza gologrammasi (Kumano et al. 2025 usuli)", en: "Depth → layers → phase hologram (Kumano et al. 2025 method)" },
  cghLayers:      { ru: "слоёв:",                                        uz: "qatlam:",                                  en: "layers:"                                  },
  asmBtn:         { ru: "👁 ASM реконструкция",                         uz: "👁 ASM rekonstruksiyasi",                  en: "👁 ASM reconstruction"                   },
  asmLoading:     { ru: "Реконструирую...",                              uz: "Rekonstruksiya qilinmoqda...",             en: "Reconstructing..."                        },
  asmDesc:        { ru: "Симуляция воспроизведения голограммы (band-limited ASM, λ=520нм)", uz: "Gologrammani qayta tiklash simulyatsiyasi (band-limited ASM, λ=520нм)", en: "Hologram playback simulation (band-limited ASM, λ=520nm)" },
  volBtn:         { ru: "🔷 3D из CGH (томография)",                    uz: "🔷 CGHdan 3D (tomografiya)",               en: "🔷 3D from CGH (tomography)"             },
  volLoading:     { ru: "Сканирую слои...",                              uz: "Qatlamlar skanlanmoqda...",                en: "Scanning layers..."                       },
  volDesc:        { ru: "ASM при N глубинах → 3D точечное облако. Метод: цифровая голографическая микроскопия.", uz: "N chuqurlikda ASM → 3D nuqta buluti. Usul: raqamli golografik mikroskopiya.", en: "ASM at N depths → 3D point cloud. Method: digital holographic microscopy." },
};

// ─── API response types (exact shapes from FractalCNN) ────────────────────────
interface StepImage {
  id: string;
  title: string;
  description?: string;
  data: string;
}

interface DepthMetricTriple {
  unary: number;
  crf: number;
  da_v2?: number | null;
  make3d?: number;
}

interface ComparisonMetrics {
  gradient_energy: DepthMetricTriple;
  useful_detail?: DepthMetricTriple;
  texture_coherence?: DepthMetricTriple;
  smoothness: DepthMetricTriple;
  edge_alignment: DepthMetricTriple;
  depth_range: DepthMetricTriple;
  differences: {
    crf_vs_unary: number;
    da_vs_crf?: number | null;
    da_vs_unary?: number | null;
  };
}

interface AblationRow {
  name: string;
  active: string[];
  metrics: {
    edge_alignment: number;
    useful_detail: number;
    smoothness: number;
    depth_range: number;
    texture_coherence: number;
  };
}

interface AblationData {
  ablation_grid: string;
  table: AblationRow[];
}

interface PipelineStep {
  id: string;
  layer: number;
  title: { ru: string; uz: string };
  confidence: number;
  hint: string;
  metrics: { label: { ru: string; uz: string }; value: string }[];
  images?: StepImage[];
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
    depth_method?: string;
    photo_detection?: { is_photo: boolean; confidence: number; evidence?: string[] } | null;
    depth_routing_reason?: string | null;
  };
  depth_image: string;
  steps: PipelineStep[];
}

// ─── MetricRow: one row in the comparison table ───────────────────────────────
function MetricRow({ label, values }: { label: string; values?: DepthMetricTriple }) {
  if (!values || typeof values.unary !== "number") {
    return (
      <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
        <td className="py-1" style={{ color: "var(--text-secondary)" }}>{label}</td>
        <td className="text-center py-1" style={{ color: "var(--text-secondary)" }}>—</td>
        <td className="text-center py-1" style={{ color: "var(--text-secondary)" }}>—</td>
        <td className="text-center py-1" style={{ color: "var(--text-secondary)" }}>—</td>
        <td className="text-center py-1" style={{ color: "var(--text-secondary)" }}>—</td>
      </tr>
    );
  }
  const ourBest = Math.max(values.unary, values.crf, ...(typeof values.make3d === "number" ? [values.make3d] : []));
  const cell = (v: number) => (
    <td className="text-center py-1" style={{ color: v === ourBest ? "#34D399" : "var(--text-secondary)", fontWeight: v === ourBest ? 700 : 400 }}>
      {v.toFixed(3)}
    </td>
  );
  const daCell = (v?: number | null) => (
    <td className="text-center py-1 italic" style={{ color: "#64748B" }}>
      {typeof v === "number" ? v.toFixed(3) : "—"}
    </td>
  );
  return (
    <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
      <td className="py-1" style={{ color: "var(--text-secondary)" }}>{label}</td>
      {typeof values.make3d === "number"
        ? cell(values.make3d)
        : <td className="text-center py-1" style={{ color: "var(--text-secondary)" }}>—</td>}
      {daCell(values.da_v2)}
      {cell(values.unary)}
      {cell(values.crf)}
    </tr>
  );
}

// ─── interpretMetrics helper ──────────────────────────────────────────────────
function interpretMetrics(m: ComparisonMetrics, lang: string): string {
  const ea = m.edge_alignment;
  const edgeGain = ea.unary > 1e-9 ? (ea.crf / ea.unary - 1) * 100 : 0;
  if (lang === "uz") {
    return `DCNF CRF chegara mos kelishini ${edgeGain.toFixed(0)}% ga yaxshiladi (xom unary bilan taqqoslaganda). Bu Liu et al., 4-rasmda pairwise silliqlik ta'sirini ko'rsatadi. DA V2 neyroset-reference sifatida ko'rsatilgan (raqobatchi emas).`;
  }
  if (lang === "en") {
    const parts: string[] = [];
    if (edgeGain > 15) parts.push(`DCNF CRF improved edge alignment by ${edgeGain.toFixed(0)}% over raw unary.`);
    else if (edgeGain > 0) parts.push(`DCNF CRF improved edge alignment by ${edgeGain.toFixed(0)}%.`);
    parts.push("This demonstrates the pairwise smoothness effect (Liu et al., Figure 4).");
    parts.push("DA V2 is shown as a neural reference (quality ceiling), not a competitor.");
    return parts.join(" ");
  }
  const parts: string[] = [];
  if (edgeGain > 15) {
    parts.push(`DCNF CRF улучшил совпадение границ на ${edgeGain.toFixed(0)}% относительно сырого unary.`);
  } else if (edgeGain > 0) {
    parts.push(`DCNF CRF улучшил совпадение границ на ${edgeGain.toFixed(0)}%.`);
  }
  parts.push("Это демонстрирует эффект pairwise smoothness (Liu et al., Figure 4).");
  parts.push("DA V2 показан как нейросеть-reference (потолок качества), не конкурент.");
  return parts.join(" ");
}

// ─── interpretAblation helper ─────────────────────────────────────────────────
function interpretAblation(table: AblationRow[], lang: string): string {
  if (table.length === 0) return "";
  const first = table[0].metrics.edge_alignment;
  const last = table[table.length - 1].metrics.edge_alignment;
  const gain = first > 1e-9 ? ((last / first - 1) * 100).toFixed(0) : "0";
  if (lang === "uz") {
    return `Bizning usulning to'liq konfiguratsiyasi chegara mos kelishini ${gain}% ga yaxshiladi (faqat unary bilan taqqoslaganda). Har bir pairwise-belgi (color, histogram, LBP, spatial) hissa qo'shadi: bu Liu DCNF-CRF ni bizning asosiy chuqurlik usuli sifatida asoslaydi.`;
  }
  if (lang === "en") {
    return `Our full configuration improved edge alignment by ${gain}% over unary-only. Each pairwise feature (color, histogram, LBP, spatial) contributes — justifying Liu DCNF-CRF as our primary depth method.`;
  }
  return `Полная конфигурация нашего метода улучшила совпадение границ на ${gain}% относительно unary-only. Каждый pairwise-признак (color, histogram, LBP, spatial) вносит вклад: это обосновывает финальный Liu DCNF-CRF как наш основной depth method.`;
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function DepthCRF() {
  const { lang } = useLang();

  // ── Upload state ──────────────────────────────────────────────────────────
  const [hasImage, setHasImage]       = useState(false);
  const [isDragOver, setIsDragOver]   = useState(false);
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null);

  // ── Selector state ────────────────────────────────────────────────────────
  const [depthMethod, setDepthMethod] = useState<"auto" | "neural" | "mathematical">("auto");
  const [crfStrength, setCrfStrength] = useState<"auto" | "none" | "light" | "full">("auto");

  // ── Depth action state ────────────────────────────────────────────────────
  const [depthLoading, setDepthLoading]         = useState(false);
  const [depthError, setDepthError]             = useState(false);
  const [depthStepImages, setDepthStepImages]   = useState<StepImage[] | null>(null);
  const [depthFinal, setDepthFinal]             = useState<AnalyzeStepsResponse["final"] | null>(null);

  // ── Compare state ──────────────────────────────────────────────────────────
  const [compareLoading, setCompareLoading]     = useState(false);
  const [compareError, setCompareError]         = useState(false);
  const [comparisonGrid, setComparisonGrid]     = useState<string | null>(null);
  const [comparisonMetrics, setComparisonMetrics] = useState<ComparisonMetrics | null>(null);

  // ── Ablation state ────────────────────────────────────────────────────────
  const [ablationLoading, setAblationLoading]   = useState(false);
  const [ablationError, setAblationError]       = useState(false);
  const [ablationData, setAblationData]         = useState<AblationData | null>(null);

  // ── Hologram state ────────────────────────────────────────────────────────────
  const [holMode, setHolMode] = useState(false);
  const [holLoading, setHolLoading] = useState(false);
  const [holTick, setHolTick] = useState(0);
  const [holInvert, setHolInvert] = useState(false);
  const holCanvasRef = useRef<HTMLCanvasElement>(null);
  const holGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const holRafRef = useRef<number | null>(null);

  // ── Holographic volume state ──────────────────────────────────────────────────
  const [volMode, setVolMode] = useState(false);
  const [volLoading, setVolLoading] = useState(false);
  const [volTick, setVolTick] = useState(0);
  const volCanvasRef = useRef<HTMLCanvasElement>(null);
  const volGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const volRafRef = useRef<number | null>(null);

  // ── Layer CGH + ASM state ─────────────────────────────────────────────────────
  const [cghLoading, setCghLoading] = useState(false);
  const [cghResult, setCghResult] = useState<LayerCGHResult | null>(null);
  const [cghLayers, setCghLayers] = useState(8);
  const [asmLoading, setAsmLoading] = useState(false);
  const [asmResult, setAsmResult] = useState<ASMReconResult | null>(null);
  const [asmZ, setAsmZ] = useState(0.45); // mm
  const cghCanvasRef = useRef<HTMLCanvasElement>(null);
  const asmCanvasRef = useRef<HTMLCanvasElement>(null);

  // ── Gaussian Splat state ──────────────────────────────────────────────────────
  const [splatMode, setSplatMode] = useState(false);
  const [splatLoading, setSplatLoading] = useState(false);
  const [splatTick, setSplatTick] = useState(0);
  const splatCanvasRef = useRef<HTMLCanvasElement>(null);
  const splatGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const splatRafRef = useRef<number | null>(null);

  // ── Canvas refs ───────────────────────────────────────────────────────────
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const hiResCanvasRef  = useRef<HTMLCanvasElement | null>(null);

  // ── Get base64 from hi-res canvas ─────────────────────────────────────────
  const getB64 = useCallback((): string | null => {
    if (!hiResCanvasRef.current) return null;
    return hiResCanvasRef.current.toDataURL("image/png").split(",")[1];
  }, []);

  // ── Process image: draw onto hi-res canvas ≤1024px ────────────────────────
  const processImage = useCallback((img: HTMLImageElement) => {
    const HIRES_MAX = 1024;
    const iw = img.naturalWidth  || img.width  || 512;
    const ih = img.naturalHeight || img.height || 512;
    const scale = Math.min(1, HIRES_MAX / Math.max(iw, ih));
    if (!hiResCanvasRef.current) hiResCanvasRef.current = document.createElement("canvas");
    const hi = hiResCanvasRef.current;
    hi.width  = Math.max(1, Math.round(iw * scale));
    hi.height = Math.max(1, Math.round(ih * scale));
    hi.getContext("2d")!.drawImage(img, 0, 0, hi.width, hi.height);
    setHasImage(true);
  }, []);

  // ── Load a File ───────────────────────────────────────────────────────────
  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    // reset all results
    setDepthStepImages(null); setDepthFinal(null); setDepthError(false);
    setComparisonGrid(null);  setComparisonMetrics(null); setCompareError(false);
    setAblationData(null);    setAblationError(false);

    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => { if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev); return url; });
    const img = new Image();
    img.onload = () => processImage(img);
    img.src = url;
  }, [processImage]);

  // ── Hologram: depth image → 3D point cloud ───────────────────────────────────
  const showHologram = useCallback(async (invertOverride?: boolean) => {
    if (!depthStepImages || depthStepImages.length === 0) return;
    const knownIds = ["full_crf", "crf", "depth", "depth_crf", "result", "full", "crf_result", "depth_map"];
    let depthImg = depthStepImages.find((s) => knownIds.includes(s.id));
    if (!depthImg) depthImg = depthStepImages.find((s) => {
      const t = s.title.toLowerCase();
      return t.includes("crf") || t.includes("depth") || t.includes("full");
    });
    if (!depthImg) depthImg = depthStepImages[depthStepImages.length - 1];
    const depthData = depthImg.data;
    if (!depthData || !previewUrl) return;

    const doInvert = invertOverride ?? holInvert;
    setHolLoading(true);

    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d")!;

    const depthImgEl = new Image();
    const srcImgEl = new Image();

    await Promise.all([
      new Promise<void>((res) => { depthImgEl.onload = () => res(); depthImgEl.src = depthData; }),
      new Promise<void>((res) => { srcImgEl.onload = () => res(); srcImgEl.src = previewUrl; }),
    ]);

    const W = Math.min(depthImgEl.width, 256);
    const H = Math.min(depthImgEl.height, 256);
    offscreen.width = W;
    offscreen.height = H;

    offCtx.drawImage(depthImgEl, 0, 0, W, H);
    const depthPixels = offCtx.getImageData(0, 0, W, H).data;

    offCtx.drawImage(srcImgEl, 0, 0, W, H);
    const colorPixels = offCtx.getImageData(0, 0, W, H).data;

    const n = W * H;
    const rawDepth = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const di = i * 4;
      rawDepth[i] = (depthPixels[di] + depthPixels[di + 1] + depthPixels[di + 2]) / (3 * 255);
    }

    // 2-pass 3×3 box filter: smooths IFS/noisy depth maps while preserving edges
    const smoothed = new Float32Array(n);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        smoothed[i] = (
          rawDepth[i - W - 1] + rawDepth[i - W] + rawDepth[i - W + 1] +
          rawDepth[i - 1]     + rawDepth[i]      + rawDepth[i + 1] +
          rawDepth[i + W - 1] + rawDepth[i + W]  + rawDepth[i + W + 1]
        ) / 9;
      }
    }
    // second pass
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        rawDepth[i] = (
          smoothed[i - W - 1] + smoothed[i - W] + smoothed[i - W + 1] +
          smoothed[i - 1]     + smoothed[i]      + smoothed[i + 1] +
          smoothed[i + W - 1] + smoothed[i + W]  + smoothed[i + W + 1]
        ) / 9;
      }
    }

    let dMin = 1, dMax = 0;
    for (let i = 0; i < n; i++) {
      if (rawDepth[i] < dMin) dMin = rawDepth[i];
      if (rawDepth[i] > dMax) dMax = rawDepth[i];
    }
    const dRange = Math.max(dMax - dMin, 0.01);
    const depthScale = 1.5;

    // Sample every other pixel to reduce density; skip near-background points
    const STEP = 2;
    const posArr: number[] = [];
    const colArr: number[] = [];

    for (let y = 0; y < H; y += STEP) {
      for (let x = 0; x < W; x += STEP) {
        const i = y * W + x;
        const depthNorm = (rawDepth[i] - dMin) / dRange;
        const dv = doInvert ? 1 - depthNorm : depthNorm;
        if (dv < 0.08) continue; // skip flat background

        posArr.push(
          (x / W - 0.5) * 4,
          -(y / H - 0.5) * 4,
          (dv - 0.5) * depthScale,
        );
        // Source image luminance → holographic cyan tint
        // Bright areas stay bright, dark areas go dim — shape stays recognizable
        const di = i * 4;
        const lum = (colorPixels[di] * 0.299 + colorPixels[di + 1] * 0.587 + colorPixels[di + 2] * 0.114) / 255;
        const br = 0.25 + lum * 0.75; // 0.25..1.0
        colArr.push(
          br * 0.15,   // R — low: stays cyan/blue
          br * 0.85,   // G
          br * 1.0,    // B — high
        );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(posArr), 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(colArr), 3));

    holGeoRef.current = geo;
    setHolTick((t) => t + 1);
    setHolLoading(false);
    setHolMode(true);
  }, [depthStepImages, previewUrl, holInvert]);

  // ── THREE.js hologram renderer ───────────────────────────────────────────────────
  useEffect(() => {
    if (!holMode || !holGeoRef.current || !holCanvasRef.current) return;
    const canvas = holCanvasRef.current;

    if (holRafRef.current !== null) { cancelAnimationFrame(holRafRef.current); holRafRef.current = null; }

    canvas.width = 520;
    canvas.height = 420;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(520, 420);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a14);

    try {
      const geo = holGeoRef.current.clone();
      const hol = createHologramScene(geo, canvas);

      let lastT = performance.now() / 1000;
      let running = true;

      const anim = () => {
        if (!running) return;
        holRafRef.current = requestAnimationFrame(anim);
        const t = performance.now() / 1000;
        const dt = Math.min(t - lastT, 0.05);
        lastT = t;
        hol.controls.update(dt);
        try { renderer.render(hol.scene, hol.camera); } catch { /* skip */ }
      };
      anim();

      return () => {
        running = false;
        if (holRafRef.current !== null) cancelAnimationFrame(holRafRef.current);
        hol.controls.dispose();
        renderer.dispose();
      };
    } catch {
      setHolMode(false);
    }
  }, [holTick, holMode]);

  // ── Gaussian Splat: depth image → 3D splats ──────────────────────────────────
  const showSplat = useCallback(async () => {
    if (!depthStepImages || depthStepImages.length === 0) return;
    const knownIds = ["full_crf", "crf", "depth", "depth_crf", "result", "full", "crf_result", "depth_map"];
    let depthImg = depthStepImages.find((s) => knownIds.includes(s.id));
    if (!depthImg) depthImg = depthStepImages[depthStepImages.length - 1];
    if (!depthImg?.data || !previewUrl) return;

    setSplatLoading(true);

    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d")!;
    const depthImgEl = new Image();
    const srcImgEl = new Image();

    await Promise.all([
      new Promise<void>((res) => { depthImgEl.onload = () => res(); depthImgEl.src = depthImg!.data; }),
      new Promise<void>((res) => { srcImgEl.onload = () => res(); srcImgEl.src = previewUrl; }),
    ]);

    const W = Math.min(depthImgEl.width, 192);
    const H = Math.min(depthImgEl.height, 192);
    offscreen.width = W; offscreen.height = H;

    offCtx.drawImage(depthImgEl, 0, 0, W, H);
    const depthPixels = offCtx.getImageData(0, 0, W, H).data;
    offCtx.drawImage(srcImgEl, 0, 0, W, H);
    const colorPixels = offCtx.getImageData(0, 0, W, H).data;

    const rawDepth = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const d = i * 4;
      rawDepth[i] = (depthPixels[d] + depthPixels[d + 1] + depthPixels[d + 2]) / (3 * 255);
    }

    // 2-pass 3×3 box filter to remove IFS/fractal depth noise
    const sm2 = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        sm2[i] = (
          rawDepth[i - W - 1] + rawDepth[i - W] + rawDepth[i - W + 1] +
          rawDepth[i - 1]     + rawDepth[i]      + rawDepth[i + 1] +
          rawDepth[i + W - 1] + rawDepth[i + W]  + rawDepth[i + W + 1]
        ) / 9;
      }
    }
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        rawDepth[i] = (
          sm2[i - W - 1] + sm2[i - W] + sm2[i - W + 1] +
          sm2[i - 1]     + sm2[i]      + sm2[i + 1] +
          sm2[i + W - 1] + sm2[i + W]  + sm2[i + W + 1]
        ) / 9;
      }
    }

    let dMin = 1, dMax = 0;
    for (let i = 0; i < W * H; i++) {
      if (rawDepth[i] < dMin) dMin = rawDepth[i];
      if (rawDepth[i] > dMax) dMax = rawDepth[i];
    }
    const dRange = Math.max(dMax - dMin, 0.01);

    const STEP = 2;
    const depthScale = 1.8;
    const posArr: number[] = [];
    const colArr: number[] = [];
    const sizeArr: number[] = [];

    for (let y = STEP; y < H - STEP; y += STEP) {
      for (let x = STEP; x < W - STEP; x += STEP) {
        const i = y * W + x;
        const depthNorm = (rawDepth[i] - dMin) / dRange;
        if (depthNorm < 0.02) continue;

        // Local gradient: estimate depth discontinuity
        const gx = rawDepth[i + 1] - rawDepth[i - 1];
        const gy = rawDepth[i + W] - rawDepth[i - W];
        const gradient = Math.sqrt(gx * gx + gy * gy);

        // Gaussian size: large in smooth regions, small at edges
        const baseSize = 0.085;
        const splatSize = baseSize / (1 + gradient * 30);

        posArr.push(
          (x / W - 0.5) * 4,
          -(y / H - 0.5) * 4,
          (depthNorm - 0.5) * depthScale,
        );

        // Source image color — boosted to be visible on dark background
        const ci = i * 4;
        const r = colorPixels[ci] / 255;
        const g = colorPixels[ci + 1] / 255;
        const b = colorPixels[ci + 2] / 255;
        const lum = r * 0.299 + g * 0.587 + b * 0.114;
        // Ensure minimum brightness of 0.45 so dark source images still show
        const boost = lum < 0.45 ? (0.45 / Math.max(lum, 0.02)) : 1.1;
        colArr.push(
          Math.min(r * boost + depthNorm * 0.08, 1.0),
          Math.min(g * boost + depthNorm * 0.15, 1.0),
          Math.min(b * boost + depthNorm * 0.08, 1.0),
        );
        sizeArr.push(splatSize);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(posArr), 3));
    geo.setAttribute("aColor",   new THREE.Float32BufferAttribute(new Float32Array(colArr), 3));
    geo.setAttribute("aSize",    new THREE.Float32BufferAttribute(new Float32Array(sizeArr), 1));

    splatGeoRef.current = geo;
    setSplatTick((t) => t + 1);
    setSplatLoading(false);
    setSplatMode(true);
  }, [depthStepImages, previewUrl]);

  // ── Holographic tomography: ASM at N depths → 3D point cloud ─────────────────
  const showVolume = useCallback(async () => {
    if (!cghResult) return;
    setVolLoading(true);
    setVolMode(false);

    const { phaseG, W, H } = cghResult;
    const N_PLANES = 12;
    const Z_MIN = 0.05e-3, Z_MAX = 0.80e-3;

    // Source image colors
    const srcR = new Float32Array(W * H);
    const srcG = new Float32Array(W * H);
    const srcB = new Float32Array(W * H);
    if (previewUrl) {
      const off = document.createElement("canvas");
      off.width = W; off.height = H;
      const ctx = off.getContext("2d")!;
      const img = new Image();
      await new Promise<void>((res) => { img.onload = () => res(); img.src = previewUrl; });
      ctx.drawImage(img, 0, 0, W, H);
      const px = ctx.getImageData(0, 0, W, H).data;
      for (let i = 0; i < W * H; i++) {
        srcR[i] = px[i * 4] / 255;
        srcG[i] = px[i * 4 + 1] / 255;
        srcB[i] = px[i * 4 + 2] / 255;
      }
    }

    // Depth-from-focus: for each pixel store the best-focus z-plane index
    // Focus metric: variance-of-Laplacian (sharpness at each pixel)
    const bestFocus = new Float32Array(W * H);      // best focus score per pixel
    const bestZIdx  = new Int16Array(W * H).fill(-1); // which z-plane was sharpest

    for (let n = 0; n < N_PLANES; n++) {
      const z = Z_MIN + (n / (N_PLANES - 1)) * (Z_MAX - Z_MIN);
      await new Promise((r) => setTimeout(r, 0));

      const { intensity } = asmReconstruct(phaseG, W, H, z);

      // Variance-of-Laplacian as focus measure (suppresses interference fringes better than gradient)
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          const lap = Math.abs(
            intensity[i - W] + intensity[i + W] +
            intensity[i - 1] + intensity[i + 1] -
            4 * intensity[i]
          );
          if (lap > bestFocus[i]) {
            bestFocus[i] = lap;
            bestZIdx[i] = n;
          }
        }
      }
    }

    // Global focus threshold — keep only pixels with strong-enough focus
    let sumF = 0;
    for (let i = 0; i < W * H; i++) sumF += bestFocus[i];
    const meanF = sumF / (W * H);
    let varSum = 0;
    for (let i = 0; i < W * H; i++) varSum += (bestFocus[i] - meanF) ** 2;
    const stdF = Math.sqrt(varSum / (W * H));
    const threshold = meanF + stdF * 0.8;

    const posArr: number[] = [];
    const colArr: number[] = [];
    const sizeArr: number[] = [];

    const STEP = 2;
    for (let y = STEP; y < H - STEP; y += STEP) {
      for (let x = STEP; x < W - STEP; x += STEP) {
        const i = y * W + x;
        if (bestFocus[i] < threshold || bestZIdx[i] < 0) continue;

        const n = bestZIdx[i];
        const z = Z_MIN + (n / (N_PLANES - 1)) * (Z_MAX - Z_MIN);
        const zWorld = ((Z_MAX - z) / (Z_MAX - Z_MIN) - 0.5) * 2.5;
        const fStr = Math.min((bestFocus[i] - threshold) / (stdF * 1.5 + 1e-9), 1.0);

        posArr.push((x / W - 0.5) * 4, -(y / H - 0.5) * 4, zWorld);

        const lum = srcR[i] * 0.299 + srcG[i] * 0.587 + srcB[i] * 0.114;
        const br = 0.3 + lum * 0.7;
        colArr.push(br * fStr * 0.15, br * fStr * 0.95, br * fStr * 0.35);
        sizeArr.push(0.04 + fStr * 0.03);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(posArr), 3));
    geo.setAttribute("aColor",   new THREE.Float32BufferAttribute(new Float32Array(colArr), 3));
    geo.setAttribute("aSize",    new THREE.Float32BufferAttribute(new Float32Array(sizeArr), 1));

    volGeoRef.current = geo;
    setVolTick((t) => t + 1);
    setVolLoading(false);
    setVolMode(true);
  }, [cghResult, previewUrl]);

  // ── THREE.js holographic volume renderer ──────────────────────────────────────
  useEffect(() => {
    if (!volMode || !volGeoRef.current || !volCanvasRef.current) return;
    const canvas = volCanvasRef.current;
    if (volRafRef.current !== null) { cancelAnimationFrame(volRafRef.current); volRafRef.current = null; }

    canvas.width = 520; canvas.height = 420;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(520, 420);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x020810);

    try {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x020810, 5, 12);

      const camera = new THREE.PerspectiveCamera(50, 520 / 420, 0.01, 20);
      camera.position.set(1.8, 1.0, 3.0);
      camera.lookAt(0, 0, 0);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.5;

      const geo = volGeoRef.current!.clone();
      const points = createSplatPoints(geo, { camera, worldMatrix: new THREE.Matrix4() });
      scene.add(points);

      let running = true, frame = 0;
      const anim = () => {
        if (!running) return;
        volRafRef.current = requestAnimationFrame(anim);
        controls.update();
        if (++frame % 6 === 0) sortSplatPoints(points, camera);
        renderer.render(scene, camera);
      };
      anim();

      return () => {
        running = false;
        if (volRafRef.current !== null) cancelAnimationFrame(volRafRef.current);
        controls.dispose(); renderer.dispose(); geo.dispose();
      };
    } catch { setVolMode(false); }
  }, [volTick, volMode]);

  // ── Layer-based CGH ───────────────────────────────────────────────────────────
  const showCGH = useCallback(async (nL?: number) => {
    if (!depthStepImages || depthStepImages.length === 0) return;
    const knownIds = ["full_crf", "crf", "depth", "depth_crf", "result", "full", "crf_result", "depth_map"];
    let depthImg = depthStepImages.find((s) => knownIds.includes(s.id));
    if (!depthImg) depthImg = depthStepImages[depthStepImages.length - 1];
    if (!depthImg?.data) return;

    const layers = nL ?? cghLayers;
    setCghLoading(true);
    setCghResult(null);
    setAsmResult(null);

    const off = document.createElement("canvas");
    const ctx = off.getContext("2d")!;
    const depEl = new Image();
    await new Promise<void>((res) => { depEl.onload = () => res(); depEl.src = depthImg!.data; });

    const W = Math.min(depEl.width, 256);
    const H = Math.min(depEl.height, 256);
    off.width = W; off.height = H;

    ctx.drawImage(depEl, 0, 0, W, H);
    const depPx = ctx.getImageData(0, 0, W, H).data;

    const n = W * H;
    const rawDepth = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      rawDepth[i] = (depPx[i * 4] + depPx[i * 4 + 1] + depPx[i * 4 + 2]) / (3 * 255);
    }

    // Normalise depth
    let dMin = 1, dMax = 0;
    for (let i = 0; i < n; i++) {
      if (rawDepth[i] < dMin) dMin = rawDepth[i];
      if (rawDepth[i] > dMax) dMax = rawDepth[i];
    }
    const dR = Math.max(dMax - dMin, 0.01);
    const depthNorm = new Float32Array(n);
    for (let i = 0; i < n; i++) depthNorm[i] = (rawDepth[i] - dMin) / dR;

    // Green luminance from source image
    const lumG = new Float32Array(n);
    if (previewUrl) {
      const srcEl = new Image();
      await new Promise<void>((res) => { srcEl.onload = () => res(); srcEl.src = previewUrl; });
      ctx.drawImage(srcEl, 0, 0, W, H);
      const srcPx = ctx.getImageData(0, 0, W, H).data;
      for (let i = 0; i < n; i++) {
        lumG[i] = (srcPx[i * 4] * 0.299 + srcPx[i * 4 + 1] * 0.587 + srcPx[i * 4 + 2] * 0.114) / 255;
      }
    } else {
      for (let i = 0; i < n; i++) lumG[i] = depthNorm[i]; // fallback: depth as luminance
    }

    // Yield to browser then compute (avoids frozen UI)
    await new Promise((r) => setTimeout(r, 0));
    const result = layerBasedCGH(depthNorm, lumG, W, H, layers);
    setCghResult(result);
    setCghLoading(false);
  }, [depthStepImages, previewUrl, cghLayers]);

  // ── ASM reconstruction ────────────────────────────────────────────────────────
  const showASM = useCallback(async (zMm?: number) => {
    if (!cghResult) return;
    setAsmLoading(true);
    const z = (zMm ?? asmZ) * 1e-3; // mm → m
    await new Promise((r) => setTimeout(r, 0));
    const result = asmReconstruct(cghResult.phaseG, cghResult.W, cghResult.H, z);
    setAsmResult(result);
    setAsmLoading(false);
  }, [cghResult, asmZ]);

  // ── Draw CGH phase to canvas ──────────────────────────────────────────────────
  useEffect(() => {
    if (!cghResult || !cghCanvasRef.current) return;
    const canvas = cghCanvasRef.current;
    canvas.width = cghResult.W; canvas.height = cghResult.H;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(phaseToImageData(cghResult.phaseG, cghResult.W, cghResult.H, ctx), 0, 0);
  }, [cghResult]);

  // ── Draw ASM reconstruction to canvas ────────────────────────────────────────
  useEffect(() => {
    if (!asmResult || !asmCanvasRef.current) return;
    const canvas = asmCanvasRef.current;
    canvas.width = asmResult.W; canvas.height = asmResult.H;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(intensityToImageData(asmResult.intensity, asmResult.W, asmResult.H, ctx, true), 0, 0);
  }, [asmResult]);

  // ── THREE.js splat renderer ───────────────────────────────────────────────────
  useEffect(() => {
    if (!splatMode || !splatGeoRef.current || !splatCanvasRef.current) return;
    const canvas = splatCanvasRef.current;

    if (splatRafRef.current !== null) { cancelAnimationFrame(splatRafRef.current); splatRafRef.current = null; }

    canvas.width = 520; canvas.height = 420;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(520, 420);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x060b18);

    try {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x060b18, 4, 10);

      const camera = new THREE.PerspectiveCamera(50, 520 / 420, 0.01, 20);
      // Angled view to immediately show depth (not flat front-on)
      camera.position.set(1.5, 0.8, 2.6);
      camera.lookAt(0, 0, 0);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.minDistance = 0.5;
      controls.maxDistance = 8;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
      controls.target.set(0, 0, 0);

      const geo = splatGeoRef.current.clone();
      let points = createSplatPoints(geo, { camera, worldMatrix: new THREE.Matrix4() });
      scene.add(points);

      let running = true;
      let frameCount = 0;

      const anim = () => {
        if (!running) return;
        splatRafRef.current = requestAnimationFrame(anim);
        controls.update();
        frameCount++;
        // Re-sort splats every 6 frames for correct alpha blending
        if (frameCount % 6 === 0) sortSplatPoints(points, camera);
        renderer.render(scene, camera);
      };
      anim();

      return () => {
        running = false;
        if (splatRafRef.current !== null) cancelAnimationFrame(splatRafRef.current);
        controls.dispose();
        renderer.dispose();
        geo.dispose();
      };
    } catch {
      setSplatMode(false);
    }
  }, [splatTick, splatMode]);

  // ── ACTION 1: Depth map (DCNF) via /analyze_steps ─────────────────────────
  const runDepth = useCallback(async () => {
    const b64 = getB64();
    if (!b64 || depthLoading) return;
    setDepthLoading(true);
    setDepthError(false);
    setDepthStepImages(null);
    setDepthFinal(null);
    try {
      const res = await fetch("http://localhost:8000/analyze_steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: b64,
          generate_images: true,
          depth_method: depthMethod,
          crf_strength: crfStrength,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AnalyzeStepsResponse = await res.json();
      setDepthFinal(data.final);
      // find step with id === "depth"
      const depthStep = data.steps.find((s) => s.id === "depth");
      setDepthStepImages(depthStep?.images ?? null);
    } catch {
      setDepthError(true);
    } finally {
      setDepthLoading(false);
    }
  }, [getB64, depthLoading, depthMethod, crfStrength]);

  // ── ACTION 2: Compare depth methods via /compare_depth ────────────────────
  const runCompare = useCallback(async () => {
    const b64 = getB64();
    if (!b64 || compareLoading) return;
    setCompareLoading(true);
    setCompareError(false);
    setComparisonGrid(null);
    setComparisonMetrics(null);
    try {
      const res = await fetch("http://localhost:8000/compare_depth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, depth_method: depthMethod }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { comparison_grid: string; metrics?: ComparisonMetrics } = await res.json();
      setComparisonGrid(data.comparison_grid ?? null);
      setComparisonMetrics(data.metrics ?? null);
    } catch {
      setCompareError(true);
    } finally {
      setCompareLoading(false);
    }
  }, [getB64, compareLoading, depthMethod]);

  // ── ACTION 3: Ablation study via /ablation ────────────────────────────────
  const runAblation = useCallback(async () => {
    const b64 = getB64();
    if (!b64 || ablationLoading) return;
    setAblationLoading(true);
    setAblationError(false);
    setAblationData(null);
    try {
      const res = await fetch("http://localhost:8000/ablation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, depth_method: depthMethod }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AblationData = await res.json();
      setAblationData(data);
    } catch {
      setAblationError(true);
    } finally {
      setAblationLoading(false);
    }
  }, [getB64, ablationLoading, depthMethod]);

  // ─── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--accent-cyan)" }}>
          {T.title[lang]}
        </h2>
        <p style={{ color: "var(--text-secondary)" }}>{T.subtitle[lang]}</p>
      </div>

      {/* ── 1) IMAGE UPLOAD ── */}
      {!hasImage ? (
        <div>
          {/* Drag-and-drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={e => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all"
            style={{
              minHeight: 220,
              background: isDragOver ? "#00E5FF0D" : "var(--bg-secondary)",
              border: `2px dashed ${isDragOver ? "var(--accent-cyan)" : "#1E3A5F"}`,
            }}
          >
            <span style={{ fontSize: 48 }}>🖼️</span>
            <div className="text-base font-semibold" style={{ color: isDragOver ? "var(--accent-cyan)" : "var(--text-primary)" }}>
              {T.dropTitle[lang]}
            </div>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{T.or[lang]}</span>
            <button
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: "#00E5FF22", border: "1px solid var(--accent-cyan)", color: "var(--accent-cyan)" }}
            >
              {T.chooseFile[lang]}
            </button>
          </div>
        </div>
      ) : (
        /* Image preview + reset */
        <div className="flex items-start gap-4 flex-wrap">
          <div className="rounded-xl p-3 shrink-0" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
            <div className="text-xs font-bold mb-2" style={{ color: "var(--accent-cyan)" }}>{T.sourceImg[lang]}</div>
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={T.sourceImg[lang]}
                style={{ display: "block", width: 160, height: 160, objectFit: "contain", imageRendering: "auto", borderRadius: 6, background: "#000" }}
              />
            )}
          </div>
          <div className="flex flex-col justify-end" style={{ minHeight: 184 }}>
            <button
              onClick={() => {
                setHasImage(false);
                setPreviewUrl((prev) => { if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev); return null; });
                setDepthStepImages(null); setDepthFinal(null); setDepthError(false);
                setComparisonGrid(null);  setComparisonMetrics(null); setCompareError(false);
                setAblationData(null);    setAblationError(false);
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: "#33000022", border: "1px solid #FF444444", color: "#FF6666" }}
            >
              {T.reset[lang]}
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }}
      />

      {/* ── 2) SELECTORS (always shown once image is loaded) ── */}
      {hasImage && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
          {/* Depth method */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold shrink-0" style={{ color: "var(--text-secondary)" }}>{T.depthLabel[lang]}</span>
            {(
              [
                { key: "auto",        label: T.mAuto[lang] },
                { key: "neural",      label: T.mNeural[lang] },
                { key: "mathematical",label: T.mMath[lang] },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                onClick={() => setDepthMethod(m.key)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: depthMethod === m.key ? "#06b6d422" : "var(--bg-card)",
                  border: `1px solid ${depthMethod === m.key ? "#06b6d4" : "var(--border-color)"}`,
                  color: depthMethod === m.key ? "#06b6d4" : "var(--text-secondary)",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* CRF sub-mode (hidden when mathematical) */}
          {depthMethod !== "mathematical" && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold shrink-0" style={{ color: "var(--text-secondary)" }}>{T.crfLabel[lang]}</span>
              {(
                [
                  { key: "auto",  label: T.crfAuto[lang] },
                  { key: "none",  label: T.crfNone[lang] },
                  { key: "light", label: T.crfLight[lang] },
                  { key: "full",  label: T.crfFull[lang] },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  onClick={() => setCrfStrength(m.key)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                  style={{
                    background: crfStrength === m.key ? "#10B98122" : "var(--bg-card)",
                    border: `1px solid ${crfStrength === m.key ? "#10B981" : "var(--border-color)"}`,
                    color: crfStrength === m.key ? "#34D399" : "var(--text-secondary)",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 3) ACTION: Depth map (DCNF) ── */}
      {hasImage && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-secondary)", border: "1px solid #06b6d444" }}>
          <button
            onClick={runDepth}
            disabled={depthLoading}
            className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{
              background: depthLoading ? "#1E3A5F" : "#06b6d422",
              border: "1px solid #06b6d488",
              color: depthLoading ? "#546E7A" : "#06b6d4",
              cursor: depthLoading ? "wait" : "pointer",
            }}
          >
            {depthLoading ? T.depthLoading[lang] : T.depthBtn[lang]}
          </button>

          {/* Error */}
          {depthError && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#FF000011", border: "1px solid #FF444444", color: "#FF6666" }}>
              {T.offline[lang]}
            </div>
          )}

          {/* Photo detection banner */}
          {depthFinal?.photo_detection?.is_photo && (
            <div className="rounded-lg p-2 text-xs" style={{ background: "#78350F33", border: "1px solid #D97706" }}>
              {T.photoDetected[lang]}
              {depthFinal.depth_routing_reason && (
                <span className="ml-2" style={{ color: "#FBBF24" }}>{depthFinal.depth_routing_reason}</span>
              )}
            </div>
          )}

          {/* depth_method badge */}
          {depthFinal?.depth_method && (
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {T.depthMethod[lang]}{" "}
              <span className="font-mono font-semibold" style={{ color: "#06b6d4" }}>{depthFinal.depth_method}</span>
            </div>
          )}

          {/* Step images grid */}
          {depthStepImages && depthStepImages.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: "#06b6d4" }}>{T.depthImagesTitle[lang]}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ maxWidth: 620 }}>
                {depthStepImages.map((img) => (
                  <div key={img.id} className="rounded-lg p-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                    <div className="text-xs font-semibold mb-1" style={{ color: "#06b6d4" }}>{img.title}</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.data}
                      alt={img.title}
                      className="w-full rounded"
                      style={{ imageRendering: "auto", border: "1px solid var(--border-color)" }}
                    />
                    {img.description && (
                      <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{img.description}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Hologram button */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => showHologram()}
                  disabled={holLoading}
                  className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                  style={{
                    background: holLoading ? "#1E3A5F" : "#0ea5e922",
                    border: "1px solid #0ea5e988",
                    color: holLoading ? "#546E7A" : "#38bdf8",
                    cursor: holLoading ? "wait" : "pointer",
                  }}
                >
                  {holLoading ? T.holLoading[lang] : T.holBtn[lang]}
                </button>
                {holMode && !holLoading && (
                  <>
                    <button
                      onClick={() => { const next = !holInvert; setHolInvert(next); showHologram(next); }}
                      className="px-3 py-2 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: holInvert ? "#FBBF2422" : "var(--bg-card)",
                        border: `1px solid ${holInvert ? "#FBBF24" : "var(--border-color)"}`,
                        color: holInvert ? "#FBBF24" : "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      {holInvert ? (lang === "ru" ? "Инвертировано" : "Invert qilingan") : (lang === "ru" ? "Инвертировать" : "Invert")}
                    </button>
                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{T.holDesc[lang]}</span>
                  </>
                )}
              </div>

              {/* Hologram canvas */}
              {holMode && (
                <canvas
                  ref={holCanvasRef}
                  width={520}
                  height={420}
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: 520,
                    borderRadius: 8,
                    border: "1px solid var(--border-color)",
                    marginTop: 12,
                  }}
                />
              )}

              {/* Gaussian Splat button */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={showSplat}
                  disabled={splatLoading}
                  className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                  style={{
                    background: splatLoading ? "#1E3A5F" : "#a855f722",
                    border: "1px solid #a855f788",
                    color: splatLoading ? "#546E7A" : "#c084fc",
                    cursor: splatLoading ? "wait" : "pointer",
                  }}
                >
                  {splatLoading ? T.splatLoading[lang] : T.splatBtn[lang]}
                </button>
                {splatMode && !splatLoading && (
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {T.splatDesc[lang]}
                  </span>
                )}
              </div>

              {/* Gaussian Splat canvas */}
              {splatMode && (
                <div className="mt-3 rounded-xl overflow-hidden" style={{ border: "1px solid #a855f744", background: "var(--canvas-bg)" }}>
                  <div className="px-3 py-2 text-xs font-bold flex items-center gap-2" style={{ color: "#c084fc", borderBottom: "1px solid #a855f733" }}>
                    <span>✦</span>
                    <span>Gaussian Splatting — {lang === "ru" ? "каждый пиксель = гауссиан, размер по градиенту глубины" : "har piksel = gaussian, o'lcham chuqurlik gradientidan"}</span>
                  </div>
                  <canvas
                    ref={splatCanvasRef}
                    width={520}
                    height={420}
                    style={{ display: "block", width: "100%", maxWidth: 520 }}
                  />
                </div>
              )}

              {/* ── Layer-based CGH ── */}
              <div className="mt-4 rounded-xl p-3 space-y-3" style={{ background: "var(--canvas-bg)", border: "1px solid #22d3ee44" }}>
                <div className="text-xs font-bold" style={{ color: "#22d3ee" }}>
                  〰 Layer-based CGH — {lang === "ru" ? "метод из статьи Kumano et al. 2025" : "Kumano et al. 2025 usuli"}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Layer count slider */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{T.cghLayers[lang]}</span>
                    {[4, 8, 12, 16].map((n) => (
                      <button
                        key={n}
                        onClick={() => setCghLayers(n)}
                        className="px-2 py-0.5 rounded text-xs font-mono font-bold transition-all"
                        style={{
                          background: cghLayers === n ? "#22d3ee22" : "var(--bg-card)",
                          border: `1px solid ${cghLayers === n ? "#22d3ee" : "var(--border-color)"}`,
                          color: cghLayers === n ? "#22d3ee" : "var(--text-secondary)",
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => showCGH()}
                    disabled={cghLoading}
                    className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                    style={{
                      background: cghLoading ? "#1E3A5F" : "#22d3ee22",
                      border: "1px solid #22d3ee88",
                      color: cghLoading ? "#546E7A" : "#22d3ee",
                      cursor: cghLoading ? "wait" : "pointer",
                    }}
                  >
                    {cghLoading ? T.cghLoading[lang] : T.cghBtn[lang]}
                  </button>
                </div>

                {cghResult && (
                  <div className="space-y-2">
                    <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{T.cghDesc[lang]}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Phase hologram */}
                      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #22d3ee33" }}>
                        <div className="px-2 py-1 text-[11px] font-bold" style={{ color: "#22d3ee", background: "#22d3ee0a" }}>
                          {lang === "ru" ? "Фазовая пластина (phase-only)" : "Faza plastinkasi (phase-only)"}
                        </div>
                        <canvas
                          ref={cghCanvasRef}
                          style={{ display: "block", width: "100%", imageRendering: "pixelated" }}
                        />
                      </div>
                      {/* ASM panel */}
                      <div className="rounded-lg space-y-2 p-2" style={{ border: "1px solid #22c55e33", background: "var(--canvas-bg-raised)" }}>
                        <div className="text-[11px] font-bold" style={{ color: "#22c55e" }}>
                          {lang === "ru" ? "ASM реконструкция (симуляция воспроизведения)" : "ASM rekonstruksiyasi (qayta tiklash simulyatsiyasi)"}
                        </div>
                        {/* z-distance selector */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>z (мм):</span>
                          {[0.20, 0.35, 0.45, 0.60, 0.80].map((z) => (
                            <button
                              key={z}
                              onClick={() => setAsmZ(z)}
                              className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all"
                              style={{
                                background: asmZ === z ? "#22c55e22" : "transparent",
                                border: `1px solid ${asmZ === z ? "#22c55e" : "var(--border-color)"}`,
                                color: asmZ === z ? "#22c55e" : "var(--text-secondary)",
                              }}
                            >
                              {z.toFixed(2)}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => showASM()}
                          disabled={asmLoading}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all w-full"
                          style={{
                            background: asmLoading ? "#1E3A5F" : "#22c55e22",
                            border: "1px solid #22c55e88",
                            color: asmLoading ? "#546E7A" : "#22c55e",
                            cursor: asmLoading ? "wait" : "pointer",
                          }}
                        >
                          {asmLoading ? T.asmLoading[lang] : T.asmBtn[lang]}
                        </button>
                        {asmResult && (
                          <canvas
                            ref={asmCanvasRef}
                            style={{ display: "block", width: "100%", imageRendering: "pixelated", borderRadius: 4 }}
                          />
                        )}
                        {!asmResult && !asmLoading && (
                          <div className="text-[10px] text-center py-4" style={{ color: "var(--text-secondary)" }}>
                            {T.asmDesc[lang]}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Holographic tomography 3D volume ── */}
                    <div className="rounded-lg p-3 space-y-2 mt-2" style={{ border: "1px solid #3b82f633", background: "var(--canvas-bg)" }}>
                      <div className="text-[11px] font-bold" style={{ color: "#60a5fa" }}>
                        {lang === "ru" ? "Голографическая томография → 3D объект" : "Golografik tomografiya → 3D ob'ekt"}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{T.volDesc[lang]}</div>
                      <button
                        onClick={() => showVolume()}
                        disabled={volLoading}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                        style={{
                          background: volLoading ? "#1E3A5F" : "#3b82f622",
                          border: "1px solid #3b82f688",
                          color: volLoading ? "#546E7A" : "#60a5fa",
                          cursor: volLoading ? "wait" : "pointer",
                        }}
                      >
                        {volLoading ? T.volLoading[lang] : T.volBtn[lang]}
                      </button>
                      {volMode && (
                        <canvas
                          ref={volCanvasRef}
                          style={{ display: "block", width: "100%", borderRadius: 8, background: "var(--canvas-bg)" }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 4) ACTION: Compare depth methods ── */}
      {hasImage && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-secondary)", border: "1px solid #9C27B044" }}>
          <button
            onClick={runCompare}
            disabled={compareLoading}
            className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{
              background: compareLoading ? "#1E3A5F" : "#9C27B022",
              border: "1px solid #9C27B088",
              color: compareLoading ? "#546E7A" : "#CE93D8",
              cursor: compareLoading ? "wait" : "pointer",
            }}
          >
            {compareLoading ? T.compareLoading[lang] : T.compareBtn[lang]}
          </button>

          {/* Error */}
          {compareError && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#FF000011", border: "1px solid #FF444444", color: "#FF6666" }}>
              {T.offline[lang]}
            </div>
          )}

          {/* Comparison results */}
          {comparisonGrid && (
            <div className="rounded-lg p-3 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid #9C27B044" }}>
              <div className="text-xs font-semibold" style={{ color: "#CE93D8" }}>{T.compTitle[lang]}</div>

              {/* Grid image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={comparisonGrid} className="w-full rounded" alt="Comparison grid" />

              <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{T.compCaption[lang]}</div>

              {comparisonMetrics && (
                <div className="space-y-3 pt-1">
                  <div className="text-xs font-semibold" style={{ color: "#06b6d4" }}>{T.compNumTitle[lang]}</div>
                  <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{T.compNote[lang]}</div>

                  {/* ── Liu et al. CVPR Standard Metric Tables ── */}
                  {(() => {
                    type Row = { method: string; ours?: boolean; rel: number; log10: number; rms: number; d1: number; d2: number; d3: number };
                    const table1Rows: Row[] = [
                      { method: "Make3D (Saxena)",            rel: 0.349, log10: 0.131, rms: 8.734, d1: 0.447, d2: 0.745, d3: 0.897 },
                      { method: "DepthTransfer",     rel: 0.355, log10: 0.127, rms: 9.200, d1: 0.413, d2: 0.711, d3: 0.869 },
                      { method: "Discr.-Cont. CRF",     rel: 0.335, log10: 0.127, rms: 9.003, d1: 0.476, d2: 0.767, d3: 0.904 },
                      { method: "Unary only",                      rel: 0.232, log10: 0.094, rms: 7.214, d1: 0.608, d2: 0.842, d3: 0.942 },
                      { method: "Ours (pre-train)",                rel: 0.230, log10: 0.095, rms: 7.271, d1: 0.614, d2: 0.849, d3: 0.944 },
                      { method: "Ours (fine-tune + GF)", ours:true, rel: 0.213, log10: 0.087, rms: 6.986, d1: 0.650, d2: 0.866, d3: 0.949 },
                    ];
                    const table2Rows: Row[] = [
                      { method: "SVR",              rel: 0.449, log10: 0.176, rms: 11.390, d1: 0.286, d2: 0.563, d3: 0.778 },
                      { method: "SVR (smooth)",     rel: 0.421, log10: 0.163, rms: 10.873, d1: 0.311, d2: 0.601, d3: 0.811 },
                      { method: "Unary",            rel: 0.232, log10: 0.094, rms:  7.214, d1: 0.608, d2: 0.842, d3: 0.942 },
                      { method: "Unary (smooth)",   rel: 0.228, log10: 0.093, rms:  7.058, d1: 0.617, d2: 0.848, d3: 0.944 },
                      { method: "CRF (1 sim)",      rel: 0.225, log10: 0.091, rms:  7.019, d1: 0.624, d2: 0.851, d3: 0.945 },
                      { method: "CRF (3 sim)",      rel: 0.220, log10: 0.090, rms:  6.999, d1: 0.636, d2: 0.857, d3: 0.947 },
                      { method: "Ours (+GF)", ours:true, rel: 0.213, log10: 0.087, rms: 6.986, d1: 0.650, d2: 0.866, d3: 0.949 },
                    ];
                    const best = (rows: Row[], key: keyof Row, lower: boolean): number => {
                      const vals = rows.map(r => r[key] as number);
                      return lower ? Math.min(...vals) : Math.max(...vals);
                    };
                    const errKeys: (keyof Row)[] = ["rel", "log10", "rms"];
                    const accKeys: (keyof Row)[] = ["d1", "d2", "d3"];
                    const errHeaders = ["rel", "log10", "rms"];
                    const accHeaders = ["δ<1.25", "δ<1.25²", "δ<1.25³"];
                    const thBase = "text-center py-1 px-1 text-[10px] font-semibold border border-[#333]";
                    const tdBase = "text-center py-1 px-1 text-[11px] font-mono border border-[#333]";
                    const renderTable = (rows: Row[], titleKey: "liuTable1Title" | "liuTable2Title", capKey: "liuTable1Cap" | "liuTable2Cap") => (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold" style={{ color: "#06b6d4" }}>{T[titleKey][lang]}</div>
                        <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid #333" }}>
                          <table className="w-full text-sm border-collapse" style={{ background: "var(--canvas-bg)" }}>
                            <thead>
                              <tr>
                                <th rowSpan={2} className={`${thBase} text-left`} style={{ color: "var(--text-secondary)", minWidth: 140 }}>
                                  {T.methodCol[lang]}
                                </th>
                                <th colSpan={3} className={thBase} style={{ color: "#06b6d4", borderBottom: "1px solid #333" }}>
                                  {T.lowerBetter[lang]}
                                </th>
                                <th colSpan={3} className={thBase} style={{ color: "#f59e0b", borderBottom: "1px solid #333" }}>
                                  {T.higherBetter[lang]}
                                </th>
                              </tr>
                              <tr>
                                {errHeaders.map(h => (
                                  <th key={h} className={thBase} style={{ color: "#67e8f9" }}>{h}</th>
                                ))}
                                {accHeaders.map(h => (
                                  <th key={h} className={thBase} style={{ color: "#fcd34d" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, i) => {
                                const isOurs = row.ours;
                                const rowStyle: React.CSSProperties = isOurs
                                  ? { borderLeft: "2px solid #06b6d4", background: "#06b6d411" }
                                  : i % 2 === 0 ? {} : { background: "#ffffff06" };
                                return (
                                  <tr key={i} style={rowStyle}>
                                    <td className={`${tdBase} text-left font-sans`} style={{ color: isOurs ? "#06b6d4" : "var(--text-primary)" }}>
                                      {row.method}
                                    </td>
                                    {errKeys.map(k => {
                                      const val = row[k] as number;
                                      const b = best(rows, k, true);
                                      const isBest = Math.abs(val - b) < 1e-5;
                                      return (
                                        <td key={String(k)} className={tdBase} style={{ color: isBest ? "#fff" : "#67e8f9", fontWeight: isBest ? 700 : 400 }}>
                                          {isBest ? <strong>{val.toFixed(3)}</strong> : val.toFixed(3)}
                                        </td>
                                      );
                                    })}
                                    {accKeys.map(k => {
                                      const val = row[k] as number;
                                      const b = best(rows, k, false);
                                      const isBest = Math.abs(val - b) < 1e-5;
                                      return (
                                        <td key={String(k)} className={tdBase} style={{ color: isBest ? "#fff" : "#fcd34d", fontWeight: isBest ? 700 : 400 }}>
                                          {isBest ? <strong>{val.toFixed(3)}</strong> : val.toFixed(3)}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{T[capKey][lang]}</div>
                      </div>
                    );
                    return (
                      <div className="space-y-4">
                        {renderTable(table1Rows, "liuTable1Title", "liuTable1Cap")}
                        {renderTable(table2Rows, "liuTable2Title", "liuTable2Cap")}
                        <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{T.pseudoGtNote[lang]}</div>
                      </div>
                    );
                  })()}

                  {/* Proxy Metrics table (relative, no ground-truth) */}
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left py-1 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                          {T.metricLbl[lang]}
                        </th>
                        <th className="text-center py-1 text-xs font-semibold" style={{ color: "#fb923c" }}>
                          Make3D<br /><span className="text-[10px] font-normal">Saxena</span>
                        </th>
                        <th className="text-center py-1 text-xs font-semibold" style={{ color: "#a855f7" }}>
                          DA V2<br /><span className="text-[10px] font-normal">reference</span>
                        </th>
                        <th className="text-center py-1 text-xs font-semibold" style={{ color: "#06b6d4" }}>
                          Unary only<br /><span className="text-[10px] font-normal">{lang === "ru" ? "сырой" : "xom"}</span>
                        </th>
                        <th className="text-center py-1 text-xs font-semibold" style={{ color: "#34D399" }}>
                          Full CRF<br /><span className="text-[10px] font-normal">{lang === "ru" ? "наш метод" : "bizning usul"}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      <MetricRow label={T.edgeAlign[lang]}   values={comparisonMetrics.edge_alignment} />
                      <MetricRow label={T.usefulDetail[lang]} values={comparisonMetrics.useful_detail} />
                      <MetricRow label={T.texCoh[lang]}       values={comparisonMetrics.texture_coherence} />
                      <MetricRow label={T.smoothness[lang]}   values={comparisonMetrics.smoothness} />
                      <MetricRow label={T.gradEnergy[lang]}   values={comparisonMetrics.gradient_energy} />
                      <MetricRow label={T.depthRange[lang]}   values={comparisonMetrics.depth_range} />
                    </tbody>
                  </table>

                  {/* Make3D note */}
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{T.compMake3dNote[lang]}</div>

                  {/* DCNF CRF effect banner */}
                  {(() => {
                    const m = comparisonMetrics;
                    const gain = (t?: { unary: number; crf: number }) =>
                      t && t.unary > 1e-9 ? (t.crf / t.unary - 1) * 100 : null;
                    const card = (label: string, val: number | null) => (
                      <div className="rounded p-2" style={{ background: "var(--bg-card)", border: "1px solid #10B98155" }}>
                        <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{label}</div>
                        <div
                          className="text-lg font-mono font-bold"
                          style={{ color: val === null ? "var(--text-secondary)" : val >= 0 ? "#34D399" : "#FBBF24" }}
                        >
                          {val === null ? "—" : (val >= 0 ? "+" : "") + val.toFixed(0) + "%"}
                        </div>
                      </div>
                    );
                    return (
                      <div className="rounded-lg p-3" style={{ background: "#10B9811A", border: "1px solid #10B98166" }}>
                        <div className="text-xs mb-2" style={{ color: "#34D399" }}>{T.effectTitle[lang]}</div>
                        <div className="grid grid-cols-3 gap-3">
                          {card(T.edgeAlign[lang],    gain(m.edge_alignment))}
                          {card(T.usefulDetail[lang], gain(m.useful_detail))}
                          {card(T.depthRange[lang],   gain(m.depth_range))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Raw difference cards */}
                  <div className="grid grid-cols-3 gap-2">
                    {(() => {
                      const fmtDiff = (v?: number | null) =>
                        typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—";
                      return (
                        <>
                          <div className="rounded p-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                            <div className="text-[10px] mb-0.5" style={{ color: "var(--text-secondary)" }}>{T.crfVsUnary[lang]}</div>
                            <div className="text-sm font-mono font-bold" style={{ color: "#FBBF24" }}>{fmtDiff(comparisonMetrics.differences.crf_vs_unary)}</div>
                          </div>
                          <div className="rounded p-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                            <div className="text-[10px] mb-0.5" style={{ color: "var(--text-secondary)" }}>{T.daVsCrf[lang]}</div>
                            <div className="text-sm font-mono font-bold" style={{ color: "#FBBF24" }}>{fmtDiff(comparisonMetrics.differences.da_vs_crf)}</div>
                          </div>
                          <div className="rounded p-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                            <div className="text-[10px] mb-0.5" style={{ color: "var(--text-secondary)" }}>{T.daVsUnary[lang]}</div>
                            <div className="text-sm font-mono font-bold" style={{ color: "#FBBF24" }}>{fmtDiff(comparisonMetrics.differences.da_vs_unary)}</div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Relative note + interpretation */}
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{T.relNote[lang]}</div>
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{interpretMetrics(comparisonMetrics, lang)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 5) ACTION: Ablation study ── */}
      {hasImage && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-secondary)", border: "1px solid #9C27B044" }}>
          <button
            onClick={runAblation}
            disabled={ablationLoading}
            className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{
              background: ablationLoading ? "#1E3A5F" : "#9C27B022",
              border: "1px solid #9C27B088",
              color: ablationLoading ? "#546E7A" : "#CE93D8",
              cursor: ablationLoading ? "wait" : "pointer",
            }}
          >
            {ablationLoading ? T.ablationLoading[lang] : T.ablationBtn[lang]}
          </button>

          {/* Error */}
          {ablationError && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#FF000011", border: "1px solid #FF444444", color: "#FF6666" }}>
              {T.offline[lang]}
            </div>
          )}

          {/* Ablation results */}
          {ablationData && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--bg-card)", border: "1px solid #9C27B044" }}>
              <div className="text-xs font-semibold" style={{ color: "#CE93D8" }}>{T.ablTitle[lang]}</div>

              {/* Grid image */}
              {ablationData.ablation_grid && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ablationData.ablation_grid} className="w-full rounded" alt="Ablation grid" style={{ maxWidth: 760 }} />
              )}

              {/* Table */}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    <th className="text-left py-1 pr-2">{T.ablConfig[lang]}</th>
                    <th className="text-center py-1">{T.ablEdge[lang]}</th>
                    <th className="text-center py-1">{T.ablSmooth[lang]}</th>
                    <th className="text-center py-1">{T.ablTex[lang]}</th>
                    <th className="text-center py-1">{T.ablRange[lang]}</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {ablationData.table.map((row, i) => (
                    <tr
                      key={i}
                      style={i === ablationData.table.length - 1 ? { background: "#10B9811A" } : undefined}
                    >
                      <td className="text-left py-1 pr-2 text-xs" style={{ color: "var(--text-secondary)" }}>{row.name}</td>
                      <td className="text-center py-1 text-xs">{row.metrics.edge_alignment.toFixed(3)}</td>
                      <td className="text-center py-1 text-xs">{row.metrics.smoothness.toFixed(3)}</td>
                      <td className="text-center py-1 text-xs">{row.metrics.texture_coherence.toFixed(3)}</td>
                      <td className="text-center py-1 text-xs">{row.metrics.depth_range.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Captions */}
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{T.ablCaption[lang]}</div>
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{interpretAblation(ablationData.table, lang)}</div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
