"use client";

import { useState } from "react";
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";

type PieceSize = "full" | "half" | "quarter" | "piece";

export default function HologramPiece() {
  const { lang } = useLang();
  const [selected, setSelected] = useState<PieceSize>("full");

  const PIECE_OPTIONS: { id: PieceSize; labelKey: keyof typeof t; fraction: number; angle: number; descKey: keyof typeof t }[] = [
    { id: "full",    labelKey: "pieceFull2",    fraction: 1,    angle: 40, descKey: "pieceDescFull" },
    { id: "half",    labelKey: "pieceHalf",    fraction: 0.5,  angle: 20, descKey: "pieceDescHalf" },
    { id: "quarter", labelKey: "pieceQuarter", fraction: 0.25, angle: 10, descKey: "pieceDescQuarter" },
    { id: "piece",   labelKey: "piecePiece",   fraction: 0.1,  angle: 5,  descKey: "pieceDescPiece" },
  ];

  const current = PIECE_OPTIONS.find((o) => o.id === selected)!;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--accent-cyan)' }}>
          {t.pieceTitle[lang]}
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          {t.pieceSubtitle[lang]}
        </p>
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        {PIECE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setSelected(opt.id)}
            className="px-5 py-2.5 rounded-lg font-medium text-sm transition-all"
            style={{
              background: selected === opt.id ? '#00E5FF22' : 'var(--bg-card)',
              border: `1px solid ${selected === opt.id ? '#00E5FF' : 'var(--border-color)'}`,
              color: selected === opt.id ? '#00E5FF' : 'var(--text-secondary)',
            }}
          >
            {t[opt.labelKey][lang]}
          </button>
        ))}
      </div>

      {/* Main visual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Film SVG */}
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
        >
          <div className="text-sm mb-3 font-medium" style={{ color: 'var(--text-secondary)' }}>
            {t.pieceFilm[lang]}
          </div>
          <svg viewBox="0 0 260 200" className="w-full">
            {/* Full film border */}
            <rect x="20" y="10" width="100" height="180" rx="4"
              fill="#0D1526" stroke="#1E3A5F" strokeWidth="1.5" />

            {/* Interference fringes */}
            {Array.from({ length: 24 }).map((_, i) => {
              const fy = 14 + i * 7.5;
              const alpha = Math.abs(Math.sin(i * 0.8));
              return (
                <rect key={i} x="22" y={fy} width="96" height="5"
                  fill={`rgba(0,229,255,${0.05 + alpha * 0.35})`} />
              );
            })}

            {/* Highlighted portion */}
            <rect
              x="20"
              y={10 + 180 * (1 - current.fraction) / 2}
              width="100"
              height={180 * current.fraction}
              rx="3"
              fill="rgba(0,229,255,0.18)"
              stroke="#00E5FF"
              strokeWidth="2"
            />

            {/* Label */}
            <text x="70" y="205" textAnchor="middle" fill="#90A4AE" fontSize="11">
              {t[current.labelKey][lang]}
            </text>

            {/* Dimension brace */}
            <line x1="126" y1={10 + 180 * (1 - current.fraction) / 2}
              x2="134" y2={10 + 180 * (1 - current.fraction) / 2}
              stroke="#00E5FF" strokeWidth="1.5" />
            <line x1="130" y1={10 + 180 * (1 - current.fraction) / 2}
              x2="130" y2={10 + 180 * (1 + current.fraction) / 2}
              stroke="#00E5FF" strokeWidth="1.5" strokeDasharray="3 2" />
            <line x1="126" y1={10 + 180 * (1 + current.fraction) / 2}
              x2="134" y2={10 + 180 * (1 + current.fraction) / 2}
              stroke="#00E5FF" strokeWidth="1.5" />

            {/* FOV fan */}
            <g>
              {(() => {
                const originX = 120;
                const originY = 100;
                const halfAngleDeg = current.angle / 2;
                const halfRad = (halfAngleDeg * Math.PI) / 180;
                const fanLen = 110;
                const topX = originX + fanLen * Math.cos(-halfRad);
                const topY = originY + fanLen * Math.sin(-halfRad);
                const botX = originX + fanLen * Math.cos(halfRad);
                const botY = originY + fanLen * Math.sin(halfRad);
                return (
                  <>
                    <line x1={originX} y1={originY} x2={topX} y2={topY}
                      stroke="#00E5FF" strokeWidth="1.5" opacity="0.7" />
                    <line x1={originX} y1={originY} x2={botX} y2={botY}
                      stroke="#00E5FF" strokeWidth="1.5" opacity="0.7" />
                    <path
                      d={`M ${topX} ${topY} A ${fanLen} ${fanLen} 0 0 1 ${botX} ${botY}`}
                      fill="rgba(0,229,255,0.07)"
                      stroke="#00E5FF"
                      strokeWidth="1"
                      strokeDasharray="4 3"
                    />
                    <text
                      x={originX + fanLen * 0.6}
                      y={originY + 5}
                      textAnchor="middle"
                      fill="#00E5FF"
                      fontSize="11"
                      fontWeight="bold"
                    >
                      {current.angle}°
                    </text>
                  </>
                );
              })()}
            </g>

            {/* Eye icon */}
            <g transform="translate(220, 90)">
              <ellipse cx="0" cy="0" rx="14" ry="9" fill="#0D1526" stroke="#00E5FF" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="5" fill="#00E5FF" opacity="0.7" />
              <circle cx="2" cy="-2" r="1.5" fill="#fff" opacity="0.7" />
            </g>
            <text x="220" y="110" textAnchor="middle" fill="#90A4AE" fontSize="10">{t.pieceObserver[lang]}</text>
          </svg>
        </div>

        {/* Result description */}
        <div
          className="rounded-xl p-5 flex flex-col justify-between"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
        >
          <div>
            <div className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>{t.pieceViewResult[lang]}</div>
            <h3 className="text-xl font-bold mb-3" style={{ color: '#00E5FF' }}>{t[current.labelKey][lang]}</h3>
            <div
              className="rounded-lg p-4 mb-4"
              style={{ background: '#00E5FF0D', border: '1px solid #00E5FF33' }}
            >
              <div className="text-lg font-bold" style={{ color: '#69F0AE' }}>
                {t.pieceFullImg[lang]}
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t[current.descKey][lang]}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.pieceViewAngle[lang]}</div>
                <div className="text-2xl font-bold font-mono" style={{ color: '#FFB300' }}>{current.angle}°</div>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.pieceInfo[lang]}</div>
                <div className="text-2xl font-bold font-mono" style={{ color: '#69F0AE' }}>100%</div>
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t.pieceNarrows[lang]} <strong style={{ color: '#FF9800' }}>{t.pieceNoLoss[lang]}</strong>{t.pieceNarrowsEnd[lang]}
          </div>
        </div>
      </div>

      {/* Comparison: photo vs hologram */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--bg-card)', border: '1px solid #FF525233' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">📷</span>
            <span className="font-bold" style={{ color: '#FF5252' }}>{t.photoComp[lang]}</span>
          </div>
          <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div>{t.piece1pix[lang]}</div>
            <div>{t.pieceLocalRec[lang]}</div>
            <div className="flex items-center gap-2">
              <span style={{ color: '#FF5252' }}>✗</span>
              <span>{t.piecePhotoLoss[lang]}</span>
            </div>
          </div>
        </div>
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--bg-card)', border: '1px solid #00E5FF33' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🌀</span>
            <span className="font-bold" style={{ color: '#00E5FF' }}>{t.holoComp[lang]}</span>
          </div>
          <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div>{t.pieceAllPts[lang]}</div>
            <div>{t.pieceDistRec[lang]}</div>
            <div className="flex items-center gap-2">
              <span style={{ color: '#69F0AE' }}>✓</span>
              <span>{t.pieceHoloKeep[lang]}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Window analogy */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl">🪟</span>
          <div>
            <div className="font-bold mb-1" style={{ color: 'var(--accent-amber)' }}>
              {t.windowAnal[lang]}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {t.windowDesc[lang]}
            </p>
          </div>
        </div>
      </div>

      {/* Math note */}
      <div
        className="mt-4 rounded-xl p-4"
        style={{ background: '#9C27B00D', border: '1px solid #9C27B033' }}
      >
        <div className="text-sm font-mono" style={{ color: '#9C27B0' }}>
          {t.mathNote[lang]}
        </div>
      </div>
    </div>
  );
}
