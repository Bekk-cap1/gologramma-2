"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";

type DrawFn = (ctx: CanvasRenderingContext2D, time: number, w: number, h: number) => void;

const STEPS_DRAW: DrawFn[] = [
  // Step 1: Laser on
  (ctx, time, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#FF5252";
    ctx.beginPath();
    ctx.roundRect(20, h/2 - 20, 80, 40, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("LASER", 60, h/2 + 4);

    const animated = ((time * 3) % (w - 100)) + 100;
    const gradient = ctx.createLinearGradient(100, 0, animated, 0);
    gradient.addColorStop(0, "rgba(0,229,255,0)");
    gradient.addColorStop(0.3, "rgba(0,229,255,0.9)");
    gradient.addColorStop(1, "rgba(0,229,255,0.2)");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(100, h/2);
    ctx.lineTo(Math.min(animated, w - 30), h/2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(0,229,255,0.15)";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(100, h/2);
    ctx.lineTo(Math.min(animated, w - 30), h/2);
    ctx.stroke();

    ctx.fillStyle = "#00E5FF";
    ctx.font = "13px serif";
    ctx.textAlign = "center";
    ctx.fillText("λ = 632.8 нм  |  Lc ≈ 30 см", w/2, h/2 - 20);
  },

  // Step 2: Beam splits
  (ctx, time, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#FF5252";
    ctx.beginPath();
    ctx.roundRect(20, h/2 - 20, 70, 40, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("LASER", 55, h/2 + 4);

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(90, h/2);
    ctx.lineTo(200, h/2);
    ctx.stroke();

    ctx.fillStyle = "#00E5FF22";
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(220, h/2);
    ctx.lineTo(200, h/2 - 20);
    ctx.lineTo(220, h/2 - 40);
    ctx.lineTo(240, h/2 - 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#00E5FF";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("50/50", 220, h/2 - 16);

    const animProgress = (Math.sin(time * 2) + 1) / 2;

    const refX = 240 + animProgress * (w - 300);
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(220, h/2 - 20);
    ctx.lineTo(refX, 40);
    ctx.stroke();
    ctx.fillStyle = "#00E5FF";
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("← reference", 260, 55);

    const objX = 240 + animProgress * (w - 300);
    ctx.strokeStyle = "#9C27B0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(220, h/2 - 20);
    ctx.lineTo(objX, h - 40);
    ctx.stroke();
    ctx.fillStyle = "#9C27B0";
    ctx.textAlign = "left";
    ctx.fillText("← object", 260, h - 45);
  },

  // Step 3: Reflection from object
  (ctx, time, w, h) => {
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "#9C27B0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(30, h/2);
    ctx.lineTo(220, h/2);
    ctx.stroke();

    ctx.fillStyle = "#FFB30022";
    ctx.strokeStyle = "#FFB300";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(230, h/2 - 50, 80, 80, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#FFB300";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("3D OBJECT", 270, h/2 + 5);

    const numRays = 7;
    for (let i = 0; i < numRays; i++) {
      const angle = -70 + (i * 140) / (numRays - 1);
      const rad = (angle * Math.PI) / 180;
      const progress = (Math.sin(time * 1.5 + i * 0.5) + 1) / 2;
      const len = 100 + progress * 60;
      const x2 = 310 + Math.cos(rad) * len;
      const y2 = h/2 + Math.sin(rad) * len;
      ctx.strokeStyle = `rgba(156,39,176,${0.3 + progress * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(310, h/2);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (i === 3) {
        ctx.fillStyle = "#9C27B0";
        ctx.font = "11px serif";
        ctx.textAlign = "left";
        ctx.fillText("φ(x,y,z)", x2 + 5, y2);
      }
    }

    ctx.fillStyle = "#9C27B0";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Object beam → scattered wavefront", 270, 30);
  },

  // Step 4: Interference on film
  (ctx, time, w, h) => {
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const filmX = cx + 80;

    const drawWave = (yBase: number, color: string, phase: number, amp: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = 0; x <= filmX - 20; x++) {
        const y = yBase + amp * Math.sin((x / 30) * Math.PI * 2 + time * 3 + phase);
        if (x === 0) ctx.moveTo(x + 20, y);
        else ctx.lineTo(x + 20, y);
      }
      ctx.stroke();
    };

    drawWave(h * 0.35, "#00E5FF", 0, 28);
    drawWave(h * 0.65, "#9C27B0", 0, 28);

    ctx.fillStyle = "#00E5FF";
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("Reference beam", 25, h * 0.35 - 35);

    ctx.fillStyle = "#9C27B0";
    ctx.fillText("Object beam", 25, h * 0.65 + 50);

    ctx.fillStyle = "#9C27B022";
    ctx.strokeStyle = "#9C27B0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(filmX - 10, 20, 20, h - 40);
    ctx.fill();
    ctx.stroke();

    for (let y = 25; y < h - 25; y += 8) {
      const ref = Math.sin((y / 30) * Math.PI * 2 + time * 3);
      const obj = Math.sin((y / 30) * Math.PI * 2 + time * 3 + 1.2);
      const interference = (ref + obj) / 2;
      const brightness = (interference + 1) / 2;
      ctx.fillStyle = `rgba(255,255,255,${brightness * 0.8})`;
      ctx.fillRect(filmX - 8, y, 16, 7);
    }

    ctx.fillStyle = "#E8EAF6";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("FILM", filmX, h - 10);

    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(20, h * 0.35);
    ctx.lineTo(filmX - 15, h * 0.35);
    ctx.stroke();

    ctx.strokeStyle = "#9C27B0";
    ctx.beginPath();
    ctx.moveTo(20, h * 0.65);
    ctx.lineTo(filmX - 15, h * 0.65);
    ctx.stroke();

    ctx.fillStyle = "#FFB300";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("I = Aᵣ² + A₀² + 2AᵣA₀cos(φ)", w/2 - 60, h - 12);
  },

  // Step 5: Hologram recorded
  (ctx, time, w, h) => {
    ctx.clearRect(0, 0, w, h);

    const filmX = w / 2 - 20;
    const filmW = 40;
    const filmH = h - 60;
    const filmY = 30;

    ctx.fillStyle = "#0D1526";
    ctx.strokeStyle = "#9C27B0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(filmX, filmY, filmW, filmH, 4);
    ctx.fill();
    ctx.stroke();

    const numFringes = 20;
    const fringe_spacing = filmH / numFringes;
    for (let i = 0; i < numFringes; i++) {
      const y = filmY + i * fringe_spacing;
      const brightness = Math.sin(i * Math.PI * 0.8 + time * 0.5);
      const alpha = 0.1 + Math.abs(brightness) * 0.8;
      ctx.fillStyle = `rgba(0,229,255,${alpha})`;
      ctx.fillRect(filmX + 2, y, filmW - 4, fringe_spacing * 0.7);
    }

    ctx.fillStyle = "#9C27B0";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("HOLOGRAM", filmX + filmW/2, filmY - 10);

    ctx.fillStyle = "#00E5FF";
    ctx.font = "13px monospace";
    ctx.textAlign = "left";
    ctx.fillText("d = λ / (2·sin(θ/2))", filmX + filmW + 20, h/2 - 25);

    ctx.fillStyle = "#90A4AE";
    ctx.font = "11px system-ui";
    ctx.fillText("d ≈ 0.5–1 мкм", filmX + filmW + 20, h/2 + 0);
    ctx.fillText("N ≈ 1000–2000 lines/mm", filmX + filmW + 20, h/2 + 20);
    ctx.fillText("T(x,y) = T₀ + β·I(x,y)", filmX + filmW + 20, h/2 + 40);

    ctx.fillStyle = "#69F0AE";
    ctx.font = "24px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("✓", filmX + filmW/2, h - 15);
  },
];

const STEP_TITLE_KEYS = [
  "step1title", "step2title", "step3title", "step4title", "step5title",
] as const;

const STEP_TEXT_KEYS = [
  "step1text", "step2text", "step3text", "step4text", "step5text",
] as const;

export default function Recording() {
  const { lang } = useLang();
  const [step, setStep] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const timeRef = useRef(0);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    timeRef.current += 0.016;
    STEPS_DRAW[step](ctx, timeRef.current, canvas.width, canvas.height);
    rafRef.current = requestAnimationFrame(drawFrame);
  }, [step]);

  useEffect(() => {
    timeRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--accent-cyan)' }}>
          {t.recTitle[lang]}
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          {t.recSubtitle[lang]}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2 mb-4">
        {STEPS_DRAW.map((_, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className="flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all"
            style={{
              background: i === step ? '#00E5FF22' : 'var(--bg-card)',
              border: `1px solid ${i === step ? '#00E5FF' : 'var(--border-color)'}`,
              color: i === step ? '#00E5FF' : 'var(--text-secondary)',
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div
        className="rounded-xl overflow-hidden mb-4"
        style={{ background: '#060B18', border: '1px solid var(--border-color)' }}
      >
        <canvas
          ref={canvasRef}
          width={700}
          height={260}
          className="w-full"
          style={{ display: 'block' }}
        />
      </div>

      {/* Step info */}
      <div
        className="rounded-xl p-5 mb-4"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
      >
        <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--accent-cyan)' }}>
          {t.stepLabel[lang]} {step + 1}: {t[STEP_TITLE_KEYS[step]][lang]}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {t[STEP_TEXT_KEYS[step]][lang]}
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="px-6 py-2 rounded-lg font-medium text-sm transition-all"
          style={{
            background: step === 0 ? '#1E3A5F44' : 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            color: step === 0 ? '#1E3A5F' : 'var(--text-primary)',
            cursor: step === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {t.recPrev[lang]}
        </button>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {step + 1} {t.recOf[lang]} {STEPS_DRAW.length}
        </span>
        <button
          onClick={() => setStep(Math.min(STEPS_DRAW.length - 1, step + 1))}
          disabled={step === STEPS_DRAW.length - 1}
          className="px-6 py-2 rounded-lg font-medium text-sm transition-all"
          style={{
            background: step === STEPS_DRAW.length - 1 ? '#1E3A5F44' : '#00E5FF22',
            border: `1px solid ${step === STEPS_DRAW.length - 1 ? 'var(--border-color)' : '#00E5FF'}`,
            color: step === STEPS_DRAW.length - 1 ? '#1E3A5F' : '#00E5FF',
            cursor: step === STEPS_DRAW.length - 1 ? 'not-allowed' : 'pointer',
          }}
        >
          {t.recNext[lang]}
        </button>
      </div>
    </div>
  );
}
