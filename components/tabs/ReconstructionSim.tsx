"use client";

import { useState, useRef, useEffect } from "react";
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";

function toRad(deg: number) { return deg * Math.PI / 180; }

const RECORD_ANGLE = 30;
const RECORD_LAMBDA = 632.8;

const LASER_TABLE = [
  { name: 'He-Ne', lambda: 632.8, color: '#FF4444', dot: '🔴', viewLaser: 'He-Ne или красный 633нм', price: '$50–200' },
  { name: 'Аргоновый', lambda: 488, color: '#4488FF', dot: '🔵', viewLaser: 'Аргоновый или диод 488нм', price: '$100–500' },
  { name: 'Nd:YAG×2', lambda: 532, color: '#44FF44', dot: '🟢', viewLaser: 'Зелёная указка 532нм', price: '$10–50' },
  { name: 'Диодный', lambda: 405, color: '#AA44FF', dot: '🟣', viewLaser: 'Фиолетовая указка 405нм', price: '$5–20' },
];

function getQuality(incidentAngle: number, reconLambda: number) {
  const angleDiff = Math.abs(incidentAngle - RECORD_ANGLE);
  const lambdaDiff = Math.abs(reconLambda - RECORD_LAMBDA);
  if (angleDiff < 2 && lambdaDiff < 5) return 0;
  if (angleDiff < 10 || lambdaDiff < 20) return 1;
  return 2;
}

function matchingLaserRow(reconLambda: number) {
  let best = -1;
  let bestDist = Infinity;
  LASER_TABLE.forEach((row, i) => {
    const d = Math.abs(row.lambda - reconLambda);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return bestDist < 30 ? best : -1;
}

// Draw the reconstruction scheme canvas
function drawReconScheme(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  incidentAngle: number,
  reconLambda: number,
  time: number
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0D1526';
  ctx.fillRect(0, 0, w, h);

  // Grid dots
  ctx.fillStyle = '#1E3A5F';
  for (let gx = 40; gx < w; gx += 40) {
    for (let gy = 40; gy < h; gy += 40) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const filmX = w * 0.48;
  const filmY = h * 0.1;
  const filmH = h * 0.8;
  const filmW = 12;

  // Film
  ctx.fillStyle = '#1a0e00';
  ctx.strokeStyle = '#FFB300';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(filmX - filmW / 2, filmY, filmW, filmH);
  ctx.fill();
  ctx.stroke();

  // Film fringes
  const numFringes = 22;
  for (let fi = 0; fi < numFringes; fi++) {
    const fy = filmY + (fi / numFringes) * filmH;
    const b = Math.abs(Math.sin(fi * Math.PI * 0.6));
    ctx.fillStyle = `rgba(255,179,0,${0.07 + b * 0.45})`;
    ctx.fillRect(filmX - filmW / 2 + 2, fy, filmW - 4, (filmH / numFringes) * 0.65);
  }

  ctx.fillStyle = '#FFB300';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FILM', filmX, filmY - 8);

  // Incoming beam from left at incidentAngle from film normal
  const angleRad = toRad(incidentAngle);
  const beamStartX = filmX - 200;
  const beamCenterY = h * 0.5;

  // Animated beam segments
  const numBeamLines = 5;
  for (let bi = -numBeamLines; bi <= numBeamLines; bi++) {
    const spread = bi * 7;
    const perpX = -Math.sin(angleRad) * spread;
    const perpY = Math.cos(angleRad) * spread;
    const animOffset = ((time * 2 + bi * 15) % 40) / 40;
    const alpha = 0.15 + (1 - Math.abs(bi) / numBeamLines) * 0.7;

    ctx.strokeStyle = `rgba(255,60,60,${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#FF3333';
    ctx.shadowBlur = 4;
    ctx.setLineDash([20 * animOffset, 20 * (1 - animOffset)]);
    ctx.beginPath();
    ctx.moveTo(beamStartX + perpX, beamCenterY + perpY);
    ctx.lineTo(filmX - filmW / 2 + perpX, beamCenterY + Math.tan(angleRad) * (filmX - filmW / 2 - beamStartX) + perpY);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  // Laser box on left
  const laserX = beamStartX - 50;
  ctx.fillStyle = '#CC2222';
  ctx.strokeStyle = '#FF4444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(laserX - 28, beamCenterY - 16, 56, 32, 4);
  ctx.fill();
  ctx.stroke();
  // Lens arcs
  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(laserX + 34, beamCenterY, 26, -Math.PI * 0.55, Math.PI * 0.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(laserX + 44, beamCenterY, 26, Math.PI - Math.PI * 0.55, Math.PI + Math.PI * 0.55);
  ctx.stroke();

  ctx.fillStyle = '#FFaaaa';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LASER', laserX, beamCenterY + 1);

  // Quality: affects diffraction orders
  const quality = getQuality(incidentAngle, reconLambda);
  const brightness = quality === 0 ? 1.0 : quality === 1 ? 0.55 : 0.2;

  // 0th order — straight through (gray)
  ctx.strokeStyle = 'rgba(150,150,150,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(filmX + filmW / 2, beamCenterY);
  ctx.lineTo(filmX + 220, beamCenterY);
  ctx.stroke();

  ctx.fillStyle = 'rgba(150,150,150,0.6)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('0-й порядок', filmX + filmW / 2 + 5, beamCenterY - 6);

  // +1st order upward (cyan, bright) — angle affected by angle/lambda mismatch
  const order1Angle = -25 + (incidentAngle - RECORD_ANGLE) * 0.5 + (reconLambda - RECORD_LAMBDA) * 0.02;
  const order1Rad = toRad(order1Angle);

  const o1EndX = filmX + filmW / 2 + Math.cos(order1Rad) * 230;
  const o1EndY = beamCenterY + Math.sin(order1Rad) * 230;

  // Animated +1 beam
  for (let bi2 = -3; bi2 <= 3; bi2++) {
    const perp = bi2 * 5;
    const pX = -Math.sin(order1Rad) * perp;
    const pY = Math.cos(order1Rad) * perp;
    const alpha2 = brightness * (0.3 + (1 - Math.abs(bi2) / 3) * 0.65);
    ctx.strokeStyle = `rgba(0,229,255,${alpha2})`;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = brightness > 0.6 ? 10 : 3;
    ctx.beginPath();
    ctx.moveTo(filmX + filmW / 2 + pX, beamCenterY + pY);
    ctx.lineTo(o1EndX + pX, o1EndY + pY);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // +1 order label
  ctx.fillStyle = `rgba(0,229,255,${brightness})`;
  ctx.font = `bold ${quality === 0 ? 11 : 9}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('3D ИЗОБРАЖЕНИЕ', o1EndX - 20, o1EndY - 8);
  ctx.font = '9px monospace';
  ctx.fillText('+1-й порядок', o1EndX - 20, o1EndY + 4);

  // -1st order downward (violet, dimmer)
  const order_1Angle = 25 + (incidentAngle - RECORD_ANGLE) * 0.5;
  const order_1Rad = toRad(order_1Angle);
  const om1EndX = filmX + filmW / 2 + Math.cos(order_1Rad) * 180;
  const om1EndY = beamCenterY + Math.sin(order_1Rad) * 180;

  ctx.strokeStyle = `rgba(156,39,176,${brightness * 0.5})`;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#9C27B0';
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.moveTo(filmX + filmW / 2, beamCenterY);
  ctx.lineTo(om1EndX, om1EndY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = `rgba(206,147,216,${brightness * 0.7})`;
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Сопряжённая волна', om1EndX - 10, om1EndY + 12);
  ctx.fillText('-1-й порядок', om1EndX - 10, om1EndY + 23);

  // Observer eye on right
  const eyeX = w - 40;
  const eyeY = o1EndY;
  ctx.strokeStyle = '#E8EAF6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(eyeX, eyeY, 14, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#00E5FF';
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#001a22';
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#E8EAF6';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Зритель', eyeX, eyeY + 22);

  // Recording params (top-left)
  ctx.fillStyle = 'rgba(14,21,38,0.8)';
  ctx.beginPath();
  ctx.roundRect(12, 12, 180, 52, 6);
  ctx.fill();
  ctx.strokeStyle = '#1E3A5F';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#90A4AE';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Параметры записи:', 20, 27);
  ctx.fillStyle = '#E8EAF6';
  ctx.fillText(`θ = ${RECORD_ANGLE}°`, 20, 40);
  ctx.fillText(`λ = ${RECORD_LAMBDA} нм`, 20, 53);
}

export default function ReconstructionSim() {
  const { lang } = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);

  const [incidentAngle, setIncidentAngle] = useState(30);
  const [reconLambda, setReconLambda] = useState(632.8);

  const quality = getQuality(incidentAngle, reconLambda);
  const matchRow = matchingLaserRow(reconLambda);

  const qualityConfig = [
    { text: t.reconSimQuality0[lang], color: '#69F0AE', bg: '#003322', border: '#00FF8866' },
    { text: t.reconSimQuality1[lang], color: '#FFB300', bg: '#332200', border: '#FFB30066' },
    { text: t.reconSimQuality2[lang], color: '#FF6666', bg: '#330000', border: '#FF444466' },
  ][quality];

  // Animation loop
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      timeRef.current += 1;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawReconScheme(ctx, canvas.width, canvas.height, incidentAngle, reconLambda, timeRef.current);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [incidentAngle, reconLambda]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--accent-cyan)' }}>
          {t.reconSimTitle[lang]}
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t.reconSimSubtitle[lang]}
        </p>
      </div>

      {/* Section A — Interactive canvas */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
        <div className="overflow-x-auto">
          <canvas
            ref={canvasRef}
            width={800}
            height={350}
            style={{ display: 'block', background: '#0D1526', minWidth: 400 }}
          />
        </div>

        <div
          className="p-4 space-y-4"
          style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)' }}
        >
          {/* Quality indicator */}
          <div
            className="p-3 rounded-lg text-sm font-bold"
            style={{
              background: qualityConfig.bg,
              border: `1px solid ${qualityConfig.border}`,
              color: qualityConfig.color,
            }}
          >
            {qualityConfig.text}
          </div>

          {/* Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                Угол падения:{' '}
                <span style={{ color: 'var(--accent-cyan)' }}>{incidentAngle}°</span>
                {Math.abs(incidentAngle - RECORD_ANGLE) < 2 && (
                  <span className="ml-2 text-xs" style={{ color: '#69F0AE' }}>
                    ✓ совпадает с углом записи
                  </span>
                )}
              </label>
              <input
                type="range"
                min={0} max={60} step={1}
                value={incidentAngle}
                onChange={e => setIncidentAngle(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: '#00E5FF' }}
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: '#90A4AE' }}>
                <span>0°</span>
                <span className="font-bold" style={{ color: '#FFB300' }}>↑ θ_записи = {RECORD_ANGLE}°</span>
                <span>60°</span>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                λ восстановления:{' '}
                <span style={{ color: 'var(--accent-cyan)' }}>{reconLambda.toFixed(0)} нм</span>
                {Math.abs(reconLambda - RECORD_LAMBDA) < 5 && (
                  <span className="ml-2 text-xs" style={{ color: '#69F0AE' }}>
                    ✓ совпадает с λ записи
                  </span>
                )}
              </label>
              <input
                type="range"
                min={380} max={780} step={1}
                value={reconLambda}
                onChange={e => setReconLambda(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: '#9C27B0' }}
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: '#90A4AE' }}>
                <span>380 нм</span>
                <span className="font-bold" style={{ color: '#FFB300' }}>↑ λ_записи = {RECORD_LAMBDA} нм</span>
                <span>780 нм</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section B — Why not a projector */}
      <div>
        <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--accent-amber)' }}>
          {t.whyNotProjector[lang]}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1 — Laser (correct) */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{
              background: 'var(--bg-card)',
              border: '2px solid #00FF8855',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">✓</span>
              <span className="font-bold text-sm" style={{ color: '#69F0AE' }}>Лазер (правильно)</span>
            </div>
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>• Монохроматический: одна λ → чёткая дифракция</li>
              <li>• Когерентный: фазы совпадают → волновой фронт восстанавливается</li>
              <li style={{ color: '#69F0AE', fontWeight: 600 }}>• Результат: чёткое 3D-изображение</li>
            </ul>
            <svg width="100%" height="60" viewBox="0 0 200 60">
              <rect x="2" y="20" width="36" height="20" rx="4" fill="#CC222255" stroke="#FF4444" strokeWidth="1.5" />
              <text x="20" y="32" textAnchor="middle" fill="#FF6666" fontSize="7" fontFamily="monospace">LASER</text>
              <line x1="38" y1="30" x2="88" y2="30" stroke="#FF4444" strokeWidth="1.5" />
              <rect x="88" y="20" width="8" height="20" rx="1" fill="#1a0e00" stroke="#FFB300" strokeWidth="1.5" />
              <line x1="96" y1="30" x2="140" y2="18" stroke="#00E5FF" strokeWidth="2" />
              <circle cx="156" cy="12" r="10" fill="none" stroke="#00E5FF" strokeWidth="1.5" />
              <text x="156" y="15" textAnchor="middle" fill="#00E5FF" fontSize="7">3D</text>
            </svg>
          </div>

          {/* Card 2 — Projector (wrong) */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{
              background: 'var(--bg-card)',
              border: '2px solid #FF444455',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">✗</span>
              <span className="font-bold text-sm" style={{ color: '#FF6666' }}>Проектор (неправильно)</span>
            </div>
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>• Белый свет: много λ → каждая даёт свой угол дифракции</li>
              <li>• Некогерентный: случайные фазы → волновой фронт разрушается</li>
              <li style={{ color: '#FF6666', fontWeight: 600 }}>• Результат: радужное размытое пятно</li>
            </ul>
            <svg width="100%" height="60" viewBox="0 0 200 60">
              <rect x="2" y="14" width="40" height="32" rx="4" fill="#22222255" stroke="#888888" strokeWidth="1.5" />
              <text x="22" y="32" textAnchor="middle" fill="#AAAAAA" fontSize="6" fontFamily="monospace">PROJ</text>
              {[0, 8, 16, -8, -16].map((dy, i) => (
                <line key={i} x1="42" y1={30 + dy * 0.3} x2="88" y2={30 + dy} stroke={['#FF4444','#FF8800','#FFFF00','#00FF00','#4444FF'][i]} strokeWidth="1.2" opacity="0.7" />
              ))}
              <rect x="88" y="20" width="8" height="20" rx="1" fill="#1a0e00" stroke="#FFB300" strokeWidth="1.5" />
              <text x="145" y="32" textAnchor="middle" fill="#888888" fontSize="7" fontFamily="monospace">???</text>
            </svg>
          </div>

          {/* Card 3 — Bulb (wrong) */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{
              background: 'var(--bg-card)',
              border: '2px solid #FF444455',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">✗</span>
              <span className="font-bold text-sm" style={{ color: '#FF6666' }}>Лампочка (неправильно)</span>
            </div>
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>• Белый некогерентный свет → размытие + радуга</li>
              <li>• Для Reflection голограмм — частично работает</li>
              <li style={{ color: '#FF6666', fontWeight: 600 }}>• Для Transmission — не работает</li>
            </ul>
            <svg width="100%" height="60" viewBox="0 0 200 60">
              <circle cx="28" cy="30" r="14" fill="#33330055" stroke="#FFFF44" strokeWidth="1.5" />
              <text x="28" y="33" textAnchor="middle" fill="#FFFF66" fontSize="10">💡</text>
              {[-20, -12, -4, 4, 12, 20].map((dy, i) => (
                <line key={i} x1="42" y1={30 + dy * 0.2} x2="88" y2={30 + dy * 1.8} stroke={['#FF4444','#FF8800','#FFFF00','#00FF00','#4444FF','#AA00FF'][i]} strokeWidth="1" opacity="0.5" />
              ))}
              <rect x="88" y="20" width="8" height="20" rx="1" fill="#1a0e00" stroke="#FFB300" strokeWidth="1.5" />
              <text x="145" y="28" textAnchor="middle" fill="#666666" fontSize="6">размытое</text>
              <text x="145" y="37" textAnchor="middle" fill="#666666" fontSize="6">пятно</text>
            </svg>
          </div>
        </div>
      </div>

      {/* Section C — Laser table */}
      <div>
        <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--accent-amber)' }}>
          {t.laserTable[lang]}
        </h3>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                <th className="text-left px-4 py-3" style={{ color: 'var(--text-secondary)' }}>Лазер</th>
                <th className="text-left px-4 py-3" style={{ color: 'var(--text-secondary)' }}>λ</th>
                <th className="text-left px-4 py-3" style={{ color: 'var(--text-secondary)' }}>Лазер для просмотра</th>
                <th className="text-left px-4 py-3" style={{ color: 'var(--text-secondary)' }}>Цена</th>
              </tr>
            </thead>
            <tbody>
              {LASER_TABLE.map((row, i) => {
                const isHighlighted = i === matchRow;
                return (
                  <tr
                    key={i}
                    style={{
                      background: isHighlighted ? '#00E5FF14' : i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)',
                      borderBottom: '1px solid var(--border-color)',
                      border: isHighlighted ? `1px solid ${row.color}44` : undefined,
                    }}
                  >
                    <td className="px-4 py-3 font-bold font-mono" style={{ color: isHighlighted ? row.color : 'var(--text-primary)' }}>
                      {row.dot} {row.name}
                      {isHighlighted && (
                        <span className="ml-2 text-xs" style={{ color: '#69F0AE' }}>← текущий</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ color: row.color }}>
                      {row.lambda} нм
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                      {row.viewLaser}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--accent-amber)' }}>
                      {row.price}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Tip box */}
        <div
          className="mt-3 p-4 rounded-xl text-sm"
          style={{
            background: '#0D1526',
            border: '1px solid #FFB30044',
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ color: '#FFB300' }}>💡 </span>
          Не знаете чем записывали? Попробуйте зелёную указку{' '}
          <span style={{ color: '#44FF44', fontWeight: 600 }}>532 нм</span>{' '}
          — самая доступная (от $10) и широко используется в лабораториях.
        </div>
      </div>
    </div>
  );
}
