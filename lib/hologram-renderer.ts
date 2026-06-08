import * as THREE from "three";

const POINT_VERT = /* glsl */ `
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vDepth;

  void main() {
    vColor = aColor;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mvPos.z;
    float size = 4.0 + 8.0 / (1.0 + mvPos.z * mvPos.z * 0.2);
    gl_PointSize = clamp(size, 2.0, 32.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vDepth;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    float core = exp(-d * d * 12.0);
    float glow = exp(-d * d * 4.0) * 0.5;
    float edgeGlow = exp(-pow((d - 0.35) * 8.0, 2.0)) * 0.6;

    float pulse = 0.92 + 0.08 * sin(vDepth * 0.5 + 0.0);

    vec3 holColor = mix(vColor, vec3(0.1, 0.7, 1.0), 0.35);
    vec3 emission = vec3(0.0, 0.6, 1.0) * (glow + edgeGlow);

    float alpha = (core + glow + edgeGlow) * pulse * 0.85;
    gl_FragColor = vec4(holColor + emission, alpha);
  }
`;

const MESH_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const MESH_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);

    float fresnel = 1.0 - abs(dot(n, v));
    fresnel = pow(fresnel, 2.5);

    float rim = fresnel * 0.8;
    float core = 1.0 - fresnel * 0.6;

    vec3 holColor = mix(uColor, vec3(0.0, 0.7, 1.0), 0.4);
    vec3 rimColor = vec3(0.0, 0.5, 1.0);

    float pulse = 0.94 + 0.06 * sin(uTime * 0.8);

    vec3 final = holColor * core + rimColor * rim;
    float alpha = (0.5 + 0.5 * core) * pulse;
    gl_FragColor = vec4(final * alpha, alpha);
  }
`;

const GRID_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GRID_FRAG = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0) discard;

    vec2 grid = abs(fract(c * 30.0) - 0.5);
    float line = min(grid.x, grid.y);
    float gridVis = 1.0 - smoothstep(0.0, 0.05, line);
    gridVis *= 0.15;

    float ring = 1.0 - smoothstep(0.0, 0.02, abs(r - 0.95));
    ring += 1.0 - smoothstep(0.0, 0.015, abs(r - 0.7));
    ring += 1.0 - smoothstep(0.0, 0.015, abs(r - 0.4));
    ring *= 0.2;

    float alpha = (gridVis + ring) * (1.0 - r * 0.5);
    gl_FragColor = vec4(0.0, 0.6, 1.0, alpha * 0.6);
  }
`;

export interface HologramControls {
  azimuth: number;
  elevation: number;
  targetAzimuth: number;
  targetElevation: number;
  update: (dt: number) => void;
  dispose: () => void;
}

export function createHologramScene(
  geometry: THREE.BufferGeometry,
  canvas: HTMLCanvasElement,
): { scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: HologramControls } {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0a14, 3, 8);

  const camera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 0.01, 20);
  camera.position.set(0, 0.3, 2.8);

  const posAttr = geometry.getAttribute("position");
  if (!posAttr) throw new Error("no position attribute");

  // Convert red/green/blue → aColor if needed
  let colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (!colorAttr) {
    const r = geometry.getAttribute("red") as THREE.BufferAttribute | undefined;
    const g = geometry.getAttribute("green") as THREE.BufferAttribute | undefined;
    const b = geometry.getAttribute("blue") as THREE.BufferAttribute | undefined;
    if (r && g && b) {
      const n = r.count;
      const cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        cols[i * 3] = r.getX(i) / 255;
        cols[i * 3 + 1] = g.getX(i) / 255;
        cols[i * 3 + 2] = b.getX(i) / 255;
      }
      colorAttr = new THREE.Float32BufferAttribute(cols, 3);
    }
  }
  if (colorAttr) {
    geometry.setAttribute("aColor", colorAttr);
  }

  // Center + scale
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox!;
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);
  const bsize = new THREE.Vector3();
  bbox.getSize(bsize);
  const maxDim = Math.max(bsize.x, bsize.y, bsize.z) || 1;
  const s = 2.2 / maxDim;
  geometry.scale(s, s, s);

  const pointMat = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, pointMat);
  points.position.y = 0.15;
  scene.add(points);

  // Holographic base grid
  const gridGeo = new THREE.PlaneGeometry(3.6, 3.6);
  const gridMat = new THREE.ShaderMaterial({
    vertexShader: GRID_VERT,
    fragmentShader: GRID_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const grid = new THREE.Mesh(gridGeo, gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -0.7;
  scene.add(grid);

  // Ambient fill
  const ambient = new THREE.AmbientLight(0x4488ff, 0.2);
  scene.add(ambient);

  const hololight = new THREE.DirectionalLight(0x4488ff, 1.5);
  hololight.position.set(2, 3, 4);
  scene.add(hololight);

  const rimlight = new THREE.DirectionalLight(0x00ccff, 0.8);
  rimlight.position.set(-2, -1, -3);
  scene.add(rimlight);

  // Parallax controls
  let azimuth = 0;
  let elevation = 0.15;
  let targetAzimuth = 0;
  let targetElevation = 0.15;
  let mouseX = 0;
  let mouseY = 0;
  let idle = true;
  let idleTimer = 0;
  let autoAngle = 0;
  let running = true;

  const onMouse = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mouseY = Math.max(-1, Math.min(1, mouseY));
    targetAzimuth = mouseX * 1.3;
    targetElevation = 0.15 + mouseY * 0.25;
    idle = false;
    idleTimer = 0;
  };

  const onLeave = () => {
    idle = true;
    idleTimer = 0;
  };

  canvas.addEventListener("mousemove", onMouse);
  canvas.addEventListener("mouseleave", onLeave);

  // Touch support
  const onTouch = (e: TouchEvent) => {
    if (e.touches.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0];
    mouseX = ((t.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = ((t.clientY - rect.top) / rect.height) * 2 - 1;
    mouseY = Math.max(-1, Math.min(1, mouseY));
    targetAzimuth = mouseX * 1.3;
    targetElevation = 0.15 + mouseY * 0.25;
    idle = false;
    idleTimer = 0;
  };
  canvas.addEventListener("touchmove", onTouch, { passive: true });

  return {
    scene,
    camera,
    controls: {
      get azimuth() { return azimuth; },
      get elevation() { return elevation; },
      set targetAzimuth(v: number) { targetAzimuth = v; },
      set targetElevation(v: number) { targetElevation = v; },
      update(dt: number) {
        if (!running) return;

        if (idle) {
          idleTimer += dt;
          if (idleTimer > 2) {
            autoAngle += dt * 0.25;
            targetAzimuth = Math.sin(autoAngle) * 1.3;
            targetElevation = 0.15 + Math.sin(autoAngle * 0.7) * 0.15;
          }
        }

        const speed = 3;
        azimuth += (targetAzimuth - azimuth) * Math.min(1, dt * speed);
        elevation += (targetElevation - elevation) * Math.min(1, dt * speed);
        elevation = Math.max(-0.3, Math.min(0.6, elevation));

        const dist = 2.8;
        const ca = Math.cos(azimuth);
        const sa = Math.sin(azimuth);
        const ce = Math.cos(elevation);
        const se = Math.sin(elevation);
        camera.position.set(dist * ca * ce, dist * se + 0.3, dist * sa * ce);
        camera.lookAt(0, 0, 0);
      },
      dispose() {
        running = false;
        canvas.removeEventListener("mousemove", onMouse);
        canvas.removeEventListener("mouseleave", onLeave);
        canvas.removeEventListener("touchmove", onTouch);
      },
    },
  };
}
