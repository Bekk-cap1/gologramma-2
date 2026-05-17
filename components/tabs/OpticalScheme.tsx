"use client";

import { useState, useEffect, useRef } from "react";
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";

type Lang = "ru" | "uz";

interface Component {
  id: string;
  labelKey: keyof typeof t;
  descKey: keyof typeof t;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

const components: Component[] = [
  { id: "laser",    labelKey: "compLaser",    descKey: "descLaser",    x: 20,  y: 155, w: 60, h: 30, color: "#FF5252" },
  { id: "splitter", labelKey: "compSplitter", descKey: "descSplitter", x: 135, y: 148, w: 44, h: 44, color: "#00E5FF" },
  { id: "mirror1",  labelKey: "compMirror1",  descKey: "descMirror1",  x: 215, y: 70,  w: 40, h: 14, color: "#90A4AE" },
  { id: "lens1",    labelKey: "compLens1",    descKey: "descLens1",    x: 320, y: 62,  w: 14, h: 30, color: "#69F0AE" },
  { id: "mirror2",  labelKey: "compMirror2",  descKey: "descMirror2",  x: 215, y: 256, w: 40, h: 14, color: "#90A4AE" },
  { id: "lens2",    labelKey: "compLens2",    descKey: "descLens2",    x: 320, y: 248, w: 14, h: 30, color: "#69F0AE" },
  { id: "object",   labelKey: "compObject",   descKey: "descObject",   x: 430, y: 236, w: 40, h: 50, color: "#FFB300" },
  { id: "film",     labelKey: "compFilm",     descKey: "descFilm",     x: 570, y: 120, w: 14, h: 100, color: "#9C27B0" },
];

export default function OpticalScheme() {
  const { lang } = useLang();
  const [hovered, setHovered] = useState<string | null>(null);
  const [animOffset, setAnimOffset] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let start: number | null = null;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      setAnimOffset((elapsed / 8) % 200);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const hoveredComp = components.find((c) => c.id === hovered);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--accent-cyan)' }}>
          {t.schemeTitle[lang]}
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          {t.schemeSubtitle[lang]}
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 rounded" style={{ background: '#00E5FF' }}></div>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.refBeam[lang]}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 rounded" style={{ background: '#9C27B0' }}></div>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.objBeam[lang]}</span>
        </div>
        <div className="flex items-center gap-2 ml-auto text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t.angleBetween[lang]}
        </div>
      </div>

      <div
        className="rounded-xl overflow-hidden relative"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
      >
        <svg
          viewBox="0 0 650 340"
          className="w-full"
          style={{ display: 'block' }}
        >
          {/* Background grid */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1E3A5F" strokeWidth="0.5" opacity="0.4" />
            </pattern>
            <marker id="arrowCyan" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#00E5FF" />
            </marker>
            <marker id="arrowViolet" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#9C27B0" />
            </marker>
          </defs>
          <rect width="650" height="340" fill="url(#grid)" />

          {/* Optical table surface */}
          <rect x="10" y="300" width="630" height="30" rx="4" fill="#0D1526" stroke="#1E3A5F" strokeWidth="1" />
          <text x="325" y="319" textAnchor="middle" fill="#1E3A5F" fontSize="11" fontFamily="monospace">
            {t.vibTable[lang]}
          </text>

          {/* Reference beam path */}
          <polyline
            points="80,170 157,170 157,100 235,77 334,77 577,170"
            fill="none"
            stroke="#00E5FF"
            strokeWidth="2"
            strokeDasharray="6 3"
            opacity="0.6"
          />

          {/* Object beam path */}
          <polyline
            points="157,170 157,263 235,263 334,263 450,263 577,200"
            fill="none"
            stroke="#9C27B0"
            strokeWidth="2"
            strokeDasharray="6 3"
            opacity="0.6"
          />

          {/* Animated dots on reference path */}
          {[0, 60, 120].map((offset, i) => {
            const tVal = ((animOffset + offset) % 200) / 200;
            const pts = [[80,170],[157,170],[157,100],[235,77],[334,77],[577,170]];
            const totalSegs = pts.length - 1;
            const segLen = 1 / totalSegs;
            const segIdx = Math.min(Math.floor(tVal / segLen), totalSegs - 1);
            const segT = (tVal - segIdx * segLen) / segLen;
            const x = pts[segIdx][0] + (pts[segIdx+1][0] - pts[segIdx][0]) * segT;
            const y = pts[segIdx][1] + (pts[segIdx+1][1] - pts[segIdx][1]) * segT;
            return (
              <circle key={`ref-dot-${i}`} cx={x} cy={y} r="4" fill="#00E5FF" opacity="0.9">
                <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1s" repeatCount="indefinite" />
              </circle>
            );
          })}

          {/* Animated dots on object path */}
          {[0, 60, 120].map((offset, i) => {
            const tVal = ((animOffset + offset + 30) % 200) / 200;
            const pts = [[157,170],[157,263],[235,263],[334,263],[450,263],[577,200]];
            const totalSegs = pts.length - 1;
            const segLen = 1 / totalSegs;
            const segIdx = Math.min(Math.floor(tVal / segLen), totalSegs - 1);
            const segT = (tVal - segIdx * segLen) / segLen;
            const x = pts[segIdx][0] + (pts[segIdx+1][0] - pts[segIdx][0]) * segT;
            const y = pts[segIdx][1] + (pts[segIdx+1][1] - pts[segIdx][1]) * segT;
            return (
              <circle key={`obj-dot-${i}`} cx={x} cy={y} r="4" fill="#9C27B0" opacity="0.9">
                <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.2s" repeatCount="indefinite" />
              </circle>
            );
          })}

          {/* Scattering from object */}
          {[0,1,2,3,4].map((i) => {
            const angle = -60 + i * 30;
            const rad = (angle * Math.PI) / 180;
            const x2 = 470 + Math.cos(rad) * 90;
            const y2 = 263 + Math.sin(rad) * 70;
            return (
              <line
                key={`scatter-${i}`}
                x1="470" y1="263"
                x2={x2} y2={y2}
                stroke="#9C27B0"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.4"
              />
            );
          })}

          {/* Angle θ arc at film */}
          <path
            d="M 557,170 A 20,20 0 0,1 563,200"
            fill="none"
            stroke="#FFB300"
            strokeWidth="1.5"
          />
          <text x="536" y="192" fill="#FFB300" fontSize="12" fontFamily="serif" fontStyle="italic">θ</text>

          {/* Components */}
          {components.map((comp) => (
            <g
              key={comp.id}
              onMouseEnter={() => setHovered(comp.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={comp.x}
                y={comp.y}
                width={comp.w}
                height={comp.h}
                rx="4"
                fill={hovered === comp.id ? `${comp.color}44` : `${comp.color}22`}
                stroke={hovered === comp.id ? comp.color : `${comp.color}88`}
                strokeWidth={hovered === comp.id ? 2 : 1.5}
              />
              <text
                x={comp.x + comp.w / 2}
                y={comp.y + comp.h + 14}
                textAnchor="middle"
                fill={hovered === comp.id ? comp.color : '#90A4AE'}
                fontSize="10"
                fontFamily="system-ui"
              >
                {t[comp.labelKey as keyof typeof t][lang as Lang]}
              </text>
            </g>
          ))}

          {/* Beam splitter diagonal line */}
          <line x1="135" y1="148" x2="179" y2="192" stroke="#00E5FF" strokeWidth="1.5" opacity="0.7" />

          {/* Mirror diagonals */}
          <line x1="215" y1="77" x2="255" y2="70" stroke="#90A4AE" strokeWidth="1.5" opacity="0.8" />
          <line x1="215" y1="263" x2="255" y2="270" stroke="#90A4AE" strokeWidth="1.5" opacity="0.8" />
        </svg>
      </div>

      {/* Tooltip / info panel */}
      <div
        className="mt-4 rounded-xl p-4 min-h-[80px] transition-all"
        style={{
          background: 'var(--bg-secondary)',
          border: `1px solid ${hoveredComp ? hoveredComp.color : 'var(--border-color)'}`,
        }}
      >
        {hoveredComp ? (
          <div>
            <h3 className="font-bold text-base mb-1" style={{ color: hoveredComp.color }}>
              {t[hoveredComp.labelKey as keyof typeof t][lang as Lang]}
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t[hoveredComp.descKey as keyof typeof t][lang as Lang]}
            </p>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t.schemeHover[lang]}
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--bg-card)', border: '1px solid #00E5FF33' }}
        >
          <div className="text-sm font-semibold mb-1" style={{ color: '#00E5FF' }}>{t.refBeamFull[lang]}</div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
            {t.refBeamDesc[lang]}
          </p>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--bg-card)', border: '1px solid #9C27B033' }}
        >
          <div className="text-sm font-semibold mb-1" style={{ color: '#9C27B0' }}>{t.objBeamFull[lang]}</div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
            {t.objBeamDesc[lang]}
          </p>
        </div>
      </div>

      {/* Additional notes */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl p-3" style={{ background: '#00E5FF0D', border: '1px solid #00E5FF22' }}>
          <p className="text-xs font-mono" style={{ color: '#00E5FF' }}>{t.schemeNote1[lang]}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: '#FFB3000D', border: '1px solid #FFB30022' }}>
          <p className="text-xs font-mono" style={{ color: '#FFB300' }}>{t.schemeNote2[lang]}</p>
        </div>
      </div>
    </div>
  );
}
