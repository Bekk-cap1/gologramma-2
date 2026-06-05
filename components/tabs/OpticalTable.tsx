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

  // Selection border
  if (selected) {
    ctx.save();
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.rect(-(hw + 6), -(hh + 6), comp.width + 12, comp.height + 12);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Rotation handle — small circle at top of component
    ctx.beginPath();
    ctx.arc(0, -(hh + 14), 6, 0, Math.PI * 2);
    ctx.fillStyle = '#00E5FF';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Angle label below component
    ctx.fillStyle = 'rgba(0,229,255,0.7)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${Math.round(comp.angle)}°`, 0, hh + 18);
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
  skipId?: string; // skip the component we just interacted with (avoid re-entry)
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
      if (comp.id === src.skipId) continue; // skip the component we just exited
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
          skipId: comp.id,
        });
        // Reflected ray (perpendicular, 50% intensity) — reflect off diagonal (45°)
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
          skipId: comp.id,
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
        const mnx = -ey / len;
        const mny = ex / len;
        const mref = reflect(src.dx, src.dy, mnx, mny);
        queue.push({
          x: hx + mref.dx * 2, y: hy + mref.dy * 2,
          dx: mref.dx, dy: mref.dy,
          color: src.color,
          rayType: src.rayType,
          intensity: src.intensity * 0.95,
          bounces: src.bounces + 1,
          skipId: comp.id,
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
            skipId: comp.id,
          });
        }
        break;
      }
      case 'object': {
        // Scatter 7 rays toward film (diffuse object wave)
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
            skipId: comp.id,
          });
        }
        // Also transmit partial beam through the object (needed for Gabor inline hologram)
        queue.push({
          x: hx + src.dx * 2, y: hy + src.dy * 2,
          dx: src.dx, dy: src.dy,
          color: src.color,
          rayType: src.rayType,
          intensity: src.intensity * 0.35,
          bounces: src.bounces + 1,
          skipId: comp.id,
        });
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

function getPaletteLabels(lang: import("@/lib/translations").Lang): Record<ComponentType, string> {
  return {
    laser:        t.paletteLaser[lang],
    beamsplitter: t.paletteBS[lang],
    mirror:       t.paletteMirror[lang],
    lens:         t.paletteLens[lang],
    film:         t.paletteFilm[lang],
    object:       t.paletteObject[lang],
  };
}

function getTutorialSteps(lang: import("@/lib/translations").Lang) {
  return [
    {
      title: t.tutStep1title[lang],
      desc:  t.tutStep1desc[lang],
      done:  (comps: OpticalComponent[], _: boolean) => comps.some(c => c.type === 'laser'),
    },
    {
      title: t.tutStep2title[lang],
      desc:  t.tutStep2desc[lang],
      done:  (comps: OpticalComponent[], _: boolean) => comps.some(c => c.type === 'beamsplitter'),
    },
    {
      title: t.tutStep3title[lang],
      desc:  t.tutStep3desc[lang],
      done:  (comps: OpticalComponent[], _: boolean) => comps.some(c => c.type === 'film'),
    },
    {
      title: t.tutStep4title[lang],
      desc:  t.tutStep4desc[lang],
      done:  (comps: OpticalComponent[], _: boolean) => comps.some(c => c.type === 'object'),
    },
    {
      title: t.tutStep5title[lang],
      desc:  t.tutStep5desc[lang],
      done:  (_: OpticalComponent[], interferenceOnFilm: boolean) => interferenceOnFilm,
    },
  ];
}

function makeStandardPreset(): OpticalComponent[] {
  // Leith-Upatnieks off-axis holography:
  // BS(220,250,90) → transmitted=reference RIGHT at y=250, reflected=object UP
  // Object arm: BS→UP→mirror(220,130,45°)→RIGHT at y≈136→object(400,130)→scatter→film
  // Film(590,200,h=160) spans y=120..280, catches reference at y=250 AND scattered rays from y=130
  return [
    { id: makeId(), type: 'laser',        x: 80,  y: 250, angle: 0,  width: 60, height: 28 },
    { id: makeId(), type: 'beamsplitter', x: 220, y: 250, angle: 90, width: 28, height: 28 },
    { id: makeId(), type: 'mirror',       x: 220, y: 130, angle: 45, width: 8,  height: 50 },
    { id: makeId(), type: 'object',       x: 400, y: 130, angle: 0,  width: 30, height: 30 },
    { id: makeId(), type: 'film',         x: 590, y: 200, angle: 0,  width: 8,  height: 160 },
  ];
}

function makeErrorPreset(): OpticalComponent[] {
  return [
    { id: makeId(), type: 'laser', x: 80, y: 275, angle: 0, width: 60, height: 28 },
    { id: makeId(), type: 'object', x: 300, y: 275, angle: 0, width: 30, height: 30 },
    { id: makeId(), type: 'film', x: 500, y: 275, angle: 90, width: 8, height: 60 },
  ];
}

// Rectangle — object goes UP→mirror→RIGHT, reference goes RIGHT→mirror→UP, both hit tall film
function makeRectanglePreset(): OpticalComponent[] {
  // mirror1(210,150,45): object arm UP→RIGHT at y≈156
  // mirror2(530,310,45): reference arm RIGHT→UP at x=530
  // film(530,200,h=160): spans y=120..280, catches reference going UP and scattered object rays
  return [
    { id: makeId(), type: 'laser',        x: 80,  y: 310, angle: 0,  width: 60, height: 28 },
    { id: makeId(), type: 'beamsplitter', x: 210, y: 310, angle: 90, width: 28, height: 28 },
    { id: makeId(), type: 'mirror',       x: 210, y: 150, angle: 45, width: 8,  height: 54 },
    { id: makeId(), type: 'mirror',       x: 530, y: 310, angle: 45, width: 8,  height: 54 },
    { id: makeId(), type: 'object',       x: 380, y: 150, angle: 0,  width: 30, height: 30 },
    { id: makeId(), type: 'film',         x: 530, y: 200, angle: 0,  width: 8,  height: 160 },
  ];
}

// Triangle — object UP→RIGHT→object→scatter→film, reference straight to film
function makeTrianglePreset(): OpticalComponent[] {
  return [
    { id: makeId(), type: 'laser',        x: 80,  y: 270, angle: 0,  width: 60, height: 28 },
    { id: makeId(), type: 'beamsplitter', x: 210, y: 270, angle: 90, width: 28, height: 28 },
    { id: makeId(), type: 'mirror',       x: 210, y: 140, angle: 45, width: 8,  height: 54 },
    { id: makeId(), type: 'object',       x: 400, y: 140, angle: 0,  width: 30, height: 30 },
    { id: makeId(), type: 'film',         x: 590, y: 210, angle: 0,  width: 8,  height: 160 },
  ];
}

// Gabor (in-line) — laser→lens→object: transmitted beam=reference, scattered=object wave → interference
function makeGaborPreset(): OpticalComponent[] {
  return [
    { id: makeId(), type: 'laser',  x: 70,  y: 275, angle: 0,  width: 60, height: 28 },
    { id: makeId(), type: 'lens',   x: 200, y: 275, angle: 0,  width: 16, height: 44 },
    { id: makeId(), type: 'object', x: 380, y: 275, angle: 0,  width: 30, height: 30 },
    { id: makeId(), type: 'film',   x: 570, y: 275, angle: 0,  width: 8,  height: 120 },
  ];
}

// Expanded — lenses in both arms for beam expansion, tall film catches reference + object scatter
function makeExpandedPreset(): OpticalComponent[] {
  return [
    { id: makeId(), type: 'laser',        x: 80,  y: 270, angle: 0,  width: 60, height: 28 },
    { id: makeId(), type: 'beamsplitter', x: 200, y: 270, angle: 90, width: 28, height: 28 },
    { id: makeId(), type: 'mirror',       x: 200, y: 140, angle: 45, width: 8,  height: 54 },
    { id: makeId(), type: 'lens',         x: 360, y: 140, angle: 0,  width: 16, height: 44 },
    { id: makeId(), type: 'lens',         x: 350, y: 270, angle: 0,  width: 16, height: 44 },
    { id: makeId(), type: 'object',       x: 480, y: 140, angle: 0,  width: 30, height: 30 },
    { id: makeId(), type: 'film',         x: 620, y: 210, angle: 0,  width: 8,  height: 160 },
  ];
}

const CANVAS_W = 800;
const CANVAS_H = 550;
const PALETTE_W = 90;

type HologramObject = 'cube' | 'sphere' | 'pyramid';
const HOLO_OBJECTS_BASE: { id: HologramObject; nameKey: 'holoCube' | 'holoSphere' | 'holoPyramid'; icon: string }[] = [
  { id: 'cube',    nameKey: 'holoCube',    icon: '⬜' },
  { id: 'sphere',  nameKey: 'holoSphere',  icon: '⚪' },
  { id: 'pyramid', nameKey: 'holoPyramid', icon: '🔺' },
];

function drawHologramPreview(
  canvas: HTMLCanvasElement,
  object: HologramObject,
  angle: number,
  quality: 'good' | 'blurry' | 'fail'
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#000814';
  ctx.fillRect(0, 0, W, H);

  if (quality === 'fail') {
    ctx.fillStyle = '#2a3a4a';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Голограмма', W / 2, H / 2 - 10);
    ctx.fillText('не записана', W / 2, H / 2 + 10);
    return;
  }

  const alpha = quality === 'good' ? 0.85 : 0.3;
  ctx.strokeStyle = `rgba(0,255,136,${alpha})`;
  ctx.lineWidth = quality === 'good' ? 1.5 : 1;
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = quality === 'good' ? 6 : 2;

  const cx = W / 2, cy = H / 2;
  const sc = W * 0.32;

  const proj = (x: number, y: number, z: number): [number, number] => {
    const rx = x * Math.cos(angle) + z * Math.sin(angle);
    const ry = y;
    const rz = -x * Math.sin(angle) + z * Math.cos(angle);
    const d = 2.2 - rz * 0.3;
    return [cx + (rx * sc) / d, cy - (ry * sc) / d];
  };

  const line = (a: [number, number], b: [number, number]) => {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  };

  if (object === 'cube') {
    const v = [
      [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
      [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
    ].map(([x,y,z]) => proj(x*0.52, y*0.52, z*0.52));
    [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]
      .forEach(([a,b]) => line(v[a], v[b]));
  }

  if (object === 'sphere') {
    for (let c = 0; c < 3; c++) {
      const tilt = c * Math.PI / 3;
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const t = (i / 48) * Math.PI * 2;
        const [px, py] = proj(
          Math.cos(t) * 0.52,
          Math.sin(t) * Math.cos(tilt) * 0.52,
          Math.sin(t) * Math.sin(tilt) * 0.52
        );
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  if (object === 'pyramid') {
    const base = [[-0.5,0.35,-0.5],[0.5,0.35,-0.5],[0.5,0.35,0.5],[-0.5,0.35,0.5]]
      .map(([x,y,z]) => proj(x, y, z));
    const apex = proj(0, -0.5, 0);
    base.forEach((b, i) => { line(b, base[(i+1)%4]); line(b, apex); });
  }

  ctx.shadowBlur = 0;
}

export default function OpticalTable() {
  const { lang } = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef<HTMLCanvasElement>(null);
  const fringeCanvasRef = useRef<HTMLCanvasElement>(null);
  const holoCanvasRef = useRef<HTMLCanvasElement>(null);
  const holoAngleRef = useRef(0);

  const [components, setComponents] = useState<OpticalComponent[]>(makeStandardPreset());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [pointerDownPos, setPointerDownPos] = useState<{ x: number; y: number } | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(true);
  const [animFrame, setAnimFrame] = useState(0);
  const [selectedObject, setSelectedObject] = useState<HologramObject>('cube');

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

  // Hologram preview animation
  const holoRafRef = useRef<number>(0);
  useEffect(() => {
    let running = true;
    const refLen = rays.filter(r => r.rayType === 'reference').reduce((s,r) => s + Math.hypot(r.x2-r.x1,r.y2-r.y1), 0);
    const objLen = rays.filter(r => r.rayType === 'object').reduce((s,r) => s + Math.hypot(r.x2-r.x1,r.y2-r.y1), 0);
    const pOk = Math.abs(refLen - objLen) < 40000;
    const quality: 'good' | 'blurry' | 'fail' =
      interferenceInfo.hasInterference ? (pOk ? 'good' : 'blurry') : 'fail';
    const tick = () => {
      if (!running) return;
      holoAngleRef.current += 0.012;
      const canvas = holoCanvasRef.current;
      if (canvas) drawHologramPreview(canvas, selectedObject, holoAngleRef.current, quality);
      holoRafRef.current = requestAnimationFrame(tick);
    };
    holoRafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(holoRafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObject, interferenceInfo.hasInterference, rays]);

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
      drawComponent(ctx, comp, comp.id === selectedId);
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
  }, [components, rays, interferenceInfo, animFrame, selectedId]);

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
    ctx.fillText(lang === 'uz' ? 'PALITRA' : 'ПАЛИТРА', PALETTE_W / 2, 14);

    const paletteLabels = getPaletteLabels(lang);
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
      ctx.fillText(paletteLabels[type], PALETTE_W / 2, cy + 22);
    });
  }, [lang]);

  // Draw fringe preview mini-canvas — proper sinusoidal I(y) = (1+cos(2πy/T))/2
  useEffect(() => {
    const canvas = fringeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 200, H = 120;
    ctx.fillStyle = '#060B18';
    ctx.fillRect(0, 0, W, H);

    if (!interferenceInfo.hasInterference || !isFinite(interferenceInfo.d_nm) || interferenceInfo.d_nm <= 0) {
      ctx.fillStyle = '#546E7A';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('— нет интерференции —', W / 2, H / 2 - 8);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#37474F';
      ctx.fillText('нужны оба луча на плёнке', W / 2, H / 2 + 10);
      return;
    }

    // Map d_nm → pixel period: show 6-16 fringes regardless of d
    const targetFringes = Math.min(16, Math.max(4, Math.round(6000 / interferenceInfo.d_nm)));
    const periodPx = H / targetFringes;
    // Animated phase offset
    const phase = (animFrame / 120) * Math.PI * 2;

    // Pixel-accurate sinusoidal pattern via ImageData
    const img = ctx.createImageData(W, H);
    for (let py = 0; py < H; py++) {
      // I = (1 + cos(2π·y/T + phase)) / 2  → range [0,1]
      const intensity = 0.5 + 0.5 * Math.cos((2 * Math.PI * py) / periodPx + phase);
      // Amber colour: R=255, G=179, B=0, scaled by intensity
      const r = Math.round(255 * intensity);
      const g = Math.round(179 * intensity);
      const b = 0;
      const a = Math.round(200 * intensity + 30); // dark lines slightly visible
      for (let px = 0; px < W; px++) {
        const i4 = (py * W + px) * 4;
        img.data[i4]     = r;
        img.data[i4 + 1] = g;
        img.data[i4 + 2] = b;
        img.data[i4 + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Scale bar: show actual fringe period label
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 18, W, 18);
    ctx.fillStyle = '#FFB300';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`d = ${interferenceInfo.d_nm.toFixed(0)} нм  ·  N = ${interferenceInfo.N.toFixed(0)} лин/мм`, W / 2, H - 9);
  }, [interferenceInfo, animFrame]);

  // Helper: get canvas-space coords for the rotation handle of a component (world coords)
  const getRotationHandlePos = useCallback((comp: OpticalComponent): { x: number; y: number } => {
    const rad = toRad(comp.angle);
    const hh = comp.height / 2;
    // Handle is at local (0, -(hh+14)), rotate to world
    const lx = 0;
    const ly = -(hh + 14);
    return {
      x: comp.x + lx * Math.cos(rad) - ly * Math.sin(rad),
      y: comp.y + lx * Math.sin(rad) + ly * Math.cos(rad),
    };
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
    setPointerDownPos({ x, y });

    // Check if clicking on rotation handle of selected component
    if (selectedId) {
      const selComp = components.find(c => c.id === selectedId);
      if (selComp) {
        const handlePos = getRotationHandlePos(selComp);
        const dist = Math.hypot(x - handlePos.x, y - handlePos.y);
        if (dist <= 10) {
          setRotatingId(selectedId);
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    const comp = findComponentAt(x, y);
    if (comp) {
      setDragging(comp.id);
      setDragOffset({ x: x - comp.x, y: y - comp.y });
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    }
  }, [getTableCoords, findComponentAt, selectedId, components, getRotationHandlePos]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getTableCoords(e);

    if (rotatingId) {
      const comp = components.find(c => c.id === rotatingId);
      if (comp) {
        const angle = Math.atan2(y - comp.y, x - comp.x) * 180 / Math.PI;
        setComponents(prev => prev.map(c =>
          c.id === rotatingId ? { ...c, angle: (angle + 90 + 360) % 360 } : c
        ));
      }
      return;
    }

    if (!dragging) return;
    setComponents(prev => prev.map(c =>
      c.id === dragging ? { ...c, x: x - dragOffset.x, y: y - dragOffset.y } : c
    ));
  }, [dragging, dragOffset, getTableCoords, rotatingId, components]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (rotatingId) {
      setRotatingId(null);
      return;
    }

    if (pointerDownPos) {
      const { x, y } = getTableCoords(e);
      const dist = Math.hypot(x - pointerDownPos.x, y - pointerDownPos.y);
      if (dist < 4) {
        // It was a click — handle selection
        const comp = findComponentAt(x, y);
        if (comp) {
          setSelectedId(comp.id);
        } else {
          setSelectedId(null);
        }
      }
    }

    setDragging(null);
    setPointerDownPos(null);
  }, [rotatingId, pointerDownPos, getTableCoords, findComponentAt]);

  // Keep a ref to current components so the native wheel handler can access them
  const componentsRef = useRef<OpticalComponent[]>(components);
  useEffect(() => { componentsRef.current = components; }, [components]);

  // Native (non-passive) wheel handler to enable preventDefault and rotation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * ((CANVAS_W - PALETTE_W) / rect.width);
      const my = (e.clientY - rect.top) * (CANVAS_H / rect.height);

      // Find component under cursor
      const currentComps = componentsRef.current;
      let hit: OpticalComponent | null = null;
      for (let i = currentComps.length - 1; i >= 0; i--) {
        const c = currentComps[i];
        const dx = mx - c.x;
        const dy = my - c.y;
        const hw = (c.width / 2) + 10;
        const hh = (c.height / 2) + 10;
        if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
          hit = c;
          break;
        }
      }

      if (hit) {
        const delta = e.deltaY > 0 ? 5 : -5;
        setComponents(prev => prev.map(c =>
          c.id === hit!.id ? { ...c, angle: (c.angle + delta + 360) % 360 } : c
        ));
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // Auto-arrange: snap existing components to standard Leith-Upatnieks layout
  const handleAutoArrange = useCallback(() => {
    setComponents(prev => {
      const laser  = prev.find(c => c.type === 'laser');
      const bs     = prev.find(c => c.type === 'beamsplitter');
      const mirrors = prev.filter(c => c.type === 'mirror');
      const obj    = prev.find(c => c.type === 'object');
      const film   = prev.find(c => c.type === 'film');
      if (!laser || !film) return makeStandardPreset(); // fallback to full preset
      const pos = (id: string, x: number, y: number, angle: number) =>
        prev.map(c => c.id === id ? { ...c, x, y, angle } : c);
      let next = [...prev];
      next = next.map(c => c.id === laser.id  ? { ...c, x: 80,  y: 230, angle: 0  } : c);
      if (bs)       next = next.map(c => c.id === bs.id        ? { ...c, x: 210, y: 230, angle: 90 } : c);
      if (mirrors[0]) next = next.map(c => c.id === mirrors[0].id ? { ...c, x: 210, y: 130, angle: 45 } : c);
      if (obj)      next = next.map(c => c.id === obj.id       ? { ...c, x: 400, y: 130, angle: 0  } : c);
      next = next.map(c => c.id === film.id   ? { ...c, x: 620, y: 230, angle: 0  } : c);
      void pos; // suppress unused warning
      return next;
    });
    setSelectedId(null);
  }, []);

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

  // Compute path lengths for simulation panel
  const refLength = rays
    .filter(r => r.rayType === 'reference')
    .reduce((sum, r) => sum + Math.hypot(r.x2 - r.x1, r.y2 - r.y1), 0);
  const objLength = rays
    .filter(r => r.rayType === 'object')
    .reduce((sum, r) => sum + Math.hypot(r.x2 - r.x1, r.y2 - r.y1), 0);
  const pathDiff = Math.abs(refLength - objLength);
  const coherenceLength = 40000;
  const pathOk = pathDiff < coherenceLength;

  const holoObjects = HOLO_OBJECTS_BASE.map(o => ({ ...o, name: t[o.nameKey][lang] }));

  // Setup checklist
  const checks = [
    { label: t.checkLaser[lang],  ok: components.some(c => c.type === 'laser') },
    { label: t.checkBS[lang],     ok: components.some(c => c.type === 'beamsplitter') },
    { label: t.checkMirror[lang], ok: components.some(c => c.type === 'mirror') },
    { label: t.checkLens[lang],   ok: components.some(c => c.type === 'lens') },
    { label: t.checkObject[lang], ok: components.some(c => c.type === 'object') },
    { label: t.checkFilm[lang],   ok: components.some(c => c.type === 'film') },
    { label: t.checkInterf[lang], ok: interferenceInfo.hasInterference },
  ];

  const tutorialSteps = getTutorialSteps(lang);
  const tutorialDone = tutorialSteps.map(step =>
    step.done(components, interferenceInfo.hasInterference)
  );

  // Cursor logic
  let canvasCursor = 'grab';
  if (dragging) canvasCursor = 'grabbing';
  if (rotatingId) canvasCursor = 'crosshair';

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
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => { setComponents(makeStandardPreset()); setSelectedId(null); }}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: '#00E5FF22', border: '1px solid #00E5FF66', color: '#00E5FF' }}
        >
          {t.presetStandard[lang]}
        </button>
        <button
          onClick={() => { setComponents([]); setSelectedId(null); }}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: '#1E3A5F44', border: '1px solid #1E3A5F', color: '#90A4AE' }}
        >
          {t.presetEmpty[lang]}
        </button>
        <button
          onClick={() => { setComponents(makeErrorPreset()); setSelectedId(null); }}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: '#FF444422', border: '1px solid #FF444466', color: '#FF6666' }}
        >
          {t.presetError[lang]}
        </button>
        <button
          onClick={handleAutoArrange}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: '#4CAF5022', border: '1px solid #4CAF5066', color: '#69F0AE' }}
        >
          {t.autoArrange[lang]}
        </button>
        <span className="ml-auto text-xs self-center" style={{ color: '#546E7A' }}>
          {t.dragHint[lang]}
        </span>
      </div>

      {/* Example model presets */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-semibold shrink-0" style={{ color: '#546E7A' }}>
          {t.examplesLabel[lang]}
        </span>
        {([
          { fn: makeRectanglePreset, label: t.presetRect[lang],     icon: '▭', color: '#9C27B0' },
          { fn: makeTrianglePreset,  label: t.presetTriangle[lang],  icon: '△', color: '#FF9800' },
          { fn: makeGaborPreset,     label: t.presetGabor[lang],     icon: '⟶', color: '#00BCD4' },
          { fn: makeExpandedPreset,  label: t.presetExpanded[lang],  icon: '⊕', color: '#4CAF50' },
        ] as const).map(({ fn, label, icon, color }) => (
          <button
            key={label}
            onClick={() => { setComponents(fn()); setSelectedId(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-90"
            style={{ background: `${color}18`, border: `1px solid ${color}55`, color }}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
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
              style={{
                position: 'absolute', left: PALETTE_W, top: 0,
                cursor: canvasCursor,
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
            {t.holoStatus[lang]}
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
                  {isFinite(interferenceInfo.d_nm) ? interferenceInfo.d_nm.toFixed(1) : '∞'} {t.nmUnit[lang]}
                </span>
              </div>
              <div>
                <span style={{ color: '#90A4AE' }}>N = </span>
                <span style={{ color: '#9C27B0' }}>
                  {isFinite(interferenceInfo.N) ? interferenceInfo.N.toFixed(0) : '0'} {t.linesPerMm[lang]}
                </span>
              </div>
            </div>
          )}

          <div className="pt-2 text-xs space-y-1" style={{ color: '#90A4AE', borderTop: '1px solid var(--border-color)' }}>
            <div>{t.componentsCount[lang]} <span style={{ color: '#E8EAF6' }}>{components.length}</span></div>
            <div>{t.raysCount[lang]} <span style={{ color: '#E8EAF6' }}>{rays.length}</span></div>
            <div>{t.filmHitsCount[lang]} <span style={{ color: '#E8EAF6' }}>{filmHits.length}</span></div>
          </div>
        </div>

        {/* Hologram result panel */}
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', minWidth: 180 }}
        >
          <div className="font-bold text-sm" style={{ color: '#9C27B0' }}>{t.holoResult[lang]}</div>

          {/* Object selector */}
          <div className="flex gap-2">
            {holoObjects.map(o => (
              <button
                key={o.id}
                onClick={() => setSelectedObject(o.id)}
                className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: selectedObject === o.id ? '#9C27B022' : 'var(--bg-card)',
                  border: `1px solid ${selectedObject === o.id ? '#9C27B0' : 'var(--border-color)'}`,
                  color: selectedObject === o.id ? '#CE93D8' : '#90A4AE',
                }}
              >
                <span className="text-lg">{o.icon}</span>
                <span>{o.name}</span>
              </button>
            ))}
          </div>

          {/* 3D preview canvas */}
          <canvas
            ref={holoCanvasRef}
            width={160} height={160}
            style={{ display: 'block', borderRadius: 8, border: '1px solid #1E3A5F', background: '#000814' }}
          />

          {/* Quality message */}
          <div className="text-xs font-medium text-center" style={{
            color: interferenceInfo.hasInterference ? (pathOk ? '#69F0AE' : '#FFB300') : '#607D8B',
          }}>
            {interferenceInfo.hasInterference
              ? (pathOk
                  ? `✓ ${holoObjects.find(o => o.id === selectedObject)?.name} — ${lang === 'uz' ? 'yozildi' : 'записан'}`
                  : t.holoBlurry[lang])
              : t.holoFail[lang]}
          </div>
        </div>
      </div>

      {/* Selection control bar */}
      {selectedId && (() => {
        const sel = components.find(c => c.id === selectedId);
        if (!sel) return null;
        return (
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl flex-wrap"
            style={{ background: 'var(--bg-secondary)', border: '1px solid #00E5FF44' }}>

            {/* Component type label */}
            <span className="text-sm font-bold" style={{ color: '#00E5FF' }}>
              {getPaletteLabels(lang)[sel.type]}
            </span>

            {/* Angle display + input */}
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#90A4AE' }}>{t.angleLabel[lang]}</span>
              <input
                type="number"
                value={Math.round(sel.angle)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setComponents(prev => prev.map(c =>
                    c.id === selectedId ? { ...c, angle: ((v % 360) + 360) % 360 } : c
                  ));
                }}
                className="w-16 text-center text-sm font-mono px-2 py-1 rounded"
                style={{ background: '#111827', border: '1px solid #1E3A5F', color: '#00E5FF' }}
              />
              <span className="text-xs" style={{ color: '#90A4AE' }}>°</span>
            </div>

            {/* Step buttons */}
            {([-45, -15, -5, -1, 1, 5, 15, 45] as const).map(delta => (
              <button key={delta}
                onClick={() => setComponents(prev => prev.map(c =>
                  c.id === selectedId ? { ...c, angle: ((c.angle + delta) % 360 + 360) % 360 } : c
                ))}
                className="px-2 py-1 text-xs rounded font-mono transition-colors hover:opacity-80"
                style={{
                  background: delta < 0 ? '#1E3A5F' : '#1a2a1a',
                  border: `1px solid ${delta < 0 ? '#2E4A6F' : '#2a3a2a'}`,
                  color: delta < 0 ? '#90CEFF' : '#90EAA0',
                }}
              >
                {delta > 0 ? '+' : ''}{delta}°
              </button>
            ))}

            {/* Snap to common angles */}
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: '#90A4AE' }}>{t.snapsLabel[lang]}</span>
              {[0, 45, 90, 135, 180].map(a => (
                <button key={a}
                  onClick={() => setComponents(prev => prev.map(c =>
                    c.id === selectedId ? { ...c, angle: a } : c
                  ))}
                  className="px-2 py-1 text-xs rounded font-mono"
                  style={{ background: '#0D1526', border: '1px solid #1E3A5F', color: '#FFB300' }}
                >
                  {a}°
                </button>
              ))}
            </div>

            {/* Delete button */}
            <button
              onClick={() => {
                setComponents(prev => prev.filter(c => c.id !== selectedId));
                setSelectedId(null);
              }}
              className="ml-auto px-3 py-1 text-xs rounded"
              style={{ background: '#330000', border: '1px solid #FF444444', color: '#FF6666' }}
            >
              {t.deleteBtn[lang]}
            </button>
          </div>
        );
      })()}

      {/* Live Simulation Panel */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <div className="font-bold text-sm" style={{ color: 'var(--accent-cyan)' }}>
          {t.liveSimTitle[lang]}
        </div>
        <div className="flex gap-4 flex-wrap">

          {/* Section A — Beam path quality meter */}
          <div className="flex-1 min-w-45 rounded-lg p-3 space-y-1"
            style={{ background: '#060B18', border: '1px solid #1E3A5F' }}>
            <div className="text-xs font-bold mb-2" style={{ color: '#90A4AE' }}>
              {t.optPathLengths[lang]}
            </div>
            <div className="font-mono text-xs space-y-1">
              <div>
                <span style={{ color: '#90A4AE' }}>{t.refPath[lang]} </span>
                <span style={{ color: '#00E5FF' }}>{refLength.toFixed(0)} {t.pixUnit[lang]}</span>
              </div>
              <div>
                <span style={{ color: '#90A4AE' }}>{t.objPath[lang]} </span>
                <span style={{ color: '#9C27B0' }}>{objLength.toFixed(0)} {t.pixUnit[lang]}</span>
              </div>
              <div>
                <span style={{ color: '#90A4AE' }}>{t.pathDiffLabel[lang]} </span>
                <span style={{ color: pathOk ? '#69F0AE' : '#FF6666' }}>{pathDiff.toFixed(0)} {t.pixUnit[lang]}</span>
              </div>
              <div className="pt-1" style={{ color: pathOk ? '#69F0AE' : '#FF6666' }}>
                {pathOk ? t.pathOkMsg[lang] : t.pathFailMsg[lang]}
              </div>
            </div>
          </div>

          {/* Section B — Interference fringe preview */}
          <div className="rounded-lg p-3 space-y-2"
            style={{ background: '#060B18', border: '1px solid #1E3A5F' }}>
            <div className="text-xs font-bold" style={{ color: '#90A4AE' }}>
              {t.fringePreview[lang]}
            </div>
            <canvas
              ref={fringeCanvasRef}
              width={200}
              height={120}
              style={{ display: 'block', borderRadius: 6, border: '1px solid #1E3A5F' }}
            />
            <div className="text-xs font-mono text-center" style={{ color: '#FFB300' }}>
              {interferenceInfo.hasInterference && isFinite(interferenceInfo.d_nm)
                ? `d = ${interferenceInfo.d_nm.toFixed(0)} ${t.nmUnit[lang]} | N = ${interferenceInfo.N.toFixed(0)} ${t.linesPerMm[lang]}`
                : t.noInterference[lang]}
            </div>
          </div>

          {/* Section C — Setup checklist */}
          <div className="rounded-lg p-3"
            style={{ background: '#060B18', border: '1px solid #1E3A5F', minWidth: 140 }}>
            <div className="text-xs font-bold mb-2" style={{ color: '#90A4AE' }}>
              {t.schemeComps[lang]}
            </div>
            <div className="space-y-1">
              {checks.map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2 text-xs font-mono">
                  <span style={{ color: ok ? '#69F0AE' : '#FF6666', minWidth: 12 }}>
                    {ok ? '✓' : '✗'}
                  </span>
                  <span style={{ color: ok ? '#E8EAF6' : '#607D8B' }}>{label}</span>
                </div>
              ))}
            </div>
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
            {tutorialSteps.map((step, i) => (
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
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
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
