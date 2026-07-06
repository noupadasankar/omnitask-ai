'use client';

/* =====================================================================
   NeuralBrainCanvas — realistic WebGL brain visualization
   ---------------------------------------------------------------------
   Multi-layered anatomical cortex point-cloud with gyri/sulci noise,
   subsurface glow, white-matter tracts, electrical impulses, and
   UnrealBloom post-processing for the molten glow.

   6,100 nodes: 4800 cortex + 600 deep + 500 cerebellum + 200 brainstem.

   Built on raw three.js (already a dependency) — no R3F, no new packages.
   Self-contained, SSR-safe (mount it via next/dynamic ssr:false),
   DPR-clamped, resize-aware, fully cleaned up on unmount.
   ===================================================================== */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { cn } from '@/lib/utils';

interface NeuralBrainCanvasProps {
  className?: string;
}

export default function NeuralBrainCanvas({ className }: NeuralBrainCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;
    const mount: HTMLDivElement = mountEl;

    // ──────────────── Simplex-like noise ────────────────
    // Multi-octave 3D noise for realistic cortex folds
    function hash(x: number, y: number, z: number): number {
      let h = x * 374761393 + y * 668265263 + z * 1274126177;
      h = ((h ^ (h >> 13)) * 1274126177) | 0;
      return (h ^ (h >> 16)) / 2147483648;
    }

    function smoothNoise3(x: number, y: number, z: number): number {
      const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
      const fx = x - ix, fy = y - iy, fz = z - iz;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const sz = fz * fz * (3 - 2 * fz);

      const n000 = hash(ix, iy, iz);
      const n100 = hash(ix + 1, iy, iz);
      const n010 = hash(ix, iy + 1, iz);
      const n110 = hash(ix + 1, iy + 1, iz);
      const n001 = hash(ix, iy, iz + 1);
      const n101 = hash(ix + 1, iy, iz + 1);
      const n011 = hash(ix, iy + 1, iz + 1);
      const n111 = hash(ix + 1, iy + 1, iz + 1);

      const nx00 = n000 + sx * (n100 - n000);
      const nx10 = n010 + sx * (n110 - n010);
      const nx01 = n001 + sx * (n101 - n001);
      const nx11 = n011 + sx * (n111 - n011);

      const nxy0 = nx00 + sy * (nx10 - nx00);
      const nxy1 = nx01 + sy * (nx11 - nx01);

      return nxy0 + sz * (nxy1 - nxy0);
    }

    function fbm(x: number, y: number, z: number, octaves: number, lacunarity: number, gain: number): number {
      let value = 0, amplitude = 1, frequency = 1, maxVal = 0;
      for (let i = 0; i < octaves; i++) {
        value += amplitude * (smoothNoise3(x * frequency, y * frequency, z * frequency) * 2 - 1);
        maxVal += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
      }
      return value / maxVal;
    }

    // ──────────────── Configuration ────────────────
    const CORTEX_NODES = 4800;
    const DEEP_NODES = 600;
    const CEREBELLUM_NODES = 500;
    const BRAINSTEM_NODES = 200;
    const TOTAL_NODES = CORTEX_NODES + DEEP_NODES + CEREBELLUM_NODES + BRAINSTEM_NODES;

    // ──────────────── Scene setup ────────────────
    // Guard against a zero-size mount (next/dynamic can mount before the
    // container has laid out). A 0 width would give aspect=0 and collapse
    // the brain to one side — fall back to the window, fix it up on resize.
    let initW = mount.clientWidth || window.innerWidth;
    let initH = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, initW / initH, 0.1, 100);
    camera.position.set(0, 0.2, 6.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(initW, initH);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);

    // ──────────────── Post-processing bloom ────────────────
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    renderPass.clearAlpha = 0;
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(initW, initH),
      1.4,   // strength
      0.6,   // radius
      0.15   // threshold
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    // ──────────────── Glow sprite textures ────────────────
    function makeGlowTexture(r: number, g: number, b: number, softness: number): THREE.CanvasTexture {
      const size = 128;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, `rgba(255,255,255,1)`);
      grad.addColorStop(0.08, `rgba(${r},${g},${b},0.95)`);
      grad.addColorStop(softness, `rgba(${r},${g},${b},0.3)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(c);
    }

    const glowWhite = makeGlowTexture(255, 230, 200, 0.35);
    const glowBlue = makeGlowTexture(100, 160, 255, 0.55);

    // ──────────────── Brain anatomy sampling ────────────────

    // Cortex surface — anatomically shaped with gyri/sulci folds
    function sampleCortex(side: number): THREE.Vector3 {
      // Uniform sphere sampling
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(2 * Math.random() - 1);

      let x = Math.sin(v) * Math.cos(u);
      let y = Math.cos(v);
      let z = Math.sin(v) * Math.sin(u);

      // Anatomical proportions — front-back elongated, left-right wide, top-bottom compressed
      const rx = 1.55, ry = 1.18, rz = 1.85;
      x *= rx; y *= ry; z *= rz;

      // Frontal lobe bulge
      if (z > 0.8) {
        const bulge = 1.0 + 0.12 * Math.pow(Math.max(0, (z - 0.8) / 1.0), 0.7);
        x *= bulge;
        y *= 1.0 + 0.06 * Math.max(0, (z - 0.8) / 1.0);
      }

      // Temporal lobe — lateral bulge below the Sylvian fissure
      if (y < -0.1 && Math.abs(x) > 0.4) {
        const temporalFactor = Math.max(0, (-y - 0.1)) * Math.max(0, (Math.abs(x) - 0.4));
        x *= 1.0 + temporalFactor * 0.35;
        z *= 1.0 + temporalFactor * 0.15;
      }

      // Occipital taper at the back
      if (z < -1.0) {
        const taper = 1.0 - 0.15 * Math.pow(Math.max(0, (-z - 1.0) / 0.8), 1.2);
        x *= taper;
        y *= taper;
      }

      // Multi-octave gyri/sulci — the key to realistic wrinkled appearance
      const noiseScale = 2.8;
      const n1 = fbm(x * noiseScale, y * noiseScale, z * noiseScale, 5, 2.1, 0.52);
      const n2 = fbm(x * noiseScale * 1.7 + 100, y * noiseScale * 1.7, z * noiseScale * 1.7, 3, 2.3, 0.45);

      // Sulci (grooves) — carve inward
      const sulcusDepth = 0.08;
      const gyrusHeight = 0.06;
      const foldDisp = n1 * sulcusDepth + Math.abs(n2) * gyrusHeight;

      const r = Math.sqrt(x * x + y * y + z * z);
      if (r > 0) {
        const factor = 1.0 + foldDisp / r;
        x *= factor; y *= factor; z *= factor;
      }

      // Surface concentration — bias points toward the shell
      const shellBias = 0.88 + Math.random() * 0.12;
      x *= shellBias; y *= shellBias; z *= shellBias;

      // Flatten orbital/temporal base
      if (y < -0.25) y = -0.25 + (y + 0.25) * 0.35;

      // Longitudinal fissure — medial gap between hemispheres
      const fissureWidth = 0.12 + 0.04 * Math.abs(fbm(y * 4, z * 4, 0, 2, 2, 0.5));
      x = side * (Math.abs(x) * 0.62 + fissureWidth);

      // Central sulcus — a groove running laterally across the top
      const centralSulcusZ = 0.15;
      const distToCentral = Math.abs(z - centralSulcusZ);
      if (distToCentral < 0.12 && y > 0.3) {
        y -= (0.12 - distToCentral) * 0.3 * Math.max(0, (y - 0.3));
      }

      // Sylvian fissure — lateral groove separating temporal from parietal/frontal
      if (Math.abs(x) > 0.5 && y < 0.15 && y > -0.3 && z > -0.3 && z < 0.8) {
        const sylvianDepth = 0.06 * Math.max(0, 1.0 - Math.abs(y + 0.075) / 0.225);
        y -= sylvianDepth * Math.sign(y + 0.075);
      }

      return new THREE.Vector3(x, y, z);
    }

    // Deep brain structures — thalamus, basal ganglia, etc.
    function sampleDeepStructure(): THREE.Vector3 {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.5) * 0.55;
      let x = r * Math.sin(v) * Math.cos(u);
      let y = r * Math.cos(v) * 0.7 - 0.1;
      let z = r * Math.sin(v) * Math.sin(u) * 0.9;
      // Slight noise displacement
      x += fbm(x * 5 + 200, y * 5, z * 5, 2, 2, 0.5) * 0.04;
      y += fbm(x * 5, y * 5 + 200, z * 5, 2, 2, 0.5) * 0.04;
      return new THREE.Vector3(x, y, z);
    }

    // Cerebellum — foliated lower-posterior structure
    function sampleCerebellum(): THREE.Vector3 {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 0.15 + Math.pow(Math.random(), 0.6) * 0.42;
      let x = Math.sin(phi) * Math.cos(theta) * r * 1.3;
      let y = -0.7 + Math.cos(phi) * r * 0.5 - Math.random() * 0.15;
      let z = -1.05 + Math.sin(phi) * Math.sin(theta) * r * 0.7;

      // Cerebellar folia — tighter, more regular folding
      const foliaFreq = 8.0;
      const foliaNoise = Math.sin(theta * foliaFreq) * 0.03 + fbm(x * 12, y * 12, z * 12, 3, 2.5, 0.4) * 0.025;
      x += foliaNoise * Math.cos(theta);
      z += foliaNoise * Math.sin(theta);

      return new THREE.Vector3(x, y, z);
    }

    // Brainstem — tapered cylinder connecting to spinal cord
    function sampleBrainstem(t: number): THREE.Vector3 {
      const baseY = -0.85;
      const y = baseY - t * 1.2;
      // Medulla/pons wider, then tapers
      const widthProfile = t < 0.3 ? 0.18 + (0.3 - t) * 0.15 : 0.18 * (1.0 - (t - 0.3) * 0.7);
      const ang = Math.random() * Math.PI * 2;
      const r = widthProfile * (0.5 + Math.random() * 0.5);
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r - 0.35;
      return new THREE.Vector3(x, y, z);
    }

    // ──────────────── Generate all points ────────────────
    const positions = new Float32Array(TOTAL_NODES * 3);
    const basePositions = new Float32Array(TOTAL_NODES * 3);
    const colors = new Float32Array(TOTAL_NODES * 3);
    const sizes = new Float32Array(TOTAL_NODES);
    const seeds = new Float32Array(TOTAL_NODES);
    const regionTypes = new Float32Array(TOTAL_NODES); // 0=cortex, 1=deep, 2=cerebellum, 3=brainstem

    let idx = 0;

    // Color palette
    const cortexColor = new THREE.Color(0xff8844);      // warm orange
    const cortexHighlight = new THREE.Color(0xffbb77);   // lighter cortex
    const deepColor = new THREE.Color(0xffddaa);         // warm white-gold for deep structures
    const cerebellumColor = new THREE.Color(0xff6633);    // deeper red-orange
    const brainstemColor = new THREE.Color(0xcc7744);     // muted earthy
    const tmpColor = new THREE.Color();

    function setPoint(p: THREE.Vector3, color: THREE.Color, size: number, region: number) {
      positions[idx * 3] = p.x;
      positions[idx * 3 + 1] = p.y;
      positions[idx * 3 + 2] = p.z;
      basePositions[idx * 3] = p.x;
      basePositions[idx * 3 + 1] = p.y;
      basePositions[idx * 3 + 2] = p.z;
      colors[idx * 3] = color.r;
      colors[idx * 3 + 1] = color.g;
      colors[idx * 3 + 2] = color.b;
      sizes[idx] = size;
      seeds[idx] = Math.random() * 1000;
      regionTypes[idx] = region;
      idx++;
    }

    // Cortex — left hemisphere
    for (let i = 0; i < CORTEX_NODES / 2; i++) {
      const p = sampleCortex(-1);
      const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      tmpColor.copy(cortexColor).lerp(cortexHighlight, Math.random() * 0.3 + (dist > 1.3 ? 0.2 : 0));
      setPoint(p, tmpColor, 0.032 + Math.random() * 0.015, 0);
    }
    // Cortex — right hemisphere
    for (let i = 0; i < CORTEX_NODES / 2; i++) {
      const p = sampleCortex(1);
      const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      tmpColor.copy(cortexColor).lerp(cortexHighlight, Math.random() * 0.3 + (dist > 1.3 ? 0.2 : 0));
      setPoint(p, tmpColor, 0.032 + Math.random() * 0.015, 0);
    }
    // Deep structures
    for (let i = 0; i < DEEP_NODES; i++) {
      const p = sampleDeepStructure();
      tmpColor.copy(deepColor).lerp(cortexColor, Math.random() * 0.3);
      setPoint(p, tmpColor, 0.04 + Math.random() * 0.03, 1);
    }
    // Cerebellum
    for (let i = 0; i < CEREBELLUM_NODES; i++) {
      const p = sampleCerebellum();
      tmpColor.copy(cerebellumColor).lerp(cortexColor, Math.random() * 0.25);
      setPoint(p, tmpColor, 0.028 + Math.random() * 0.012, 2);
    }
    // Brainstem
    for (let i = 0; i < BRAINSTEM_NODES; i++) {
      const p = sampleBrainstem(Math.random());
      tmpColor.copy(brainstemColor).lerp(deepColor, Math.random() * 0.2);
      setPoint(p, tmpColor, 0.025 + Math.random() * 0.015, 3);
    }

    // ──────────────── Main point cloud — custom shader ────────────────
    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pointGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const pointVertexShader = `
      attribute float size;
      varying vec3 vColor;
      varying float vDist;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vDist = -mvPosition.z;
        gl_PointSize = size * (280.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const pointFragmentShader = `
      varying vec3 vColor;
      varying float vDist;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        // Soft glow falloff
        float alpha = 1.0 - smoothstep(0.0, 0.5, d);
        alpha = pow(alpha, 1.5);
        // Depth-based atmospheric fade
        float depthFade = clamp(1.0 - (vDist - 4.0) * 0.08, 0.3, 1.0);
        // Slight color shift — brighter at center
        vec3 col = vColor + vec3(0.3, 0.2, 0.1) * (1.0 - d * 2.0) * 0.4;
        gl_FragColor = vec4(col * depthFade, alpha * depthFade * 0.9);
      }
    `;

    const pointMat = new THREE.ShaderMaterial({
      vertexShader: pointVertexShader,
      fragmentShader: pointFragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const pointCloud = new THREE.Points(pointGeo, pointMat);

    // ──────────────── Translucent cortex surface mesh ────────────────
    // Create a smooth brain-shaped mesh with translucent material for organic depth
    const brainMeshGeo = new THREE.SphereGeometry(1, 64, 48);
    const brainPositions = brainMeshGeo.attributes.position;
    const brainNormals = brainMeshGeo.attributes.normal;

    for (let i = 0; i < brainPositions.count; i++) {
      let x = brainPositions.getX(i);
      let y = brainPositions.getY(i);
      let z = brainPositions.getZ(i);

      // Apply same anatomical shape
      x *= 1.55; y *= 1.18; z *= 1.85;

      // Frontal bulge
      if (z > 0.8) {
        x *= 1.0 + 0.1 * Math.max(0, (z - 0.8) / 1.0);
        y *= 1.0 + 0.05 * Math.max(0, (z - 0.8) / 1.0);
      }

      // Occipital taper
      if (z < -1.0) {
        const taper = 1.0 - 0.12 * Math.pow(Math.max(0, (-z - 1.0) / 0.8), 1.2);
        x *= taper; y *= taper;
      }

      // Gyri/sulci displacement on mesh
      const noiseScale = 2.5;
      const n = fbm(x * noiseScale, y * noiseScale, z * noiseScale, 4, 2.1, 0.5);
      const disp = n * 0.07;
      const nx = brainNormals.getX(i);
      const ny = brainNormals.getY(i);
      const nz = brainNormals.getZ(i);
      x += nx * disp;
      y += ny * disp;
      z += nz * disp;

      // Flatten base
      if (y < -0.25) y = -0.25 + (y + 0.25) * 0.35;

      // Longitudinal fissure on mesh — indent at midline
      const fissureIndent = Math.exp(-Math.abs(x) * 12) * 0.08;
      if (y > -0.1) y -= fissureIndent * Math.max(0, y + 0.1);

      brainPositions.setXYZ(i, x, y, z);
    }
    brainMeshGeo.computeVertexNormals();

    const brainMeshMat = new THREE.MeshStandardMaterial({
      color: 0xff6633,
      transparent: true,
      opacity: 0.04,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const brainMesh = new THREE.Mesh(brainMeshGeo, brainMeshMat);

    // Second inner glow mesh
    const innerGlowGeo = new THREE.SphereGeometry(0.65, 32, 24);
    const innerGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff9955,
      transparent: true,
      opacity: 0.025,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const innerGlow = new THREE.Mesh(innerGlowGeo, innerGlowMat);
    innerGlow.position.y = -0.05;

    // ──────────────── Synapse connections (spatial hash) ────────────────
    const cellSize = 0.3;
    const grid = new Map<string, number[]>();
    function cellKey(x: number, y: number, z: number): string {
      return `${Math.floor(x / cellSize)}_${Math.floor(y / cellSize)}_${Math.floor(z / cellSize)}`;
    }
    for (let i = 0; i < TOTAL_NODES; i++) {
      const k = cellKey(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(i);
    }

    const lineVerts: number[] = [];
    const lineColors: number[] = [];
    const MAX_LINK_DIST = 0.2;
    // Budget split across BOTH hemispheres now (see shuffle below), so raise it
    // to keep each side as densely wired as the reference's single dense side.
    const MAX_LINKS = 9000;

    // Visit nodes in SHUFFLED order. The link budget (MAX_LINKS) is finite,
    // and nodes are laid out left-hemisphere-first, then right. Iterating in
    // index order spends the whole budget on the left side and starves the
    // right — leaving one hemisphere densely wired and the other bare.
    // Shuffling spreads the links evenly across BOTH hemispheres.
    const order = new Uint16Array(TOTAL_NODES);
    for (let i = 0; i < TOTAL_NODES; i++) order[i] = i;
    for (let a = TOTAL_NODES - 1; a > 0; a--) {
      const b = Math.floor(Math.random() * (a + 1));
      const tmp = order[a]; order[a] = order[b]; order[b] = tmp;
    }

    let linksDone = false;
    for (let oi = 0; oi < TOTAL_NODES && !linksDone; oi++) {
      const i = order[oi];
      if (Math.random() > 0.5) continue;
      const xi = positions[i * 3], yi = positions[i * 3 + 1], zi = positions[i * 3 + 2];
      const cx = Math.floor(xi / cellSize), cy = Math.floor(yi / cellSize), cz = Math.floor(zi / cellSize);

      for (let dx = -1; dx <= 1 && !linksDone; dx++) {
        for (let dy = -1; dy <= 1 && !linksDone; dy++) {
          for (let dz = -1; dz <= 1 && !linksDone; dz++) {
            const k = `${cx + dx}_${cy + dy}_${cz + dz}`;
            const bucket = grid.get(k);
            if (!bucket) continue;
            for (const j of bucket) {
              if (j <= i) continue;
              const xj = positions[j * 3], yj = positions[j * 3 + 1], zj = positions[j * 3 + 2];
              const d = Math.hypot(xi - xj, yi - yj, zi - zj);
              if (d < MAX_LINK_DIST) {
                lineVerts.push(xi, yi, zi, xj, yj, zj);
                // Color by region: deep connections brighter
                const avgRegion = (regionTypes[i] + regionTypes[j]) / 2;
                const brightness = avgRegion <= 1 ? 0.6 : 0.4;
                const r = brightness * (0.9 + Math.random() * 0.1);
                const g = brightness * (0.4 + Math.random() * 0.15);
                const b = brightness * (0.15 + Math.random() * 0.1);
                lineColors.push(r, g, b, r, g, b);
                if (lineVerts.length / 6 > MAX_LINKS) { linksDone = true; break; }
              }
            }
          }
        }
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lineVerts), 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(lineColors), 3));
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeo, lineMat);

    // ──────────────── White matter tracts (interior fiber bundles) ────────────────
    const tractCount = 60;
    const tractGroup = new THREE.Group();

    for (let t = 0; t < tractCount; t++) {
      const curvePoints: THREE.Vector3[] = [];
      const steps = 8 + Math.floor(Math.random() * 8);

      // Start from a random interior point
      let cx2 = (Math.random() - 0.5) * 1.0;
      let cy2 = (Math.random() - 0.5) * 0.6 - 0.1;
      let cz2 = (Math.random() - 0.5) * 1.2;

      for (let s = 0; s < steps; s++) {
        curvePoints.push(new THREE.Vector3(cx2, cy2, cz2));
        cx2 += (Math.random() - 0.5) * 0.25;
        cy2 += (Math.random() - 0.5) * 0.18;
        cz2 += (Math.random() - 0.5) * 0.25;
        // Keep inside brain volume
        const rr = Math.sqrt(cx2 * cx2 / (1.4 * 1.4) + cy2 * cy2 / (1.0 * 1.0) + cz2 * cz2 / (1.7 * 1.7));
        if (rr > 0.7) {
          cx2 *= 0.7 / rr;
          cy2 *= 0.7 / rr;
          cz2 *= 0.7 / rr;
        }
      }

      if (curvePoints.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(curvePoints);
        const curveGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
        const tractMat = new THREE.LineBasicMaterial({
          color: new THREE.Color(0.6 + Math.random() * 0.3, 0.3 + Math.random() * 0.15, 0.1 + Math.random() * 0.1),
          transparent: true,
          opacity: 0.06 + Math.random() * 0.04,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        tractGroup.add(new THREE.Line(curveGeo, tractMat));
      }
    }

    // ──────────────── Electrical impulse particles ────────────────
    const IMPULSE_COUNT = 80;
    const impulsePositions = new Float32Array(IMPULSE_COUNT * 3);

    // Each impulse travels along a line segment
    interface ImpulseData {
      startIdx: number;
      endIdx: number;
      speed: number;
      phase: number;
    }
    const impulseData: ImpulseData[] = [];

    const totalLineSegments = lineVerts.length / 6;
    for (let i = 0; i < IMPULSE_COUNT; i++) {
      const segIdx = Math.floor(Math.random() * totalLineSegments);
      impulseData.push({
        startIdx: segIdx * 6,
        endIdx: segIdx * 6 + 3,
        speed: 0.3 + Math.random() * 0.7,
        phase: Math.random(),
      });
    }

    const impulseGeo = new THREE.BufferGeometry();
    impulseGeo.setAttribute('position', new THREE.BufferAttribute(impulsePositions, 3));
    const impulseMat = new THREE.PointsMaterial({
      size: 0.06,
      map: glowWhite,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(0xffffff),
      opacity: 0.85,
    });
    const impulsePoints = new THREE.Points(impulseGeo, impulseMat);

    // ──────────────── Inner core glow points ────────────────
    const coreCount = 250;
    const corePos = new Float32Array(coreCount * 3);

    for (let i = 0; i < coreCount; i++) {
      const srcIdx = Math.floor(Math.random() * DEEP_NODES + CORTEX_NODES) * 3;
      const safeIdx = Math.min(srcIdx, (TOTAL_NODES - 1) * 3);
      corePos[i * 3] = positions[safeIdx] * 0.85;
      corePos[i * 3 + 1] = positions[safeIdx + 1] * 0.85;
      corePos[i * 3 + 2] = positions[safeIdx + 2] * 0.85;
    }
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.BufferAttribute(corePos, 3));
    const coreMat = new THREE.PointsMaterial({
      size: 0.08,
      map: glowWhite,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(0xffeedd),
      opacity: 0.5,
    });
    const coreCloud = new THREE.Points(coreGeo, coreMat);

    // ──────────────── Ambient neural dust ────────────────
    const dustCount = 250;
    const dustPos = new Float32Array(dustCount * 3);
    const dustSpeeds = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 14;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 9;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 9 - 1;
      dustSpeeds[i * 3] = (Math.random() - 0.5) * 0.002;
      dustSpeeds[i * 3 + 1] = (Math.random() - 0.5) * 0.001;
      dustSpeeds[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 0.018,
      map: glowBlue,
      color: 0xffaa66,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // ──────────────── Subtle ambient light ────────────────
    const ambientLight = new THREE.AmbientLight(0xff8844, 0.15);
    scene.add(ambientLight);

    // ──────────────── Interaction tracking ────────────────
    const mouseTarget = { x: 0, y: 0 };
    const mouseCurrent = { x: 0, y: 0 };
    function onPointerMove(e: PointerEvent) {
      const rect = mount.getBoundingClientRect();
      mouseTarget.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseTarget.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    // Track globally so the pointer still drives rotation even when the
    // canvas sits behind other (pointer-events-none) hero content.
    window.addEventListener('pointermove', onPointerMove);

    // ──────────────── Resize ────────────────
    function onResize() {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      if (w === 0 || h === 0) return;
      initW = w; initH = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      bloomPass.resolution.set(w, h);
    }
    window.addEventListener('resize', onResize);

    // Re-center the instant the container gets its real dimensions — this is
    // what corrects the "brain pushed to one side" look when it mounts at 0px.
    const resizeObserver = new ResizeObserver(() => onResize());
    resizeObserver.observe(mount);

    // ──────────────── Animation loop ────────────────
    let frameId: number;
    const clock = new THREE.Clock();
    let elapsedAccum = 0;
    const brainGroup = new THREE.Group();
    brainGroup.add(pointCloud, lines, tractGroup, impulsePoints, coreCloud, brainMesh, innerGlow);
    // Start in a good-looking 3/4 angled pose (both hemispheres now wired),
    // then rotate slowly & continuously from there.
    const BASE_ROT_Y = -0.6; // ~ -34°, the pleasing 3/4 view
    brainGroup.rotation.y = BASE_ROT_Y;
    brainGroup.rotation.x = -0.04;
    brainGroup.scale.setScalar(1.35); // enlarge the whole brain
    scene.add(brainGroup);

    // All brain components are in brainGroup, only dust and light are direct scene children

    function animate() {
      frameId = requestAnimationFrame(animate);
    
      const delta = clock.getDelta();
      
      elapsedAccum += delta;
      const elapsed = elapsedAccum;

      // Smooth mouse
      mouseCurrent.x += (mouseTarget.x - mouseCurrent.x) * 0.04;
      mouseCurrent.y += (mouseTarget.y - mouseCurrent.y) * 0.04;

      // Breathing deformation on cortex nodes
      const posAttr = pointGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < TOTAL_NODES; i++) {
        const bx = basePositions[i * 3];
        const by = basePositions[i * 3 + 1];
        const bz = basePositions[i * 3 + 2];
        const s = seeds[i];
        const wobble = regionTypes[i] <= 1 ? 0.01 : 0.006;
        posAttr.array[i * 3] = bx + Math.sin(elapsed * 0.4 + s) * wobble;
        posAttr.array[i * 3 + 1] = by + Math.cos(elapsed * 0.35 + s * 1.1) * wobble;
        posAttr.array[i * 3 + 2] = bz + Math.sin(elapsed * 0.28 + s * 0.9) * wobble;
      }
      posAttr.needsUpdate = true;

      // Electrical impulses traveling along synapses
      const impulseAttr = impulseGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < IMPULSE_COUNT; i++) {
        const data = impulseData[i];
        data.phase += delta * data.speed;
        if (data.phase > 1) {
          data.phase -= 1;
          // Jump to new synapse
          const segIdx = Math.floor(Math.random() * totalLineSegments);
          data.startIdx = segIdx * 6;
          data.endIdx = segIdx * 6 + 3;
        }
        const t = data.phase;
        const si = data.startIdx, ei = data.endIdx;
        if (si + 2 < lineVerts.length && ei + 2 < lineVerts.length) {
          impulseAttr.array[i * 3] = lineVerts[si] + (lineVerts[ei] - lineVerts[si]) * t;
          impulseAttr.array[i * 3 + 1] = lineVerts[si + 1] + (lineVerts[ei + 1] - lineVerts[si + 1]) * t;
          impulseAttr.array[i * 3 + 2] = lineVerts[si + 2] + (lineVerts[ei + 2] - lineVerts[si + 2]) * t;
        }
      }
      impulseAttr.needsUpdate = true;
      impulseMat.opacity = 0.6 + Math.sin(elapsed * 3) * 0.2;

      // Dust drift
      const dustAttr = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < dustCount; i++) {
        dustAttr.array[i * 3] += dustSpeeds[i * 3];
        dustAttr.array[i * 3 + 1] += dustSpeeds[i * 3 + 1];
        dustAttr.array[i * 3 + 2] += dustSpeeds[i * 3 + 2];
        // Wrap around
        if (Math.abs(dustAttr.array[i * 3]) > 7) dustSpeeds[i * 3] *= -1;
        if (Math.abs(dustAttr.array[i * 3 + 1]) > 5) dustSpeeds[i * 3 + 1] *= -1;
        if (Math.abs(dustAttr.array[i * 3 + 2]) > 5) dustSpeeds[i * 3 + 2] *= -1;
      }
      dustAttr.needsUpdate = true;

      // Brain rotation — start in the 3/4 pose, then SLOWLY rotate forever,
      // and let the mouse gently steer it. Both hemispheres are wired now,
      // so the pose looks good from every angle.
      const targetRotY = BASE_ROT_Y + elapsed * 0.05 + mouseCurrent.x * 0.5;
      const targetRotX = -0.04 + mouseCurrent.y * 0.3;
      brainGroup.rotation.y += (targetRotY - brainGroup.rotation.y) * 0.05;
      brainGroup.rotation.x += (targetRotX - brainGroup.rotation.x) * 0.05;

      dust.rotation.y = elapsed * 0.005;

      // Core breathing
      coreMat.opacity = 0.4 + Math.sin(elapsed * 1.0) * 0.2;

      // Inner glow pulsation
      innerGlowMat.opacity = 0.02 + Math.sin(elapsed * 0.8) * 0.01;

      // Bloom strength subtle oscillation
      bloomPass.strength = 1.3 + Math.sin(elapsed * 0.5) * 0.15;

      composer.render();
    }
    animate();

    // ──────────────── Cleanup ────────────────
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      resizeObserver.disconnect();

      // Dispose geometries
      pointGeo.dispose();
      brainMeshGeo.dispose();
      innerGlowGeo.dispose();
      lineGeo.dispose();
      impulseGeo.dispose();
      coreGeo.dispose();
      dustGeo.dispose();

      // Dispose materials
      pointMat.dispose();
      brainMeshMat.dispose();
      innerGlowMat.dispose();
      lineMat.dispose();
      impulseMat.dispose();
      coreMat.dispose();
      dustMat.dispose();

      // Dispose tract geometries/materials
      tractGroup.traverse((child) => {
        if ((child as THREE.Line).geometry) (child as THREE.Line).geometry.dispose();
        if ((child as THREE.Line).material) ((child as THREE.Line).material as THREE.Material).dispose();
      });

      // Dispose textures
      glowWhite.dispose();
      glowBlue.dispose();

      // Dispose composer
      composer.dispose();
      renderer.dispose();

      if (mount && mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={cn('absolute inset-0 w-full h-full', className)}
    />
  );
}
