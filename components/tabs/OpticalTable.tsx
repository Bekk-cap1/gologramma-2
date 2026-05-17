"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";

type ComponentType = 'laser' | 'beamsplitter' | 'mirror' | 'lens' | 'film' | 'object';

interface OpticalComponent {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
}

interface Ray {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  intensity: number;
  rayType: 'reference' | 'object' | 'scattered';
}

interface FilmHit {
  x: number;
  y: number;
  angle: number;
  rayType: 'reference' | 'object';
}

function toRad(deg: number) { return deg * Math.PI / 180; }

function defaultSize(type: ComponentType): { width: number; height: number } {
  switch (type) {
    case 'laser': return { width: 60, height: 28 };
    case 'beamsplitter': return { width: 28, height: 28 };
    case 'mirror': return { width: 8, height: 50 };
    case 'lens': return { width: 16, height: 44 };
    case 'film': return { width: 8, height: 60 };
    case 'object': return { width: 30, height: 30 };
  }
}

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

// Draw a single component on canvas
function drawComponent(ctx: CanvasRenderingContext2D, comp: OpticalComponent, selected: boolean) {
  ctx.save();
  ctx.translate(comp.x, comp.y);
  ctx.rotate(toRad(comp.angle));

  if (selected) {
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 12;
  }

  const hw = comp.width / 2;
  const hh = comp.height / 2;

  switch (comp.type) {
    case 'laser': {
      // Red rectangle
      ctx.fillStyle = '#CC2222';
      ctx.strokeStyle = '#FF4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, comp.width, comp.height, 4);
      ctx.fill();
      ctx.stroke();
      // Arrow showing beam exit
      ctx.strokeStyle = '#FF6666';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hw - 10, 0);
      ctx.lineTo(hw + 14, 0);
      ctx.stroke();
      ctx.fillStyle = '#FF6666';
      ctx.beginPath();
      ctx.moveTo(hw + 14, 0);
      ctx.lineTo(hw + 8, -4);
      ctx.lineTo(hw + 8, 4);
      ctx.closePath();
      ctx.fill();
      // Label
      ctx.fillStyle = '#FFaaaa';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LASER', 0, 0);
      break;
    }
    case 'beamsplitter': {
      // Yellow square with diagonal
      ctx.fillStyle = '#1a1500';
      ctx.strokeStyle = '#FFB300';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(-hw, -hh, comp.width, comp.height);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-hw, hh);
      ctx.lineTo(hw, -hh);
      ctx.stroke();
      ctx.fillStyle = '#FFB300';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BS', 0, 0);
      break;
    }
    case 'mirror': {
      // Thin silver rectangle
      ctx.fillStyle = '#C0C0C0';
      ctx.strokeStyle = '#E8E8E8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(-hw, -hh, comp.width, comp.height);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'lens': {
      // Two arcs forming convex lens
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 2.5;
      ctx.fillStyle = 'rgba(0,229,255,0.08)';
      const r = comp.height * 0.7;
      ctx.beginPath();
      const a1 = Math.asin(hh / r);
      ctx.arc(-r + hw * 0.6, 0, r, -a1, a1);
      ctx.arc(r - hw * 0.6, 0, r, Math.PI - a1, Math.PI + a1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'film': {
      // Amber rectangle
      ctx.fillStyle = '#332200';
      ctx.strokeStyle = '#FFB300';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-hw, -hh, comp.width, comp.height);
      ctx.fill();
      ctx.stroke();
      // Fringes
      ctx.strokeStyle = 'rgba(255,179,0,0.35)';
      ctx.lineWidth = 1;
      const numFringes = 8;
      for (let i = 0; i <= numFringes; i++) {
        const fy = -hh + (i / numFringes) * comp.height;
        ctx.beginPath();
        ctx.moveTo(-hw, fy);
        ctx.lineTo(hw, fy);
        ctx.stroke();
      }
      break;
    }
    case 'object': {
      // Violet circle
      ctx.fillStyle = 'rgba(156,39,176,0.25)';
      ctx.strokeStyle = '#9C27B0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, comp.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#CE93D8';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OBJ', 0, 0);
      break;
    }
  }

  ctx.restore();
}

// Draw palette icon (smaller version)
function drawPaletteIcon(ctx: CanvasRenderingContext2D, type: ComponentType, cx: number, cy: number) {
  const comp: OpticalComponent = {
    id: 'palette',
    type,
    x: cx, y: cy,
    angle: 0,
    ...defaultSize(type),
  };
  ctx.save();
  ctx.scale(0.65, 0.65);
  ctx.translate((cx / 0.65) * (1 - 0.65) + cx * 0, (cy / 0.65) * (1 - 0.65) + cy * 0);
  ctx.restore();

  const scale = 0.65;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  drawComponent(ctx, comp, false);
  ctx.restore();
}

interface RaySource {
  x: number; y: number;
  dx: number; dy: number;
  color: string;
  rayType: 'reference' | 'object' | 'scattered';
  intensity: number;
  bounces: number;
}

function segmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): { x: number; y: number; t: number } | null {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  if (t >= 0.001 && t <= 1 && u >= 0 && u <= 1) {
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t };
  }
  return null;
}

// Get the 4 corners of a rotated rect component
function getComponentEdges(comp: OpticalComponent): Array<[number, number, number, number]> {
  const hw = comp.width / 2;
  const hh = comp.height / 2;
  const rad = toRad(comp.angle);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotate = (lx: number, ly: number) => ({
    x: comp.x + lx * cos - ly * sin,
    y: comp.y + lx * sin + ly * cos,
  });
  const tl = rotate(-hw, -hh);
  const tr = rotate(hw, -hh);
  const br = rotate(hw, hh);
  const bl = rotate(-hw, hh);

  return [
    [tl.x, tl.y, tr.x, tr.y],
    [tr.x, tr.y, br.x, br.y],
    [br.x, br.y, bl.x, bl.y],
    [bl.x, bl.y, tl.x, tl.y],
  ];
}

// Reflect direction off a surface normal
function reflect(dx: number, dy: number, nx: number, ny: number): { dx: number; dy: number } {
  const dot = dx * nx + dy * ny;
  return { dx: dx - 2 * dot * nx, dy: dy - 2 * dot * ny };
}

function traceRays(
  components: OpticalComponent[],
  canvasW: number,
  canvasH: number
): { rays: Ray[]; filmHits: FilmHit[] } {
  const rays: Ray[] = [];
  const filmHits: FilmHit[] = [];

  const laser = components.find(c => c.type === 'laser');
  if (!laser) return { rays, filmHits };

  const rad = toRad(laser.angle);
  const startX = laser.x + Math.cos(rad) * (laser.width / 2 + 4);
  const startY = laser.y + Math.sin(rad) * (laser.width / 2 + 4);

  const queue: RaySource[] = [{
    x: startX, y: startY,
    dx: Math.cos(rad),
    dy: Math.sin(rad),
    color: '#00E5FF',
    rayType: 'reference',
    intensity: 1.0,
    bounces: 0,
  }];

  const MAX_BOUNCES = 10;
  const STEP = 800; // large step — we compute exact intersections

  while (queue.length > 0) {
    const src = queue.shift()!;
    if (src.bounces > MAX_BOUNCES) continue;
    if (src.intensity < 0.05) continue;

    // Ray end at canvas boundary
    let endX = src.x + src.dx * STEP;
    let endY = src.y + src.dy * STEP;

    // Clamp to canvas edges
    let tMin = 1.0;
    const checkEdge = (ex1: number, ey1: number, ex2: number, ey2: number) => {
      const hit = segmentsIntersect(src.x, src.y, src.x + src.dx * STEP * 2, src.y + src.dy * STEP * 2, ex1, ey1, ex2, ey2);
      if (hit && hit.t < tMin) {
        tMin = hit.t;
        endX = hit.x;
        endY = hit.y;
      }
    };
    checkEdge(0, 0, canvasW, 0);
    checkEdge(canvasW, 0, canvasW, canvasH);
    checkEdge(canvasW, canvasH, 0, canvasH);
    checkEdge(0, canvasH, 0, 0);

    // Find nearest component hit
    let nearestT = tMin;
    let nearestComp: OpticalComponent | null = null;
    let nearestHitX = endX;
    let nearestHitY = endY;
    let nearestEdgeIdx = 0;

    for (const comp of components) {
      if (comp.type === 'laser') continue;
      const edges = getComponentEdges(comp);
      edges.forEach((edge, idx) => {
        const hit = segmentsIntersect(
          src.x, src.y,
          src.x + src.dx * STEP * 2,
          src.y + src.dy * STEP * 2,
          edge[0], edge[1], edge[2], edge[3]
        );
        if (hit && hit.t < nearestT) {
          nearestT = hit.t;
          nearestComp = comp;
          nearestHitX = hit.x;
          nearestHitY = hit.y;
          nearestEdgeIdx = idx;
        }
      });
    }

    // Record this ray segment
    rays.push({
      x1: src.x, y1: src.y,
      x2: nearestHitX, y2: nearestHitY,
      color: src.color,
      intensity: src.intensity,
      rayType: src.rayType,
    });

    if (!nearestComp) continue;

    const comp = nearestComp as OpticalComponent;
    const hx = nearestHitX;
    const hy = nearestHitY;

    switch (comp.type) {
      case 'beamsplitter': {
        // Transmitted ray (same direction, 50% intensity)
        queue.push({
          x: hx + src.dx * 2, y: hy + src.dy * 2,
          dx: src.dx, dy: src.dy,
          color: src.color,
          rayType: src.rayType,
          intensity: src.intensity * 0.5,
          bounces: src.bounces + 1,
        });
        // Reflected ray (perpendicular, 50% intensity) — reflect off diagonal (45°)
        // BS diagonal is at 45° in local space, so reflect about that normal
        const bsRad = toRad(comp.angle + 45);
        const nx = -Math.sin(bsRad);
        const ny = Math.cos(bsRad);
        const ref = reflect(src.dx, src.dy, nx, ny);
        queue.push({
          x: hx + ref.dx * 2, y: hy + ref.dy * 2,
          dx: ref.dx, dy: ref.dy,
          color: '#9C27B0',
          rayType: 'object',
          intensity: src.intensity * 0.5,
          bounces: src.bounces + 1,
        });
        break;
      }
      case 'mirror': {
        // Find the edge normal
        const edges = getComponentEdges(comp);
        const edge = edges[nearestEdgeIdx % edges.length];
        const ex = edge[2] - edge[0];
        const ey = edge[3] - edge[1];
        const len = Math.sqrt(ex * ex + ey * ey) || 1;
        // normal perpendicular to edge
        const nx = -ey / len;
        const ny = ex / len;
        const ref = reflect(src.dx, src.dy, nx, ny);
        queue.push({
          x: hx + ref.dx * 2, y: hy + ref.dy * 2,
          dx: ref.dx, dy: ref.dy,
          color: src.color,
          rayType: src.rayType,
          intensity: src.intensity * 0.95,
          bounces: src.bounces + 1,
        });
        break;
      }
      case 'lens': {
        // Ray continues but creates 3 diverging rays
        const spread = 15 * Math.PI / 180;
        for (let s = -1; s <= 1; s++) {
          const a = Math.atan2(src.dy, src.dx) + s * spread;
          queue.push({
            x: hx + Math.cos(a) * 2, y: hy + Math.sin(a) * 2,
            dx: Math.cos(a), dy: Math.sin(a),
            color: src.color,
            rayType: src.rayType,
            intensity: src.intensity * (s === 0 ? 0.6 : 0.3),
            bounces: src.bounces + 1,
          });
        }
        break;
      }
      case 'object': {
        if (src.rayType === 'object' || src.rayType === 'reference') {
          // Scatter 7 rays toward film
          const film = components.find(c => c.type === 'film');
          const targetAngle = film
            ? Math.atan2(film.y - hy, film.x - hx)
            : Math.atan2(src.dy, src.dx);
          const fanSpread = 40 * Math.PI / 180;
          for (let k = 0; k < 7; k++) {
            const a = targetAngle - fanSpread + (k / 6) * fanSpread * 2;
            queue.push({
              x: hx + Math.cos(a) * 2, y: hy + Math.sin(a) * 2,
              dx: Math.cos(a), dy: Math.sin(a),
              color: '#9C27B0',
              rayType: 'object',
              intensity: src.intensity * 0.25,
              bounces: src.bounces + 1,
            });
          }
        }
        break;
      }
      case 'film': {
        // Record film hit, stop ray
        filmHits.push({
          x: hx, y: hy,
          angle: Math.atan2(src.dy, src.dx) * 180 / Math.PI,
          rayType: src.rayType === 'scattered' ? 'object' : src.rayType,
        });
        break;
      }
    }
  }

  return { rays, filmHits };
}

function computeInterference(filmHits: FilmHit[]): {
  hasInterference: boolean;
  theta: number;
  d_nm: number;
  N: number;
} {
  const refHits = filmHits.filter(h => h.rayType === 'reference');
  const objHits = filmHits.filter(h => h.rayType === 'object');
  const hasInterference = refHits.length > 0 && objHits.length > 0;

  if (!hasInterference) return { hasInterference: false, theta: 0, d_nm: 0, N: 0 };

  const refAngle = refHits[0].angle;
  const objAngle = objHits[0].angle;
  let theta = Math.abs(refAngle - objAngle);
  if (theta > 180) theta = 360 - theta;

  const lambda = 632.8; // nm
  const sinHalf = Math.sin((theta / 2) * Math.PI / 180);
  const d_nm = sinHalf > 0 ? lambda / (2 * sinHalf) : Infinity;
  const N = d_nm < Infinity ? 1e6 / d_nm : 0;

  return { hasInterference, theta, d_nm, N };
}

const PALETTE_TYPES: ComponentType[] = ['laser', 'beamsplitter', 'mirror', 'lens', 'film', 'object'];
const PALETTE_LABELS: Record<ComponentType, string> = {
  laser: 'Лазер',
  beamsplitter: 'БС',
  mirror: 'Зеркало',
  lens: 'Линза',
  film: 'Плёнка',
  object: 'Объект',
};

const TUTORIAL_STEPS = [
  {
    title: 'Добавьте лазер',
    desc: 'Перетащите лазер на стол или нажмите на него в палитре.',
    done: (comps: OpticalComponent[], _ifilm: boolean) => comps.some(c => c.type === 'laser'),
  },
  {
    title: 'Добавьте светоделитель',
    desc: 'Светоделитель разделит луч на опорный и объектный.',
    done: (comps: OpticalComponent[], _ifilm: boolean) =>
      comps.some(c => c.type === 'beamsplitter'),
  },
  {
    title: 'Добавьте плёнку',
    desc: 'Голографическая плёнка записывает интерференционную картину.',
    done: (comps: OpticalComponent[], _ifilm: boolean) => comps.some(c => c.type === 'film'),
  },
  {
    title: 'Добавьте объект',
    desc: 'Объект рассеивает объектный луч, создавая объектную волну.',
    done: (comps: OpticalComponent[], _ifilm: boolean) => comps.some(c => c.type === 'object'),
  },
  {
    title: 'Добейтесь интерференции',
    desc: 'Оба луча должны попасть на плёнку одновременно для записи голограммы.',
    done: (_comps: OpticalComponent[], interferenceOnFilm: boolean) => interferenceOnFilm,
  },
];

function makeStandardPreset(): OpticalComponent[] {
  return [
    { id: makeId(), type: 'laser', x: 80, y: 275, angle: 0, width: 60, height: 28 },
    { id: makeId(), type: 'beamsplitter', x: 200, y: 275, angle: 45, width: 28, height: 28 },
    { id: makeId(), type: 'mirror', x: 200, y: 120, angle: -45, width: 8, height: 50 },
    { id: makeId(), type: 'lens', x: 360, y: 120, angle: 0, width: 16, height: 44 },
    { id: makeId(), type: 'mirror', x: 340, y: 275, angle: 45, width: 8, height: 50 },
    { id: makeId(), type: 'lens', x: 480, y: 275, angle: 0, width: 16, height: 44 },
    { id: makeId(), type: 'object', x: 600, y: 275, angle: 0, width: 30, height: 30 },
    { id: makeId(), type: 'film', x: 700, y: 200, angle: 90, width: 8, height: 60 },
  ];
}

function makeErrorPreset(): OpticalComponent[] {
  return [
    { id: makeId(), type: 'laser', x: 80, y: 275, angle: 0, width: 60, height: 28 },
    { id: makeId(), type: 'object', x: 300, y: 275, angle: 0, width: 30, height: 30 },
    { id: makeId(), type: 'film', x: 500, y: 275, angle: 90, width: 8, height: 60 },
  ];
}

const CANVAS_W = 800;
const CANVAS_H = 550;
const PALETTE_W = 90;

export default function OpticalTable() {
  const { lang } = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef<HTMLCanvasElement>(null);

  const [components, setComponents] = useState<OpticalComponent[]>(makeStandardPreset());
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [tutorialOpen, setTutorialOpen] = useState(true);
  const [animFrame, setAnimFrame] = useState(0);

  // Ray tracing state
  const [rays, setRays] = useState<Ray[]>([]);
  const [filmHits, setFilmHits] = useState<FilmHit[]>([]);
  const [interferenceInfo, setInterferenceInfo] = useState<ReturnType<typeof computeInterference>>({
    hasInterference: false, theta: 0, d_nm: 0, N: 0,
  });

  // Animation for film interference glow
  const rafRef = useRef<number>(0);
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      setAnimFrame(f => (f + 1) % 120);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  // Run ray tracing whenever components change
  useEffect(() => {
    const { rays: newRays, filmHits: newFilmHits } = traceRays(components, CANVAS_W - PALETTE_W, CANVAS_H);
    setRays(newRays);
    setFilmHits(newFilmHits);
    setInterferenceInfo(computeInterference(newFilmHits));
  }, [components]);

  // Draw main canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = CANVAS_W - PALETTE_W;
    const h = CANVAS_H;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0D1526';
    ctx.fillRect(0, 0, w, h);

    // Grid dots
    ctx.fillStyle = '#1E3A5F';
    for (let gx = 40; gx < w; gx += 40) {
      for (let gy = 40; gy < h; gy += 40) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw rays
    for (const ray of rays) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.1, Math.min(1, ray.intensity));
      ctx.strokeStyle = ray.color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = ray.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(ray.x1, ray.y1);
      ctx.lineTo(ray.x2, ray.y2);
      ctx.stroke();
      // Glow pass
      ctx.globalAlpha = Math.max(0.05, ray.intensity * 0.3);
      ctx.lineWidth = 5;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(ray.x1, ray.y1);
      ctx.lineTo(ray.x2, ray.y2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw components
    for (const comp of components) {
      drawComponent(ctx, comp, false);
    }

    // Interference glow on film
    if (interferenceInfo.hasInterference) {
      const film = components.find(c => c.type === 'film');
      if (film) {
        const pulse = 0.5 + 0.5 * Math.sin(animFrame * 0.15);
        ctx.save();
        ctx.translate(film.x, film.y);
        ctx.rotate(toRad(film.angle));
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
        grad.addColorStop(0, `rgba(255,179,0,${0.4 * pulse})`);
        grad.addColorStop(1, 'rgba(255,179,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-40, -40, 80, 80);

        // Animated fringes
        ctx.strokeStyle = `rgba(255,220,0,${0.5 * pulse})`;
        ctx.lineWidth = 1;
        const fringeSpacing = 6;
        for (let fi = -30; fi < 30; fi += fringeSpacing) {
          const offset = (animFrame % fringeSpacing) / fringeSpacing * fringeSpacing;
          ctx.beginPath();
          ctx.moveTo(-film.height / 2, fi + offset);
          ctx.lineTo(film.height / 2, fi + offset);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }, [components, rays, interferenceInfo, animFrame]);

  // Draw palette canvas
  useEffect(() => {
    const canvas = paletteRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, PALETTE_W, CANVAS_H);
    ctx.fillStyle = '#060B18';
    ctx.fillRect(0, 0, PALETTE_W, CANVAS_H);
    ctx.strokeStyle = '#1E3A5F';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PALETTE_W - 0.5, 0);
    ctx.lineTo(PALETTE_W - 0.5, CANVAS_H);
    ctx.stroke();

    ctx.fillStyle = '#90A4AE';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ПАЛИТРА', PALETTE_W / 2, 14);

    PALETTE_TYPES.forEach((type, i) => {
      const cy = 40 + i * 80;
      // Hover zone bg
      ctx.fillStyle = '#0D1526';
      ctx.beginPath();
      ctx.roundRect(6, cy - 26, PALETTE_W - 12, 52, 6);
      ctx.fill();
      ctx.strokeStyle = '#1E3A5F';
      ctx.lineWidth = 1;
      ctx.stroke();

      drawPaletteIcon(ctx, type, PALETTE_W / 2, cy);

      ctx.fillStyle = '#90A4AE';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(PALETTE_LABELS[type], PALETTE_W / 2, cy + 22);
    });
  }, []);

  // Pointer handlers for main canvas
  const getTableCoords = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * ((CANVAS_W - PALETTE_W) / rect.width),
      y: (e.clientY - rect.top) * (CANVAS_H / rect.height),
    };
  }, []);

  const findComponentAt = useCallback((x: number, y: number): OpticalComponent | null => {
    for (let i = components.length - 1; i >= 0; i--) {
      const comp = components[i];
      const rad = toRad(comp.angle);
      const cos = Math.cos(-rad);
      const sin = Math.sin(-rad);
      const lx = cos * (x - comp.x) - sin * (y - comp.y);
      const ly = sin * (x - comp.x) + cos * (y - comp.y);
      if (Math.abs(lx) <= comp.width / 2 + 8 && Math.abs(ly) <= comp.height / 2 + 8) {
        return comp;
      }
    }
    return null;
  }, [components]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getTableCoords(e);
    const comp = findComponentAt(x, y);
    if (comp) {
      setDragging(comp.id);
      setDragOffset({ x: x - comp.x, y: y - comp.y });
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    }
  }, [getTableCoords, findComponentAt]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const { x, y } = getTableCoords(e);
    setComponents(prev => prev.map(c =>
      c.id === dragging ? { ...c, x: x - dragOffset.x, y: y - dragOffset.y } : c
    ));
  }, [dragging, dragOffset, getTableCoords]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) * ((CANVAS_W - PALETTE_W) / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_H / rect.height);
    const comp = findComponentAt(x, y);
    if (comp) {
      const delta = e.deltaY > 0 ? 5 : -5;
      setComponents(prev => prev.map(c =>
        c.id === comp.id ? { ...c, angle: (c.angle + delta + 360) % 360 } : c
      ));
    }
  }, [findComponentAt]);

  // Palette click — add component to center of table
  const handlePaletteClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const y = (e.clientY - rect.top) * (CANVAS_H / rect.height);
    const idx = Math.floor((y - 14) / 80);
    if (idx >= 0 && idx < PALETTE_TYPES.length) {
      const type = PALETTE_TYPES[idx];
      const tableW = CANVAS_W - PALETTE_W;
      setComponents(prev => [...prev, {
        id: makeId(),
        type,
        x: tableW / 2,
        y: CANVAS_H / 2,
        angle: 0,
        ...defaultSize(type),
      }]);
    }
  }, []);

  const tutorialDone = TUTORIAL_STEPS.map(step =>
    step.done(components, interferenceInfo.hasInterference)
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--accent-cyan)' }}>
          {t.tableTitle[lang]}
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t.tableSubtitle[lang]}
        </p>
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setComponents(makeStandardPreset())}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: '#00E5FF22', border: '1px solid #00E5FF66', color: '#00E5FF' }}
        >
          {t.presetStandard[lang]}
        </button>
        <button
          onClick={() => setComponents([])}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: '#1E3A5F44', border: '1px solid #1E3A5F', color: '#90A4AE' }}
        >
          {t.presetEmpty[lang]}
        </button>
        <button
          onClick={() => setComponents(makeErrorPreset())}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: '#FF444422', border: '1px solid #FF444466', color: '#FF6666' }}
        >
          {t.presetError[lang]}
        </button>
        <span className="ml-auto text-xs self-center" style={{ color: '#90A4AE' }}>
          Колесо мыши = вращение | Перетащите для перемещения
        </span>
      </div>

      {/* Main layout: palette + table + info panel */}
      <div className="flex gap-4 flex-wrap">
        {/* Canvas area */}
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border-color)' }}>
          <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H }}>
            {/* Palette canvas */}
            <canvas
              ref={paletteRef}
              width={PALETTE_W}
              height={CANVAS_H}
              onClick={handlePaletteClick}
              style={{
                position: 'absolute', left: 0, top: 0,
                cursor: 'pointer',
                borderRadius: '12px 0 0 12px',
              }}
            />
            {/* Table canvas */}
            <canvas
              ref={canvasRef}
              width={CANVAS_W - PALETTE_W}
              height={CANVAS_H}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onWheel={handleWheel}
              style={{
                position: 'absolute', left: PALETTE_W, top: 0,
                cursor: dragging ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
            />
          </div>
        </div>

        {/* Info panel */}
        <div
          className="flex-1 min-w-[200px] rounded-xl p-4 space-y-3"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
        >
          <div className="font-bold text-sm" style={{ color: 'var(--text-secondary)' }}>
            Статус голограммы
          </div>
          <div
            className="p-3 rounded-lg text-sm font-medium"
            style={{
              background: interferenceInfo.hasInterference ? '#00880022' : '#88000022',
              border: `1px solid ${interferenceInfo.hasInterference ? '#00FF8866' : '#FF444466'}`,
              color: interferenceInfo.hasInterference ? '#69F0AE' : '#FF6666',
            }}
          >
            {interferenceInfo.hasInterference ? t.interferenceYes[lang] : t.interferenceNo[lang]}
          </div>

          {interferenceInfo.hasInterference && (
            <div className="space-y-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
              <div>
                <span style={{ color: '#90A4AE' }}>θ = </span>
                <span style={{ color: '#00E5FF' }}>{interferenceInfo.theta.toFixed(1)}°</span>
              </div>
              <div>
                <span style={{ color: '#90A4AE' }}>d = </span>
                <span style={{ color: '#FFB300' }}>
                  {isFinite(interferenceInfo.d_nm) ? interferenceInfo.d_nm.toFixed(1) : '∞'} нм
                </span>
              </div>
              <div>
                <span style={{ color: '#90A4AE' }}>N = </span>
                <span style={{ color: '#9C27B0' }}>
                  {isFinite(interferenceInfo.N) ? interferenceInfo.N.toFixed(0) : '0'} лин/мм
                </span>
              </div>
            </div>
          )}

          <div className="pt-2 text-xs space-y-1" style={{ color: '#90A4AE', borderTop: '1px solid var(--border-color)' }}>
            <div>Компонентов: <span style={{ color: '#E8EAF6' }}>{components.length}</span></div>
            <div>Лучей: <span style={{ color: '#E8EAF6' }}>{rays.length}</span></div>
            <div>Попаданий в плёнку: <span style={{ color: '#E8EAF6' }}>{filmHits.length}</span></div>
          </div>
        </div>
      </div>

      {/* Tutorial panel */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setTutorialOpen(o => !o)}
          className="w-full px-5 py-3 flex items-center justify-between text-sm font-bold"
          style={{ background: 'var(--bg-secondary)', color: 'var(--accent-amber)' }}
        >
          <span>{t.tutorialTitle[lang]}</span>
          <span style={{ color: '#90A4AE' }}>{tutorialOpen ? '▲' : '▼'}</span>
        </button>
        {tutorialOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-0" style={{ background: 'var(--bg-card)' }}>
            {TUTORIAL_STEPS.map((step, i) => (
              <div
                key={i}
                className="p-4 border-r last:border-r-0"
                style={{
                  borderColor: 'var(--border-color)',
                  borderBottom: '1px solid var(--border-color)',
                  background: tutorialDone[i] ? '#003322' : 'transparent',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      background: tutorialDone[i] ? '#00FF88' : '#1E3A5F',
                      color: tutorialDone[i] ? '#001a0d' : '#90A4AE',
                    }}
                  >
                    {tutorialDone[i] ? '✓' : i + 1}
                  </span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: tutorialDone[i] ? '#69F0AE' : 'var(--text-primary)' }}
                  >
                    {step.title}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
