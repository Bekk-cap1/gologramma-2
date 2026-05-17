"use client";

import { useState, useMemo, useEffect } from "react";
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";
import ExtensionDownload from "@/components/ExtensionDownload";

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
    </div>
  );
}
