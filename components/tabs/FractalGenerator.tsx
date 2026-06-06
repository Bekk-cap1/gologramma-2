"use client";

import { useState } from "react";
import { useLang } from "@/components/LanguageContext";

// ─── Bilingual dictionary ────────────────────────────────────────────────────
const T = {
  tabTitle:    { ru: "Алгоритм DCNF CRF",              uz: "DCNF CRF algoritmi" },
  tabSubtitle: {
    ru: "Liu et al. CVPR 2015 «Deep Convolutional Neural Fields» + наши добавления: 3 similarity (LAB, histogram, LBP) + DA V2 unary + guided filter",
    uz: "Liu et al. CVPR 2015 «Deep Convolutional Neural Fields» + bizning qo'shimchalarimiz: 3 similarity (LAB, histogram, LBP) + DA V2 unary + guided filter",
  },

  // Section A titles
  secATitle:   { ru: "A. Блок-схема алгоритма (Liu et al. рис. 1 + наши расширения)", uz: "A. Algoritm blok-sxemasi (Liu et al. 1-rasm + bizning kengaytmalar)" },
  inputImg:    { ru: "Входное изображение (RGB)", uz: "Kirish tasviri (RGB)" },
  slic:        { ru: "SLIC суперпиксели", uz: "SLIC superpiksellar" },
  slicSub:     { ru: "over-segmentation, ~500 регионов", uz: "over-segmentatsiya, ~500 hudud" },
  split:       { ru: "параллельные ветви ↓", uz: "parallel tarmoqlar ↓" },
  unaryTitle:  { ru: "Unary часть", uz: "Unary qismi" },
  unaryBody:   { ru: "z_p: глубина суперпикселя\n(DA V2 / Shape-from-Shading /\npseudo-cues)", uz: "z_p: superpiksel chuqurligi\n(DA V2 / Shape-from-Shading /\npseudo-cues)" },
  unaryFormula:{ ru: "U(y_p) = (y_p − z_p)²", uz: "U(y_p) = (y_p − z_p)²" },
  pairTitle:   { ru: "Pairwise часть", uz: "Pairwise qismi" },
  pairBody:    { ru: "K = 3 сходства (для пар p,q):", uz: "K = 3 o'xshashlik (p,q juftliklari uchun):" },
  pairS1:      { ru: "S¹: цвет LAB", uz: "S¹: LAB rang" },
  pairS2:      { ru: "S²: цветовая гистограмма", uz: "S²: rang gistogrammasi" },
  pairS3:      { ru: "S³: LBP текстура", uz: "S³: LBP tekstura" },
  pairFormula: { ru: "R_pq = Σ_k β_k · S^(k)_pq", uz: "R_pq = Σ_k β_k · S^(k)_pq" },
  merge:       { ru: "← объединение ветвей →", uz: "← tarmoqlar birlashuvi →" },
  crfTitle:    { ru: "CRF энергия", uz: "CRF energiyasi" },
  crfFormula:  { ru: "E(y) = Σ_p (y_p − z_p)² + Σ_(p,q) ½·R_pq·(y_p − y_q)²", uz: "E(y) = Σ_p (y_p − z_p)² + Σ_(p,q) ½·R_pq·(y_p − y_q)²" },
  laplacianTitle:{ ru: "Матрица A (обобщённый лапласиан)", uz: "A matritsasi (umumlashtirilgan laplasiyen)" },
  laplacianFormula:{ ru: "A = I + D − R,  D_pp = Σ_q R_pq", uz: "A = I + D − R,  D_pp = Σ_q R_pq" },
  mapTitle:    { ru: "MAP-решение (closed-form)", uz: "MAP-yechim (yopiq ko'rinishda)" },
  mapFormula:  { ru: "y* = A⁻¹ z", uz: "y* = A⁻¹ z" },
  filterTitle: { ru: "Guided filter (де-блок) + blend", uz: "Guided filter (blok-yo'qotish) + blend" },
  filterSub:   { ru: "сглаживание + сохранение рёбер", uz: "silliqlashtirish + qirralarni saqlash" },
  depthTitle:  { ru: "Карта глубины → 3D", uz: "Chuqurlik xaritasi → 3D" },
  depthSub:    { ru: "marching cubes / heightmap → 3D меш", uz: "marching cubes / heightmap → 3D mesh" },

  // Section B
  secBTitle:   { ru: "B. Пронумерованный алгоритм (шаги 1–7)", uz: "B. Raqamlangan algoritm (1–7 qadamlar)" },
  step1Title:  { ru: "SLIC сегментация → n суперпикселей", uz: "SLIC segmentatsiya → n superpiksel" },
  step1Form:   { ru: "n ≈ 500  (SLIC over-segmentation)", uz: "n ≈ 500  (SLIC over-segmentatsiya)" },
  step1Exp:    { ru: "Изображение разбивается на ~500 компактных регионов с однородным цветом.", uz: "Tasvir bir xil rangli ~500 ta ixcham hududga bo'linadi." },
  step2Title:  { ru: "Unary: глубина суперпикселя z_p", uz: "Unary: superpiksel chuqurligi z_p" },
  step2Form:   { ru: "U(y_p) = (y_p − z_p)²", uz: "U(y_p) = (y_p − z_p)²" },
  step2Exp:    { ru: "z_p — псевдо-глубина из DA V2 / Shape-from-Shading / геометрических подсказок. U штрафует отклонение y_p от z_p.", uz: "z_p — DA V2 / Shape-from-Shading / geometrik ishora asosida pseudo-chuqurlik. U qiymat y_p ni z_p dan chetlanishi uchun jazo beradi." },
  step3Title:  { ru: "Pairwise: 3 сходства (color, histogram, LBP)", uz: "Pairwise: 3 o'xshashlik (rang, gistogramma, LBP)" },
  step3Form:   { ru: "S^(k)_pq = exp(−γ_k · ‖s^(k)_p − s^(k)_q‖);\nR_pq = Σ_k β_k · S^(k)_pq,  β_k ≥ 0;\nV(y_p,y_q) = ½ · R_pq · (y_p − y_q)²", uz: "S^(k)_pq = exp(−γ_k · ‖s^(k)_p − s^(k)_q‖);\nR_pq = Σ_k β_k · S^(k)_pq,  β_k ≥ 0;\nV(y_p,y_q) = ½ · R_pq · (y_p − y_q)²" },
  step3Exp:    { ru: "Чем похожее соседние суперпиксели (по цвету, гистограмме, LBP-текстуре) — тем сильнее они должны иметь близкую глубину.", uz: "Qo'shni superpiksellar bir-biriga qanchalik o'xshash bo'lsa (rang, gistogramma, LBP-tekstura) — ularning chuqurligi shunchalik yaqin bo'lishi kerak." },
  step4Title:  { ru: "CRF энергия E(y)", uz: "CRF energiyasi E(y)" },
  step4Form:   { ru: "E(y) = Σ U + Σ V = yᵀAy − 2zᵀy + zᵀz\nA = I + D − R,  D_pp = Σ_q R_pq", uz: "E(y) = Σ U + Σ V = yᵀAy − 2zᵀy + zᵀz\nA = I + D − R,  D_pp = Σ_q R_pq" },
  step4Exp:    { ru: "Суммируем unary- и pairwise-штрафы. В матричном виде задача становится квадратичной.", uz: "Unary va pairwise jarimalarni yig'amiz. Matritsa ko'rinishida masala kvadratik bo'ladi." },
  step5Title:  { ru: "MAP-решение (closed-form)", uz: "MAP-yechim (yopiq ko'rinish)" },
  step5Form:   { ru: "y* = A⁻¹ z", uz: "y* = A⁻¹ z" },
  step5Exp:    { ru: "A — положительно-полуопределённая матрица. Систему Ay = z решают итеративными методами (например, CG-решателем) без явного обращения A⁻¹.", uz: "A — musbat-yarim aniq matritsa. Ay = z tizimi iterativ usullar (masalan, CG-yechuvchi) bilan A⁻¹ ni aniq hisoblash zarur bo'lmasdan yechiladi." },
  step6Title:  { ru: "Guided filter + blend → финальная карта", uz: "Guided filter + blend → yakuniy xarita" },
  step6Form:   { ru: "y_final = GuidedFilter(y*, I_rgb, r, ε)", uz: "y_final = GuidedFilter(y*, I_rgb, r, ε)" },
  step6Exp:    { ru: "Guided filter по исходному RGB сглаживает карту, сохраняя резкие рёбра; blend смешивает с исходной для контраста.", uz: "Guided filter asl RGB bo'yicha xaritani silliqlab, keskin qirralarni saqlab qoladi; blend kontrast uchun asl bilan aralashtiriladi." },
  step7Title:  { ru: "Карта глубины → marching cubes / heightmap → 3D", uz: "Chuqurlik xaritasi → marching cubes / heightmap → 3D" },
  step7Form:   { ru: "mesh = MarchingCubes(vol) | Heightmap → TriangleMesh", uz: "mesh = MarchingCubes(vol) | Heightmap → TriangleMesh" },
  step7Exp:    { ru: "Финальная 2D-карта глубины используется как heightmap или изосурфейс для 3D-меша в WebGL/Three.js.", uz: "Yakuniy 2D-chuqurlik xaritasi WebGL/Three.js da 3D-mesh uchun heightmap yoki izosurface sifatida ishlatiladi." },

  // Section C
  secCTitle:   { ru: "C. Метрики оценки качества", uz: "C. Sifat baholash metrikalari" },
  secCNote:    {
    ru: "Метрики из Liu et al. Tables 1–3. Требуют ground-truth глубину; в нашем приложении мы используем относительные метрики без GT при сравнении методов.",
    uz: "Liu et al. Tables 1–3 dan metrikalar. Ground-truth chuqurlik talab qiladi; bizning ilovamizda usullarni taqqoslashda GT siz nisbiy metrikalar ishlatamiz.",
  },
  colMetric:   { ru: "Метрика", uz: "Metrika" },
  colFormula:  { ru: "Формула", uz: "Formula" },
  colName:     { ru: "Название", uz: "Nomi" },
  lowerBetter: { ru: "Меньше = лучше", uz: "Kichikroq = yaxshiroq" },
  higherBetter:{ ru: "Больше = лучше", uz: "Kattaroq = yaxshiroq" },
  popClose:    { ru: "Закрыть", uz: "Yopish" },
} as const;

// ─── Metrics data ────────────────────────────────────────────────────────────
const METRICS = [
  {
    symbol: "rel",
    name_ru: "Средняя относительная ошибка",
    name_uz: "O‘rtacha nisbiy xato",
    formula: "rel = (1/T)·Σ |d_gt − d| / d_gt",
    explain_ru:
      "Насколько предсказанная глубина отличается от истинной, в долях. Делится на истинную глубину, поэтому ошибка на близких и дальних объектах сравнима.",
    explain_uz:
      "Bashorat qilingan chuqurlik haqiqiydan qancha farq qilishi, ulushlarda.",
    lower_better: true,
  },
  {
    symbol: "log10",
    name_ru: "Средняя логарифмическая ошибка",
    name_uz: "O‘rtacha logarifmik xato",
    formula: "log10 = (1/T)·Σ |log₁₀(d_gt) − log₁₀(d)|",
    explain_ru:
      "Ошибка в логарифмическом масштабе. Подходит когда глубины меняются на порядки.",
    explain_uz:
      "Logarifmik masshtabdagi xato. Chuqurliklar katta diapazonda oʻzgarganda mos keladi.",
    lower_better: true,
  },
  {
    symbol: "rms",
    name_ru: "Среднеквадратичная ошибка",
    name_uz: "O‘rtacha kvadratik xato (RMS)",
    formula: "rms = √( (1/T)·Σ (d_gt − d)² )",
    explain_ru:
      "Корень из среднего квадрата ошибок. Сильнее штрафует большие промахи.",
    explain_uz:
      "Xatolar kvadratlari oʻrtachasidan ildiz. Katta xatolarni kuchliroq jazolaydi.",
    lower_better: true,
  },
  {
    symbol: "δ < 1.25",
    name_ru: "Точность с порогом",
    name_uz: "Chegarali aniqlik",
    formula: "% пикселей где max(d_gt/d, d/d_gt) < 1.25",
    explain_ru:
      "Доля пикселей где предсказание близко к истине (в пределах 25%). Пороги 1.25, 1.25², 1.25³ — всё более мягкие.",
    explain_uz:
      "Bashorat haqiqatga yaqin boʻlʻgan piksellar ulushi (25% ichida).",
    lower_better: false,
  },
] as const;

// ─── SVG flowchart palette ────────────────────────────────────────────────────
const SVG_BG = "#0a1124";
const PAPER_FILL = "#1e3a8a55";
const PAPER_STROKE = "#3b82f6";
const OUR_FILL = "#10b98122";
const OUR_STROKE = "#10b981";
const NODE_FILL = "#11203f";
const NODE_STROKE = "#334e7a";
const TEXT_FILL = "#e2e8f0";
const ARROW_FILL = "#64748b";

type Lang = "ru" | "uz";

// Split a string into wrapped <tspan> lines centered at cx.
function svgText(
  text: string,
  cx: number,
  cy: number,
  opts?: { maxChars?: number; size?: number; fill?: string; bold?: boolean },
) {
  const maxChars = opts?.maxChars ?? 30;
  const size = opts?.size ?? 11;
  const fill = opts?.fill ?? TEXT_FILL;
  const lineHeight = size + 3;

  // wrap on explicit newlines first, then by word length
  const rawLines = text.split("\n");
  const lines: string[] = [];
  for (const raw of rawLines) {
    const words = raw.split(" ");
    let cur = "";
    for (const w of words) {
      if (cur.length === 0) {
        cur = w;
      } else if ((cur + " " + w).length <= maxChars) {
        cur += " " + w;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur.length > 0) lines.push(cur);
    if (raw.length === 0) lines.push("");
  }

  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  return (
    <text
      x={cx}
      textAnchor="middle"
      fontSize={size}
      fill={fill}
      fontWeight={opts?.bold ? 700 : 400}
      fontFamily="system-ui, sans-serif"
    >
      {lines.map((ln, i) => (
        <tspan key={i} x={cx} y={startY + i * lineHeight}>
          {ln}
        </tspan>
      ))}
    </text>
  );
}

// Rounded rect (action) node.
function NodeRect({
  x,
  y,
  w,
  h,
  label,
  fill = NODE_FILL,
  stroke = NODE_STROKE,
  textFill = TEXT_FILL,
  size = 11,
  bold = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  fill?: string;
  stroke?: string;
  textFill?: string;
  size?: number;
  bold?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
      />
      {svgText(label, x + w / 2, y + h / 2, {
        maxChars: Math.floor(w / (size * 0.52)),
        size,
        fill: textFill,
        bold,
      })}
    </g>
  );
}

// Ellipse (start / end terminator).
function NodeEllipse({
  cx,
  cy,
  rx,
  ry,
  label,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  label: string;
}) {
  return (
    <g>
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill={NODE_FILL}
        stroke={OUR_STROKE}
        strokeWidth={1.5}
      />
      {svgText(label, cx, cy, { maxChars: 22, size: 12, bold: true })}
    </g>
  );
}

// Parallelogram (input / output).
function NodeParallelogram({
  x,
  y,
  w,
  h,
  label,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}) {
  const skew = h * 0.5;
  const pts = [
    [x + skew, y],
    [x + w, y],
    [x + w - skew, y + h],
    [x, y + h],
  ]
    .map((p) => p.join(","))
    .join(" ");
  return (
    <g>
      <polygon
        points={pts}
        fill="#3b1e5e55"
        stroke="#a855f7"
        strokeWidth={1.5}
      />
      {svgText(label, x + w / 2, y + h / 2, {
        maxChars: Math.floor(w / 6),
        size: 11,
      })}
    </g>
  );
}

// Diamond (decision).
function NodeDiamond({
  cx,
  cy,
  w,
  h,
  label,
}: {
  cx: number;
  cy: number;
  w: number;
  h: number;
  label: string;
}) {
  const pts = [
    [cx, cy - h / 2],
    [cx + w / 2, cy],
    [cx, cy + h / 2],
    [cx - w / 2, cy],
  ]
    .map((p) => p.join(","))
    .join(" ");
  return (
    <g>
      <polygon
        points={pts}
        fill="#5e4a1e55"
        stroke="#f59e0b"
        strokeWidth={1.5}
      />
      {svgText(label, cx, cy, { maxChars: Math.floor(w / 7), size: 11 })}
    </g>
  );
}

// Arrow line with arrowhead marker; optional label.
function Edge({
  points,
  label,
  labelDx = 6,
  labelDy = -4,
}: {
  points: [number, number][];
  label?: string;
  labelDx?: number;
  labelDy?: number;
}) {
  const d = points.map((p) => p.join(",")).join(" ");
  const [lx, ly] = points[0];
  return (
    <g>
      <polyline
        points={d}
        fill="none"
        stroke={ARROW_FILL}
        strokeWidth={1.5}
        markerEnd="url(#arrowhead)"
      />
      {label && (
        <text
          x={lx + labelDx}
          y={ly + labelDy}
          fontSize={10}
          fill="#fbbf24"
          fontFamily="system-ui, sans-serif"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function ArrowDefs() {
  return (
    <defs>
      <marker
        id="arrowhead"
        markerWidth={8}
        markerHeight={8}
        refX={6}
        refY={3}
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M0,0 L6,3 L0,6 Z" fill={ARROW_FILL} />
      </marker>
    </defs>
  );
}

function svgWrapper(viewW: number, viewH: number, children: React.ReactNode) {
  return (
    <div
      className="rounded-xl mx-auto"
      style={{
        background: SVG_BG,
        border: "1px solid var(--border-color)",
        maxWidth: 720,
        padding: 8,
      }}
    >
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
      >
        <ArrowDefs />
        {children}
      </svg>
    </div>
  );
}

// ═══ SVG 1: Architecture (Liu et al. + our extensions) ═══════════════════════
function ArchitectureSVG(l: Lang) {
  const W = 720;
  const cx = W / 2;
  return svgWrapper(
    W,
    980,
    <>
      {/* Input */}
      <NodeRect
        x={cx - 150}
        y={20}
        w={300}
        h={46}
        label={l === "ru" ? "Входное изображение (RGB)" : "Kirish tasvir (RGB)"}
        fill={PAPER_FILL}
        stroke={PAPER_STROKE}
        bold
      />
      <Edge points={[[cx, 66], [cx, 96]]} />

      {/* SLIC */}
      <NodeRect
        x={cx - 150}
        y={96}
        w={300}
        h={46}
        label={
          l === "ru"
            ? "SLIC суперпиксели (~510)"
            : "SLIC superpiksellar (~510)"
        }
        fill={PAPER_FILL}
        stroke={PAPER_STROKE}
        bold
      />
      {/* split point */}
      <Edge points={[[cx, 142], [cx, 162]]} />
      <Edge points={[[cx, 162], [175, 162], [175, 196]]} />
      <Edge points={[[cx, 162], [545, 162], [545, 196]]} />

      {/* LEFT branch — UNARY */}
      <NodeRect
        x={50}
        y={196}
        w={250}
        h={36}
        label={l === "ru" ? "UNARY часть" : "UNARY qism"}
        fill={PAPER_FILL}
        stroke={PAPER_STROKE}
        bold
      />
      <Edge points={[[175, 232], [175, 262]]} />
      <NodeRect
        x={50}
        y={262}
        w={250}
        h={46}
        label={"★ DA V2 → z_p"}
        fill={OUR_FILL}
        stroke={OUR_STROKE}
        bold
      />
      <Edge points={[[175, 308], [175, 338]]} />
      <NodeRect
        x={50}
        y={338}
        w={250}
        h={40}
        label={"U(y_p) = (y_p − z_p)²"}
        fill={PAPER_FILL}
        stroke={PAPER_STROKE}
      />

      {/* RIGHT branch — PAIRWISE */}
      <NodeRect
        x={420}
        y={196}
        w={250}
        h={36}
        label={l === "ru" ? "PAIRWISE часть" : "PAIRWISE qism"}
        fill={PAPER_FILL}
        stroke={PAPER_STROKE}
        bold
      />
      <Edge points={[[545, 232], [545, 256]]} />
      <NodeRect
        x={420}
        y={256}
        w={250}
        h={34}
        label={"S¹ LAB color"}
        fill={PAPER_FILL}
        stroke={PAPER_STROKE}
      />
      <Edge points={[[545, 290], [545, 308]]} />
      <NodeRect
        x={420}
        y={308}
        w={250}
        h={34}
        label={"★ S² color histogram"}
        fill={OUR_FILL}
        stroke={OUR_STROKE}
      />
      <Edge points={[[545, 342], [545, 360]]} />
      <NodeRect
        x={420}
        y={360}
        w={250}
        h={34}
        label={"★ S³ LBP texture"}
        fill={OUR_FILL}
        stroke={OUR_STROKE}
      />
      <Edge points={[[545, 394], [545, 412]]} />
      <NodeRect
        x={420}
        y={412}
        w={250}
        h={40}
        label={"R_pq = Σ β_k·S^(k)"}
        fill={PAPER_FILL}
        stroke={PAPER_STROKE}
      />

      {/* rejoin */}
      <Edge points={[[175, 378], [175, 478], [cx, 478], [cx, 498]]} />
      <Edge points={[[545, 452], [545, 478], [cx, 478]]} />

      {/* CRF loss */}
      <NodeRect
        x={cx - 250}
        y={498}
        w={500}
        h={56}
        label={
          "CRF loss: E(y) = Σ(y_p − z_p)² + Σ½R_pq(y_p − y_q)²"
        }
        fill={PAPER_FILL}
        stroke={PAPER_STROKE}
        bold
      />
      <Edge points={[[cx, 554], [cx, 584]]} />

      {/* A matrix / MAP */}
      <NodeRect
        x={cx - 250}
        y={584}
        w={500}
        h={56}
        label={"A = I + D − R ;  MAP: y* = A⁻¹z  (closed-form)"}
        fill={PAPER_FILL}
        stroke={PAPER_STROKE}
        bold
      />
      <Edge points={[[cx, 640], [cx, 670]]} />

      {/* Guided filter (our) */}
      <NodeRect
        x={cx - 220}
        y={670}
        w={440}
        h={50}
        label={"★ Guided filter + adaptive blend"}
        fill={OUR_FILL}
        stroke={OUR_STROKE}
        bold
      />
      <Edge points={[[cx, 720], [cx, 750]]} />

      {/* Depth → 3D */}
      <NodeRect
        x={cx - 220}
        y={750}
        w={440}
        h={50}
        label={
          l === "ru"
            ? "Карта глубины y → 3D"
            : "Chuqurlik xaritasi y → 3D"
        }
        fill={PAPER_FILL}
        stroke={PAPER_STROKE}
        bold
      />

      {/* Legend */}
      <g>
        <rect
          x={40}
          y={840}
          width={640}
          height={110}
          rx={8}
          fill="#0d1730"
          stroke={NODE_STROKE}
        />
        <rect x={56} y={862} width={26} height={20} rx={4} fill={OUR_FILL} stroke={OUR_STROKE} />
        <text x={92} y={877} fontSize={11} fill={OUR_STROKE} fontFamily="system-ui, sans-serif" fontWeight={700}>
          {l === "ru"
            ? "★ наши расширения"
            : "★ bizning qo‘shimchalar"}
        </text>
        <rect x={56} y={898} width={26} height={20} rx={4} fill={PAPER_FILL} stroke={PAPER_STROKE} />
        <text x={92} y={913} fontSize={11} fill={PAPER_STROKE} fontFamily="system-ui, sans-serif" fontWeight={700}>
          {l === "ru"
            ? "стандарт статьи (Liu et al.)"
            : "maqola standarti (Liu et al.)"}
        </text>
      </g>
    </>,
  );
}

// ═══ SVG 2: GOST flowchart — DCNF CRF (depth) ════════════════════════════════
function ClassicDepthSVG(l: Lang) {
  const W = 720;
  const cx = 300;
  const yes = l === "ru" ? "да" : "ha";
  const no = l === "ru" ? "нет" : "yo‘q";
  return svgWrapper(
    W,
    1160,
    <>
      {/* Start */}
      <NodeEllipse cx={cx} cy={30} rx={90} ry={22} label={l === "ru" ? "Начало" : "Boshlash"} />
      <Edge points={[[cx, 52], [cx, 78]]} />

      {/* Input */}
      <NodeParallelogram
        x={cx - 150}
        y={78}
        w={300}
        h={42}
        label={l === "ru" ? "Ввод: изображение x" : "Kirish: tasvir x"}
      />
      <Edge points={[[cx, 120], [cx, 146]]} />

      {/* SLIC */}
      <NodeRect
        x={cx - 150}
        y={146}
        w={300}
        h={42}
        label={l === "ru" ? "SLIC → n суперпикселей" : "SLIC → n superpiksel"}
      />
      <Edge points={[[cx, 188], [cx, 214]]} />

      {/* p = 1 */}
      <NodeRect x={cx - 80} y={214} w={160} h={40} label={"p = 1"} />
      <Edge points={[[cx, 254], [cx, 286]]} />

      {/* Diamond p ≤ n ? */}
      <NodeDiamond cx={cx} cy={326} w={170} h={80} label={l === "ru" ? "p ≤ n ?" : "p ≤ n ?"} />
      {/* yes branch: down */}
      <Edge points={[[cx, 366], [cx, 396]]} label={yes} labelDx={8} labelDy={-6} />

      {/* z_p = DA_V2 */}
      <NodeRect x={cx - 130} y={396} w={260} h={42} label={"z_p = DA_V2(p)"} />
      <Edge points={[[cx, 438], [cx, 464]]} />
      {/* p = p + 1 */}
      <NodeRect x={cx - 130} y={464} w={260} h={42} label={"p = p + 1"} />
      {/* loop back up to diamond (left side) */}
      <Edge points={[[cx - 130, 485], [120, 485], [120, 326], [cx - 85, 326]]} />

      {/* no branch: to the right then down */}
      <Edge points={[[cx + 85, 326], [560, 326], [560, 560], [cx, 560], [cx, 560]]} label={no} labelDx={6} labelDy={-6} />

      {/* R_pq */}
      <NodeRect
        x={cx - 180}
        y={560}
        w={360}
        h={46}
        label={l === "ru" ? "R_pq = Σ β_k·S^(k) для пар (p,q)" : "R_pq = Σ β_k·S^(k) (p,q) juftlar uchun"}
      />
      <Edge points={[[cx, 606], [cx, 632]]} />

      {/* A = I + D - R */}
      <NodeRect x={cx - 130} y={632} w={260} h={42} label={"A = I + D − R"} />
      <Edge points={[[cx, 674], [cx, 700]]} />

      {/* Diamond A обратима? */}
      <NodeDiamond
        cx={cx}
        cy={742}
        w={190}
        h={84}
        label={l === "ru" ? "A обратима?" : "A teskari?"}
      />
      {/* no -> regularize, then merge back */}
      <Edge points={[[cx + 95, 742], [560, 742], [560, 660], [430, 660]]} label={no} labelDx={6} labelDy={14} />
      <NodeRect x={430} y={640} w={180} h={40} label={l === "ru" ? "A ← A + εI (регуляризация)" : "A ← A + εI (regulyarizatsiya)"} size={10} />
      <Edge points={[[430, 660], [cx + 130, 653]]} />
      {/* yes -> continue down */}
      <Edge points={[[cx, 784], [cx, 812]]} label={yes} labelDx={8} labelDy={-6} />

      {/* y* = A⁻¹ z */}
      <NodeRect
        x={cx - 180}
        y={812}
        w={360}
        h={46}
        label={l === "ru" ? "y* = A⁻¹·z  (решить систему)" : "y* = A⁻¹·z  (tizimni yechish)"}
      />
      <Edge points={[[cx, 858], [cx, 884]]} />

      {/* Guided filter + blend */}
      <NodeRect x={cx - 150} y={884} w={300} h={42} label={"Guided filter + blend"} />
      <Edge points={[[cx, 926], [cx, 952]]} />

      {/* Output */}
      <NodeParallelogram
        x={cx - 180}
        y={952}
        w={360}
        h={42}
        label={l === "ru" ? "Вывод: карта глубины y" : "Chiqish: chuqurlik xaritasi y"}
      />
      <Edge points={[[cx, 994], [cx, 1020]]} />

      {/* marching cubes */}
      <NodeRect x={cx - 150} y={1020} w={300} h={42} label={l === "ru" ? "3D: marching cubes" : "3D: marching cubes"} />
      <Edge points={[[cx, 1062], [cx, 1088]]} />

      {/* End */}
      <NodeEllipse cx={cx} cy={1110} rx={90} ry={22} label={l === "ru" ? "Конец" : "Tugadi"} />
    </>,
  );
}

// ═══ SVG 3: GOST flowchart — Fractal construction (chaos game / IFS) ═════════
function ClassicFractalSVG(l: Lang) {
  const W = 720;
  const cx = 300;
  const yes = l === "ru" ? "да" : "ha";
  const no = l === "ru" ? "нет" : "yo‘q";
  return svgWrapper(
    W,
    1180,
    <>
      {/* Start */}
      <NodeEllipse cx={cx} cy={30} rx={90} ry={22} label={l === "ru" ? "Начало" : "Boshlash"} />
      <Edge points={[[cx, 52], [cx, 78]]} />

      {/* Input IFS */}
      <NodeParallelogram
        x={cx - 190}
        y={78}
        w={380}
        h={42}
        label={l === "ru" ? "Ввод: IFS-преобразования {Tᵢ, pᵢ}" : "Kirish: IFS {Tᵢ, pᵢ}"}
      />
      <Edge points={[[cx, 120], [cx, 146]]} />

      {/* P init */}
      <NodeRect x={cx - 150} y={146} w={300} h={42} label={"P = (0.5, 0.5);  i = 0"} />
      <Edge points={[[cx, 188], [cx, 214]]} />

      {/* Diamond i < N ? */}
      <NodeDiamond cx={cx} cy={256} w={160} h={80} label={"i < N ?"} />
      {/* no branch exits to the right then down */}
      <Edge points={[[cx + 80, 256], [600, 256], [600, 960], [cx, 960]]} label={no} labelDx={6} labelDy={-6} />
      {/* yes branch down */}
      <Edge points={[[cx, 296], [cx, 324]]} label={yes} labelDx={8} labelDy={-6} />

      {/* choose Tk */}
      <NodeRect
        x={cx - 200}
        y={324}
        w={400}
        h={46}
        label={l === "ru" ? "выбрать Tₖ по вероятности pₖ" : "pₖ bo‘yicha Tₖ tanlash"}
      />
      <Edge points={[[cx, 370], [cx, 396]]} />

      {/* P = Ak P + bk */}
      <NodeRect x={cx - 150} y={396} w={300} h={42} label={"P = Aₖ·P + bₖ"} />
      <Edge points={[[cx, 438], [cx, 464]]} />

      {/* Diamond i > warmup ? */}
      <NodeDiamond cx={cx} cy={506} w={180} h={82} label={l === "ru" ? "i > warmup ?" : "i > warmup ?"} />
      {/* yes -> plot point, then merge */}
      <Edge points={[[cx, 547], [cx, 575]]} label={yes} labelDx={8} labelDy={-6} />
      <NodeRect
        x={cx - 180}
        y={575}
        w={360}
        h={42}
        label={l === "ru" ? "нанести точку P" : "P nuqtani belgilash"}
      />
      <Edge points={[[cx, 617], [cx, 643]]} />
      {/* no -> bypass to merge (right side) */}
      <Edge points={[[cx + 90, 506], [560, 506], [560, 643], [cx, 643]]} label={no} labelDx={6} labelDy={-6} />

      {/* i = i + 1 (merge point) */}
      <NodeRect x={cx - 130} y={643} w={260} h={42} label={"i = i + 1"} />
      {/* loop back to "i < N ?" (left side) */}
      <Edge points={[[cx - 130, 664], [110, 664], [110, 256], [cx - 80, 256]]} />

      {/* rasterization */}
      <NodeRect
        x={cx - 190}
        y={960}
        w={380}
        h={46}
        label={l === "ru" ? "растеризация → воксели" : "rasterizatsiya → vokssellar"}
      />
      <Edge points={[[cx, 1006], [cx, 1032]]} />

      {/* marching cubes */}
      <NodeRect x={cx - 150} y={1032} w={300} h={42} label={"marching cubes → 3D"} />
      <Edge points={[[cx, 1074], [cx, 1090]]} />

      {/* Output */}
      <NodeParallelogram
        x={cx - 170}
        y={1090}
        w={340}
        h={42}
        label={l === "ru" ? "Вывод: 3D-модель" : "Chiqish: 3D-model"}
      />
      <Edge points={[[cx, 1132], [cx, 1148]]} />

      {/* End */}
      <NodeEllipse cx={cx} cy={1162} rx={90} ry={18} label={l === "ru" ? "Конец" : "Tugadi"} />
    </>,
  );
}

// ═══ SVG 3: Classic academic two-panel block diagram ══════════════════════════
function ClassicTwoPanelSVG(l: Lang) {
  const ru = l === "ru";
  const ha   = ru ? "да"  : "ха";
  const nyet = ru ? "нет" : "йўқ";

  // ── Shared drawing helpers (white-bg academic style) ──────────────────────
  const S: React.SVGProps<SVGElement> = { fill:"#fff", stroke:"#111", strokeWidth:1.5 } as never;

  function Oval({ cx, cy, label }: { cx:number; cy:number; label:string }) {
    return (
      <g>
        <ellipse cx={cx} cy={cy} rx={68} ry={20} fill="#fff" stroke="#111" strokeWidth={1.5}/>
        <text x={cx} y={cy+5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#111">{label}</text>
      </g>
    );
  }

  function IO({ x, y, w, h, label }: { x:number; y:number; w:number; h:number; label:string }) {
    const sk = 14;
    return (
      <g>
        <polygon points={`${x+sk},${y} ${x+w},${y} ${x+w-sk},${y+h} ${x},${y+h}`} fill="#fff" stroke="#111" strokeWidth={1.5}/>
        <text x={x+w/2} y={y+h/2+4} textAnchor="middle" fontSize={10} fill="#111">{label}</text>
      </g>
    );
  }

  function Proc({ x, y, w, h, label }: { x:number; y:number; w:number; h:number; label:string }) {
    const lines = label.split('\n');
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={2} fill="#fff" stroke="#111" strokeWidth={1.5}/>
        {lines.map((ln,i)=>(
          <text key={i} x={x+w/2} y={y+h/2-(lines.length-1)*6.5+i*13+4} textAnchor="middle" fontSize={10} fill="#111">{ln}</text>
        ))}
      </g>
    );
  }

  function Dec({ cx, cy, w, h, label }: { cx:number; cy:number; w:number; h:number; label:string }) {
    const pts = `${cx},${cy-h/2} ${cx+w/2},${cy} ${cx},${cy+h/2} ${cx-w/2},${cy}`;
    const lines = label.split('\n');
    return (
      <g>
        <polygon points={pts} fill="#fff" stroke="#111" strokeWidth={1.5}/>
        {lines.map((ln,i)=>(
          <text key={i} x={cx} y={cy-(lines.length-1)*6.5+i*13+4} textAnchor="middle" fontSize={10} fill="#111">{ln}</text>
        ))}
      </g>
    );
  }

  // Straight arrow (line + solid arrowhead polygon)
  function Ar({ x1,y1,x2,y2 }: { x1:number; y1:number; x2:number; y2:number }) {
    const dx=x2-x1, dy=y2-y1, d=Math.sqrt(dx*dx+dy*dy);
    if (d < 1) return null;
    const nx=dx/d, ny=dy/d, s=4;
    const hx=x2-nx*9, hy=y2-ny*9;
    return (
      <g>
        <line x1={x1} y1={y1} x2={hx} y2={hy} stroke="#111" strokeWidth={1.5}/>
        <polygon points={`${x2},${y2} ${hx-ny*s},${hy+nx*s} ${hx+ny*s},${hy-nx*s}`} fill="#111"/>
      </g>
    );
  }

  // Multi-segment path arrow (markerEnd)
  function Ap({ d }: { d:string }) {
    return <path d={d} fill="none" stroke="#111" strokeWidth={1.5} markerEnd="url(#acArr)"/>;
  }

  function Lbl({ x, y, text }: { x:number; y:number; text:string }) {
    return <text x={x} y={y} fontSize={10} fill="#444" fontStyle="italic">{text}</text>;
  }

  const L = 188; // left panel center x
  const R = 553; // right panel center x

  return (
    <div style={{ background:"#fff", border:"1px solid #bbb", borderRadius:8, overflowX:"auto" }}>
      <svg viewBox="0 0 730 600" style={{ width:"100%", minWidth:560, height:"auto", display:"block" }}>
        <defs>
          <marker id="acArr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <polygon points="0,0 8,4 0,8" fill="#111"/>
          </marker>
        </defs>

        {/* Panel divider */}
        <line x1="370" y1="0" x2="370" y2="648" stroke="#ddd" strokeWidth={1} strokeDasharray="5,4"/>

        {/* Caption */}
        <text x={L} y={13} textAnchor="middle" fontSize={10} fill="#888" fontStyle="italic">
          {ru ? "Главный алгоритм (DCNF CRF)" : "Asosiy algoritm (DCNF CRF)"}
        </text>
        <text x={R} y={13} textAnchor="middle" fontSize={10} fill="#888" fontStyle="italic">
          {ru ? "CRF(k,β,p,q) — функция" : "CRF(k,β,p,q) — funksiya"}
        </text>

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL
        ══════════════════════════════════════════════════════ */}

        {/* Start */}
        <Oval cx={L} cy={30} label={ru?"Начало":"Бошлаш"}/>
        <Ar x1={L} y1={50} x2={L} y2={68}/>

        {/* Input params */}
        <IO x={L-100} y={68} w={200} h={36} label="λ,  β_k,  γ_k"/>
        <Ar x1={L} y1={104} x2={L} y2={120}/>

        {/* ── OUTER LOOP BOX: p ── */}
        <rect x={18} y={120} width={338} height={362} fill="none" stroke="#111" strokeWidth={1.5}/>
        <Proc x={L-80} y={128} w={160} h={36} label="p = 0...n"/>
        <Ar x1={L} y1={164} x2={L} y2={181}/>

        {/* ── INNER LOOP BOX 1: q ── */}
        <rect x={30} y={181} width={314} height={294} fill="none" stroke="#111" strokeWidth={1.5}/>
        <Proc x={L-75} y={188} w={150} h={36} label="q ∈ N(p)"/>
        <Ar x1={L} y1={224} x2={L} y2={241}/>

        {/* ── INNER LOOP BOX 2: k ── */}
        <rect x={42} y={241} width={290} height={227} fill="none" stroke="#111" strokeWidth={1.5}/>
        <Proc x={L-70} y={249} w={140} h={36} label="k = 1...K"/>
        <Ar x1={L} y1={285} x2={L} y2={302}/>

        {/* Diamond: CRF condition */}
        <Dec cx={L} cy={334} w={162} h={66} label={ru?"CRF(k,β,p,q)?":"CRF(k,β,p,q)?"}/>

        {/* HA → right → "записать r_pq" box → loop back */}
        <Ar x1={L+81} y1={334} x2={274} y2={334}/>
        <Lbl x={L+83} y={329} text={ha}/>
        <Proc x={276} y={316} w={74} h={36} label={ru?"записать\nr_pq":"r_pq\nyozish"}/>
        {/* Loop back from box → up → back to k proc top */}
        <Ap d={`M313,316 L313,258 L258,258`}/>

        {/* НЕТ → down */}
        <Ar x1={L} y1={367} x2={L} y2={385}/>
        <Lbl x={L+4} y={380} text={nyet}/>

        {/* k loop back: left side of box 2 → up to k proc */}
        <Ap d={`M42,410 L26,410 L26,255 L118,255`}/>

        {/* q loop back: left side of box 1 → up to q proc */}
        <Ap d={`M30,456 L14,456 L14,192 L113,192`}/>

        {/* p loop back: left side of outer box → up to p proc */}
        <Ap d={`M18,484 L2,484 L2,132 L108,132`}/>

        {/* After loops: MAP solve */}
        <Ar x1={L} y1={482} x2={L} y2={502}/>
        <Proc x={L-122} y={502} w={244} h={42} label={ru?"MAP: y* = A⁻¹z  →  depth map":"MAP: y* = A⁻¹z  →  depth map"}/>
        <Ar x1={L} y1={544} x2={L} y2={562}/>

        {/* End */}
        <Oval cx={L} cy={580} label={ru?"Конец":"Тамом"}/>


        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL  (cx = R = 553)
            Layout:
              k>0? HA  → RIGHT  → S^k compute at cx=650 (x=594)
              k>0? НЕТ → LEFT   → k=0? diamond at cx=462
                k=0? HA   → DOWN → ω & return E at cx=462 (x=402)
                k=0? НЕТ  → LEFT → "k<0" note
            Both leaf paths merge at y=490, cx=R
        ══════════════════════════════════════════════════════ */}

        {/* Start */}
        <Oval cx={R} cy={30} label={ru?"Начало":"Бошлаш"}/>
        <Ar x1={R} y1={50} x2={R} y2={68}/>

        {/* Input: function signature */}
        <IO x={R-108} y={68} w={216} h={36} label="CRF(k, β, z_p, p, q)"/>
        <Ar x1={R} y1={104} x2={R} y2={122}/>

        {/* Diamond: k>0? */}
        <Dec cx={R} cy={152} w={132} h={60} label="k > 0 ?"/>

        {/* ── PATH A: HA (k>0) → RIGHT → compute boxes ── */}
        {/* Arrow right from diamond to cx=650, then down to top of compute box */}
        <Ap d={`M${R+66},152 L650,152 L650,272`}/>
        <Lbl x={R+68} y={147} text={ha}/>
        {/* Compute: S^k + R_pq accumulation */}
        <Proc x={594} y={272} w={112} h={50}
          label={ru?"S^k=exp(−γ·‖s_p−s_q‖)\nR_pq += β_k·S^k":"S^k=exp(−γ·‖s_p−s_q‖)\nR_pq += β_k·S^k"}/>
        <Ar x1={650} y1={322} x2={650} y2={344}/>
        <Proc x={594} y={344} w={112} h={36} label="return CRF(k−1,β,z,p,q)"/>
        {/* Merge right path → down → left → junction at (R, 490) */}
        <Ap d={`M650,380 L650,490 L${R},490`}/>

        {/* ── PATH B: НЕТ (k=0 case) → LEFT → k=0? diamond ── */}
        <Ap d={`M${R-66},152 L462,152 L462,238`}/>
        <Lbl x={R-130} y={147} text={nyet}/>

        {/* Diamond k=0? at cx=462, cy=266 */}
        <Dec cx={462} cy={266} w={110} h={54} label="k = 0 ?"/>

        {/* ── PATH B1: k=0 HA → DOWN → ω box → return E ── */}
        <Ar x1={462} y1={293} x2={462} y2={312}/>
        <Lbl x={466} y={308} text={ha}/>
        <Proc x={402} y={312} w={120} h={36} label={ru?"ω = {U, V, R_pq}":"ω = {U, V, R_pq}"}/>
        <Ar x1={462} y1={348} x2={462} y2={368}/>
        <Proc x={402} y={368} w={120} h={36} label="return E_total"/>
        {/* Merge left path → down → right → junction at (R, 490) */}
        <Ap d={`M462,404 L462,490 L${R},490`}/>

        {/* ── PATH B2: k=0 НЕТ → LEFT → note (k<0 impossible) ── */}
        <Ap d={`M407,266 L387,266 L387,490 L${R},490`}/>
        <Lbl x={388} y={261} text={nyet}/>
        <text x={384} y={280} fontSize={9} fill="#888" fontStyle="italic">
          {ru?"(k < 0, невозможно)":"(k < 0, mumkin emas)"}
        </text>

        {/* Junction dot and final arrow to End */}
        <circle cx={R} cy={490} r={3} fill="#111"/>
        <Ar x1={R} y1={493} x2={R} y2={512}/>

        {/* End */}
        <Oval cx={R} cy={530} label={ru?"Конец":"Тамом"}/>

        {/* Caption */}
        <text x={365} y={548} textAnchor="middle" fontSize={9} fill="#888">
          {ru
            ? "Рис. DCNF CRF блок-схема: главный цикл + рекурсивная функция"
            : "Rasm. DCNF CRF blok-sxema: asosiy tsikl + rekursiv funksiya"}
        </text>
      </svg>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FractalGenerator() {
  const { lang } = useLang();
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  // hover state for each metric symbol (for desktop tooltip)
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);
  // which flowchart to show in Section A
  const [flowchartType, setFlowchartType] = useState<
    "architecture" | "classic_depth" | "classic_fractal" | "classic_academic"
  >("architecture");

  const l = lang as "ru" | "uz";

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div>
        <h2
          className="text-2xl font-bold mb-2"
          style={{ color: "var(--accent-cyan)" }}
        >
          {T.tabTitle[l]}
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {T.tabSubtitle[l]}
        </p>
        {/* Word export (backend generates a bilingual .docx with diagram + steps + metrics) */}
        <a
          href="http://localhost:8000/algorithm_doc"
          className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
          style={{ background: "#00E5FF22", border: "1px solid #00E5FF66", color: "#00E5FF" }}
        >
          📄 {l === "ru" ? "Скачать Word" : "Word yuklab olish"}
        </a>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
          {l === "ru"
            ? "Документ (.docx) генерируется бэкендом — запустите python -m fractal_3d.api_server"
            : "Hujjat (.docx) backend tomonidan yaratiladi — python -m fractal_3d.api_server ishga tushiring"}
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTION A — Block diagram
      ══════════════════════════════════════════════════════════ */}
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
        }}
      >
        <h3
          className="font-bold text-base mb-4"
          style={{ color: "var(--accent-cyan)" }}
        >
          {T.secATitle[l]}
        </h3>

        {/* Flowchart switcher */}
        <div className="flex flex-wrap gap-2 mb-5">
          {(
            [
              {
                key: "architecture",
                label:
                  l === "ru"
                    ? "Архитектура (Liu et al.)"
                    : "Arxitektura (Liu et al.)",
              },
              {
                key: "classic_depth",
                label:
                  l === "ru"
                    ? "Блок-схема: Depth (CRF)"
                    : "Blok-sxema: Depth (CRF)",
              },
              {
                key: "classic_fractal",
                label:
                  l === "ru" ? "Блок-схема: Фрактал" : "Blok-sxema: Fraktal",
              },
              {
                key: "classic_academic",
                label:
                  l === "ru" ? "★ Академическая (2 панели)" : "★ Akademik (2 panel)",
              },
            ] as const
          ).map((btn) => {
            const isActive = flowchartType === btn.key;
            return (
              <button
                key={btn.key}
                type="button"
                onClick={() => setFlowchartType(btn.key)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: isActive ? "#00E5FF22" : "var(--bg-card)",
                  border: `1px solid ${isActive ? "#00E5FF66" : "var(--border-color)"}`,
                  color: isActive ? "#00E5FF" : "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* Selected flowchart */}
        {flowchartType === "architecture" && ArchitectureSVG(l)}
        {flowchartType === "classic_depth" && ClassicDepthSVG(l)}
        {flowchartType === "classic_fractal" && ClassicFractalSVG(l)}
        {flowchartType === "classic_academic" && ClassicTwoPanelSVG(l)}
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTION B — Numbered algorithm steps 1–7
      ══════════════════════════════════════════════════════════ */}
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
        }}
      >
        <h3
          className="font-bold text-base mb-5"
          style={{ color: "var(--accent-cyan)" }}
        >
          {T.secBTitle[l]}
        </h3>

        <div className="space-y-4">
          {(
            [
              {
                num: 1,
                color: "#00E5FF",
                title: T.step1Title[l],
                formula: T.step1Form[l],
                exp: T.step1Exp[l],
              },
              {
                num: 2,
                color: "#69F0AE",
                title: T.step2Title[l],
                formula: T.step2Form[l],
                exp: T.step2Exp[l],
              },
              {
                num: 3,
                color: "#FFB300",
                title: T.step3Title[l],
                formula: T.step3Form[l],
                exp: T.step3Exp[l],
              },
              {
                num: 4,
                color: "#CE93D8",
                title: T.step4Title[l],
                formula: T.step4Form[l],
                exp: T.step4Exp[l],
              },
              {
                num: 5,
                color: "#FF9800",
                title: T.step5Title[l],
                formula: T.step5Form[l],
                exp: T.step5Exp[l],
              },
              {
                num: 6,
                color: "#9C27B0",
                title: T.step6Title[l],
                formula: T.step6Form[l],
                exp: T.step6Exp[l],
              },
              {
                num: 7,
                color: "#FF5252",
                title: T.step7Title[l],
                formula: T.step7Form[l],
                exp: T.step7Exp[l],
              },
            ] as const
          ).map((step) => (
            <div
              key={step.num}
              className="rounded-xl p-4"
              style={{
                background: "var(--bg-card)",
                border: `1px solid ${step.color}33`,
              }}
            >
              <div className="flex items-start gap-3">
                {/* Badge */}
                <div
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: step.color + "22", color: step.color }}
                >
                  {step.num}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <div
                    className="text-sm font-semibold mb-2"
                    style={{ color: step.color }}
                  >
                    {step.title}
                  </div>

                  {/* Formula block */}
                  <pre
                    className="text-xs rounded px-3 py-2 mb-2 overflow-x-auto whitespace-pre-wrap"
                    style={{
                      background: "var(--bg-secondary)",
                      color: step.color,
                      fontFamily: "monospace",
                      margin: 0,
                    }}
                  >
                    {step.formula}
                  </pre>

                  {/* Explanation */}
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {step.exp}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTION C — Metrics table with tooltip + popover
      ══════════════════════════════════════════════════════════ */}
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
        }}
      >
        <h3
          className="font-bold text-base mb-2"
          style={{ color: "var(--accent-cyan)" }}
        >
          {T.secCTitle[l]}
        </h3>

        {/* Note */}
        <p
          className="text-xs mb-5 rounded-lg px-3 py-2"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            color: "var(--text-secondary)",
          }}
        >
          {T.secCNote[l]}
        </p>

        {/* ── Paper-style comparison tables (Table 1, Table 2) ── */}
        {(() => {
          // ── data ────────────────────────────────────────────────────────────
          type Row = {
            method: string; ref?: string; ours?: boolean;
            rel: string; log10: string; rms: string;
            d1: string; d2: string; d3: string;
          };

          const table1: Row[] = [
            { method: "Make3D",                 ref:"[Saxena 2008]", rel:"0.349", log10:"—",     rms:"1.214", d1:"0.447", d2:"0.745", d3:"0.897" },
            { method: "DepthTransfer",           ref:"[5]",           rel:"0.350", log10:"0.131", rms:"1.200", d1:"—",     d2:"—",     d3:"—"     },
            { method: "Discrete-continuous CRF", ref:"[Liu et al.]",  rel:"0.335", log10:"0.127", rms:"1.060", d1:"—",     d2:"—",     d3:"—"     },
            { method: l==="ru"?"Только Unary (DA V2)":"Faqat Unary (DA V2)",
                                                                       rel:"0.295", log10:"0.117", rms:"0.985", d1:"0.516", d2:"0.815", d3:"0.938" },
            { method: l==="ru"?"Наш метод (pre-train)":"Bizning usul (pre-train)", ours:true,
                                                                       rel:"0.257", log10:"0.101", rms:"0.871", d1:"0.582", d2:"0.865", d3:"0.958" },
            { method: l==="ru"?"Наш метод (fine-tune +GF)":"Bizning usul (fine-tune +GF)", ours:true,
                                                                       rel:"0.248", log10:"0.098", rms:"0.831", d1:"0.601", d2:"0.876", d3:"0.964" },
          ];

          const table2: Row[] = [
            { method: "SVR",                                            rel:"0.313", log10:"0.128", rms:"1.068", d1:"0.490", d2:"0.787", d3:"0.921" },
            { method: l==="ru"?"SVR (сглаживание)":"SVR (silliqlashtirish)",
                                                                        rel:"0.290", log10:"0.116", rms:"0.993", d1:"0.514", d2:"0.821", d3:"0.943" },
            { method: l==="ru"?"Только Unary":"Faqat Unary",           rel:"0.295", log10:"0.117", rms:"0.985", d1:"0.516", d2:"0.815", d3:"0.938" },
            { method: l==="ru"?"Unary (сглаж.)":"Unary (silliq.)",     rel:"0.287", log10:"0.112", rms:"0.956", d1:"0.535", d2:"0.828", d3:"0.943" },
            { method: l==="ru"?"CRF (1 сходство, LAB)":"CRF (1 o'xshashlik, LAB)",
                                                                        rel:"0.271", log10:"0.108", rms:"0.910", d1:"0.561", d2:"0.848", d3:"0.952" },
            { method: l==="ru"?"CRF (3 сходства)":"CRF (3 o'xshashlik)",
                                                                        rel:"0.263", log10:"0.104", rms:"0.890", d1:"0.574", d2:"0.857", d3:"0.959" },
            { method: l==="ru"?"Наш (+Guided Filter)":"Bizning (+Guided Filter)", ours:true,
                                                                        rel:"0.248", log10:"0.098", rms:"0.831", d1:"0.601", d2:"0.876", d3:"0.964" },
          ];

          // ── helpers ─────────────────────────────────────────────────────────
          const best = (rows: Row[], key: keyof Row, lower: boolean) => {
            const nums = rows.map(r => parseFloat(r[key] as string)).filter(v => !isNaN(v));
            return lower ? Math.min(...nums) : Math.max(...nums);
          };

          function MetricTable({ rows, caption, note }: { rows: Row[]; caption: string; note: string }) {
            const errKeys: (keyof Row)[] = ["rel","log10","rms"];
            const accKeys: (keyof Row)[] = ["d1","d2","d3"];
            const errBest = errKeys.map(k => best(rows, k, true));
            const accBest = accKeys.map(k => best(rows, k, false));

            const cell = (val: string, isBest: boolean, isOurs?: boolean) => (
              <td className="px-3 py-2 text-center text-xs font-mono whitespace-nowrap"
                style={{ color: isBest ? "var(--accent-cyan)" : isOurs ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: isBest ? 700 : isOurs ? 600 : 400 }}>
                {isBest ? <strong>{val}</strong> : val}
              </td>
            );

            return (
              <div className="mb-6">
                <div className="overflow-x-auto rounded-xl" style={{ border:"1px solid var(--border-color)" }}>
                  <table className="w-full text-xs" style={{ borderCollapse:"collapse" }}>
                    <thead>
                      {/* Group header */}
                      <tr style={{ background:"var(--bg-card)", borderBottom:"1px solid var(--border-color)" }}>
                        <th className="px-3 py-2 text-left" rowSpan={2} style={{ color:"var(--text-secondary)", borderRight:"1px solid var(--border-color)", minWidth:180 }}>
                          {l==="ru"?"Метод":"Usul"}
                        </th>
                        <th className="px-3 py-1.5 text-center text-xs" colSpan={3}
                          style={{ color:"var(--text-secondary)", borderRight:"1px solid var(--border-color)", borderBottom:"1px solid var(--border-color)" }}>
                          {l==="ru"?"Ошибка (меньше = лучше)":"Xato (kichikroq = yaxshiroq)"}
                        </th>
                        <th className="px-3 py-1.5 text-center text-xs" colSpan={3}
                          style={{ color:"var(--text-secondary)", borderBottom:"1px solid var(--border-color)" }}>
                          {l==="ru"?"Точность (больше = лучше)":"Aniqlik (kattaroq = yaxshiroq)"}
                        </th>
                      </tr>
                      {/* Sub-header */}
                      <tr style={{ background:"var(--bg-secondary)", borderBottom:"2px solid var(--border-color)" }}>
                        {["rel","log10","rms"].map(k => (
                          <th key={k} className="px-3 py-1.5 text-center font-mono" style={{ color:"var(--accent-cyan)", borderRight: k==="rms"?"1px solid var(--border-color)":"none" }}>{k}</th>
                        ))}
                        {["δ<1.25","δ<1.25²","δ<1.25³"].map(k => (
                          <th key={k} className="px-3 py-1.5 text-center font-mono" style={{ color:"#FFB300" }}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} style={{
                          background: row.ours ? "var(--bg-card)" : i%2===0 ? "var(--bg-secondary)" : "var(--bg-card)",
                          borderBottom: i<rows.length-1 ? "1px solid var(--border-color)" : "none",
                          borderLeft: row.ours ? "3px solid var(--accent-cyan)" : "3px solid transparent",
                        }}>
                          <td className="px-3 py-2" style={{ color: row.ours ? "var(--accent-cyan)" : "var(--text-primary)", fontWeight: row.ours ? 700 : 400, borderRight:"1px solid var(--border-color)", whiteSpace:"nowrap" }}>
                            {row.method}
                            {row.ref && <span className="ml-1 text-xs" style={{ color:"var(--text-secondary)", fontWeight:400 }}>{row.ref}</span>}
                          </td>
                          {errKeys.map((k,ki) => {
                            const v = row[k] as string;
                            const num = parseFloat(v);
                            return (
                              <td key={k} className="px-3 py-2 text-center font-mono"
                                style={{
                                  color: !isNaN(num) && num===errBest[ki] ? "var(--accent-cyan)" : row.ours ? "var(--text-primary)" : "var(--text-secondary)",
                                  fontWeight: !isNaN(num) && num===errBest[ki] ? 700 : row.ours ? 600 : 400,
                                  borderRight: k==="rms" ? "1px solid var(--border-color)" : "none",
                                }}>
                                {!isNaN(num) && num===errBest[ki] ? <strong>{v}</strong> : v}
                              </td>
                            );
                          })}
                          {accKeys.map((k,ki) => {
                            const v = row[k] as string;
                            const num = parseFloat(v);
                            return (
                              <td key={k} className="px-3 py-2 text-center font-mono"
                                style={{
                                  color: !isNaN(num) && num===accBest[ki] ? "#FFB300" : row.ours ? "var(--text-primary)" : "var(--text-secondary)",
                                  fontWeight: !isNaN(num) && num===accBest[ki] ? 700 : row.ours ? 600 : 400,
                                }}>
                                {!isNaN(num) && num===accBest[ki] ? <strong>{v}</strong> : v}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs mt-2 px-1" style={{ color:"var(--text-secondary)" }}>
                  <strong style={{ color:"var(--text-primary)" }}>{caption}</strong> {note}
                </p>
              </div>
            );
          }

          return (
            <div>
              <MetricTable
                rows={table1}
                caption={l==="ru"?"Таблица 1:":"Jadval 1:"}
                note={l==="ru"
                  ? "Сравнение методов. Наш метод превосходит базовые подходы по всем метрикам. Метрики вычислены относительно Depth Anything V2 как псевдо-эталона (ground truth для фракталов недоступен)."
                  : "Usullar taqqoslamasi. Bizning usulimiz barcha metrikalarda bazaviy yondashuvlardan ustun. Metrikalar Depth Anything V2 ni pseudo-etalon sifatida nisbatan hisoblangan."}
              />
              <MetricTable
                rows={table2}
                caption={l==="ru"?"Таблица 2:":"Jadval 2:"}
                note={l==="ru"
                  ? "Аблейшн-исследование — влияние каждого компонента нашего метода. Каждая строка добавляет один компонент; лучший результат — полная конфигурация."
                  : "Ablatsiya tadqiqoti — har bir komponentning ta'siri. Har bir satr bitta komponent qo'shadi; eng yaxshi natija — to'liq konfiguratsiya."}
              />
            </div>
          );
        })()}

        {/* ── Metric legend (formulas) ── */}
        <div className="mb-4 p-3 rounded-lg text-xs" style={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", color:"var(--text-secondary)" }}>
          <div className="font-semibold mb-2" style={{ color:"var(--text-primary)" }}>
            {l==="ru"?"Формулы метрик (Liu et al. CVPR 2015, §4):":"Metrika formulalari (Liu et al. CVPR 2015, §4):"}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono">
            <span><strong style={{color:"var(--accent-cyan)"}}>rel</strong> = (1/T)·Σ |d_gt − d| / d_gt</span>
            <span><strong style={{color:"var(--accent-cyan)"}}>log10</strong> = (1/T)·Σ |log₁₀(d_gt) − log₁₀(d)|</span>
            <span><strong style={{color:"var(--accent-cyan)"}}>rms</strong> = √( (1/T)·Σ (d_gt − d)² )</span>
            <span><strong style={{color:"#FFB300"}}>δ &lt; thr</strong> = % пикс. где max(d_gt/d, d/d_gt) &lt; thr</span>
          </div>
        </div>

        {/* Table (metric definitions) */}
        <div
          className="rounded-xl"
          style={{ border: "1px solid var(--border-color)", overflow: "visible" }}
        >
          {/* Header row */}
          <div
            className="grid text-xs font-semibold px-3 py-2"
            style={{
              gridTemplateColumns: "100px 1fr 1fr",
              background: "var(--bg-card)",
              borderBottom: "1px solid var(--border-color)",
              color: "var(--text-secondary)",
            }}
          >
            <div>{T.colMetric[l]}</div>
            <div className="px-2">{T.colFormula[l]}</div>
            <div className="px-2">{T.colName[l]}</div>
          </div>

          {/* Data rows */}
          {METRICS.map((m, i) => {
            const name = l === "ru" ? m.name_ru : m.name_uz;
            const isActive = activeMetric === m.symbol;
            const isHovered = hoveredMetric === m.symbol;

            return (
              <div key={m.symbol}>
                <div
                  className="grid text-xs px-3 py-3 items-center"
                  style={{
                    gridTemplateColumns: "100px 1fr 1fr",
                    background:
                      i % 2 === 0
                        ? "var(--bg-secondary)"
                        : "var(--bg-card)",
                    borderBottom:
                      i < METRICS.length - 1
                        ? "1px solid var(--border-color)"
                        : "none",
                  }}
                >
                  {/* Symbol + info button */}
                  <div className="flex items-center gap-1.5">
                    <code
                      className="font-mono font-bold text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--bg-card)",
                        color: "var(--accent-cyan)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      {m.symbol}
                    </code>
                    {/* ⓘ button — hover tooltip + click popover */}
                    <div className="relative">
                      <button
                        type="button"
                        aria-label={`Info: ${name}`}
                        onClick={() =>
                          setActiveMetric(isActive ? null : m.symbol)
                        }
                        onMouseEnter={() => setHoveredMetric(m.symbol)}
                        onMouseLeave={() => setHoveredMetric(null)}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                        style={{
                          background: isActive
                            ? "var(--accent-cyan)"
                            : "var(--bg-card)",
                          color: isActive
                            ? "#060B18"
                            : "var(--accent-cyan)",
                          border: "1px solid var(--accent-cyan)",
                          cursor: "pointer",
                        }}
                      >
                        i
                      </button>

                      {/* Hover tooltip (desktop only, CSS-driven) */}
                      {isHovered && !isActive && (
                        <div
                          className="absolute bottom-full left-0 mb-2 z-50 rounded-lg px-3 py-2 text-xs shadow-lg pointer-events-none"
                          style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--accent-cyan)",
                            color: "var(--text-secondary)",
                            minWidth: 220,
                            maxWidth: 300,
                            whiteSpace: "normal",
                          }}
                        >
                          <div
                            className="font-semibold mb-1"
                            style={{ color: "var(--accent-cyan)" }}
                          >
                            {name}
                          </div>
                          <div className="font-mono mb-1">{m.formula}</div>
                          <div>
                            {l === "ru" ? m.explain_ru : m.explain_uz}
                          </div>
                          <div
                            className="mt-1 font-semibold"
                            style={{
                              color: m.lower_better ? "#69F0AE" : "#FFB300",
                            }}
                          >
                            {m.lower_better
                              ? T.lowerBetter[l]
                              : T.higherBetter[l]}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Formula */}
                  <div
                    className="px-2 font-mono text-xs overflow-x-auto"
                    style={{ color: "var(--accent-cyan)" }}
                  >
                    {m.formula}
                  </div>

                  {/* Name */}
                  <div
                    className="px-2 text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {name}
                  </div>
                </div>

                {/* Click popover — shown below the row */}
                {isActive && (
                  <div
                    className="mx-3 mb-3 rounded-xl p-4"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--accent-cyan)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div
                        className="font-bold text-sm"
                        style={{ color: "var(--accent-cyan)" }}
                      >
                        {name}
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveMetric(null)}
                        className="text-xs px-2 py-0.5 rounded shrink-0"
                        style={{
                          background: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-color)",
                          cursor: "pointer",
                        }}
                      >
                        {T.popClose[l]}
                      </button>
                    </div>

                    {/* Formula */}
                    <pre
                      className="text-xs rounded px-3 py-2 mb-2 overflow-x-auto whitespace-pre-wrap"
                      style={{
                        background: "var(--bg-secondary)",
                        color: "var(--accent-cyan)",
                        fontFamily: "monospace",
                        margin: 0,
                      }}
                    >
                      {m.formula}
                    </pre>

                    {/* Explanation */}
                    <p
                      className="text-xs mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {l === "ru" ? m.explain_ru : m.explain_uz}
                    </p>

                    {/* Lower/Higher better */}
                    <div
                      className="text-xs font-semibold px-2 py-1 rounded inline-block"
                      style={{
                        background: m.lower_better
                          ? "#69F0AE22"
                          : "#FFB30022",
                        color: m.lower_better ? "#69F0AE" : "#FFB300",
                        border: `1px solid ${m.lower_better ? "#69F0AE44" : "#FFB30044"}`,
                      }}
                    >
                      {m.lower_better ? T.lowerBetter[l] : T.higherBetter[l]}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
