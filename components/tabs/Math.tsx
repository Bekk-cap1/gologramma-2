"use client";

import { useState, useMemo, useEffect } from "react";
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";
import ExtensionDownload from "@/components/ExtensionDownload";

const FORMULA_GUIDE = [
  {
    formula: 'd = λ / (2·sin(θ/2))',
    color: '#00E5FF',
    name: { ru: 'Период интерференционных полос', uz: 'Interferensiya chiziqlarining davri' },
    when: {
      ru: 'На этапе проектирования эксперимента — до начала записи голограммы. Когда выбираете угол между лучами θ.',
      uz: 'Gologramma yozilmasidan oldin tajriba loyihalash bosqichida. θ nurlar orasidagi burchakni tanlaganda.'
    },
    why: {
      ru: 'Определяет пространственную частоту интерференционной картины. От d зависит, справится ли плёнка с разрешением. Если d слишком мало — нужна специальная высокоразрешающая эмульсия.',
      uz: 'Interferensiya rasmining fazoviy chastotasini belgilaydi. d dan plyonkaning aniqlik bilan kurasha olishi bog\'liq. Agar d juda kichik bo\'lsa — maxsus yuqori aniqlikdagi emulsiya kerak.'
    },
    example: {
      ru: 'λ=633нм, θ=30° → d=1223нм ≈ 1.2мкм. Нужно разрешение N=1/d=818 лин/мм — стандартная плёнка справится.',
      uz: 'λ=633nm, θ=30° → d=1223nm ≈ 1.2mkm. N=818 chiziq/mm aniqlik kerak — standart plyonka uddalaydi.'
    }
  },
  {
    formula: 'N = 10⁶ / d',
    color: '#9C27B0',
    name: { ru: 'Необходимое разрешение плёнки', uz: 'Plyonkaning kerakli aniqligi' },
    when: {
      ru: 'При выборе фотоматериала для записи. После того как вычислили d.',
      uz: 'Yozish uchun fotomaterial tanlaganda. d ni hisoblagandan keyin.'
    },
    why: {
      ru: 'Стандартные голографические плёнки (PFG-01, BB-640) дают 1000–5000 лин/мм. Если N > 5000 — нужна специальная плёнка или нужно уменьшить угол θ.',
      uz: 'Standart golografik plyonkalar (PFG-01, BB-640) 1000–5000 chiziq/mm beradi. Agar N > 5000 — maxsus plyonka yoki θ burchagini kamaytirish kerak.'
    },
    example: {
      ru: 'N=818 лин/мм → обычная плёнка подходит. N=6000 лин/мм → нужна Slavich PFG-03C или Kodak 649F.',
      uz: 'N=818 chiziq/mm → oddiy plyonka mos. N=6000 chiziq/mm → Slavich PFG-03C yoki Kodak 649F kerak.'
    }
  },
  {
    formula: 'Lc = λ² / Δλ',
    color: '#69F0AE',
    name: { ru: 'Длина когерентности лазера', uz: 'Lazerning koherentlik uzunligi' },
    when: {
      ru: 'При планировании глубины записываемой сцены и при настройке оптических путей. Разность длин опорного и объектного пути должна быть ≤ Lc.',
      uz: 'Yoziladigan sahnaning chuqurligini rejalashtirishda va optik yo\'llarni sozlashda. Tayanch va ob\'ekt yo\'llarining uzunlik farqi ≤ Lc bo\'lishi kerak.'
    },
    why: {
      ru: 'Если объект глубже, чем Lc, — дальние части объекта не запишутся (нет когерентности = нет интерференции). He-Ne лазер с Δλ≈0.01нм даёт Lc≈40мм — значит объект не глубже 4 см.',
      uz: 'Agar ob\'ekt Lc dan chuqurroq bo\'lsa — ob\'ektning uzoq qismlari yozilmaydi (koherentlik yo\'q = interferensiya yo\'q). He-Ne lazer Δλ≈0.01nm bilan Lc≈40mm beradi — demak ob\'ekt 4 sm dan chuqur emas.'
    },
    example: {
      ru: 'He-Ne (λ=633нм, Δλ=0.01нм): Lc=40мм. Ваш объект — статуэтка 3см. Всё поместится! Но статуэтка 8см — задняя часть не запишется.',
      uz: 'He-Ne (λ=633nm, Δλ=0.01nm): Lc=40mm. Sizning ob\'yektingiz — 3 sm haykaltaracha. Hammasi sig\'adi! Lekin 8 sm haykaltaracha — orqa qism yozilmaydi.'
    }
  },
  {
    formula: 'α = arcsin(λ/d)',
    color: '#FFB300',
    name: { ru: 'Угол дифракции 1-го порядка', uz: '1-chi tartib difraksiya burchagi' },
    when: {
      ru: 'При восстановлении голограммы — чтобы знать под каким углом наблюдать 3D-изображение. Также при расчёте позиции наблюдателя.',
      uz: 'Gologrammani tiklaganda — 3D tasvirni qaysi burchakda kuzatishni bilish uchun. Shuningdek kuzatuvchi pozitsiyasini hisoblashda.'
    },
    why: {
      ru: 'Даёт угол, под которым восстановленная волна выходит из голограммы. Под этим углом стоит наблюдатель или камера.',
      uz: 'Tiklangan to\'lqin gologrammadan chiqadigan burchakni beradi. Kuzatuvchi yoki kamera shu burchakda turadi.'
    },
    example: {
      ru: 'λ=633нм, d=1223нм → α=31.2°. Значит наблюдатель должен смотреть под углом 31° от нормали к плёнке.',
      uz: 'λ=633nm, d=1223nm → α=31.2°. Demak kuzatuvchi plyonka normaliga 31° burchak ostida qarashi kerak.'
    }
  },
  {
    formula: 'I = Aᵣ² + A₀² + 2AᵣA₀cos(φ)',
    color: '#FF6E40',
    name: { ru: 'Интенсивность на плёнке', uz: 'Plyonkadagi intensivlik' },
    when: {
      ru: 'При расчёте экспозиции и при анализе контраста голограммы. Важно при настройке соотношения интенсивностей опорного и объектного лучей.',
      uz: 'Ekspozitsiyani hisoblashda va gologramma kontrastini tahlil qilishda. Tayanch va ob\'ekt nurlarining intensivlik nisbatini sozlashda muhim.'
    },
    why: {
      ru: 'Член 2AᵣA₀cos(φ) — это сама голограмма. Чем больше соотношение Aᵣ/A₀ ближе к 1:1 — тем выше контраст полос и ярче изображение при восстановлении. Оптимум: Aᵣ:A₀ = 1:1 до 3:1.',
      uz: '2AᵣA₀cos(φ) haddi — bu gologrammaning o\'zi. Aᵣ/A₀ nisbati 1:1 ga qanchalik yaqin bo\'lsa — chiziqlar kontrastlari va tiklanishdagi tasvir shunchalik yorqin. Optimal: Aᵣ:A₀ = 1:1 dan 3:1 gacha.'
    },
    example: {
      ru: 'Если Aᵣ = A₀ = 1: I = 1 + 1 + 2cos(φ) → меняется от 0 до 4. Контраст = 100%. Если Aᵣ = 3, A₀ = 1: I от 4 до 16. Контраст = (16-4)/(16+4) = 60%.',
      uz: 'Agar Aᵣ = A₀ = 1: I = 1 + 1 + 2cos(φ) → 0 dan 4 gacha o\'zgaradi. Kontrast = 100%. Agar Aᵣ = 3, A₀ = 1: I 4 dan 16 gacha. Kontrast = 60%.'
    }
  },
  {
    formula: 'T(x,y) = T₀ + β·I(x,y)',
    color: '#E040FB',
    name: { ru: 'Пропускающая функция плёнки', uz: 'Plyonkaning o\'tkazuvchanlik funksiyasi' },
    when: {
      ru: 'При теоретическом анализе голограммы после обработки. Описывает готовую голограмму как оптический элемент.',
      uz: 'Ishlovdan keyin gologrammaning nazariy tahlilida. Tayyor gologrammani optik element sifatida tavsiflaydi.'
    },
    why: {
      ru: 'T₀ — фоновое пропускание, β — чувствительность эмульсии к экспозиции. Когда опорный луч проходит через T(x,y), произведение T·Eᵣ раскрывается в 4 члена — один из них и есть восстановленная объектная волна.',
      uz: 'T₀ — fon o\'tkazuvchanligi, β — emulsiyaning ekspozitsiyaga sezgirligi. Tayanch nuri T(x,y) orqali o\'tganda, T·Eᵣ ko\'paytmasi 4 hadga yoyiladi — ulardan biri tiklangan ob\'ekt to\'lqinidir.'
    },
    example: {
      ru: 'T·Eᵣ = T₀Eᵣ + βAᵣ²Eᵣ + β·Aᵣ·A₀·exp(iφ) + β·Aᵣ·A₀·exp(-iφ). Третий член — 3D изображение, четвёртый — сопряжённое (псевдоскопическое).',
      uz: 'T·Eᵣ = T₀Eᵣ + βAᵣ²Eᵣ + β·Aᵣ·A₀·exp(iφ) + β·Aᵣ·A₀·exp(-iφ). Uchinchi had — 3D tasvir, to\'rtinchi — bog\'liq (psevdoskopik).'
    }
  },
] as const;

const FORMULAS = [
  { label: "Опорный луч:", formula: "Eᵣ = Aᵣ · exp(i·k·r)" },
  { label: "Объектный луч:", formula: "E₀ = A₀ · exp(i·k·r + i·φ(x,y))" },
  { label: "Интенсивность:", formula: "I = |Eᵣ + E₀|² = Aᵣ² + A₀² + 2·Aᵣ·A₀·cos(φ)" },
  { label: "Период полос:", formula: "d = λ / (2·sin(θ/2))" },
  { label: "Разрешение:", formula: "N = 10⁶ / d  [линий/мм]" },
  { label: "Длина когерентности:", formula: "Lc = λ² / Δλ" },
  { label: "Угол дифракции:", formula: "α = arcsin(λ/d)" },
  { label: "Пропускание:", formula: "T(x,y) = T₀ + β·I(x,y)" },
];

function toRad(deg: number) { return deg * Math.PI / 180; }
function toDeg(rad: number) { return rad * 180 / Math.PI; }

export default function MathTab() {
  const { lang } = useLang();
  const [lambda, setLambda] = useState(632.8);
  const [theta, setTheta] = useState(30);
  const [deltaLambda, setDeltaLambda] = useState(0.01);

  const calc = useMemo(() => {
    const thetaHalf = theta / 2;
    const sinHalf = Math.sin(toRad(thetaHalf));
    const d_nm = lambda / (2 * sinHalf);
    const d_um = d_nm / 1000;
    const N = 1e6 / d_nm;
    const Lc_nm = (lambda * lambda) / deltaLambda;
    const Lc_mm = Lc_nm / 1e6;
    const Lc_cm = Lc_mm / 10;
    const sinAlpha = lambda / d_nm;
    const alpha_deg = sinAlpha <= 1 ? toDeg(Math.asin(sinAlpha)) : NaN;
    return { thetaHalf, sinHalf, d_nm, d_um, N, Lc_nm, Lc_mm, Lc_cm, alpha_deg, sinAlpha };
  }, [lambda, theta, deltaLambda]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as Window & { __HOLOGRAM_DATA__?: object }).__HOLOGRAM_DATA__ = {
        input: {
          lambda,
          theta,
          deltaLambda,
        },
        results: {
          d_nm: calc.d_nm,
          d_um: calc.d_um,
          N: calc.N,
          Lc_mm: calc.Lc_mm,
          Lc_cm: calc.Lc_cm,
          alpha_deg: calc.alpha_deg,
        },
        steps: [
          `d = ${lambda.toFixed(1)} / (2·sin(${calc.thetaHalf.toFixed(1)}°)) = ${calc.d_nm.toFixed(2)} нм`,
          `N = 10⁶ / ${calc.d_nm.toFixed(2)} = ${calc.N.toFixed(1)} лин/мм`,
          `Lc = ${lambda.toFixed(1)}² / ${deltaLambda.toFixed(3)} = ${calc.Lc_mm.toFixed(2)} мм`,
          `α = arcsin(${calc.sinAlpha.toFixed(4)}) = ${isNaN(calc.alpha_deg) ? 'N/A' : calc.alpha_deg.toFixed(2) + '°'}`,
        ],
      };
    }
  }, [lambda, theta, deltaLambda, calc]);

  const nStatus = calc.N > 5000
    ? { text: t.filmSpec[lang], color: "#FF9800" }
    : { text: t.filmOk[lang], color: "#69F0AE" };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--accent-cyan)' }}>
          {t.mathTitle[lang]}
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          {t.mathSubtitle[lang]}
        </p>
      </div>

      <ExtensionDownload />

      {/* Block A — Formulas */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-bold text-base mb-4" style={{ color: 'var(--accent-amber)' }}>
          {t.blockATitle[lang]}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FORMULAS.map((f, i) => (
            <div key={i} className="formula-box">
              <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{f.label}</div>
              <div className="text-sm font-mono" style={{ color: 'var(--accent-cyan)' }}>{f.formula}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Block B — Interactive Calculator */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-bold text-base mb-4" style={{ color: 'var(--accent-amber)' }}>
          {t.blockBTitle[lang]}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Lambda slider */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              {t.lambdaLabel[lang]}: <span style={{ color: 'var(--accent-cyan)' }}>{lambda.toFixed(1)} {t.nmUnit[lang]}</span>
            </label>
            <input
              type="range"
              min={380} max={780} step={0.1}
              value={lambda}
              onChange={e => setLambda(parseFloat(e.target.value))}
              className="w-full mb-2"
              style={{ accentColor: '#00E5FF' }}
            />
            <input
              type="number"
              min={380} max={780} step={0.1}
              value={lambda}
              onChange={e => setLambda(parseFloat(e.target.value) || 632.8)}
              className="w-full px-3 py-1.5 rounded text-sm"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Theta slider */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              {t.thetaLabel[lang]}: <span style={{ color: 'var(--accent-cyan)' }}>{theta}°</span>
            </label>
            <input
              type="range"
              min={1} max={90} step={1}
              value={theta}
              onChange={e => setTheta(parseFloat(e.target.value))}
              className="w-full mb-2"
              style={{ accentColor: '#00E5FF' }}
            />
            <input
              type="number"
              min={1} max={90} step={1}
              value={theta}
              onChange={e => setTheta(parseFloat(e.target.value) || 30)}
              className="w-full px-3 py-1.5 rounded text-sm"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* DeltaLambda slider */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              {t.deltaLabel[lang]}: <span style={{ color: 'var(--accent-cyan)' }}>{deltaLambda.toFixed(3)} {t.nmUnit[lang]}</span>
            </label>
            <input
              type="range"
              min={0.001} max={1} step={0.001}
              value={deltaLambda}
              onChange={e => setDeltaLambda(parseFloat(e.target.value))}
              className="w-full mb-2"
              style={{ accentColor: '#00E5FF' }}
            />
            <input
              type="number"
              min={0.001} max={1} step={0.001}
              value={deltaLambda}
              onChange={e => setDeltaLambda(parseFloat(e.target.value) || 0.01)}
              className="w-full px-3 py-1.5 rounded text-sm"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid #00E5FF33' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.resultD[lang]}</div>
            <div className="text-lg font-bold font-mono" style={{ color: '#00E5FF' }}>{calc.d_nm.toFixed(1)} {t.nmUnit[lang]}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{calc.d_um.toFixed(3)} мкм</div>
          </div>
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid #9C27B033' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.resultN[lang]}</div>
            <div className="text-lg font-bold font-mono" style={{ color: '#9C27B0' }}>{calc.N.toFixed(0)}</div>
            <div className="text-xs mt-1" style={{ color: nStatus.color }}>{nStatus.text}</div>
          </div>
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid #69F0AE33' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.resultLc[lang]}</div>
            <div className="text-lg font-bold font-mono" style={{ color: '#69F0AE' }}>{calc.Lc_mm.toFixed(2)} {t.mmUnit[lang]}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{calc.Lc_cm.toFixed(3)} {t.cmUnit[lang]} — {t.maxDepth[lang]}</div>
          </div>
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid #FFB30033' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.resultAlpha[lang]}</div>
            <div className="text-lg font-bold font-mono" style={{ color: '#FFB300' }}>
              {isNaN(calc.alpha_deg) ? "N/A" : `${calc.alpha_deg.toFixed(2)}°`}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{t.firstOrder[lang]}</div>
          </div>
        </div>
      </div>

      {/* Block C — Step-by-step */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-bold text-base mb-4" style={{ color: 'var(--accent-amber)' }}>
          {t.blockCTitle[lang]}
        </h3>
        <div className="space-y-3 font-mono text-sm">
          <div className="formula-box">
            <span style={{ color: 'var(--text-secondary)' }}>{t.stepWord[lang]} 1: </span>
            <span style={{ color: '#E8EAF6' }}>d = λ/(2·sin(θ/2)) = </span>
            <span style={{ color: '#00E5FF' }}>{lambda.toFixed(1)}</span>
            <span style={{ color: '#E8EAF6' }}> / (2·sin(</span>
            <span style={{ color: '#00E5FF' }}>{calc.thetaHalf.toFixed(1)}°</span>
            <span style={{ color: '#E8EAF6' }}>) = </span>
            <span style={{ color: '#00E5FF' }}>{lambda.toFixed(1)}</span>
            <span style={{ color: '#E8EAF6' }}> / (2·</span>
            <span style={{ color: '#00E5FF' }}>{calc.sinHalf.toFixed(4)}</span>
            <span style={{ color: '#E8EAF6' }}>) = </span>
            <span style={{ color: '#00E5FF' }}>{lambda.toFixed(1)}</span>
            <span style={{ color: '#E8EAF6' }}> / </span>
            <span style={{ color: '#00E5FF' }}>{(2 * calc.sinHalf).toFixed(4)}</span>
            <span style={{ color: '#E8EAF6' }}> = </span>
            <span style={{ color: '#69F0AE', fontWeight: 'bold' }}>{calc.d_nm.toFixed(2)} {t.nmUnit[lang]}</span>
          </div>

          <div className="formula-box">
            <span style={{ color: 'var(--text-secondary)' }}>{t.stepWord[lang]} 2: </span>
            <span style={{ color: '#E8EAF6' }}>N = 10⁶ / d = 10⁶ / </span>
            <span style={{ color: '#00E5FF' }}>{calc.d_nm.toFixed(2)}</span>
            <span style={{ color: '#E8EAF6' }}> = </span>
            <span style={{ color: '#69F0AE', fontWeight: 'bold' }}>{calc.N.toFixed(1)} {t.linesPerMm[lang]}</span>
          </div>

          <div className="formula-box">
            <span style={{ color: 'var(--text-secondary)' }}>{t.stepWord[lang]} 3: </span>
            <span style={{ color: '#E8EAF6' }}>Lc = λ²/Δλ = </span>
            <span style={{ color: '#00E5FF' }}>{lambda.toFixed(1)}²</span>
            <span style={{ color: '#E8EAF6' }}> / </span>
            <span style={{ color: '#00E5FF' }}>{deltaLambda.toFixed(3)}</span>
            <span style={{ color: '#E8EAF6' }}> = </span>
            <span style={{ color: '#00E5FF' }}>{(lambda * lambda).toFixed(1)}</span>
            <span style={{ color: '#E8EAF6' }}> / </span>
            <span style={{ color: '#00E5FF' }}>{deltaLambda.toFixed(3)}</span>
            <span style={{ color: '#E8EAF6' }}> = </span>
            <span style={{ color: '#69F0AE', fontWeight: 'bold' }}>{calc.Lc_nm.toFixed(0)} {t.nmUnit[lang]} = {calc.Lc_mm.toFixed(2)} {t.mmUnit[lang]}</span>
          </div>

          <div className="formula-box">
            <span style={{ color: 'var(--text-secondary)' }}>{t.stepWord[lang]} 4: </span>
            <span style={{ color: '#E8EAF6' }}>α = arcsin(λ/d) = arcsin(</span>
            <span style={{ color: '#00E5FF' }}>{calc.sinAlpha.toFixed(4)}</span>
            <span style={{ color: '#E8EAF6' }}>) = </span>
            <span style={{ color: '#69F0AE', fontWeight: 'bold' }}>
              {isNaN(calc.alpha_deg) ? t.undefined_[lang] : `${calc.alpha_deg.toFixed(2)}°`}
            </span>
          </div>
        </div>
      </div>

      {/* Block D — When and where to use each formula */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-bold text-base mb-4" style={{ color: 'var(--accent-amber)' }}>
          {lang === 'ru' ? 'D. Где и когда использовать каждую формулу' : 'D. Har bir formulani qayerda va qachon ishlatish kerak'}
        </h3>
        <div className="space-y-3">
          {FORMULA_GUIDE.map((item, i) => (
            <div key={i} className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: `1px solid ${item.color}33` }}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: item.color + '22', color: item.color }}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <code className="text-sm px-2 py-0.5 rounded" style={{ background: '#0D1526', color: item.color, fontFamily: 'monospace' }}>
                      {item.formula}
                    </code>
                    <span className="text-xs font-semibold" style={{ color: item.color }}>{item.name[lang]}</span>
                  </div>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-semibold" style={{ color: '#E8EAF6' }}>{lang === 'ru' ? 'Когда:' : 'Qachon:'}</span>{' '}
                    {item.when[lang]}
                  </div>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-semibold" style={{ color: '#E8EAF6' }}>{lang === 'ru' ? 'Зачем:' : 'Nima uchun:'}</span>{' '}
                    {item.why[lang]}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-semibold" style={{ color: '#E8EAF6' }}>{lang === 'ru' ? 'Типичный результат:' : 'Odatiy natija:'}</span>{' '}
                    {item.example[lang]}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
