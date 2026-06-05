"use client";

import { useState, useRef, useEffect } from "react";
import * as THREE from "three";
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";

const RECORD_ANGLE = 30;
const RECORD_LAMBDA = 632.8;

const LASER_TABLE_BASE = [
  { nameKey: null,          nameStatic: 'He-Ne',   lambda: 632.8, color: '#FF4444', dot: '🔴', viewKey: 'viewLaser0' as const, price: '$50–200'   },
  { nameKey: 'laserArgon' as const, nameStatic: null, lambda: 488, color: '#4488FF', dot: '🔵', viewKey: 'viewLaser1' as const, price: '$100–500' },
  { nameKey: null,          nameStatic: 'Nd:YAG×2', lambda: 532, color: '#44FF44', dot: '🟢', viewKey: 'viewLaser2' as const, price: '$10–50'    },
  { nameKey: 'laserDiode' as const, nameStatic: null, lambda: 405, color: '#AA44FF', dot: '🟣', viewKey: 'viewLaser3' as const, price: '$5–20'   },
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
  LASER_TABLE_BASE.forEach((row, i) => {
    const d = Math.abs(row.lambda - reconLambda);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return bestDist < 30 ? best : -1;
}

export default function ReconstructionSim() {
  const { lang } = useLang();
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rafRef = useRef<number>(0);
  const orbitRef = useRef({ theta: 0.5, phi: 0.4, radius: 7, dragging: false, lastX: 0, lastY: 0 });

  const [incidentAngle, setIncidentAngle] = useState(30);
  const [reconLambda, setReconLambda] = useState(632.8);

  const quality = getQuality(incidentAngle, reconLambda);
  const matchRow = matchingLaserRow(reconLambda);

  const qualityConfig = [
    { text: t.reconSimQuality0[lang], color: '#69F0AE', bg: '#003322', border: '#00FF8866' },
    { text: t.reconSimQuality1[lang], color: '#FFB300', bg: '#332200', border: '#FFB30066' },
    { text: t.reconSimQuality2[lang], color: '#FF6666', bg: '#330000', border: '#FF444466' },
  ][quality];

  // Three.js scene
  useEffect(() => {
    const canvas = threeCanvasRef.current;
    if (!canvas) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(800, 420);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x060B18);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Lights
    scene.add(new THREE.AmbientLight(0x334466, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    // Camera
    const camera = new THREE.PerspectiveCamera(50, 800 / 420, 0.1, 100);

    // Film plane (amber, semi-transparent)
    const filmGeo = new THREE.PlaneGeometry(0.15, 3);
    const filmMat = new THREE.MeshBasicMaterial({
      color: 0xFFB300,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const filmMesh = new THREE.Mesh(filmGeo, filmMat);
    filmMesh.position.set(0, 0, 0);
    scene.add(filmMesh);

    // Fringes on film
    const fringePoints: THREE.Vector3[] = [];
    for (let i = 0; i < 15; i++) {
      const fy = -1.4 + (i / 14) * 2.8;
      fringePoints.push(new THREE.Vector3(-0.075, fy, 0.001));
      fringePoints.push(new THREE.Vector3(0.075, fy, 0.001));
    }
    const fringeGeo = new THREE.BufferGeometry().setFromPoints(fringePoints);
    const indices: number[] = [];
    for (let i = 0; i < 15; i++) { indices.push(i * 2, i * 2 + 1); }
    fringeGeo.setIndex(indices);
    const fringeLines = new THREE.LineSegments(fringeGeo, new THREE.LineBasicMaterial({ color: 0xFFB300, opacity: 0.5, transparent: true }));
    scene.add(fringeLines);

    // Incoming laser beam (red cylinder from left)
    const incidentRad = (incidentAngle * Math.PI) / 180;
    const beamLen = 3;
    const incomingGeo = new THREE.CylinderGeometry(0.04, 0.04, beamLen, 8);
    const incomingMat = new THREE.MeshBasicMaterial({ color: 0xFF3333, transparent: true, opacity: 0.85 });
    const incomingMesh = new THREE.Mesh(incomingGeo, incomingMat);
    // Position: starts at left, aimed at film center
    incomingMesh.position.set(-beamLen / 2 * Math.cos(incidentRad), beamLen / 2 * Math.sin(incidentRad), 0);
    incomingMesh.rotation.z = -incidentRad;
    scene.add(incomingMesh);

    // Point light at beam origin (red)
    const redLight = new THREE.PointLight(0xFF3333, 1.5, 6);
    redLight.position.set(-beamLen * Math.cos(incidentRad), beamLen * Math.sin(incidentRad), 0);
    scene.add(redLight);

    // 0th order beam (gray, straight through)
    const zeroGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.5, 8);
    const zeroMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });
    const zeroMesh = new THREE.Mesh(zeroGeo, zeroMat);
    zeroMesh.position.set(1.25, 0, 0);
    zeroMesh.rotation.z = Math.PI / 2;
    scene.add(zeroMesh);

    // +1st order beam (cyan, going up-right)
    const order1Angle = (-25 + (incidentAngle - RECORD_ANGLE) * 0.5) * Math.PI / 180;
    const o1Len = 2.5;
    const o1EndX = o1Len * Math.cos(-order1Angle);
    const o1EndY = o1Len * Math.sin(-order1Angle);
    const brightness = quality === 0 ? 1.0 : quality === 1 ? 0.4 : 0.05;

    const order1Geo = new THREE.CylinderGeometry(0.04, 0.04, o1Len, 8);
    const order1Mat = new THREE.MeshBasicMaterial({ color: 0x00E5FF, transparent: true, opacity: brightness });
    const order1Mesh = new THREE.Mesh(order1Geo, order1Mat);
    order1Mesh.position.set(o1EndX / 2, o1EndY / 2, 0);
    order1Mesh.rotation.z = order1Angle + Math.PI / 2;
    scene.add(order1Mesh);

    // PointLight at +1 beam end
    const cyanLight = new THREE.PointLight(0x00E5FF, brightness * 2, 5);
    cyanLight.position.set(o1EndX, o1EndY, 0);
    scene.add(cyanLight);

    // -1st order beam (violet, going down-right)
    const orderM1Angle = (25 + (incidentAngle - RECORD_ANGLE) * 0.5) * Math.PI / 180;
    const om1Len = 2.0;
    const om1EndX = om1Len * Math.cos(-orderM1Angle);
    const om1EndY = om1Len * Math.sin(-orderM1Angle);
    const orderM1Geo = new THREE.CylinderGeometry(0.025, 0.025, om1Len, 8);
    const orderM1Mat = new THREE.MeshBasicMaterial({ color: 0x9C27B0, transparent: true, opacity: 0.2 });
    const orderM1Mesh = new THREE.Mesh(orderM1Geo, orderM1Mat);
    orderM1Mesh.position.set(om1EndX / 2, om1EndY / 2, 0);
    orderM1Mesh.rotation.z = orderM1Angle - Math.PI / 2;
    scene.add(orderM1Mesh);

    // 3D virtual image (icosahedron wireframe)
    const icoGeo = new THREE.IcosahedronGeometry(0.55, 1);
    const icoMat = new THREE.MeshBasicMaterial({ color: 0x00E5FF, wireframe: true, transparent: true, opacity: brightness });
    const icoMesh = new THREE.Mesh(icoGeo, icoMat);
    icoMesh.position.set(o1EndX, o1EndY, 0);
    scene.add(icoMesh);

    // Observer sphere (white, far right along +1 beam)
    const obsGeo = new THREE.SphereGeometry(0.15, 12, 12);
    const obsMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const obsMesh = new THREE.Mesh(obsGeo, obsMat);
    obsMesh.position.set(o1EndX + 0.5, o1EndY, 0);
    scene.add(obsMesh);

    // Mouse orbit handlers
    const handleMouseDown = (e: MouseEvent) => {
      orbitRef.current.dragging = true;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!orbitRef.current.dragging) return;
      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;
      orbitRef.current.theta -= dx * 0.01;
      orbitRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbitRef.current.phi - dy * 0.01));
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
    };
    const handleMouseUp = () => { orbitRef.current.dragging = false; };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Animation loop
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);

      // Rotate icosahedron
      icoMesh.rotation.y += 0.01;

      // Update camera from orbit
      const { theta, phi, radius } = orbitRef.current;
      camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = radius * Math.cos(phi);
      camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();
    rafRef.current = frameId;

    return () => {
      cancelAnimationFrame(frameId);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      renderer.dispose();
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    };
  }, [incidentAngle, reconLambda, quality]);

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

      {/* Section A — Interactive 3D canvas + 2D diagram */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
        <div className="overflow-x-auto">
          <canvas
            ref={threeCanvasRef}
            width={800}
            height={420}
            style={{ display: 'block', background: '#060B18', minWidth: 400, cursor: 'grab' }}
          />
        </div>

        {/* 2D physics diagram */}
        <div style={{ background: '#0A1020', borderTop: '1px solid var(--border-color)', padding: '12px 16px' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: '#90A4AE' }}>
            {lang === 'ru' ? 'Схема дифракции (вид сверху)' : 'Difraksiya sxemasi (tepadan ko\'rinish)'}
          </div>
          <svg width="100%" viewBox="0 0 760 160" style={{ display: 'block' }}>
            {/* Background */}
            <rect width="760" height="160" fill="#060B18" rx="8"/>

            {/* Film — vertical line at x=360 */}
            <line x1="360" y1="10" x2="360" y2="150" stroke="#FFB300" strokeWidth="4"/>
            {/* Film label */}
            <text x="360" y="7" textAnchor="middle" fill="#FFB300" fontSize="9" fontFamily="monospace">FILM</text>
            {/* Fringes on film */}
            {Array.from({length: 10}, (_, i) => (
              <line key={i} x1="356" y1={20 + i*13} x2="364" y2={20 + i*13} stroke="#FFB30088" strokeWidth="1.5"/>
            ))}

            {/* Incoming beam from left */}
            <line x1="40" y1="80" x2="358" y2="80" stroke="#FF4444" strokeWidth="2"/>
            <polygon points="358,76 368,80 358,84" fill="#FF4444"/>
            {/* Laser box */}
            <rect x="10" y="68" width="30" height="24" rx="3" fill="#CC222244" stroke="#FF4444" strokeWidth="1.5"/>
            <text x="25" y="82" textAnchor="middle" fill="#FF4444" fontSize="7" fontFamily="monospace">λ</text>

            {/* 0th order — straight */}
            <line x1="362" y1="80" x2="520" y2="80" stroke="#888888" strokeWidth="1.5" strokeDasharray="6,4"/>
            <text x="525" y="77" fill="#888888" fontSize="8" fontFamily="monospace">0-й</text>

            {/* +1st order beam */}
            {(() => {
              const angle1 = -(25 + (incidentAngle - 30) * 0.5);
              const rad1 = angle1 * Math.PI / 180;
              const len = 200;
              const ex = 362 + Math.cos(rad1) * len;
              const ey = 80 + Math.sin(rad1) * len;
              const bright = quality === 0 ? 1 : quality === 1 ? 0.5 : 0.15;
              return (
                <g>
                  {/* Glow */}
                  <line x1="362" y1="80" x2={ex} y2={ey} stroke={`rgba(0,229,255,${bright * 0.3})`} strokeWidth="8"/>
                  {/* Main beam */}
                  <line x1="362" y1="80" x2={ex} y2={ey} stroke={`rgba(0,229,255,${bright})`} strokeWidth="2.5"/>
                  <polygon points={`${ex-5},${ey-3} ${ex+4},${ey} ${ex-5},${ey+3}`}
                    fill={`rgba(0,229,255,${bright})`}
                    transform={`rotate(${angle1}, ${ex}, ${ey})`}/>
                  {/* 3D object at endpoint */}
                  <circle cx={ex} cy={ey} r={quality === 0 ? 12 : 7} fill="none"
                    stroke={`rgba(0,229,255,${bright})`} strokeWidth="1.5"/>
                  <text x={ex} y={ey + 22} textAnchor="middle" fill={`rgba(0,229,255,${bright})`}
                    fontSize="8" fontFamily="monospace">3D</text>
                  <text x={ex + 8} y={ey - 8} fill={`rgba(0,229,255,${bright})`}
                    fontSize="7.5" fontFamily="monospace">+1</text>
                </g>
              );
            })()}

            {/* -1st order beam */}
            {(() => {
              const angle2 = 25 + (incidentAngle - 30) * 0.5;
              const rad2 = angle2 * Math.PI / 180;
              const len = 150;
              const ex = 362 + Math.cos(rad2) * len;
              const ey = 80 + Math.sin(rad2) * len;
              return (
                <g>
                  <line x1="362" y1="80" x2={ex} y2={ey} stroke="rgba(156,39,176,0.6)" strokeWidth="1.5"/>
                  <text x={ex + 5} y={ey + 5} fill="rgba(206,147,216,0.8)" fontSize="7.5" fontFamily="monospace">-1</text>
                </g>
              );
            })()}

            {/* Observer eye */}
            <ellipse cx="720" cy="80" rx="12" ry="8" fill="none" stroke="#E8EAF6" strokeWidth="1.5"/>
            <circle cx="720" cy="80" r="4" fill="#00E5FF"/>
            <circle cx="720" cy="80" r="2" fill="#001a22"/>
            <text x="720" y="100" textAnchor="middle" fill="#90A4AE" fontSize="8" fontFamily="monospace">
              {lang === 'ru' ? 'зритель' : 'ko\'z'}
            </text>

            {/* Angle label */}
            <text x="200" y="70" fill="#FF6666" fontSize="8" fontFamily="monospace">
              θ={incidentAngle}° λ={reconLambda.toFixed(0)}нм
            </text>

            {/* Labels left/right */}
            <text x="30" y="155" fill="#90A4AE" fontSize="8" fontFamily="monospace">
              {lang === 'ru' ? '← лазер' : '← lazer'}
            </text>
            <text x="600" y="155" fill="#90A4AE" fontSize="8" fontFamily="monospace">
              {lang === 'ru' ? 'дифрагированные лучи →' : 'difraksiya nurlari →'}
            </text>
          </svg>

          {/* Explanation of where 3D comes from */}
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs" style={{ color: '#90A4AE' }}>
            <div className="rounded-lg p-2" style={{ background: '#0D1526', border: '1px solid #FF444433' }}>
              {t.diffBox1[lang]}
            </div>
            <div className="rounded-lg p-2" style={{ background: '#0D1526', border: '1px solid #00E5FF33' }}>
              {t.diffBox2[lang]}
            </div>
            <div className="rounded-lg p-2" style={{ background: '#0D1526', border: '1px solid #9C27B033' }}>
              {t.diffBox3[lang]}
            </div>
          </div>
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
                {t.incidentAngle[lang]}:{' '}
                <span style={{ color: 'var(--accent-cyan)' }}>{incidentAngle}°</span>
                {Math.abs(incidentAngle - RECORD_ANGLE) < 2 && (
                  <span className="ml-2 text-xs" style={{ color: '#69F0AE' }}>
                    {t.recordingAngleMatch[lang]}
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
                <span className="font-bold" style={{ color: '#FFB300' }}>↑ θ{lang === 'ru' ? '_записи' : '_yozish'} = {RECORD_ANGLE}°</span>
                <span>60°</span>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                {t.reconWavelength[lang]}:{' '}
                <span style={{ color: 'var(--accent-cyan)' }}>{reconLambda.toFixed(0)} {t.nmUnit[lang]}</span>
                {Math.abs(reconLambda - RECORD_LAMBDA) < 5 && (
                  <span className="ml-2 text-xs" style={{ color: '#69F0AE' }}>
                    {t.recordingLambdaMatch[lang]}
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
                <span>380 {t.nmUnit[lang]}</span>
                <span className="font-bold" style={{ color: '#FFB300' }}>↑ λ{lang === 'ru' ? '_записи' : '_yozish'} = {RECORD_LAMBDA} {t.nmUnit[lang]}</span>
                <span>780 {t.nmUnit[lang]}</span>
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
              <span className="font-bold text-sm" style={{ color: '#69F0AE' }}>{t.laserCorrect[lang]}</span>
            </div>
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>• {t.laserBullet1[lang]}</li>
              <li>• {t.laserBullet2[lang]}</li>
              <li style={{ color: '#69F0AE', fontWeight: 600 }}>• {t.laserResult3D[lang]}</li>
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
              <span className="font-bold text-sm" style={{ color: '#FF6666' }}>{t.projWrong[lang]}</span>
            </div>
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>• {t.projBullet1[lang]}</li>
              <li>• {t.projBullet2[lang]}</li>
              <li style={{ color: '#FF6666', fontWeight: 600 }}>• {t.projResult[lang]}</li>
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
              <span className="font-bold text-sm" style={{ color: '#FF6666' }}>{t.bulbWrong[lang]}</span>
            </div>
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>• {t.bulbBullet1[lang]}</li>
              <li>• {t.bulbBullet2[lang]}</li>
              <li style={{ color: '#FF6666', fontWeight: 600 }}>• {t.bulbResult[lang]}</li>
            </ul>
            <svg width="100%" height="60" viewBox="0 0 200 60">
              <circle cx="28" cy="30" r="14" fill="#33330055" stroke="#FFFF44" strokeWidth="1.5" />
              <text x="28" y="33" textAnchor="middle" fill="#FFFF66" fontSize="10">💡</text>
              {[-20, -12, -4, 4, 12, 20].map((dy, i) => (
                <line key={i} x1="42" y1={30 + dy * 0.2} x2="88" y2={30 + dy * 1.8} stroke={['#FF4444','#FF8800','#FFFF00','#00FF00','#4444FF','#AA00FF'][i]} strokeWidth="1" opacity="0.5" />
              ))}
              <rect x="88" y="20" width="8" height="20" rx="1" fill="#1a0e00" stroke="#FFB300" strokeWidth="1.5" />
              <text x="145" y="28" textAnchor="middle" fill="#666666" fontSize="6">{t.blurSpot[lang].split(' ')[0]}</text>
              <text x="145" y="37" textAnchor="middle" fill="#666666" fontSize="6">{t.blurSpot[lang].split(' ')[1]}</text>
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
                <th className="text-left px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{t.colLaser[lang]}</th>
                <th className="text-left px-4 py-3" style={{ color: 'var(--text-secondary)' }}>λ</th>
                <th className="text-left px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{t.colViewLaser[lang]}</th>
                <th className="text-left px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{t.colPrice[lang]}</th>
              </tr>
            </thead>
            <tbody>
              {LASER_TABLE_BASE.map((row, i) => {
                const isHighlighted = i === matchRow;
                const name = row.nameKey ? t[row.nameKey][lang] : row.nameStatic;
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
                      {row.dot} {name}
                      {isHighlighted && (
                        <span className="ml-2 text-xs" style={{ color: '#69F0AE' }}>{t.currentRow[lang]}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ color: row.color }}>
                      {row.lambda} {t.nmUnit[lang]}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                      {t[row.viewKey][lang]}
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
          {t.laserTip[lang]}
        </div>
      </div>
    </div>
  );
}
