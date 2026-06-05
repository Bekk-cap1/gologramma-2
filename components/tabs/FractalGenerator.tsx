"use client";

import { useState } from "react";
import { useLang } from "@/components/LanguageContext";
import { generateAlgorithmDocx } from "@/lib/generateDocx";

export default function AlgorithmArchitecture() {
  const { lang } = useLang();
  const ru = lang === 'ru';
  const [activeAlgo, setActiveAlgo] = useState<'record' | 'restore' | 'trace'>('record');
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await generateAlgorithmDocx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transmission-hologramma-algoritm.docx';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  // ─── Holographic methods score table ────────────────────────────────────────
  const holoMethods = [
    {
      name: ru ? 'Трансмиссионная (Лейт–Упатниекс)' : 'Transmissiya (Leyt–Upatnieks)',
      color: '#00E5FF',
      scores: {
        [ru ? 'Разрешение' : 'Aniqlik']: 9,
        [ru ? 'Простота записи' : 'Yozish oddiyligi']: 7,
        [ru ? 'Просмотр без лазера' : 'Lazersiz ko\'rish']: 2,
        [ru ? 'Цветопередача' : 'Rang ko\'rinishi']: 3,
        [ru ? 'Глубина 3D' : '3D chuqurligi']: 9,
        [ru ? 'Научное применение' : 'Ilmiy qo\'llash']: 10,
      },
    },
    {
      name: ru ? 'Отражательная (Денисюк)' : 'Aks ettiruvchi (Denisyuk)',
      color: '#FFB300',
      scores: {
        [ru ? 'Разрешение' : 'Aniqlik']: 7,
        [ru ? 'Простота записи' : 'Yozish oddiyligi']: 6,
        [ru ? 'Просмотр без лазера' : 'Lazersiz ko\'rish']: 10,
        [ru ? 'Цветопередача' : 'Rang ko\'rinishi']: 8,
        [ru ? 'Глубина 3D' : '3D chuqurligi']: 8,
        [ru ? 'Научное применение' : 'Ilmiy qo\'llash']: 8,
      },
    },
    {
      name: ru ? 'Радужная (Бентон)' : 'Kamalak (Benton)',
      color: '#69F0AE',
      scores: {
        [ru ? 'Разрешение' : 'Aniqlik']: 7,
        [ru ? 'Простота записи' : 'Yozish oddiyligi']: 5,
        [ru ? 'Просмотр без лазера' : 'Lazersiz ko\'rish']: 8,
        [ru ? 'Цветопередача' : 'Rang ko\'rinishi']: 6,
        [ru ? 'Глубина 3D' : '3D chuqurligi']: 4,
        [ru ? 'Научное применение' : 'Ilmiy qo\'llash']: 6,
      },
    },
    {
      name: ru ? 'Габора (inline)' : 'Gabor (inline)',
      color: '#CE93D8',
      scores: {
        [ru ? 'Разрешение' : 'Aniqlik']: 6,
        [ru ? 'Простота записи' : 'Yozish oddiyligi']: 9,
        [ru ? 'Просмотр без лазера' : 'Lazersiz ko\'rish']: 5,
        [ru ? 'Цветопередача' : 'Rang ko\'rinishi']: 3,
        [ru ? 'Глубина 3D' : '3D chuqurligi']: 3,
        [ru ? 'Научное применение' : 'Ilmiy qo\'llash']: 7,
      },
    },
  ];
  const criteriaKeys = Object.keys(holoMethods[0].scores);

  // ─── Laser comparison table ──────────────────────────────────────────────────
  const lasers = [
    {
      name: 'He-Ne', lambda: 632.8, color: '#FF5252',
      coherence: 10, power: 5, cost: 4, avail: 7, stability: 10,
    },
    {
      name: 'Nd:YAG×2', lambda: 532, color: '#69F0AE',
      coherence: 8, power: 8, cost: 7, avail: 9, stability: 8,
    },
    {
      name: 'Ar⁺', lambda: 488, color: '#448AFF',
      coherence: 9, power: 9, cost: 2, avail: 4, stability: 7,
    },
    {
      name: ru ? 'Диодный' : 'Diod', lambda: 405, color: '#CE93D8',
      coherence: 6, power: 6, cost: 9, avail: 9, stability: 6,
    },
  ];

  const algoTabs = [
    { key: 'record' as const, label: ru ? 'Запись голограммы' : 'Gologramma yozish' },
    { key: 'restore' as const, label: ru ? 'Восстановление' : 'Tiklash' },
    { key: 'trace'   as const, label: ru ? 'Трассировка лучей' : 'Nur trассировkasi' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--accent-cyan)' }}>
            {ru ? 'Алгоритм и архитектура' : 'Algoritm va arxitektura'}
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {ru
              ? 'Структура приложения, алгоритмы трассировки лучей и записи голограммы, количественные сравнения методов'
              : 'Ilova tuzilmasi, nur kuzatish va gologramma yozish algoritmlari, usullarning miqdoriy taqqoslamasi'}
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: downloading ? 'var(--bg-secondary)' : 'var(--accent-cyan)',
            color: downloading ? 'var(--text-secondary)' : '#060B18',
            border: '1px solid var(--accent-cyan)',
            opacity: downloading ? 0.7 : 1,
            cursor: downloading ? 'wait' : 'pointer',
          }}
        >
          {downloading ? '...' : '↓ DOCX'}
          <span className="hidden sm:inline">{ru ? '— скачать отчёт' : '— hisobot yuklab olish'}</span>
        </button>
      </div>

      {/* §1 — App Architecture Block Diagram */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-bold text-base mb-4" style={{ color: 'var(--accent-amber)' }}>
          §1. {ru ? 'Архитектура приложения' : 'Ilova arxitekturasi'}
        </h3>
        <svg viewBox="0 0 820 400" className="w-full" style={{ fontFamily: 'monospace' }}>
          <rect width="820" height="400" fill="#060B18" rx="10"/>

          {/* Browser / User */}
          <rect x="310" y="8" width="200" height="36" rx="7" fill="#00E5FF18" stroke="#00E5FF" strokeWidth="1.5"/>
          <text x="410" y="22" textAnchor="middle" fill="#00E5FF" fontSize="11" fontWeight="bold">
            {ru ? 'БРАУЗЕР (Пользователь)' : 'BRAUZER (Foydalanuvchi)'}
          </text>
          <text x="410" y="36" textAnchor="middle" fill="#90A4AE" fontSize="8">Next.js 16 · React · TypeScript</text>

          {/* Arrow */}
          <line x1="410" y1="44" x2="410" y2="60" stroke="#00E5FF55" strokeWidth="1.5"/>
          <polygon points="406,58 410,66 414,58" fill="#00E5FF55"/>

          {/* Navigation bar */}
          <rect x="20" y="66" width="780" height="32" rx="6" fill="#9C27B01A" stroke="#9C27B066" strokeWidth="1.5"/>
          <text x="410" y="79" textAnchor="middle" fill="#CE93D8" fontSize="10" fontWeight="bold">
            {ru ? 'Навигация — 11 вкладок' : 'Navigatsiya — 11 ta vkladka'}
          </text>
          <text x="410" y="91" textAnchor="middle" fill="#9C27B0" fontSize="8">
            {ru ? 'useLang() · useTheme() · localStorage · CSS Variables' : 'useLang() · useTheme() · localStorage · CSS o\'zgaruvchilar'}
          </text>

          {/* Tab boxes — row 1 */}
          {[
            { label: ru ? 'Оборудование' : 'Jihozlar',      color: '#FF5252', x: 20 },
            { label: ru ? 'Опт. схема'   : 'Optik sxema',  color: '#FF9800', x: 110 },
            { label: ru ? 'Запись'       : 'Yozish',        color: '#FFD740', x: 200 },
            { label: ru ? 'Математика'   : 'Matematika',    color: '#69F0AE', x: 290 },
            { label: ru ? 'Восстановление':'Tiklash',       color: '#00E5FF', x: 380 },
            { label: ru ? 'Кусочек=Целое': 'Bo\'lak=Butun', color: '#448AFF', x: 470 },
          ].map(({ label, color, x }) => (
            <g key={x}>
              <rect x={x} y="114" width="82" height="30" rx="4" fill={color + '18'} stroke={color + '66'} strokeWidth="1"/>
              <text x={x + 41} y="133" textAnchor="middle" fill={color} fontSize="8" fontWeight="bold">{label}</text>
            </g>
          ))}
          {/* Tab boxes — row 2 */}
          {[
            { label: ru ? 'Сравнение'     : 'Taqqoslash',   color: '#CE93D8', x: 20 },
            { label: ru ? 'Опт. стол'     : 'Optik stol',   color: '#FF4444', x: 110 },
            { label: ru ? 'Симулятор'     : 'Simulyator',   color: '#00BCD4', x: 200 },
            { label: '2D → 3D',                             color: '#AB47BC', x: 290 },
            { label: ru ? 'Алгоритм'      : 'Algoritm',     color: '#FFB300', x: 380 },
          ].map(({ label, color, x }) => (
            <g key={x}>
              <rect x={x} y="152" width="82" height="30" rx="4" fill={color + '18'} stroke={color + '66'} strokeWidth="1"/>
              <text x={x + 41} y="171" textAnchor="middle" fill={color} fontSize="8" fontWeight="bold">{label}</text>
            </g>
          ))}

          {/* Core Engine highlight */}
          <rect x="563" y="110" width="237" height="80" rx="7" fill="#FF444414" stroke="#FF444466" strokeWidth="2" strokeDasharray="5 3"/>
          <text x="681" y="126" textAnchor="middle" fill="#FF8A80" fontSize="9" fontWeight="bold">
            {ru ? '⚙ ЯДРО — Трассировка лучей' : '⚙ YADRO — Nur kuzatish'}
          </text>
          <text x="681" y="140" textAnchor="middle" fill="#90A4AE" fontSize="8">OpticalTable.tsx</text>
          <text x="681" y="153" textAnchor="middle" fill="#90A4AE" fontSize="8">
            {ru ? 'RaySource[] · ComponentDef[]' : 'RaySource[] · ComponentDef[]'}
          </text>
          <text x="681" y="166" textAnchor="middle" fill="#90A4AE" fontSize="8">
            {ru ? 'skipId · hit detection' : 'skipId · hit aniqlash'}
          </text>
          <text x="681" y="179" textAnchor="middle" fill="#FF8A8088" fontSize="7">Canvas 2D · requestAnimationFrame</text>

          {/* Shared layers */}
          <line x1="410" y1="190" x2="410" y2="210" stroke="#ffffff22" strokeWidth="1"/>

          <rect x="20" y="210" width="370" height="36" rx="6" fill="#00E5FF0C" stroke="#00E5FF33" strokeWidth="1"/>
          <text x="205" y="225" textAnchor="middle" fill="#00E5FF" fontSize="10" fontWeight="bold">
            {ru ? 'Слой перевода (i18n)' : 'Tarjima qatlami (i18n)'}
          </text>
          <text x="205" y="238" textAnchor="middle" fill="#90A4AE" fontSize="8">translations.ts · useLang() · Lang = "ru" | "uz"</text>

          <rect x="400" y="210" width="400" height="36" rx="6" fill="#9C27B00C" stroke="#9C27B033" strokeWidth="1"/>
          <text x="600" y="225" textAnchor="middle" fill="#CE93D8" fontSize="10" fontWeight="bold">
            {ru ? 'Слой темы (UI)' : 'Mavzu qatlami (UI)'}
          </text>
          <text x="600" y="238" textAnchor="middle" fill="#90A4AE" fontSize="8">CSS Variables · data-theme · LanguageContext.tsx</text>

          {/* External libs */}
          <line x1="205" y1="246" x2="205" y2="264" stroke="#ffffff22" strokeWidth="1"/>
          <line x1="600" y1="246" x2="600" y2="264" stroke="#ffffff22" strokeWidth="1"/>

          <rect x="20"  y="264" width="180" height="30" rx="5" fill="#FFB30014" stroke="#FFB30044" strokeWidth="1"/>
          <text x="110" y="279" textAnchor="middle" fill="#FFB300" fontSize="9" fontWeight="bold">Three.js (WebGL)</text>
          <text x="110" y="290" textAnchor="middle" fill="#90A4AE" fontSize="7">ReconstructionSim · FractalCNN</text>

          <rect x="215" y="264" width="180" height="30" rx="5" fill="#69F0AE14" stroke="#69F0AE44" strokeWidth="1"/>
          <text x="305" y="279" textAnchor="middle" fill="#69F0AE" fontSize="9" fontWeight="bold">Canvas 2D API</text>
          <text x="305" y="290" textAnchor="middle" fill="#90A4AE" fontSize="7">OpticalTable · Math · Recording</text>

          <rect x="410" y="264" width="180" height="30" rx="5" fill="#CE93D814" stroke="#CE93D844" strokeWidth="1"/>
          <text x="500" y="279" textAnchor="middle" fill="#CE93D8" fontSize="9" fontWeight="bold">React Hooks</text>
          <text x="500" y="290" textAnchor="middle" fill="#90A4AE" fontSize="7">useState · useEffect · useRef · useMemo</text>

          <rect x="605" y="264" width="180" height="30" rx="5" fill="#FF525214" stroke="#FF525244" strokeWidth="1"/>
          <text x="695" y="279" textAnchor="middle" fill="#FF8A80" fontSize="9" fontWeight="bold">Next.js 16 (App Router)</text>
          <text x="695" y="290" textAnchor="middle" fill="#90A4AE" fontSize="7">"use client" · Turbopack · SSR→CSR</text>

          {/* Data flow bottom */}
          <rect x="20" y="308" width="780" height="28" rx="6" fill="#ffffff06" stroke="#ffffff18" strokeWidth="1"/>
          <text x="410" y="319" textAnchor="middle" fill="#90A4AE" fontSize="8" fontWeight="bold">
            {ru ? 'ДАННЫЕ: translations.ts (370 строк) · globals.css · CLAUDE.md · AGENTS.md' : 'MA\'LUMOTLAR: translations.ts (370 qator) · globals.css · CLAUDE.md · AGENTS.md'}
          </text>
          <text x="410" y="330" textAnchor="middle" fill="#546E7A" fontSize="7">
            {ru ? 'Никаких баз данных — всё статично, рендерится на клиенте' : 'Hech qanday ma\'lumotlar bazasi — hammasi statik, mijozda render qilinadi'}
          </text>
        </svg>
      </div>

      {/* §2 — Algorithms */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
        <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
          <h3 className="font-bold text-base" style={{ color: 'var(--accent-amber)' }}>
            §2. {ru ? 'Алгоритмы' : 'Algoritmlar'}
          </h3>
          <div className="flex gap-1">
            {algoTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveAlgo(tab.key)}
                className="px-3 py-1.5 rounded text-xs font-medium transition-all"
                style={{
                  background: activeAlgo === tab.key ? 'var(--accent-cyan)' : 'var(--bg-card)',
                  color: activeAlgo === tab.key ? '#060B18' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5" style={{ background: 'var(--bg-card)' }}>
          {activeAlgo === 'record' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Flowchart */}
              <svg viewBox="0 0 280 520" className="w-full" style={{ fontFamily: 'monospace' }}>
                <rect width="280" height="520" fill="#060B18" rx="8"/>
                {/* Steps */}
                {[
                  { y: 16,  shape: 'round', color: '#00E5FF', ru: 'НАЧАЛО', uz: 'BOSHLANISH' },
                  { y: 68,  shape: 'rect',  color: '#FF5252', ru: 'Лазер включён\nλ = 632.8 нм', uz: 'Lazer yoqildi\nλ = 632.8 nm' },
                  { y: 136, shape: 'rect',  color: '#FF9800', ru: 'Светоделитель\n50% / 50%', uz: 'Nur bo\'lgich\n50% / 50%' },
                  { y: 204, shape: 'rect',  color: '#FFD740', ru: 'Опорный луч → Плёнка\nОбъектный → Объект', uz: 'Tayanch nuri → Plyonka\nOb\'ekt → Ob\'ekt' },
                  { y: 272, shape: 'rect',  color: '#69F0AE', ru: 'Рассеяние от объекта\nφ(x,y,z) — фаза', uz: 'Ob\'ektdan tarqalish\nφ(x,y,z) — faza' },
                  { y: 340, shape: 'diamond', color: '#00E5FF', ru: 'Оба луча\nна плёнке?', uz: 'Ikki nur\nplyonkada?' },
                  { y: 412, shape: 'rect',  color: '#9C27B0', ru: 'I(x,y) = Ar²+Ao²+\n2·Ar·Ao·cos(φ)', uz: 'I(x,y) = Ar²+Ao²+\n2·Ar·Ao·cos(φ)' },
                  { y: 476, shape: 'round', color: '#69F0AE', ru: 'ГОЛОГРАММА\nЗАПИСАНА ✓', uz: 'GOLOGRAMMA\nYOZILDI ✓' },
                ].map((step, i) => {
                  const text = ru ? step.ru : step.uz;
                  const lines = text.split('\n');
                  const cx = 140;
                  const cy = step.y + 26;
                  return (
                    <g key={i}>
                      {i > 0 && (
                        <g>
                          <line x1={cx} y1={step.y - 8} x2={cx} y2={step.y + 2} stroke="#ffffff33" strokeWidth="1.5"/>
                          <polygon points={`${cx-4},${step.y} ${cx+4},${step.y} ${cx},${step.y + 6}`} fill="#ffffff33"/>
                        </g>
                      )}
                      {step.shape === 'round' && (
                        <rect x={cx - 70} y={step.y} width="140" height="44" rx="22" fill={step.color + '22'} stroke={step.color} strokeWidth="1.5"/>
                      )}
                      {step.shape === 'rect' && (
                        <rect x={cx - 70} y={step.y} width="140" height="52" rx="5" fill={step.color + '18'} stroke={step.color + '88'} strokeWidth="1.5"/>
                      )}
                      {step.shape === 'diamond' && (
                        <polygon points={`${cx},${step.y} ${cx+70},${cy} ${cx},${step.y+52} ${cx-70},${cy}`}
                          fill={step.color + '18'} stroke={step.color} strokeWidth="1.5"/>
                      )}
                      {lines.map((line, li) => (
                        <text key={li} x={cx} y={step.shape === 'round' ? cy - 4 + li * 13 : cy + li * 13 - 4}
                          textAnchor="middle" fill={step.color} fontSize="9" fontWeight={step.shape === 'round' ? 'bold' : 'normal'}>
                          {line}
                        </text>
                      ))}
                      {/* YES label on diamond */}
                      {step.shape === 'diamond' && (
                        <text x={cx} y={step.y + 62} textAnchor="middle" fill="#69F0AE" fontSize="8">Да / Ha ↓</text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Formula breakdown */}
              <div className="space-y-3">
                <div className="text-sm font-semibold" style={{ color: 'var(--accent-amber)' }}>
                  {ru ? 'Математика записи:' : 'Yozish matematikasi:'}
                </div>
                {[
                  {
                    step: '1',
                    label: ru ? 'Опорная волна' : 'Tayanch to\'lqini',
                    formula: 'Eᵣ = Aᵣ · exp(i·k·r)',
                    note: ru ? 'Плоская когерентная волна без фазовых искажений' : 'Tekis koherent to\'lqin faza buzilishlarisiz',
                    color: '#00E5FF',
                  },
                  {
                    step: '2',
                    label: ru ? 'Объектная волна' : 'Ob\'ekt to\'lqini',
                    formula: 'E₀ = A₀ · exp(i·k·r + i·φ(x,y))',
                    note: ru ? 'Несёт 3D-информацию об объекте в фазе φ(x,y)' : 'Ob\'ekt haqida 3D ma\'lumotni φ(x,y) fazasida olib boradi',
                    color: '#9C27B0',
                  },
                  {
                    step: '3',
                    label: ru ? 'Интерференция на плёнке' : 'Plyonkada interferensiya',
                    formula: 'I = Aᵣ² + A₀² + 2·Aᵣ·A₀·cos(φ)',
                    note: ru ? 'Интенсивность = сумма яркостей + интерференционный член' : 'Intensivlik = yorqinliklar yig\'indisi + interferensiya hadi',
                    color: '#FFB300',
                  },
                  {
                    step: '4',
                    label: ru ? 'Пропускание плёнки' : 'Plyonka o\'tkazuvchanligi',
                    formula: 'T(x,y) = T₀ + β · I(x,y)',
                    note: ru ? 'β — чувствительность эмульсии. Голограмма записана.' : 'β — emulsiya sezgirligi. Gologramma yozildi.',
                    color: '#69F0AE',
                  },
                ].map(item => (
                  <div key={item.step} className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: `1px solid ${item.color}33` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: item.color, color: '#060B18' }}>{item.step}</span>
                      <span className="text-xs font-semibold" style={{ color: item.color }}>{item.label}</span>
                    </div>
                    <div className="font-mono text-sm px-2 py-1 rounded mb-1" style={{ background: '#0A1020', color: item.color }}>
                      {item.formula}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.note}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeAlgo === 'restore' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <svg viewBox="0 0 280 480" className="w-full" style={{ fontFamily: 'monospace' }}>
                <rect width="280" height="480" fill="#060B18" rx="8"/>
                {[
                  { y: 16,  shape: 'round',   color: '#00E5FF', ru: 'НАЧАЛО', uz: 'BOSHLANISH' },
                  { y: 68,  shape: 'rect',     color: '#00E5FF', ru: 'Опорный лазер\nλ_вос, θ_вос', uz: 'Tayanch lazer\nλ_tik, θ_tik' },
                  { y: 136, shape: 'diamond',  color: '#FFB300', ru: 'λ_вос ≈ λ_зап\nθ_вос ≈ θ_зап?', uz: 'λ_tik ≈ λ_yoz\nθ_tik ≈ θ_yoz?' },
                  { y: 210, shape: 'rect',     color: '#FF5252', ru: 'Дифракция на\nзаписанной решётке', uz: 'Yozilgan panjarada\ndifraksiya' },
                  { y: 278, shape: 'rect',     color: '#9C27B0', ru: '3 порядка:\n0-й, +1-й, −1-й', uz: '3 tartib:\n0-chi, +1-chi, −1-chi' },
                  { y: 346, shape: 'rect',     color: '#69F0AE', ru: '+1-й = β·Aᵣ·A₀·exp(iφ)\n→ 3D изображение!', uz: '+1-chi = β·Aᵣ·A₀·exp(iφ)\n→ 3D tasvir!' },
                  { y: 418, shape: 'round',    color: '#69F0AE', ru: 'ВОССТАНОВЛЕНИЕ\nУДАЧНО ✓', uz: 'TIKLASH\nMUVAFFAQIYATLI ✓' },
                ].map((step, i) => {
                  const text = ru ? step.ru : step.uz;
                  const lines = text.split('\n');
                  const cx = 140;
                  const cy = step.y + 26;
                  return (
                    <g key={i}>
                      {i > 0 && (
                        <g>
                          <line x1={cx} y1={step.y - 8} x2={cx} y2={step.y + 2} stroke="#ffffff33" strokeWidth="1.5"/>
                          <polygon points={`${cx-4},${step.y} ${cx+4},${step.y} ${cx},${step.y+6}`} fill="#ffffff33"/>
                        </g>
                      )}
                      {step.shape === 'round' && (
                        <rect x={cx-70} y={step.y} width="140" height="44" rx="22" fill={step.color + '22'} stroke={step.color} strokeWidth="1.5"/>
                      )}
                      {step.shape === 'rect' && (
                        <rect x={cx-70} y={step.y} width="140" height="52" rx="5" fill={step.color + '18'} stroke={step.color + '88'} strokeWidth="1.5"/>
                      )}
                      {step.shape === 'diamond' && (
                        <polygon points={`${cx},${step.y} ${cx+70},${cy} ${cx},${step.y+52} ${cx-70},${cy}`}
                          fill={step.color + '18'} stroke={step.color} strokeWidth="1.5"/>
                      )}
                      {lines.map((line, li) => (
                        <text key={li} x={cx} y={step.shape === 'round' ? cy - 4 + li * 13 : cy + li * 13 - 4}
                          textAnchor="middle" fill={step.color} fontSize="9" fontWeight={step.shape === 'round' ? 'bold' : 'normal'}>
                          {line}
                        </text>
                      ))}
                      {step.shape === 'diamond' && (
                        <text x={cx} y={step.y + 62} textAnchor="middle" fill="#69F0AE" fontSize="8">Да / Ha ↓</text>
                      )}
                    </g>
                  );
                })}
              </svg>
              <div className="space-y-3">
                <div className="text-sm font-semibold" style={{ color: 'var(--accent-amber)' }}>
                  {ru ? 'Математика восстановления:' : 'Tiklash matematikasi:'}
                </div>
                {[
                  { step: '1', label: ru ? 'Освещение голограммы' : 'Gologrammani yoritish',
                    formula: 'T·Eᵣ = (T₀ + β·I)·Eᵣ', color: '#00E5FF',
                    note: ru ? 'Опорный луч проходит через голографическую плёнку T(x,y)' : 'Tayanch nuri T(x,y) golografik plyonka orqali o\'tadi' },
                  { step: '2', label: ru ? '0-й порядок (фон)' : '0-chi tartib (fon)',
                    formula: 'T₀Eᵣ + βAᵣ²Eᵣ', color: '#607D8B',
                    note: ru ? 'Прямой луч и фон — не несут информации об объекте' : 'To\'g\'ri nur va fon — ob\'ekt haqida ma\'lumot olib bermaydi' },
                  { step: '3', label: ru ? '+1-й: восстановленная волна' : '+1-chi: tiklangan to\'lqin',
                    formula: 'β·Aᵣ·A₀·exp(iφ)  ← 3D!', color: '#69F0AE',
                    note: ru ? 'Точная копия оригинальной объектной волны — виртуальное 3D-изображение' : 'Original ob\'ekt to\'lqinining aniq nusxasi — virtual 3D tasvir' },
                  { step: '4', label: ru ? '−1-й: сопряжённая волна' : '-1-chi: bog\'liq to\'lqin',
                    formula: 'β·Aᵣ·A₀·exp(−iφ)', color: '#CE93D8',
                    note: ru ? 'Псевдоскопическое (вывернутое) реальное изображение' : 'Psevdoskopik (teskari) haqiqiy tasvir' },
                ].map(item => (
                  <div key={item.step} className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: `1px solid ${item.color}33` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: item.color, color: '#060B18' }}>{item.step}</span>
                      <span className="text-xs font-semibold" style={{ color: item.color }}>{item.label}</span>
                    </div>
                    <div className="font-mono text-sm px-2 py-1 rounded mb-1" style={{ background: '#0A1020', color: item.color }}>
                      {item.formula}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.note}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeAlgo === 'trace' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <svg viewBox="0 0 280 560" className="w-full" style={{ fontFamily: 'monospace' }}>
                <rect width="280" height="560" fill="#060B18" rx="8"/>
                {[
                  { y: 10,  shape: 'round',   color: '#00E5FF', ru: 'НАЧАЛО', uz: 'BOSHLANISH' },
                  { y: 62,  shape: 'rect',     color: '#FF5252', ru: 'Найти лазер\nв компонентах', uz: 'Lazer topish\nkomponentlarda' },
                  { y: 130, shape: 'rect',     color: '#FF9800', ru: 'Испустить луч\nangle, pos, skipId', uz: 'Nur chiqarish\nangle, pos, skipId' },
                  { y: 198, shape: 'rect',     color: '#FFD740', ru: 'Найти ближайший\nкомпонент (AABB hit)', uz: 'Eng yaqin komponent\ntopish (AABB hit)' },
                  { y: 266, shape: 'diamond',  color: '#00E5FF', ru: 'Тип\nкомпонента?', uz: 'Komponent\nturi?' },
                  { y: 340, shape: 'rect',     color: '#9C27B0', ru: 'BS: 2 луча (ref+obj)\nMirror: reflect\nLens: refract\nFilm: record hit\nObject: scatter', uz: 'BS: 2 nur (ref+obj)\nKo\'zgu: aks\nLinza: sinish\nPlyonka: qayd\nOb\'ekt: tarqatish' },
                  { y: 430, shape: 'diamond',  color: '#FFB300', ru: 'Макс. шаги\n(100)?', uz: 'Maks. qadamlar\n(100)?' },
                  { y: 504, shape: 'round',    color: '#69F0AE', ru: 'ТРАССИРОВКА\nЗАВЕРШЕНА', uz: 'KUZATISH\nYAKUNLANDI' },
                ].map((step, i) => {
                  const text = ru ? step.ru : step.uz;
                  const lines = text.split('\n');
                  const cx = 140;
                  const cy = step.y + 26;
                  const h = step.shape === 'rect' ? (lines.length > 3 ? 70 : 52) : 52;
                  return (
                    <g key={i}>
                      {i > 0 && (
                        <g>
                          <line x1={cx} y1={step.y - 8} x2={cx} y2={step.y + 2} stroke="#ffffff33" strokeWidth="1.5"/>
                          <polygon points={`${cx-4},${step.y} ${cx+4},${step.y} ${cx},${step.y+6}`} fill="#ffffff33"/>
                        </g>
                      )}
                      {step.shape === 'round' && <rect x={cx-70} y={step.y} width="140" height="44" rx="22" fill={step.color + '22'} stroke={step.color} strokeWidth="1.5"/>}
                      {step.shape === 'rect'  && <rect x={cx-70} y={step.y} width="140" height={h}    rx="5" fill={step.color + '18'} stroke={step.color + '88'} strokeWidth="1.5"/>}
                      {step.shape === 'diamond' && <polygon points={`${cx},${step.y} ${cx+70},${cy} ${cx},${step.y+52} ${cx-70},${cy}`} fill={step.color + '18'} stroke={step.color} strokeWidth="1.5"/>}
                      {lines.map((line, li) => (
                        <text key={li} x={cx} y={step.shape === 'round' ? cy - 4 + li * 12 : cy + li * 11 - (lines.length > 3 ? 12 : 4)}
                          textAnchor="middle" fill={step.color} fontSize={lines.length > 3 ? 8 : 9}
                          fontWeight={step.shape === 'round' ? 'bold' : 'normal'}>{line}</text>
                      ))}
                      {step.shape === 'diamond' && step.y < 500 && (
                        <text x={cx} y={step.y + 62} textAnchor="middle" fill="#69F0AE" fontSize="8">
                          {step.y < 300 ? (ru ? '↓ обработка' : '↓ qayta ishlash') : (ru ? 'Да ↓' : 'Ha ↓')}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              <div className="space-y-3">
                <div className="text-sm font-semibold" style={{ color: 'var(--accent-amber)' }}>
                  {ru ? 'Ключевые структуры данных:' : 'Asosiy ma\'lumotlar tuzilmalari:'}
                </div>
                {[
                  { label: 'RaySource', color: '#FF5252',
                    fields: ['id: string', 'x, y: number', 'angle: number', 'color: string', 'skipId?: string  // BS fix'],
                    note: ru ? 'Активный луч, движущийся по столу' : 'Stolda harakatlanayotgan faol nur' },
                  { label: 'ComponentDef', color: '#FFB300',
                    fields: ['id: string', "type: 'laser'|'bs'|'mirror'|'lens'|'film'|'object'", 'x, y, angle: number', 'width, height: number'],
                    note: ru ? 'Оптический компонент на столе' : 'Stoldagi optik komponent' },
                  { label: ru ? 'Результат трассировки' : 'Kuzatish natijasi', color: '#69F0AE',
                    fields: ['rays: RaySource[]', 'filmHits: number', 'hasInterference: boolean', 'refPath, objPath: number'],
                    note: ru ? 'Выход алгоритма: интерференция есть?' : 'Algoritm natijasi: interferensiya bormi?' },
                ].map(item => (
                  <div key={item.label} className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: `1px solid ${item.color}33` }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: item.color }}>{item.label}</div>
                    <div className="font-mono text-xs space-y-0.5 mb-2">
                      {item.fields.map(f => (
                        <div key={f} style={{ color: '#90A4AE' }}>{f}</div>
                      ))}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.note}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* §3 — Holographic methods comparison (numerical) */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
        <div className="px-5 py-3" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
          <h3 className="font-bold text-base" style={{ color: 'var(--accent-amber)' }}>
            §3. {ru ? 'Методы голографии — количественное сравнение (1–10)' : 'Golografiya usullari — miqdoriy taqqoslash (1–10)'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--text-secondary)', minWidth: 180 }}>
                  {ru ? 'Метод' : 'Usul'}
                </th>
                {criteriaKeys.map(k => (
                  <th key={k} className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)', minWidth: 80 }}>{k}</th>
                ))}
                <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--accent-amber)', minWidth: 60 }}>
                  {ru ? 'Сумма' : 'Jami'}
                </th>
              </tr>
            </thead>
            <tbody>
              {holoMethods.map((method, mi) => {
                const total = Object.values(method.scores).reduce((a, b) => a + b, 0);
                const maxTotal = criteriaKeys.length * 10;
                return (
                  <tr key={mi} style={{
                    background: mi % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-color)',
                  }}>
                    <td className="px-4 py-3 font-semibold text-xs" style={{ color: method.color }}>{method.name}</td>
                    {criteriaKeys.map(k => {
                      const val = method.scores[k];
                      const best = Math.max(...holoMethods.map(m => m.scores[k]));
                      return (
                        <td key={k} className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-bold font-mono" style={{ color: val === best ? method.color : '#607D8B' }}>{val}</span>
                            <div className="w-8 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                              <div className="h-full rounded-full" style={{ width: `${val * 10}%`, background: val === best ? method.color : method.color + '44' }}/>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center">
                      <span className="font-bold font-mono text-sm" style={{ color: method.color }}>{total}</span>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{Math.round(total / maxTotal * 100)}%</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* §4 — Laser comparison */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
        <div className="px-5 py-3" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
          <h3 className="font-bold text-base" style={{ color: 'var(--accent-amber)' }}>
            §4. {ru ? 'Лазеры для голографии — сравнение (1–10)' : 'Golografiya uchun lazerlar — taqqoslash (1–10)'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                {[
                  { label: ru ? 'Лазер' : 'Lazer', w: 120 },
                  { label: 'λ (нм)', w: 70 },
                  { label: ru ? 'Когерентность' : 'Koherentlik', w: 100 },
                  { label: ru ? 'Мощность' : 'Quvvat', w: 80 },
                  { label: ru ? 'Стоимость' : 'Narx', w: 80 },
                  { label: ru ? 'Доступность' : 'Mavjudlik', w: 90 },
                  { label: ru ? 'Стабильность' : 'Barqarorlik', w: 90 },
                  { label: ru ? 'Итого' : 'Jami', w: 60 },
                ].map(({ label, w }) => (
                  <th key={label} className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)', minWidth: w }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lasers.map((laser, li) => {
                const scores = [laser.coherence, laser.power, laser.cost, laser.avail, laser.stability];
                const total = scores.reduce((a, b) => a + b, 0);
                const best = Math.max(...lasers.map(l => [l.coherence, l.power, l.cost, l.avail, l.stability].reduce((a, b) => a + b, 0)));
                return (
                  <tr key={li} style={{
                    background: li % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-color)',
                    outline: total === best ? `1px solid ${laser.color}44` : undefined,
                  }}>
                    <td className="px-3 py-3 font-bold" style={{ color: laser.color }}>
                      {laser.name}
                      {total === best && <span className="ml-1 text-xs px-1 rounded" style={{ background: laser.color + '33' }}>★</span>}
                    </td>
                    <td className="px-3 py-3 font-mono" style={{ color: laser.color }}>{laser.lambda}</td>
                    {scores.map((s, si) => {
                      const colBest = Math.max(...lasers.map(l => [l.coherence, l.power, l.cost, l.avail, l.stability][si]));
                      return (
                        <td key={si} className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                              <div className="h-full rounded-full" style={{ width: `${s * 10}%`, background: s === colBest ? laser.color : laser.color + '44' }}/>
                            </div>
                            <span className="font-mono text-xs" style={{ color: s === colBest ? laser.color : '#607D8B' }}>{s}</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 font-bold font-mono" style={{ color: laser.color }}>{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 text-xs" style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
          ★ {ru
            ? 'Nd:YAG×2 (532 нм, зелёный) — лучший выбор для начинающих: высокие баллы по мощности, стоимости и доступности'
            : 'Nd:YAG×2 (532 nm, yashil) — yangi boshlovchilar uchun eng yaxshi tanlov: quvvat, narx va mavjudlik bo\'yicha yuqori ball'}
        </div>
      </div>

      {/* §5 — Uzbek-only additional section */}
      {!ru && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #FFB30055' }}>
          <div className="px-5 py-3" style={{ background: '#FFB30010', borderBottom: '1px solid #FFB30033' }}>
            <h3 className="font-bold text-base" style={{ color: '#FFB300' }}>
              §5. Qo'shimcha ma'lumot — faqat o'zbekcha
            </h3>
            <p className="text-xs mt-0.5" style={{ color: '#90A4AE' }}>
              Ushbu bo'lim o'zbek tili tanlanganda ko'rinadi. Bu ma'lumotlar DOCX hisobotida ham mavjud.
            </p>
          </div>

          <div className="p-5 space-y-5" style={{ background: 'var(--bg-card)' }}>

            {/* History */}
            <div>
              <div className="text-sm font-semibold mb-2" style={{ color: '#FFB300' }}>Golografiyaning qisqacha tarixi</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { year: '1947', event: 'Dennis Gabor golografiyaning asosiy printsipini kashf etdi (interferensiyasiz ko\'rish)', color: '#00E5FF' },
                  { year: '1960–62', event: 'Lazer ixtirodan keyin Leith va Upatnieks birinchi yuqori sifatli transmissiya gologrammasini yaratdi', color: '#69F0AE' },
                  { year: '1971', event: 'Gabor fizika bo\'yicha Nobel mukofotiga sazovor bo\'ldi — "golografiya usulini ixtiro etganlik" uchun', color: '#CE93D8' },
                ].map(item => (
                  <div key={item.year} className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: `1px solid ${item.color}33` }}>
                    <div className="text-lg font-bold font-mono mb-1" style={{ color: item.color }}>{item.year}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.event}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Practical tips */}
            <div>
              <div className="text-sm font-semibold mb-2" style={{ color: '#FFB300' }}>Amaliy maslahatlar (mahalliy sharoit uchun)</div>
              <div className="space-y-2">
                {[
                  { icon: '🏔', tip: 'Pnevmatik stol yo\'q bo\'lsa — qum to\'ldirilgan og\'ir quti (200 kg+) yoki shishirilgan kameralar ustidagi metall plita yordam beradi.' },
                  { icon: '🌙', tip: 'Tunda, transport kamligi vaqtida ishlang — yer tebranishlari sezilarli kamayadi, ekspozitsiya sifati oshadi.' },
                  { icon: '🌡', tip: 'Xona harorati ekspozitsiya davomida o\'zgarmasligi kerak. Havo konditsioneri va shamollatgichlarni o\'chiring.' },
                  { icon: '🔴', tip: 'He-Ne lazer yo\'q bo\'lsa, yashil lazer ko\'rsatgichlar (532 nm, $10–50) tajriba uchun ishlatilishi mumkin, lekin koherentligi past.' },
                  { icon: '📷', tip: 'Golografik plyonka o\'rniga oddiy fotografik plyonka ham ishlatilishi mumkin (kamroq aniqlik, lekin arzon). Foma Holotest yaxshi variant.' },
                ].map((item, i) => (
                  <div key={i} className="flex gap-3 rounded-lg p-3" style={{ background: 'var(--bg-secondary)' }}>
                    <span className="text-base shrink-0">{item.icon}</span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.tip}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Glossary */}
            <div>
              <div className="text-sm font-semibold mb-2" style={{ color: '#FFB300' }}>Atamalar lug'ati (O'zbekcha → Ruscha → English)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                      {["O'zbekcha", "Ruscha", "English"].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: '#FFB300' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Gologramma",         "Голограмма",         "Hologram"],
                      ["Tayanch nuri",        "Опорный луч",        "Reference beam"],
                      ["Ob'ekt nuri",         "Объектный луч",      "Object beam"],
                      ["Nur bo'lgich",        "Светоделитель",      "Beam splitter"],
                      ["Ko'zgu",             "Зеркало",            "Mirror"],
                      ["Plyonka",            "Плёнка",             "Photosensitive film"],
                      ["Interferensiya",     "Интерференция",      "Interference"],
                      ["Difraksiya",         "Дифракция",          "Diffraction"],
                      ["Koherentlik",        "Когерентность",      "Coherence"],
                      ["To'lqin uzunligi",   "Длина волны",        "Wavelength"],
                      ["Tebranishdan himoya","Виброизоляция",      "Vibration isolation"],
                      ["Tiklash",            "Восстановление",     "Reconstruction"],
                    ].map((row, i) => (
                      <tr key={i} style={{
                        background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)',
                        borderBottom: '1px solid var(--border-color)',
                      }}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2" style={{ color: ci === 0 ? '#FFB300' : 'var(--text-secondary)' }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick formulas */}
            <div>
              <div className="text-sm font-semibold mb-2" style={{ color: '#FFB300' }}>Asosiy formulalar — tez manba</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { label: 'Interferensiya chiziq davri', formula: 'd = λ / (2·sin(θ/2))', note: 'λ = to\'lqin uzunligi, θ = burchak' },
                  { label: 'Kerakli plyonka aniqligi',   formula: 'N = 10⁶ / d  (chiziq/mm)', note: 'd nm da bo\'lganda' },
                  { label: 'Koherentlik uzunligi',        formula: 'Lc = λ² / Δλ', note: 'Optik yo\'llar farqi shu qiymatdan oshmasin' },
                  { label: 'Plyonka o\'tkazuvchanligi',  formula: 'T(x,y) = T₀ + β·I(x,y)', note: 'β — emulsiya sezgirligi' },
                ].map((f, i) => (
                  <div key={i} className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid #FFB30033' }}>
                    <div className="text-xs mb-1" style={{ color: '#90A4AE' }}>{f.label}</div>
                    <div className="font-mono text-sm font-bold mb-1" style={{ color: '#FFB300' }}>{f.formula}</div>
                    <div className="text-xs" style={{ color: '#607D8B' }}>{f.note}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
