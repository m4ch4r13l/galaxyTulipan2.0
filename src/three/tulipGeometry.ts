import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface TulipSharedGeometries {
  stemAndLeaves: THREE.BufferGeometry;
  outerPetals: THREE.BufferGeometry;
  innerPetals: THREE.BufferGeometry;
  stamenCore: THREE.BufferGeometry;
  hitProxy: THREE.BufferGeometry;
}

/**
 * Sculpts a high-resolution botanical tulip petal with natural longitudinal
 * curvature, cupped cross-section, gentle midrib crease, and tapered tip.
 */
function createHighQualityPetal(
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
    const v = iv / segV; // 0 = base, 1 = tip
    // Botanical silhouette: narrow attachment, lush rounded belly at v~0.42, delicate tip
    const widthEnvelope =
      Math.pow(Math.sin(Math.pow(v, 0.72) * Math.PI), 0.85) * 0.96 +
      (1 - v) * 0.08;
    // Outward curve like a real tulip chalice (curves out then slightly inward near tip)
    const chaliceProfile =
      Math.sin(v * Math.PI * 0.92) * cupDepth +
      Math.sin(v * Math.PI * 0.5) * leanOut -
      Math.pow(v, 3.2) * 0.48;
    const y = v * height;

    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const s = (u - 0.5) * 2.0; // -1..1
      const x = s * width * 0.5 * widthEnvelope;
      // Smooth transverse cupping + subtle central petal vein crease
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
 * Sculpts a gracefully sweeping tulip leaf wrapping around the stem base.
 */
function createBotanicalLeaf(
  sideSign: number,
  yBase: number,
  lengthScale: number,
  twistAngle: number,
): THREE.BufferGeometry {
  const segL = 12;
  const segW = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let il = 0; il <= segL; il++) {
    const t = il / segL;
    const width = Math.sin(Math.pow(t, 0.58) * Math.PI) * 1.95;
    const xCenter = sideSign * (0.28 + Math.pow(t, 1.15) * 4.2 * lengthScale);
    const yCenter =
      yBase + Math.sin(t * Math.PI * 0.78) * 6.4 * lengthScale - t * t * 1.1;
    const zCenter = Math.sin(t * Math.PI) * 0.45 * sideSign;

    for (let iw = 0; iw <= segW; iw++) {
      const u = iw / segW;
      const s = (u - 0.5) * 2.0;
      const zOffset = s * width * 0.5;
      // Channel trough down the center of a tulip leaf
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
 * Builds high-detail botanical tulip geometries shared across all instanced tulips:
 * - Smooth curved stem + receptacle calyx + 2 embracing leaves
 * - 3 outer sculpted overlapping petals
 * - 3 inner cupped petals
 * - Central pistil & 6 stamen filaments/anthers
 */
export function buildHighQualityTulipGeometries(): TulipSharedGeometries {
  // 1. Curved organic stem + swollen floral receptacle + 2 embracing leaves
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

  const stemParts = [stemGeo, receptacleGeo, leafA, leafB].map((g) => {
    const nonIdx = g.index ? g.toNonIndexed() : g;
    nonIdx.computeVertexNormals();
    return nonIdx;
  });
  const stemAndLeaves = mergeGeometries(stemParts, false);
  stemGeo.dispose();
  receptacleGeo.dispose();
  leafA.dispose();
  leafB.dispose();
  stemParts.forEach((p) => p.dispose());

  // 2. Outer whorl of 3 lush sculpted petals (0, 120, 240 deg)
  const outerParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const p = createHighQualityPetal(3.8, 6.4, 1.55, 0.65, 0.52);
    p.rotateY((i * Math.PI * 2) / 3);
    const nonIdx = p.toNonIndexed();
    nonIdx.computeVertexNormals();
    outerParts.push(nonIdx);
    p.dispose();
  }
  const outerPetals = mergeGeometries(outerParts, false);
  outerParts.forEach((p) => p.dispose());

  // 3. Inner whorl of 3 taller cupped petals offset by 60 deg
  const innerParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const p = createHighQualityPetal(3.35, 6.25, 1.32, 0.38, 0.36);
    p.rotateY((i * Math.PI * 2) / 3 + Math.PI / 3);
    const nonIdx = p.toNonIndexed();
    nonIdx.computeVertexNormals();
    innerParts.push(nonIdx);
    p.dispose();
  }
  const innerPetals = mergeGeometries(innerParts, false);
  innerParts.forEach((p) => p.dispose());

  // 4. Botanical stamen cluster (central pistil + 6 delicate anthers)
  const stamenParts: THREE.BufferGeometry[] = [];
  const pistil = new THREE.CylinderGeometry(0.28, 0.42, 2.3, 10);
  pistil.translate(0, 1.35, 0);
  stamenParts.push(pistil.toNonIndexed());
  pistil.dispose();

  for (let s = 0; s < 6; s++) {
    const angle = (s * Math.PI * 2) / 6;
    const anther = new THREE.CapsuleGeometry(0.14, 0.55, 4, 8);
    anther.rotateZ(0.18);
    anther.rotateY(angle);
    anther.translate(Math.cos(angle) * 0.62, 1.95, Math.sin(angle) * 0.62);
    stamenParts.push(anther.toNonIndexed());
    anther.dispose();
  }
  stamenParts.forEach((p) => p.computeVertexNormals());
  const stamenCore = mergeGeometries(stamenParts, false);
  stamenParts.forEach((p) => p.dispose());

  // 5. Simplified invisible proxy sphere for crisp raycasting
  const hitProxy = new THREE.SphereGeometry(5.6, 8, 8);
  hitProxy.translate(0, 1.4, 0);

  return {
    stemAndLeaves,
    outerPetals,
    innerPetals,
    stamenCore,
    hitProxy,
  };
}
