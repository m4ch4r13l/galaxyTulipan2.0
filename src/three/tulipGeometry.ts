import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FlowerType } from '../data/tulips';

export interface TulipSharedGeometries {
  stemAndLeaves: THREE.BufferGeometry;
  outerPetals: THREE.BufferGeometry;
  innerPetals: THREE.BufferGeometry;
  stamenCore: THREE.BufferGeometry;
  hitProxy: THREE.BufferGeometry;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((g) => {
    const nonIdx = g.index ? g.toNonIndexed() : g;
    nonIdx.computeVertexNormals();
    return nonIdx;
  });
  const merged = mergeGeometries(prepared, false);
  parts.forEach((p) => p.dispose());
  prepared.forEach((p) => p.dispose());
  return merged;
}

/**
 * Sculpts a curved botanical tulip petal.
 */
function createTulipPetal(
  width: number,
  height: number,
  cupDepth: number,
  leanOut: number,
  radialOffset: number,
): THREE.BufferGeometry {
  const segU = 12;
  const segV = 14;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    const widthEnvelope =
      Math.pow(Math.sin(Math.pow(v, 0.72) * Math.PI), 0.85) * 0.96 +
      (1 - v) * 0.08;
    const chaliceProfile =
      Math.sin(v * Math.PI * 0.92) * cupDepth +
      Math.sin(v * Math.PI * 0.5) * leanOut -
      Math.pow(v, 3.2) * 0.48;
    const y = v * height;

    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const s = (u - 0.5) * 2.0;
      const x = s * width * 0.5 * widthEnvelope;
      const transverseCup = (1 - s * s) * cupDepth * 0.58;
      const veinGroove = -Math.exp(-s * s * 14.0) * 0.09 * Math.sin(v * Math.PI);
      const z = chaliceProfile + transverseCup + veinGroove;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * (segU + 1) + iu;
      const b = a + 1;
      const c = a + (segU + 1);
      const d = c + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.translate(0, 0, radialOffset);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts a gracefully sweeping botanical leaf.
 */
function createBotanicalLeaf(
  sideSign: number,
  yBase: number,
  lengthScale: number,
  twistAngle: number,
  widthScale = 1.0,
): THREE.BufferGeometry {
  const segL = 12;
  const segW = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let il = 0; il <= segL; il++) {
    const t = il / segL;
    const width = Math.sin(Math.pow(t, 0.58) * Math.PI) * 1.95 * widthScale;
    const xCenter = sideSign * (0.28 + Math.pow(t, 1.15) * 4.2 * lengthScale);
    const yCenter =
      yBase + Math.sin(t * Math.PI * 0.78) * 6.4 * lengthScale - t * t * 1.1;
    const zCenter = Math.sin(t * Math.PI) * 0.45 * sideSign;

    for (let iw = 0; iw <= segW; iw++) {
      const u = iw / segW;
      const s = (u - 0.5) * 2.0;
      const zOffset = s * width * 0.5;
      const channelHeight = Math.abs(s) * 0.42;
      positions.push(xCenter, yCenter + channelHeight, zCenter + zOffset);
      uvs.push(u, t);
    }
  }

  for (let il = 0; il < segL; il++) {
    for (let iw = 0; iw < segW; iw++) {
      const a = il * (segW + 1) + iw;
      const b = a + 1;
      const c = a + (segW + 1);
      const d = c + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.rotateY(twistAngle);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts a broad, curled rose petal with rolled upper lip.
 */
function createRosePetal(
  width: number,
  height: number,
  curlOut: number,
  tiltOut: number,
  radialOffset: number,
): THREE.BufferGeometry {
  const segU = 10;
  const segV = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    // Rose petals flare wide toward the top rounded edge
    const widthProfile = Math.sin(Math.pow(v, 0.52) * Math.PI * 0.85) * 1.05 + 0.14;
    // Upper edge rolls gracefully outward
    const upperCurl = Math.pow(Math.max(0, v - 0.55) / 0.45, 2) * curlOut;
    const zCurve = Math.sin(v * Math.PI * 0.7) * 0.65 + upperCurl + v * tiltOut;
    const y = v * height;

    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const s = (u - 0.5) * 2.0;
      const x = s * width * 0.5 * widthEnvelopeClamp(widthProfile);
      const wrapCup = (1 - s * s) * (0.85 * Math.sin(v * Math.PI * 0.85));
      positions.push(x, y, zCurve + wrapCup);
      uvs.push(u, v);
    }
  }

  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * (segU + 1) + iu;
      const b = a + 1;
      const c = a + (segU + 1);
      const d = c + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.translate(0, 0, radialOffset);
  geo.computeVertexNormals();
  return geo;
}

function widthEnvelopeClamp(val: number): number {
  return Math.max(0.1, Math.min(1.25, val));
}

/**
 * Sculpts a gracefully arching, pointed star-lily petal.
 */
function createLilyPetal(
  width: number,
  length: number,
  archDrop: number,
  radialOffset: number,
): THREE.BufferGeometry {
  const segU = 10;
  const segV = 14;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    // Pointed lanceolate profile
    const widthProfile = Math.sin(Math.pow(v, 0.72) * Math.PI) * 1.02;
    // Rises from center then sweeps gracefully outward & arches downward at the tip
    const rOut = radialOffset + v * length * 0.85;
    const y = Math.sin(v * Math.PI * 0.82) * 3.1 - Math.pow(v, 2.2) * archDrop;

    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const s = (u - 0.5) * 2.0;
      const x = s * width * 0.5 * widthProfile;
      // Gently reflexed edges + raised midrib
      const cup = -Math.abs(s) * 0.25 * Math.sin(v * Math.PI) + (1 - s * s) * 0.22;
      positions.push(x, y + cup, rOut);
      uvs.push(u, v);
    }
  }

  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * (segU + 1) + iu;
      const b = a + 1;
      const c = a + (segU + 1);
      const d = c + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildHighQualityTulipGeometries(): TulipSharedGeometries {
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -14.2, 0),
    new THREE.Vector3(0.32, -9.5, 0.16),
    new THREE.Vector3(-0.22, -4.6, -0.12),
    new THREE.Vector3(0, 0.15, 0),
  ]);
  const stemGeo = new THREE.TubeGeometry(stemCurve, 16, 0.36, 12, false);
  const receptacleGeo = new THREE.SphereGeometry(0.68, 12, 10);
  receptacleGeo.scale(1.0, 1.3, 1.0);
  receptacleGeo.translate(0, 0.1, 0);

  const leafA = createBotanicalLeaf(1, -10.8, 1.0, 0.25);
  const leafB = createBotanicalLeaf(-1, -12.0, 0.92, -0.35);
  const stemAndLeaves = mergeParts([stemGeo, receptacleGeo, leafA, leafB]);

  const outerParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const p = createTulipPetal(3.8, 6.4, 1.55, 0.65, 0.52);
    p.rotateY((i * Math.PI * 2) / 3);
    outerParts.push(p);
  }
  const outerPetals = mergeParts(outerParts);

  const innerParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const p = createTulipPetal(3.35, 6.25, 1.32, 0.38, 0.36);
    p.rotateY((i * Math.PI * 2) / 3 + Math.PI / 3);
    innerParts.push(p);
  }
  const innerPetals = mergeParts(innerParts);

  const stamenParts: THREE.BufferGeometry[] = [];
  const pistil = new THREE.CylinderGeometry(0.28, 0.42, 2.3, 10);
  pistil.translate(0, 1.35, 0);
  stamenParts.push(pistil);

  for (let s = 0; s < 6; s++) {
    const angle = (s * Math.PI * 2) / 6;
    const anther = new THREE.CapsuleGeometry(0.14, 0.55, 4, 8);
    anther.rotateZ(0.18);
    anther.rotateY(angle);
    anther.translate(Math.cos(angle) * 0.62, 1.95, Math.sin(angle) * 0.62);
    stamenParts.push(anther);
  }
  const stamenCore = mergeParts(stamenParts);

  const hitProxy = new THREE.SphereGeometry(9.5, 8, 8);
  hitProxy.translate(0, -1.2, 0);

  return { stemAndLeaves, outerPetals, innerPetals, stamenCore, hitProxy };
}

export function buildRoseGeometries(): TulipSharedGeometries {
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -14.2, 0),
    new THREE.Vector3(0.26, -9.2, -0.14),
    new THREE.Vector3(-0.2, -4.4, 0.14),
    new THREE.Vector3(0, 0.25, 0),
  ]);
  const stemGeo = new THREE.TubeGeometry(stemCurve, 14, 0.32, 10, false);
  const receptacle = new THREE.SphereGeometry(0.95, 12, 10);
  receptacle.scale(1.1, 0.85, 1.1);
  receptacle.translate(0, 0.2, 0);

  const stemParts: THREE.BufferGeometry[] = [
    stemGeo,
    receptacle,
    createBotanicalLeaf(1, -8.5, 0.72, 0.3, 1.25),
    createBotanicalLeaf(-1, -10.5, 0.68, -0.45, 1.25),
  ];

  // 5 pointed green calyx sepals flaring under the rose
  for (let s = 0; s < 5; s++) {
    const sepal = new THREE.ConeGeometry(0.55, 2.4, 4);
    sepal.rotateX(Math.PI * 0.42);
    sepal.rotateY((s * Math.PI * 2) / 5);
    sepal.translate(
      Math.cos((s * Math.PI * 2) / 5) * 1.1,
      0.35,
      Math.sin((s * Math.PI * 2) / 5) * 1.1,
    );
    stemParts.push(sepal);
  }
  const stemAndLeaves = mergeParts(stemParts);

  // Outer spiral ring of 7 lush open rose petals
  const goldenAngle = 2.3999632;
  const outerParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const angle = i * goldenAngle;
    const p = createRosePetal(4.0, 4.9, 1.45, 1.65, 1.25 + (i % 2) * 0.2);
    p.rotateY(angle);
    outerParts.push(p);
  }
  const outerPetals = mergeParts(outerParts);

  // Inner tightly swirled rose bud of 6 petals
  const innerParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = i * goldenAngle + 0.9;
    const p = createRosePetal(2.85, 4.5, 0.72, 0.55, 0.48 + i * 0.08);
    p.rotateY(angle);
    innerParts.push(p);
  }
  const innerPetals = mergeParts(innerParts);

  const stamenCore = new THREE.SphereGeometry(0.65, 10, 10);
  stamenCore.translate(0, 2.1, 0);

  const hitProxy = new THREE.SphereGeometry(9.5, 8, 8);
  hitProxy.translate(0, -1.2, 0);

  return { stemAndLeaves, outerPetals, innerPetals, stamenCore, hitProxy };
}

export function buildLilyGeometries(): TulipSharedGeometries {
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -14.2, 0),
    new THREE.Vector3(-0.22, -9.0, 0.16),
    new THREE.Vector3(0.2, -4.2, -0.1),
    new THREE.Vector3(0, 0.2, 0),
  ]);
  const stemGeo = new THREE.TubeGeometry(stemCurve, 14, 0.34, 10, false);
  const receptacle = new THREE.SphereGeometry(0.65, 10, 10);
  receptacle.translate(0, 0.2, 0);

  const stemAndLeaves = mergeParts([
    stemGeo,
    receptacle,
    createBotanicalLeaf(1, -9.5, 0.98, 0.2, 0.72),
    createBotanicalLeaf(-1, -10.8, 0.92, 2.2, 0.72),
    createBotanicalLeaf(1, -12.2, 0.85, 4.2, 0.72),
  ]);

  // 3 wide arching outer lily petals
  const outerParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const p = createLilyPetal(3.2, 6.6, 2.3, 0.35);
    p.rotateY((i * Math.PI * 2) / 3);
    outerParts.push(p);
  }
  const outerPetals = mergeParts(outerParts);

  // 3 alternating inner lily petals
  const innerParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const p = createLilyPetal(2.75, 6.2, 1.85, 0.3);
    p.rotateY((i * Math.PI * 2) / 3 + Math.PI / 3);
    innerParts.push(p);
  }
  const innerPetals = mergeParts(innerParts);

  // Prominent radiating lily stamens + central style
  const stamenParts: THREE.BufferGeometry[] = [];
  const style = new THREE.CylinderGeometry(0.12, 0.16, 4.2, 8);
  style.translate(0, 2.3, 0);
  stamenParts.push(style);

  const stigma = new THREE.SphereGeometry(0.32, 8, 8);
  stigma.translate(0, 4.4, 0);
  stamenParts.push(stigma);

  for (let s = 0; s < 6; s++) {
    const angle = (s * Math.PI * 2) / 6;
    const filament = new THREE.CylinderGeometry(0.08, 0.1, 3.8, 6);
    filament.rotateZ(-0.42);
    filament.rotateY(angle);
    filament.translate(Math.cos(angle) * 0.75, 1.85, Math.sin(angle) * 0.75);
    stamenParts.push(filament);

    const anther = new THREE.CapsuleGeometry(0.18, 0.55, 4, 6);
    anther.rotateZ(Math.PI / 2.2);
    anther.rotateY(angle);
    anther.translate(Math.cos(angle) * 1.55, 3.45, Math.sin(angle) * 1.55);
    stamenParts.push(anther);
  }
  const stamenCore = mergeParts(stamenParts);

  const hitProxy = new THREE.SphereGeometry(9.5, 8, 8);
  hitProxy.translate(0, -1.2, 0);

  return { stemAndLeaves, outerPetals, innerPetals, stamenCore, hitProxy };
}

export function buildFlowerGeometries(type: FlowerType): TulipSharedGeometries {
  switch (type) {
    case 'rose':
      return buildRoseGeometries();
    case 'lily':
      return buildLilyGeometries();
    default:
      return buildHighQualityTulipGeometries();
  }
}
