"use client";

import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";

type LangKey = "ru" | "uz";

const TABLE_ROWS: Array<{
  paramKey: keyof typeof t;
  transKey: keyof typeof t;
  reflKey: keyof typeof t;
}> = [
  { paramKey: "cp1", transKey: "cp1t", reflKey: "cp1r" },
  { paramKey: "cp2", transKey: "cp2t", reflKey: "cp2r" },
  { paramKey: "cp3", transKey: "cp3t", reflKey: "cp3r" },
  { paramKey: "cp4", transKey: "cp4t", reflKey: "cp4r" },
  { paramKey: "cp5", transKey: "cp5t", reflKey: "cp5r" },
  { paramKey: "cp6", transKey: "cp6t", reflKey: "cp6r" },
  { paramKey: "cp7", transKey: "cp7t", reflKey: "cp7r" },
  { paramKey: "cp8", transKey: "cp8t", reflKey: "cp8r" },
];

export default function Comparison() {
  const { lang } = useLang();
  const l = lang as LangKey;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--accent-cyan)' }}>
          {t.compTitle[l]}
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          {t.compSubtitle[l]}
        </p>
      </div>

      {/* SVG Diagrams */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        {/* Transmission diagram */}
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid #00E5FF44' }}
        >
          <h3 className="font-bold mb-3 text-center" style={{ color: '#00E5FF' }}>
            {t.compTransTitle[l]}
          </h3>
          <svg viewBox="0 0 280 160" className="w-full">
            <defs>
              <marker id="arrowT" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#00E5FF" />
              </marker>
              <marker id="arrowTr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#69F0AE" />
              </marker>
            </defs>

            {/* Laser (left) */}
            <rect x="5" y="68" width="45" height="24" rx="4"
              fill="#FF525222" stroke="#FF5252" strokeWidth="1.5" />
            <text x="27" y="83" textAnchor="middle" fill="#FF5252" fontSize="9" fontFamily="monospace">{t.svgLaser[l]}</text>

            {/* Arrow: laser -> film */}
            <line x1="50" y1="80" x2="118" y2="80"
              stroke="#00E5FF" strokeWidth="2" markerEnd="url(#arrowT)" />
            <text x="84" y="73" textAnchor="middle" fill="#00E5FF" fontSize="9">{t.svgRef[l]}</text>

            {/* Film (center) */}
            <rect x="125" y="30" width="10" height="100" rx="2"
              fill="#0D1526" stroke="#9C27B0" strokeWidth="2" />
            {Array.from({ length: 10 }).map((_, i) => (
              <rect key={i} x="126" y={34 + i * 9} width="8" height="5"
                fill={`rgba(0,229,255,${0.1 + (i % 2) * 0.3})`} />
            ))}
            <text x="130" y="145" textAnchor="middle" fill="#9C27B0" fontSize="9">{t.svgFilm[l]}</text>

            {/* Arrow: film -> viewer (right) */}
            <line x1="135" y1="80" x2="210" y2="80"
              stroke="#69F0AE" strokeWidth="2" markerEnd="url(#arrowTr)" />
            <text x="172" y="73" textAnchor="middle" fill="#69F0AE" fontSize="9">{t.svgRestored[l]}</text>

            {/* Object arrow (below, from left) */}
            <line x1="50" y1="110" x2="118" y2="100"
              stroke="#9C27B0" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowT)" />
            <text x="75" y="125" textAnchor="middle" fill="#9C27B0" fontSize="9">{t.svgObject[l]}</text>

            {/* Object */}
            <rect x="5" y="95" width="42" height="35" rx="4"
              fill="#FFB30011" stroke="#FFB300" strokeWidth="1.5" />
            <text x="26" y="117" textAnchor="middle" fill="#FFB300" fontSize="9">{t.svgObj[l]}</text>

            {/* Viewer (right) */}
            <g transform="translate(225, 73)">
              <ellipse cx="0" cy="0" rx="12" ry="8" fill="#0D1526" stroke="#69F0AE" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="4" fill="#69F0AE" opacity="0.7" />
            </g>
            <text x="225" y="100" textAnchor="middle" fill="#90A4AE" fontSize="9">{t.svgViewer[l]}</text>

            {/* Direction labels */}
            <text x="5" y="18" fill="#90A4AE" fontSize="9">{t.svgLaserLeft[l]}</text>
            <text x="200" y="18" fill="#90A4AE" fontSize="9">{t.svgViewerRight[l]}</text>
          </svg>
          <p className="text-xs text-center mt-2" style={{ color: 'var(--text-secondary)' }}>
            {t.compTransCaption[l]}
          </p>
        </div>

        {/* Reflection diagram */}
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid #FFB30044' }}
        >
          <h3 className="font-bold mb-3 text-center" style={{ color: '#FFB300' }}>
            {t.compReflTitle[l]}
          </h3>
          <svg viewBox="0 0 280 160" className="w-full">
            <defs>
              <marker id="arrowR" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#FFB300" />
              </marker>
              <marker id="arrowRw" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#fff" />
              </marker>
              <marker id="arrowRg" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#69F0AE" />
              </marker>
            </defs>

            {/* White light source (top-left) */}
            <circle cx="30" cy="22" r="14"
              fill="#FFFFFF11" stroke="#FFFFFF" strokeWidth="1.5" />
            <text x="30" y="26" textAnchor="middle" fill="#fff" fontSize="8">{t.svgLight[l]}</text>

            {/* Arrow: white light -> film */}
            <line x1="44" y1="30" x2="125" y2="55"
              stroke="#fff" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowRw)" />
            <text x="80" y="38" textAnchor="middle" fill="#fff" fontSize="9">{t.svgWhiteLight[l]}</text>

            {/* Film (center) */}
            <rect x="125" y="30" width="10" height="100" rx="2"
              fill="#0D1526" stroke="#FFB300" strokeWidth="2" />
            {Array.from({ length: 10 }).map((_, i) => (
              <rect key={i} x="126" y={34 + i * 9} width="8" height="5"
                fill={`rgba(255,179,0,${0.1 + (i % 2) * 0.3})`} />
            ))}
            <text x="130" y="145" textAnchor="middle" fill="#FFB300" fontSize="9">{t.svgFilm[l]}</text>

            {/* Reflected beam back to viewer (left side) */}
            <line x1="125" y1="65" x2="60" y2="90"
              stroke="#69F0AE" strokeWidth="2" markerEnd="url(#arrowRg)" />
            <text x="83" y="70" textAnchor="middle" fill="#69F0AE" fontSize="9">{t.svgReflect[l]}</text>

            {/* Object (right side, opposite) */}
            <rect x="220" y="60" width="45" height="40" rx="4"
              fill="#9C27B011" stroke="#9C27B0" strokeWidth="1.5" />
            <text x="242" y="84" textAnchor="middle" fill="#9C27B0" fontSize="9">{t.svgObj[l]}</text>
            <line x1="220" y1="80" x2="136" y2="80"
              stroke="#9C27B0" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowR)" />
            <text x="185" y="94" textAnchor="middle" fill="#9C27B0" fontSize="9">{t.svgObject[l]}</text>

            {/* Viewer (left) */}
            <g transform="translate(42, 103)">
              <ellipse cx="0" cy="0" rx="12" ry="8" fill="#0D1526" stroke="#69F0AE" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="4" fill="#69F0AE" opacity="0.7" />
            </g>
            <text x="42" y="125" textAnchor="middle" fill="#90A4AE" fontSize="9">{t.svgViewer[l]}</text>

            {/* Direction labels */}
            <text x="5" y="155" fill="#90A4AE" fontSize="9">{t.svgViewerLight[l]}</text>
            <text x="190" y="155" fill="#90A4AE" fontSize="9">{t.svgObjectRight[l]}</text>
          </svg>
          <p className="text-xs text-center mt-2" style={{ color: 'var(--text-secondary)' }}>
            {t.compReflCaption[l]}
          </p>
        </div>
      </div>

      {/* Comparison Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border-color)' }}
      >
        <div
          className="grid grid-cols-3 px-4 py-3 text-sm font-semibold"
          style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}
        >
          <div style={{ color: 'var(--text-secondary)' }}>{t.paramCol[l]}</div>
          <div className="text-center" style={{ color: '#00E5FF' }}>{t.transCol[l]}</div>
          <div className="text-center" style={{ color: '#FFB300' }}>{t.reflCol[l]}</div>
        </div>
        {TABLE_ROWS.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-3 px-4 py-3 text-sm"
            style={{
              background: i % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-card)',
              borderBottom: i < TABLE_ROWS.length - 1 ? '1px solid var(--border-color)' : 'none',
            }}
          >
            <div style={{ color: 'var(--text-secondary)' }}>{t[row.paramKey][l]}</div>
            <div className="text-center" style={{ color: '#E8EAF6' }}>{t[row.transKey][l]}</div>
            <div className="text-center" style={{ color: '#E8EAF6' }}>{t[row.reflKey][l]}</div>
          </div>
        ))}
      </div>

      {/* Depth score table */}
      {(() => {
        const scoreRows: { labelRu: string; labelUz: string; trans: number; refl: number }[] = [
          { labelRu: 'Простота записи',              labelUz: 'Yozish oddiyligi',           trans: 8,  refl: 5  },
          { labelRu: 'Просмотр без лазера',          labelUz: 'Lazersiz ko\'rish',           trans: 2,  refl: 10 },
          { labelRu: 'Яркость изображения',          labelUz: 'Tasvir yorqinligi',           trans: 9,  refl: 7  },
          { labelRu: 'Пространственное разрешение',  labelUz: 'Fazoviy aniqlik',             trans: 9,  refl: 8  },
          { labelRu: 'Цветопередача',                labelUz: 'Rang ko\'rinishi',            trans: 3,  refl: 8  },
          { labelRu: 'Глубина 3D-эффекта',           labelUz: '3D chuqurlik effekti',       trans: 9,  refl: 8  },
          { labelRu: 'Стоимость оборудования',       labelUz: 'Uskunalar narxi',            trans: 5,  refl: 7  },
          { labelRu: 'Промышленное применение',      labelUz: 'Sanoat qo\'llanilishi',      trans: 3,  refl: 9  },
        ];
        const totalT = scoreRows.reduce((s, r) => s + r.trans, 0);
        const totalR = scoreRows.reduce((s, r) => s + r.refl, 0);
        const max = scoreRows.length * 10;
        return (
          <div className="mt-6 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
            <div className="px-5 py-3" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="font-bold text-sm" style={{ color: 'var(--accent-amber)' }}>
                {l === 'ru' ? 'Количественное сравнение (баллы 1–10)' : 'Miqdoriy taqqoslash (1–10 ball)'}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {l === 'ru' ? 'Больше = лучше по данному критерию' : 'Ko\'proq = ushbu mezon bo\'yicha yaxshiroq'}
              </p>
            </div>
            <div>
              {scoreRows.map((row, i) => {
                const label = l === 'ru' ? row.labelRu : row.labelUz;
                const winner = row.trans > row.refl ? 'trans' : row.refl > row.trans ? 'refl' : 'tie';
                return (
                  <div
                    key={i}
                    className="px-4 py-3"
                    style={{
                      background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)',
                      borderBottom: '1px solid var(--border-color)',
                    }}
                  >
                    <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
                      <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: winner === 'trans' ? '#00E5FF' : '#607D8B' }}>{row.trans}</span>
                        {' / '}
                        <span style={{ color: winner === 'refl' ? '#FFB300' : '#607D8B' }}>{row.refl}</span>
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-16 shrink-0" style={{ color: '#00E5FF88' }}>Trans</span>
                        <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${row.trans * 10}%`, background: winner === 'trans' ? '#00E5FF' : '#00E5FF55' }}
                          />
                        </div>
                        <span className="text-xs w-4 text-right font-mono" style={{ color: '#00E5FF' }}>{row.trans}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-16 shrink-0" style={{ color: '#FFB30088' }}>Refl</span>
                        <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${row.refl * 10}%`, background: winner === 'refl' ? '#FFB300' : '#FFB30055' }}
                          />
                        </div>
                        <span className="text-xs w-4 text-right font-mono" style={{ color: '#FFB300' }}>{row.refl}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Total row */}
              <div className="px-4 py-4" style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border-color)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {l === 'ru' ? 'Итого' : 'Jami'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>/ {max} {l === 'ru' ? 'баллов' : 'ball'}</span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'Transmission', score: totalT, color: '#00E5FF' },
                    { label: 'Reflection',   score: totalR, color: '#FFB300' },
                  ].map(({ label, score, color }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs w-24 shrink-0 font-semibold" style={{ color }}>{label}</span>
                      <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                        <div
                          className="h-full rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${(score / max) * 100}%`, background: color }}
                        >
                          <span className="text-xs font-bold" style={{ color: '#060B18' }}>{score}</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono w-10 text-right" style={{ color }}>
                        {Math.round((score / max) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs p-3 rounded-lg" style={{ background: '#FFB30011', border: '1px solid #FFB30033', color: 'var(--text-secondary)' }}>
                  {l === 'ru'
                    ? `Отражательная голограмма набирает ${totalR} из ${max} баллов (+${totalR - totalT} к трансмиссионной) — выигрывает за счёт просмотра в белом свете и промышленного применения. Трансмиссионная лидирует по яркости, разрешению и простоте записи.`
                    : `Aks ettiruvchi gologramma ${max} balldan ${totalR} ball to'pladi (+${totalR - totalT} transmissiyaga nisbatan) — oq yorug'likda ko'rish va sanoat qo'llanilishi hisobiga yutadi. Transmissiya yorqinlik, aniqlik va yozish oddiyligi bo'yicha yetakchi.`}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Key takeaways */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className="rounded-xl p-4"
          style={{ background: '#00E5FF0D', border: '1px solid #00E5FF33' }}
        >
          <div className="font-bold mb-2" style={{ color: '#00E5FF' }}>{t.compTransAdv[l]}</div>
          <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
            <li>✓ {t.compTransAdv1[l]}</li>
            <li>✓ {t.compTransAdv2[l]}</li>
            <li>✓ {t.compTransAdv3[l]}</li>
            <li>✓ {t.compTransAdv4[l]}</li>
          </ul>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: '#FFB3000D', border: '1px solid #FFB30033' }}
        >
          <div className="font-bold mb-2" style={{ color: '#FFB300' }}>{t.compReflAdv[l]}</div>
          <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
            <li>✓ {t.compReflAdv1[l]}</li>
            <li>✓ {t.compReflAdv2[l]}</li>
            <li>✓ {t.compReflAdv3[l]}</li>
            <li>✓ {t.compReflAdv4[l]}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
