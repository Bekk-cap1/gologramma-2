import * as THREE from "three";

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;

  void main() {
    vColor = aColor;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (400.0 / -mvPos.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 512.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float alpha = exp(-r2 * 10.0);
    gl_FragColor = vec4(vColor * alpha, alpha);
  }
`;

function makeSortedCopy(geo: THREE.BufferGeometry, camera: THREE.Camera, worldMatrix: THREE.Matrix4): THREE.BufferGeometry {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const col = geo.getAttribute("aColor") as THREE.BufferAttribute;
  const sz = geo.getAttribute("aSize") as THREE.BufferAttribute;
  const n = pos.count;

  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const localCam = camPos.clone().applyMatrix4(worldMatrix.clone().invert());

  const indices = new Array<number>(n);
  const dists = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const dx = pos.array[i3] - localCam.x;
    const dy = pos.array[i3 + 1] - localCam.y;
    const dz = pos.array[i3 + 2] - localCam.z;
    dists[i] = dx * dx + dy * dy + dz * dz;
    indices[i] = i;
  }
  indices.sort((a, b) => dists[b] - dists[a]);

  const outPos = new Float32Array(pos.array.length);
  const outCol = col ? new Float32Array(col.array.length) : null;
  const outSz = sz ? new Float32Array(sz.array.length) : null;

  for (let i = 0; i < n; i++) {
    const src = indices[i];
    outPos[i * 3] = pos.array[src * 3];
    outPos[i * 3 + 1] = pos.array[src * 3 + 1];
    outPos[i * 3 + 2] = pos.array[src * 3 + 2];
    if (outCol && col) {
      outCol[i * 3] = col.array[src * 3];
      outCol[i * 3 + 1] = col.array[src * 3 + 1];
      outCol[i * 3 + 2] = col.array[src * 3 + 2];
    }
    if (outSz && sz) {
      outSz[i] = sz.array[src];
    }
  }

  const outGeo = new THREE.BufferGeometry();
  outGeo.setAttribute("position", new THREE.Float32BufferAttribute(outPos, 3));
  if (outCol) outGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(outCol, 3));
  if (outSz) outGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(outSz!, 1));

  return outGeo;
}

export function createSplatPoints(
  geometry: THREE.BufferGeometry,
  options?: {
    scale?: number;
    camera?: THREE.Camera;
    worldMatrix?: THREE.Matrix4;
  },
): THREE.Points {
  const posAttr = geometry.getAttribute("position");
  if (!posAttr) throw new Error("Splat renderer: geometry has no position attribute");

  const count = posAttr.count;

  let colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (!colorAttr) {
    const red = geometry.getAttribute("red") as THREE.BufferAttribute | undefined;
    const green = geometry.getAttribute("green") as THREE.BufferAttribute | undefined;
    const blue = geometry.getAttribute("blue") as THREE.BufferAttribute | undefined;
    if (red && green && blue) {
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = red.getX(i) / 255;
        colors[i * 3 + 1] = green.getX(i) / 255;
        colors[i * 3 + 2] = blue.getX(i) / 255;
      }
      colorAttr = new THREE.Float32BufferAttribute(colors, 3);
    }
  }

  if (!colorAttr) {
    const colors = new Float32Array(count * 3);
    colors.fill(0.5);
    colorAttr = new THREE.Float32BufferAttribute(colors, 3);
  }

  let sizeAttr = geometry.getAttribute("aSize") as THREE.BufferAttribute | undefined;
  if (!sizeAttr) {
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    const boxSize = new THREE.Vector3();
    bbox.getSize(boxSize);
    const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z) || 1;
    const baseSize = maxDim / 100;
    const sizes = new Float32Array(count);
    sizes.fill(baseSize);
    sizeAttr = new THREE.Float32BufferAttribute(sizes, 1);
    geometry.setAttribute("aSize", sizeAttr);
  }

  const sortedGeo = options?.camera
    ? makeSortedCopy(geometry, options.camera, options.worldMatrix ?? new THREE.Matrix4())
    : geometry;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(sortedGeo, material);
  points.frustumCulled = false;

  return points;
}

export function sortSplatPoints(points: THREE.Points, camera: THREE.Camera) {
  const geo = points.geometry;
  const sorted = makeSortedCopy(geo, camera, points.matrixWorld);
  points.geometry.dispose();
  points.geometry = sorted;
}
