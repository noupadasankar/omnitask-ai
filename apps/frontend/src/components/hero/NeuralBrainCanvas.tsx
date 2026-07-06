'use client';

/* =====================================================================
<<<<<<< HEAD
   NeuralBrainCanvas — realistic WebGL brain visualization
   ---------------------------------------------------------------------
   Multi-layered anatomical cortex point-cloud with gyri/sulci noise,
   subsurface glow, white-matter tracts, electrical impulses, and
   UnrealBloom post-processing for the molten glow.

   6,100 nodes: 4800 cortex + 600 deep + 500 cerebellum + 200 brainstem.

   Built on raw three.js (already a dependency) — no R3F, no new packages.
   Self-contained, SSR-safe (mount it via next/dynamic ssr:false),
   DPR-clamped, resize-aware, fully cleaned up on unmount.
=======
   NeuralBrainCanvas — cinematic WebGL hero backdrop
   ---------------------------------------------------------------------
   A procedurally generated "neural brain": a synapse network whose nodes
   fire light pulses along their connections, wrapped in orbital data
   rings, drifting binary code, a starfield and a deep-red nebula.
   Rendered with real UnrealBloom post-processing for the molten glow.

   Built on raw three.js (already a dependency) — no R3F, no new packages.
   Self-contained, SSR-safe (mount it via next/dynamic ssr:false),
   DPR-clamped, visibility-paused, reduced-motion aware, fully cleaned up.
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835
   ===================================================================== */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
<<<<<<< HEAD
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
=======
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835

import { cn } from '@/lib/utils';

interface NeuralBrainCanvasProps {
  className?: string;
}

<<<<<<< HEAD
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
=======
/* ---------- palette (linear-ish sRGB) ---------- */
const C_DEEP = new THREE.Color('#ff4d12'); // deep ember
const C_AMBER = new THREE.Color('#ffae3d'); // amber
const C_GOLD = new THREE.Color('#fff0c2'); // hot core
const C_RED = new THREE.Color('#ff2317'); // crimson

/* ---------- radial sprite texture (soft glow dot) ---------- */
function makeGlowTexture(): THREE.Texture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,225,170,0.9)');
  g.addColorStop(0.45, 'rgba(255,140,50,0.35)');
  g.addColorStop(1.0, 'rgba(255,80,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- nebula background texture ---------- */
function makeNebulaTexture(): THREE.Texture {
  const w = 1024;
  const h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#040102';
  ctx.fillRect(0, 0, w, h);
  // primary warm core glow
  let g = ctx.createRadialGradient(w * 0.5, h * 0.46, 0, w * 0.5, h * 0.46, w * 0.62);
  g.addColorStop(0, 'rgba(86,18,6,0.95)');
  g.addColorStop(0.35, 'rgba(48,9,4,0.6)');
  g.addColorStop(1, 'rgba(4,1,2,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // offset secondary nebula bloom
  g = ctx.createRadialGradient(w * 0.74, h * 0.3, 0, w * 0.74, h * 0.3, w * 0.4);
  g.addColorStop(0, 'rgba(120,40,12,0.5)');
  g.addColorStop(1, 'rgba(8,2,2,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- binary-stream texture ---------- */
function makeBinaryTexture(): THREE.Texture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, s, s);
  ctx.font = '18px monospace';
  ctx.textBaseline = 'top';
  const cols = 16;
  const cell = s / cols;
  // deterministic-ish pattern (no Math.random dependency for visual stability)
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < cols; y++) {
      const v = (x * 7 + y * 13 + ((x * y) % 5)) % 3;
      if (v === 2) continue; // gaps
      const bit = (x + y) % 2 === 0 ? '1' : '0';
      const a = 0.12 + ((x * 3 + y) % 5) * 0.05;
      ctx.fillStyle = `rgba(255,150,70,${a})`;
      ctx.fillText(bit, x * cell + 4, y * cell + 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ---------- glowing code-fragment glyph texture (2:1) ---------- */
function makeGlyphTexture(text: string): THREE.Texture {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.font = 'bold 60px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // glow halo
  ctx.shadowColor = 'rgba(255,140,40,0.95)';
  ctx.shadowBlur = 22;
  ctx.fillStyle = 'rgba(255,190,110,0.95)';
  ctx.fillText(text, w / 2, h / 2);
  // crisp core
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,244,214,0.95)';
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- brain-shaped point cloud ---------- */
interface BrainData {
  positions: Float32Array;
  colors: Float32Array;
  edges: Uint32Array; // pairs of indices
  count: number;
}

/* Map a unit direction onto an anatomically-shaped cerebrum surface.
   Returns the fold depth (for colouring). Writes the point into `out`. */
function brainShape(dir: THREE.Vector3, out: THREE.Vector3): number {
  // anisotropic body — wider than tall, elongated front (z+) to back (z-)
  out.set(dir.x * 1.36, dir.y * 0.9, dir.z * 1.18);

  // occipital taper: the back of the brain narrows to a point
  if (dir.z < 0) {
    out.x *= 1 + dir.z * 0.16;
    out.y *= 1 + dir.z * 0.07;
  }
  // temporal lobes: bulge the lower sides outward
  if (dir.y < -0.05) out.x *= 1.06;
  // flatten the underside (the brain sits flat-ish on its base)
  if (out.y < 0) out.y *= 0.8;

  // ridged sulci / gyri — creases (folds) rather than isotropic bumps
  const r1 = 1 - Math.abs(Math.sin(dir.x * 6.5 + dir.z * 2.0));
  const r2 = 1 - Math.abs(Math.sin(dir.y * 8.0 + dir.z * 4.5));
  const r3 = 1 - Math.abs(Math.sin(dir.z * 7.0 - dir.x * 3.5));
  let fold = 0.05 * r1 + 0.045 * r2 + 0.035 * r3 - 0.06;
  fold += 0.018 * Math.sin(dir.x * 20) * Math.sin(dir.z * 18); // fine detail
  out.addScaledVector(dir, fold);

  // interhemispheric (longitudinal) fissure: deep groove down the top midline
  const midline = Math.exp(-(out.x * out.x) / 0.01);
  const topw = Math.max(0, out.y + 0.05);
  out.y -= 0.13 * midline * topw;
  out.x += (out.x >= 0 ? 1 : -1) * 0.06 * midline * topw;

  return fold;
}

function buildBrain(count: number): BrainData {
  const pts: THREE.Vector3[] = [];
  const cols: THREE.Color[] = [];
  const GA = Math.PI * (1 + Math.sqrt(5));
  const dir = new THREE.Vector3();
  const p = new THREE.Vector3();

  // ---- cerebrum surface (the eligible synapse nodes) ----
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
    const theta = GA * (i + 0.5);
    dir.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    const fold = brainShape(dir, p);
    pts.push(p.clone());

    // gyral crests glow amber/gold, deep sulci go crimson; frontal lobe warmer
    const t = THREE.MathUtils.clamp(fold * 6 + 0.5, 0, 1);
    const col = new THREE.Color().lerpColors(C_RED, C_AMBER, t);
    if (dir.z > 0.3) col.lerp(C_GOLD, 0.25 * dir.z);
    if (i % 13 === 0) col.lerp(C_GOLD, 0.7);
    cols.push(col);
  }

  // ---- cerebellum: two-lobed bulge at the lower back, tight horizontal folia ----
  const cereN = Math.floor(count * 0.12);
  const cereCenter = new THREE.Vector3(0, -0.62, -0.92);
  for (let i = 0; i < cereN; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / cereN);
    const theta = GA * (i + 0.5);
    dir.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    const folia = 0.045 * (1 - Math.abs(Math.sin(dir.y * 22)));
    p.set(dir.x * 0.44, dir.y * 0.3, dir.z * 0.34);
    p.addScaledVector(dir, folia);
    p.x += (p.x >= 0 ? 1 : -1) * 0.045; // split into two lobes
    p.add(cereCenter);
    pts.push(p.clone());
    cols.push(new THREE.Color().lerpColors(C_DEEP, C_AMBER, 0.3 + folia * 8));
  }

  const surfaceCount = pts.length;

  // ---- brain stem ----
  const stemN = Math.floor(count * 0.03);
  for (let i = 0; i < stemN; i++) {
    const f = i / stemN;
    const a = f * Math.PI * 8;
    const rad = 0.13 * (1 - f * 0.55);
    pts.push(new THREE.Vector3(Math.cos(a) * rad, -0.95 - f * 0.55, Math.sin(a) * rad - 0.55));
    cols.push(new THREE.Color().lerpColors(C_RED, C_AMBER, f));
  }

  // ---- inner volume shell: dim interior points for depth (excluded from edges) ----
  const innerN = Math.floor(count * 0.45);
  for (let i = 0; i < innerN; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / innerN);
    const theta = GA * (i + 0.5) * 1.7;
    dir.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    brainShape(dir, p);
    p.multiplyScalar(0.78);
    pts.push(p.clone());
    const c = new THREE.Color().lerpColors(C_DEEP, C_RED, 0.5).multiplyScalar(0.5);
    cols.push(c);
  }

  // pack into typed arrays
  const n = pts.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = pts[i].x;
    positions[i * 3 + 1] = pts[i].y;
    positions[i * 3 + 2] = pts[i].z;
    colors[i * 3] = cols[i].r;
    colors[i * 3 + 1] = cols[i].g;
    colors[i * 3 + 2] = cols[i].b;
  }

  // connect near neighbours into synapses (surface nodes only, degree-capped)
  const edgeList: number[] = [];
  const degree = new Uint8Array(surfaceCount);
  const maxDeg = 3;
  const thr = 0.155;
  const thr2 = thr * thr;
  const maxEdges = 5000;
  for (let i = 0; i < surfaceCount && edgeList.length / 2 < maxEdges; i++) {
    if (degree[i] >= maxDeg) continue;
    const ax = positions[i * 3];
    const ay = positions[i * 3 + 1];
    const az = positions[i * 3 + 2];
    for (let j = i + 1; j < surfaceCount; j++) {
      if (degree[i] >= maxDeg) break;
      if (degree[j] >= maxDeg) continue;
      const dx = ax - positions[j * 3];
      const dy = ay - positions[j * 3 + 1];
      const dz = az - positions[j * 3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < thr2) {
        edgeList.push(i, j);
        degree[i]++;
        degree[j]++;
      }
    }
  }

  return {
    positions,
    colors,
    edges: new Uint32Array(edgeList),
    count: n,
  };
}

export default function NeuralBrainCanvas({ className }: NeuralBrainCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ---- WebGL capability guard ----
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return; // no WebGL → CSS background stays
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;
    const DPR = Math.min(window.devicePixelRatio || 1, 1.75);

    renderer.setPixelRatio(DPR);
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const nebula = makeNebulaTexture();
    scene.background = nebula;
    scene.fog = new THREE.FogExp2(0x060102, 0.085);

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 4.25);

    const glow = makeGlowTexture();

    /* ---------------- BRAIN ---------------- */
    const brainGroup = new THREE.Group();
    scene.add(brainGroup);

    const brain = buildBrain(1600);

    // nodes
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(brain.positions, 3));
    nodeGeo.setAttribute('color', new THREE.BufferAttribute(brain.colors, 3));
    const nodeMat = new THREE.PointsMaterial({
      size: 0.05,
      map: glow,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      opacity: 0.95,
    });
    const nodes = new THREE.Points(nodeGeo, nodeMat);
    brainGroup.add(nodes);

    // synapse lines
    const edgeCount = brain.edges.length / 2;
    const linePos = new Float32Array(edgeCount * 6);
    const lineCol = new Float32Array(edgeCount * 6);
    for (let e = 0; e < edgeCount; e++) {
      const a = brain.edges[e * 2];
      const b = brain.edges[e * 2 + 1];
      for (let k = 0; k < 3; k++) {
        linePos[e * 6 + k] = brain.positions[a * 3 + k];
        linePos[e * 6 + 3 + k] = brain.positions[b * 3 + k];
        lineCol[e * 6 + k] = brain.colors[a * 3 + k] * 0.5;
        lineCol[e * 6 + 3 + k] = brain.colors[b * 3 + k] * 0.5;
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3));
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.32,
    });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    brainGroup.add(lines);

    // firing pulses travelling along edges
    const PULSES = prefersReduced ? 0 : 70;
    const pulsePos = new Float32Array(Math.max(PULSES, 1) * 3);
    const pulseState = Array.from({ length: PULSES }, () => ({
      edge: Math.floor((Math.random() * edgeCount) % edgeCount),
      t: Math.random(),
      speed: 0.004 + Math.random() * 0.012,
    }));
    const pulseGeo = new THREE.BufferGeometry();
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
    const pulseMat = new THREE.PointsMaterial({
      size: 0.13,
      map: glow,
      color: new THREE.Color('#fff2cc'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pulses = new THREE.Points(pulseGeo, pulseMat);
    if (PULSES > 0) brainGroup.add(pulses);

    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    function updatePulses() {
      for (let p = 0; p < PULSES; p++) {
        const st = pulseState[p];
        st.t += st.speed;
        if (st.t >= 1) {
          st.t = 0;
          st.edge = Math.floor(Math.random() * edgeCount) % edgeCount;
          st.speed = 0.004 + Math.random() * 0.012;
        }
        const a = brain.edges[st.edge * 2];
        const b = brain.edges[st.edge * 2 + 1];
        va.set(brain.positions[a * 3], brain.positions[a * 3 + 1], brain.positions[a * 3 + 2]);
        vb.set(brain.positions[b * 3], brain.positions[b * 3 + 1], brain.positions[b * 3 + 2]);
        va.lerp(vb, st.t);
        pulsePos[p * 3] = va.x;
        pulsePos[p * 3 + 1] = va.y;
        pulsePos[p * 3 + 2] = va.z;
      }
      pulseGeo.attributes.position.needsUpdate = true;
    }

    /* ---------------- ORBITING CODE GLYPHS ---------------- */
    const GLYPH_SET = [
      '</>', '{ }', '=>', '01', 'fn', '[ ]', 'AI', '#', '0x', '++',
      '||', '::', 'λ', 'Σ', 'def', 'async', '0110', 'GET', '/>', '==',
      '!=', '{...}', 'npm', 'git', '<AI/>', '01101', '&&', 'sql',
    ];
    const glyphGroup = new THREE.Group();
    brainGroup.add(glyphGroup);
    const glyphTexCache = new Map<string, THREE.Texture>();
    const NGLYPH = prefersReduced ? 14 : 30;
    const glyphData: {
      sp: THREE.Sprite;
      q: THREE.Quaternion;
      r: number;
      speed: number;
      phase: number;
      ellip: number;
      bob: number;
      seed: number;
    }[] = [];
    const _euler = new THREE.Euler();
    for (let i = 0; i < NGLYPH; i++) {
      const text = GLYPH_SET[i % GLYPH_SET.length];
      let tex = glyphTexCache.get(text);
      if (!tex) {
        tex = makeGlyphTexture(text);
        glyphTexCache.set(text, tex);
      }
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      });
      const sp = new THREE.Sprite(mat);
      const sc = 0.28 + Math.random() * 0.26;
      sp.scale.set(sc, sc * 0.5, 1);
      _euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      glyphData.push({
        sp,
        q: new THREE.Quaternion().setFromEuler(_euler),
        r: 1.75 + Math.random() * 1.55,
        speed: (0.1 + Math.random() * 0.28) * (Math.random() > 0.5 ? 1 : -1),
        phase: Math.random() * Math.PI * 2,
        ellip: 0.5 + Math.random() * 0.45,
        bob: 0.08 + Math.random() * 0.22,
        seed: Math.random() * Math.PI * 2,
      });
      glyphGroup.add(sp);
    }
    const gv = new THREE.Vector3();

    /* ---------------- BINARY STREAMS ---------------- */
    const binaryTex = makeBinaryTexture();
    const binaryGroup = new THREE.Group();
    scene.add(binaryGroup);
    const binPlanes: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const m = new THREE.MeshBasicMaterial({
        map: binaryTex.clone(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.16,
      });
      (m.map as THREE.Texture).repeat.set(4, 4);
      (m.map as THREE.Texture).needsUpdate = true;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), m);
      plane.position.set(i === 0 ? -1.5 : 1.5, 0, -4 - i * 1.5);
      binaryGroup.add(plane);
      binPlanes.push(plane);
    }

    /* ---------------- STARFIELD ---------------- */
    const STAR = 1400;
    const starPos = new Float32Array(STAR * 3);
    const starCol = new Float32Array(STAR * 3);
    for (let i = 0; i < STAR; i++) {
      const r = 8 + Math.random() * 12;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      starPos[i * 3 + 2] = r * Math.cos(ph);
      const c = Math.random() > 0.7 ? C_AMBER : new THREE.Color(0.9, 0.85, 0.8);
      starCol[i * 3] = c.r;
      starCol[i * 3 + 1] = c.g;
      starCol[i * 3 + 2] = c.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.05,
      map: glow,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.7,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    /* ---------------- POST-PROCESSING (BLOOM) ---------------- */
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(DPR);
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.15, // strength
      0.62, // radius
      0.0, // threshold (dark scene → bloom everything bright)
    );
    composer.addPass(bloom);

    /* ---------------- INTERACTION + LOOP ---------------- */
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    function onPointerMove(e: PointerEvent) {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    // scroll-zoom: dolly the camera + lift the brain as the hero scrolls away
    let scrollY = 0;
    function onScroll() {
      scrollY = window.scrollY || window.pageYOffset || 0;
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    function resize() {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let visible = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !prefersReduced) loop();
      },
      { threshold: 0 },
    );
    io.observe(container);

    let raf = 0;
    const clock = new THREE.Clock();

    function frame() {
      const t = clock.getElapsedTime();

      // scroll progress across the first viewport (0 → 1)
      const sp = Math.min(Math.max(scrollY / (window.innerHeight || 1), 0), 1);

      // smooth parallax
      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;

      brainGroup.rotation.y = t * 0.07 + pointer.x * 0.35 + sp * 0.4;
      brainGroup.rotation.x = Math.sin(t * 0.18) * 0.06 + pointer.y * 0.18;
      brainGroup.position.y = Math.sin(t * 0.6) * 0.04 + sp * 0.5;
      brainGroup.scale.setScalar(1 + sp * 0.18);

      updatePulses();

      // node twinkle
      nodeMat.size = 0.04 + Math.sin(t * 2.2) * 0.006;

      // orbiting code glyphs (fade in, twinkle, bob on tilted orbits)
      const glyphFade = Math.min(1, t * 0.5);
      for (const g of glyphData) {
        const a = t * g.speed + g.phase;
        gv.set(Math.cos(a) * g.r, Math.sin(a) * g.r * g.ellip, 0);
        gv.applyQuaternion(g.q);
        gv.y += Math.sin(t * 0.8 + g.seed) * g.bob;
        g.sp.position.copy(gv);
        const tw = 0.55 + 0.45 * Math.sin(t * 1.5 + g.seed);
        (g.sp.material as THREE.SpriteMaterial).opacity = 0.85 * tw * glyphFade;
      }

      // drifting binary
      
      binPlanes.forEach((p, i) => {
        const map = (p.material as THREE.MeshBasicMaterial).map;
         if (map) map.offset.y = (t * (0.01 + i * 0.006)) % 1;
      });

      stars.rotation.y = t * 0.01;

      // scroll-zoom dolly + bloom swell
      const targetZ = 4.25 - sp * 1.25;
      camera.position.z += (targetZ - camera.position.z) * 0.06;
      camera.position.x += (pointer.x * 0.25 - camera.position.x) * 0.04;
      camera.lookAt(0, 0, 0);
      bloom.strength = 1.15 + sp * 0.45;

      composer.render();
    }

    function loop() {
      cancelAnimationFrame(raf);
      const run = () => {
        if (!visible) return;
        frame();
        raf = requestAnimationFrame(run);
      };
      raf = requestAnimationFrame(run);
    }

    // first paint (always render at least one frame, even reduced-motion)
    frame();
    if (!prefersReduced) loop();

    /* ---------------- CLEANUP ---------------- */
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      ro.disconnect();
      io.disconnect();

      scene.traverse((obj) => {
        const any = obj as unknown as {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        any.geometry?.dispose();
        if (Array.isArray(any.material)) any.material.forEach((m) => m.dispose());
        else any.material?.dispose();
      });
      glow.dispose();
      nebula.dispose();
      binaryTex.dispose();
      glyphTexCache.forEach((tex) => tex.dispose());
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835
      }
    };
  }, []);

  return (
    <div
<<<<<<< HEAD
      ref={mountRef}
      className={cn('absolute inset-0 w-full h-full', className)}
=======
      ref={containerRef}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0', className)}
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835
    />
  );
}
