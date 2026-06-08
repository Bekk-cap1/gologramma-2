"use client";

import { useEffect, useRef, useCallback } from "react";
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";

function drawReconstructionFrame(
  ctx: CanvasRenderingContext2D,
  time: number,
  w: number,
  h: number,
  filmColor = "#0D1526"
) {
  ctx.clearRect(0, 0, w, h);

  const filmX = w * 0.42;
  const filmY = h * 0.1;
  const filmW = 18;
  const filmH = h * 0.8;

  // ---- Holographic film ----
  ctx.fillStyle = filmColor;
  ctx.beginPath();
  ctx.roundRect(filmX - filmW / 2, filmY, filmW, filmH, 3);
  ctx.fill();

  // Interference fringes
  const numFringes = 28;
  for (let i = 0; i < numFringes; i++) {
    const fy = filmY + (i / numFringes) * filmH;
    const brightness = Math.abs(Math.sin(i * Math.PI * 0.7));
    ctx.fillStyle = `rgba(0,229,255,${0.08 + brightness * 0.55})`;
    ctx.fillRect(filmX - filmW / 2 + 2, fy, filmW - 4, (filmH / numFringes) * 0.7);
  }
  ctx.strokeStyle = "#9C27B0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(filmX - filmW / 2, filmY, filmW, filmH, 3);
  ctx.stroke();

  // Film label
  ctx.fillStyle = "#9C27B0";
  ctx.font = "11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("FILM", filmX, filmY - 8);

  // ---- Incoming reference beam (from left) ----
  const beamYCenter = h * 0.5;
  const beamHalfH = 28;

  for (let dy = -beamHalfH; dy <= beamHalfH; dy += 6) {
    const by = beamYCenter + dy;
    const phase = time * 3 + dy * 0.05;
    const xEnd = filmX - filmW / 2;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(0,229,255,${0.15 + 0.5 * Math.abs(Math.sin(phase))})`;
    ctx.lineWidth = 1.5;
    ctx.moveTo(30, by);
    ctx.lineTo(xEnd, by);
    ctx.stroke();
  }

  // Arrow on ref beam
  ctx.strokeStyle = "#00E5FF";
  ctx.lineWidth = 2.5;
  const arrowX = filmX - filmW / 2 - 20;
  ctx.beginPath();
  ctx.moveTo(50, beamYCenter);
  ctx.lineTo(arrowX, beamYCenter);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(arrowX, beamYCenter - 6);
  ctx.lineTo(arrowX + 10, beamYCenter);
  ctx.lineTo(arrowX, beamYCenter + 6);
  ctx.stroke();

  ctx.fillStyle = "#00E5FF";
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Reference beam", 110, beamYCenter - 35);
  ctx.font = "10px monospace";
  ctx.fillText("Eᵣ = Aᵣ·exp(i·k·r)", 110, beamYCenter - 18);

  // ---- Output beams ----
  const beamStart = filmX + filmW / 2;
  const animAlpha = 0.5 + 0.4 * Math.sin(time * 2);

  // 0th order (straight through)
  ctx.strokeStyle = `rgba(255,255,255,${animAlpha * 0.5})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(beamStart, beamYCenter);
  ctx.lineTo(w - 20, beamYCenter);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(200,200,200,0.7)";
  ctx.font = "11px system-ui";
  ctx.textAlign = "left";
  ctx.fillText("0th order (direct)", beamStart + 8, beamYCenter + 4);

  // +1st order (up-right, real holographic image — CYAN, highlighted)
  const order1EndX = w - 30;
  const order1EndY = h * 0.18;
  ctx.strokeStyle = `rgba(0,229,255,${animAlpha})`;
  ctx.lineWidth = 3.5;
  ctx.shadowColor = "#00E5FF";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(beamStart, beamYCenter);
  ctx.lineTo(order1EndX, order1EndY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Animated dot on +1 beam
  const dot1t = (time * 0.7) % 1;
  const dot1x = beamStart + (order1EndX - beamStart) * dot1t;
  const dot1y = beamYCenter + (order1EndY - beamYCenter) * dot1t;
  ctx.beginPath();
  ctx.fillStyle = "#00E5FF";
  ctx.arc(dot1x, dot1y, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#00E5FF";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "left";
  ctx.fillText("+1st order ✓", order1EndX - 90, order1EndY - 10);
  ctx.font = "10px system-ui";
  ctx.fillText("Restored wave!", order1EndX - 100, order1EndY + 8);

  // -1st order (down-right, conjugate wave — dim violet)
  const ordN1EndX = w - 30;
  const ordN1EndY = h * 0.82;
  ctx.strokeStyle = `rgba(156,39,176,${animAlpha * 0.6})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(beamStart, beamYCenter);
  ctx.lineTo(ordN1EndX, ordN1EndY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(156,39,176,0.8)";
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  ctx.fillText("-1st order (conjugate wave)", ordN1EndX, ordN1EndY + 16);
}

export default function Reconstruction() {
  const { lang, theme } = useLang();
  const isDark = theme === "dark";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const timeRef = useRef(0);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    timeRef.current += 0.016;
    drawReconstructionFrame(ctx, timeRef.current, canvas.width, canvas.height,
      isDark ? "#0D1526" : "#90A4AE");
    rafRef.current = requestAnimationFrame(drawFrame);
  }, [isDark]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--accent-cyan)' }}>
          {t.reconTitle[lang]}
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          {t.reconSubtitle[lang]}
        </p>
      </div>

      {/* Canvas animation */}
      <div
        className="rounded-xl overflow-hidden mb-5"
        style={{ background: 'var(--canvas-bg)', border: '1px solid var(--border-color)' }}
      >
        <canvas
          ref={canvasRef}
          width={720}
          height={280}
          className="w-full"
          style={{ display: 'block' }}
        />
      </div>

      {/* Math explanation */}
      <div
        className="rounded-xl p-5 mb-4 font-mono text-sm"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
      >
        <div className="text-base font-bold mb-3" style={{ color: 'var(--accent-amber)' }}>
          {t.reconMathTitle[lang]}
        </div>
        <div className="space-y-1">
          <div style={{ color: '#E8EAF6' }}>
            E_out = T(x,y) · Eᵣ
          </div>
          <div style={{ color: '#90A4AE' }} className="pl-6">
            = T₀·Eᵣ
            <span className="ml-3 text-xs" style={{ color: '#546E7A' }}>{t.reconDirectLabel[lang]}</span>
          </div>
          <div style={{ color: '#90A4AE' }} className="pl-6">
            + β·Aᵣ²·Eᵣ
            <span className="ml-3 text-xs" style={{ color: '#546E7A' }}>{t.reconBgLabel[lang]}</span>
          </div>
          <div
            className="pl-6 py-1 rounded"
            style={{
              color: '#00E5FF',
              background: '#00E5FF11',
              border: '1px solid #00E5FF44',
            }}
          >
            + β·Aᵣ·A₀·exp(iφ)
            <span className="ml-3 text-xs font-bold" style={{ color: '#69F0AE' }}>{t.reconRestoredLabel[lang]}</span>
          </div>
          <div style={{ color: '#90A4AE' }} className="pl-6">
            + β·Aᵣ·A₀*·exp(-iφ)
            <span className="ml-3 text-xs" style={{ color: '#546E7A' }}>{t.reconConjLabel[lang]}</span>
          </div>
        </div>
      </div>

      {/* Highlighted explanation */}
      <div
        className="rounded-xl p-5 mb-4"
        style={{ background: '#00E5FF0D', border: '1px solid #00E5FF44' }}
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl">✨</div>
          <div>
            <div className="font-bold mb-1" style={{ color: '#00E5FF' }}>
              {t.reconHighlightTitle[lang]}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {t.reconHighlightDesc[lang]}
            </p>
          </div>
        </div>
      </div>

      {/* Three orders */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-card)', border: '1px solid #FFFFFF22' }}>
          <div className="font-bold text-sm mb-1" style={{ color: '#E8EAF6' }}>{t.order0[lang]}</div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.order0desc[lang]}</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: '#00E5FF0D', border: '1px solid #00E5FF55' }}>
          <div className="font-bold text-sm mb-1" style={{ color: '#00E5FF' }}>{t.order1p[lang]}</div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.order1pDesc[lang]}</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-card)', border: '1px solid #9C27B033' }}>
          <div className="font-bold text-sm mb-1" style={{ color: '#9C27B0' }}>{t.order1m[lang]}</div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.order1mDesc[lang]}</div>
        </div>
      </div>
    </div>
  );
}
