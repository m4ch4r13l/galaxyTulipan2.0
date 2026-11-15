import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TULIP_MEMORIES, TULIP_PALETTE } from '../data/tulips';
import { buildHighQualityTulipGeometries } from './tulipGeometry';

export interface TulipEngineCallbacks {
  onIntroComplete?: () => void;
  onModeChange?: (isOrbit: boolean) => void;
  onTulipSelect?: (memoryIndex: number) => void;
  onHoverChange?: (isHovering: boolean) => void;
  onContextLost?: (lost: boolean) => void;
}

interface TulipInstanceState {
  basePos: THREE.Vector3;
  baseScale: number;
  currentScale: number;
  rotY: number;
  rotSpeed: number;
  phase: number;
  memoryIndex: number;
  burstColor: THREE.Color;
}

interface BurstParticleState {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  decay: number;
}

interface ShootingStarState {
  active: boolean;
  px: number;
  py: number;
  pz: number;
  dx: number;
  dy: number;
  dz: number;
  life: number;
  decay: number;
}

const TULIP_COUNT = 47;
const MAX_BURST_PARTICLES = 360;
const BURST_COUNT_PER_CLICK = 75;
const MAX_SHOOTING_STARS = 8;

const _dummy = new THREE.Object3D();
const _vec3 = new THREE.Vector3();
const _color = new THREE.Color();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class TulipGalaxyEngine {
  private container: HTMLElement;
  private callbacks: TulipEngineCallbacks;
  private isSoftwareGl: boolean;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;

  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;

  // Original galaxy particle layers
  private backgroundStars!: THREE.Points;
  private distantGalaxies!: THREE.Points;
  private nebulaClouds!: THREE.Points;
  private coreParticleCloud!: THREE.Points;
  private galaxyParticles!: THREE.Points;
  private particleTexture!: THREE.CanvasTexture;

  // High-quality Instanced Tulips
  private tulipStates: TulipInstanceState[] = [];
  private stemMesh!: THREE.InstancedMesh;
  private outerPetalMesh!: THREE.InstancedMesh;
  private innerPetalMesh!: THREE.InstancedMesh;
  private stamenMesh!: THREE.InstancedMesh;
  private hitProxyMesh!: THREE.InstancedMesh;
  private hoveredTulipId: number | null = null;

  // Pooled bursts (keeps original glowing sphere look in 1 instanced draw call)
  private burstPool: BurstParticleState[] = [];
  private burstCursor = 0;
  private burstMesh!: THREE.InstancedMesh;

  // Pooled shooting stars
  private shootingStarPool: ShootingStarState[] = [];
  private shootingStarGeometry!: THREE.BufferGeometry;
  private shootingStarPositions!: Float32Array;
  private shootingStarColors!: Float32Array;
  private lastShootingStarTime = 0;

  // Camera & interaction state
  private isAutoRotating = true;
  private isIntroZooming = true;
  private cameraRadius = 2200;
  private targetCameraRadius = 260;
  private targetRotationX = 0.3;
  private targetRotationY = 0;
  private currentRotationX = 0.3;
  private currentRotationY = 0;

  private isDragging = false;
  private pointerDownPos = { x: 0, y: 0 };
  private previousPointerPos = { x: 0, y: 0 };
  private dragDistance = 0;
  private initialPinchDistance: number | null = null;
  private lastHoverCheck = 0;

  private raycaster = new THREE.Raycaster();
  private pointerNDC = new THREE.Vector2();

  private disposableGeometries: THREE.BufferGeometry[] = [];
  private disposableMaterials: THREE.Material[] = [];

  constructor(container: HTMLElement, callbacks: TulipEngineCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    const pixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0212);
    this.scene.fog = new THREE.FogExp2(0x0b0212, 0.0014);

    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 3000);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    container.appendChild(this.renderer.domElement);

    this.setupLightingAndEnvironment();
    this.particleTexture = this.createParticleTexture();

    // Original galaxy visual layers
    this.buildBackgroundStars();
    this.buildDistantGalaxies();
    this.buildNebulaDust();
    this.buildDiffuseGalaxyCore();
    this.buildMultiArmGalaxy();

    // High-quality sculpted botanical tulips
    this.buildHighQualityInstancedTulips();

    // Pooled effects
    this.buildPooledBurstSystem();
    this.buildPooledShootingStars();

    this.updateCameraTransform();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.startLoop();
  }

  private setupLightingAndEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRenderTarget = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const hemiLight = new THREE.HemisphereLight(0xffd1dc, 0x1e0826, 1.35);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffe4e6, 1.85);
    keyLight.position.set(140, 220, 180);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.0);
    rimLight.position.set(-180, -80, -160);
    this.scene.add(rimLight);

    const corePointLight = new THREE.PointLight(0xffb6c1, 5.0, 720);
    corePointLight.position.set(0, 0, 0);
    this.scene.add(corePointLight);
  }

  private createParticleTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.25, 'rgba(255, 182, 193, 0.85)');
      gradient.addColorStop(0.6, 'rgba(244, 63, 94, 0.25)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private buildBackgroundStars(): void {
    const starCount = 8000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    const colorOptions = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#fbcfe8'),
      new THREE.Color('#fed7aa'),
      new THREE.Color('#c084fc'),
      new THREE.Color('#93c5fd'),
      new THREE.Color('#f43f5e'),
    ];

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 280 + Math.random() * 370;

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      const c = colorOptions[Math.floor(Math.random() * colorOptions.length)];
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 2.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.backgroundStars = new THREE.Points(geometry, material);
    this.scene.add(this.backgroundStars);
    this.disposableGeometries.push(geometry);
    this.disposableMaterials.push(material);
  }

  private buildDistantGalaxies(): void {
    const galCount = 250;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(galCount * 3);
    const colors = new Float32Array(galCount * 3);

    const galColors = [
      new THREE.Color('#ec4899'),
      new THREE.Color('#8b5cf6'),
      new THREE.Color('#38bdf8'),
      new THREE.Color('#f43f5e'),
      new THREE.Color('#fb7185'),
    ];

    for (let i = 0; i < galCount; i++) {
      const i3 = i * 3;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 250 + Math.random() * 300;

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      const c = galColors[Math.floor(Math.random() * galColors.length)];
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 18.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      map: this.particleTexture,
      alphaTest: 0.001,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.distantGalaxies = new THREE.Points(geometry, material);
    this.scene.add(this.distantGalaxies);
    this.disposableGeometries.push(geometry);
    this.disposableMaterials.push(material);
  }

  private buildNebulaDust(): void {
    const cloudCount = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(cloudCount * 3);
    const colors = new Float32Array(cloudCount * 3);

    const cloudColor1 = new THREE.Color('#f43f5e');
    const cloudColor2 = new THREE.Color('#a855f7');
    const cloudColor3 = new THREE.Color('#ec4899');
    const arms = 6;
    const radius = 340;

    for (let i = 0; i < cloudCount; i++) {
      const i3 = i * 3;
      const r = Math.random() * radius;
      const spinAngle = r * 0.0035;
      const branchAngle = ((i % arms) * 2 * Math.PI) / arms;

      positions[i3] = Math.cos(branchAngle + spinAngle) * r + (Math.random() - 0.5) * 80;
      positions[i3 + 1] = (Math.random() - 0.5) * 25;
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * r + (Math.random() - 0.5) * 80;

      _color.copy(cloudColor1);
      if (i % 3 === 0) _color.lerp(cloudColor2, Math.random());
      else if (i % 3 === 1) _color.lerp(cloudColor3, Math.random());

      colors[i3] = _color.r;
      colors[i3 + 1] = _color.g;
      colors[i3 + 2] = _color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 22.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.nebulaClouds = new THREE.Points(geometry, material);
    this.scene.add(this.nebulaClouds);
    this.disposableGeometries.push(geometry);
    this.disposableMaterials.push(material);
  }

  private buildDiffuseGalaxyCore(): void {
    const count = 3500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const centerWhite = new THREE.Color('#ffffff');
    const corePink = new THREE.Color('#ff7597');
    const outerRose = new THREE.Color('#a21caf');

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.pow(Math.random(), 2.5) * 65;

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.35;
      positions[i3 + 2] = r * Math.cos(phi);

      const normDist = r / 65;
      _color.copy(centerWhite);
      if (normDist < 0.3) {
        _color.lerp(corePink, normDist / 0.3);
      } else {
        _color.lerp(outerRose, (normDist - 0.3) / 0.7);
      }

      colors[i3] = _color.r;
      colors[i3 + 1] = _color.g;
      colors[i3 + 2] = _color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 14.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      map: this.particleTexture,
      alphaTest: 0.001,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.coreParticleCloud = new THREE.Points(geometry, material);
    this.scene.add(this.coreParticleCloud);
    this.disposableGeometries.push(geometry);
    this.disposableMaterials.push(material);
  }

  private buildMultiArmGalaxy(): void {
    const particleCount = 22000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const colorInside = new THREE.Color('#fff1f2');
    const colorMiddle = new THREE.Color('#ec4899');
    const colorOutside = new THREE.Color('#831843');

    const arms = 6;
    const radius = 380;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const r = Math.random() * radius;
      const spinAngle = r * 0.0035;
      const branchAngle = ((i % arms) * 2 * Math.PI) / arms;

      const randomX = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 55;
      const randomY = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 40;
      const randomZ = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 55;

      positions[i3] = Math.cos(branchAngle + spinAngle) * r + randomX;
      positions[i3 + 1] = randomY;
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * r + randomZ;

      _color.copy(colorInside);
      if (r < radius * 0.25) {
        _color.lerp(colorInside, r / (radius * 0.25));
      } else if (r < radius * 0.65) {
        _color.lerp(colorMiddle, (r - radius * 0.25) / (radius * 0.4));
      } else {
        _color.lerp(colorOutside, (r - radius * 0.65) / (radius * 0.35));
      }

      colors[i3] = _color.r;
      colors[i3 + 1] = _color.g;
      colors[i3 + 2] = _color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 2.0,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    this.galaxyParticles = new THREE.Points(geometry, material);
    this.scene.add(this.galaxyParticles);
    this.disposableGeometries.push(geometry);
    this.disposableMaterials.push(material);
  }

  private buildHighQualityInstancedTulips(): void {
    const geos = buildHighQualityTulipGeometries();
    this.disposableGeometries.push(
      geos.stemAndLeaves,
      geos.outerPetals,
      geos.innerPetals,
      geos.stamenCore,
      geos.hitProxy,
    );

    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      roughness: 0.68,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });

    const outerPetalMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.28,
      metalness: 0.06,
      sheen: 0.85,
      sheenRoughness: 0.35,
      sheenColor: new THREE.Color(0xffe4e6),
      clearcoat: 0.25,
      clearcoatRoughness: 0.3,
      emissive: 0x3b0724,
      emissiveIntensity: 0.38,
      side: THREE.DoubleSide,
    });

    const innerPetalMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.08,
      sheen: 0.9,
      sheenRoughness: 0.3,
      sheenColor: new THREE.Color(0xfff1f2),
      clearcoat: 0.3,
      clearcoatRoughness: 0.25,
      emissive: 0x4c0519,
      emissiveIntensity: 0.45,
      side: THREE.DoubleSide,
    });

    const stamenMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 0.85,
      roughness: 0.38,
      metalness: 0.12,
    });

    const proxyMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
    });

    this.disposableMaterials.push(
      stemMat,
      outerPetalMat,
      innerPetalMat,
      stamenMat,
      proxyMat,
    );

    this.stemMesh = new THREE.InstancedMesh(geos.stemAndLeaves, stemMat, TULIP_COUNT);
    this.outerPetalMesh = new THREE.InstancedMesh(geos.outerPetals, outerPetalMat, TULIP_COUNT);
    this.innerPetalMesh = new THREE.InstancedMesh(geos.innerPetals, innerPetalMat, TULIP_COUNT);
    this.stamenMesh = new THREE.InstancedMesh(geos.stamenCore, stamenMat, TULIP_COUNT);
    this.hitProxyMesh = new THREE.InstancedMesh(geos.hitProxy, proxyMat, TULIP_COUNT);

    [
      this.stemMesh,
      this.outerPetalMesh,
      this.innerPetalMesh,
      this.stamenMesh,
      this.hitProxyMesh,
    ].forEach((m) => {
      m.frustumCulled = false;
      this.scene.add(m);
    });

    for (let i = 0; i < TULIP_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 240;

      const basePos = new THREE.Vector3(
        Math.cos(theta) * r,
        (Math.random() - 0.5) * 60,
        Math.sin(theta) * r,
      );
      const baseScale = Math.random() * 0.7 + 1.0;
      const paletteEntry = TULIP_PALETTE[i % TULIP_PALETTE.length];

      _color.setHex(paletteEntry.outerHex);
      this.outerPetalMesh.setColorAt(i, _color);

      _color.setHex(paletteEntry.innerHex);
      this.innerPetalMesh.setColorAt(i, _color);

      _color.setHex(0x34d399).offsetHSL(
        (Math.random() - 0.5) * 0.03,
        0,
        (Math.random() - 0.5) * 0.08,
      );
      this.stemMesh.setColorAt(i, _color);

      this.tulipStates.push({
        basePos,
        baseScale,
        currentScale: baseScale,
        rotY: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.85,
        phase: Math.random() * Math.PI * 2,
        memoryIndex: i % TULIP_MEMORIES.length,
        burstColor: new THREE.Color(paletteEntry.burstHex),
      });

      _dummy.position.copy(basePos);
      _dummy.rotation.set(0, this.tulipStates[i].rotY, 0);
      _dummy.scale.setScalar(baseScale);
      _dummy.updateMatrix();

      this.stemMesh.setMatrixAt(i, _dummy.matrix);
      this.outerPetalMesh.setMatrixAt(i, _dummy.matrix);
      this.innerPetalMesh.setMatrixAt(i, _dummy.matrix);
      this.stamenMesh.setMatrixAt(i, _dummy.matrix);
      this.hitProxyMesh.setMatrixAt(i, _dummy.matrix);
    }

    if (this.outerPetalMesh.instanceColor) this.outerPetalMesh.instanceColor.needsUpdate = true;
    if (this.innerPetalMesh.instanceColor) this.innerPetalMesh.instanceColor.needsUpdate = true;
    if (this.stemMesh.instanceColor) this.stemMesh.instanceColor.needsUpdate = true;
  }

  private buildPooledBurstSystem(): void {
    const geometry = new THREE.SphereGeometry(1.2, 6, 6);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.burstMesh = new THREE.InstancedMesh(
      geometry,
      material,
      MAX_BURST_PARTICLES,
    );
    this.burstMesh.frustumCulled = false;

    for (let i = 0; i < MAX_BURST_PARTICLES; i++) {
      this.burstPool.push({
        active: false,
        x: 0,
        y: -99999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        decay: 0.02,
      });
      _dummy.position.set(0, -99999, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.burstMesh.setMatrixAt(i, _dummy.matrix);
      this.burstMesh.setColorAt(i, _color.setHex(0xffffff));
    }

    this.burstMesh.instanceMatrix.needsUpdate = true;
    if (this.burstMesh.instanceColor) {
      this.burstMesh.instanceColor.needsUpdate = true;
    }

    this.scene.add(this.burstMesh);
    this.disposableGeometries.push(geometry);
    this.disposableMaterials.push(material);
  }

  private buildPooledShootingStars(): void {
    this.shootingStarPositions = new Float32Array(MAX_SHOOTING_STARS * 2 * 3);
    this.shootingStarColors = new Float32Array(MAX_SHOOTING_STARS * 2 * 3);

    for (let i = 0; i < MAX_SHOOTING_STARS; i++) {
      this.shootingStarPositions[i * 6 + 1] = -99999;
      this.shootingStarPositions[i * 6 + 4] = -99999;
      this.shootingStarPool.push({
        active: false,
        px: 0,
        py: -99999,
        pz: 0,
        dx: 0,
        dy: 0,
        dz: 0,
        life: 0,
        decay: 0.02,
      });
    }

    this.shootingStarGeometry = new THREE.BufferGeometry();
    this.shootingStarGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.shootingStarPositions, 3),
    );
    this.shootingStarGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.shootingStarColors, 3),
    );

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const lines = new THREE.LineSegments(this.shootingStarGeometry, material);
    lines.frustumCulled = false;
    this.scene.add(lines);
    this.disposableGeometries.push(this.shootingStarGeometry);
    this.disposableMaterials.push(material);
  }

  public triggerBurst(x: number, y: number, z: number, burstColor: THREE.Color): void {
    for (let i = 0; i < BURST_COUNT_PER_CLICK; i++) {
      const idx = this.burstCursor;
      this.burstCursor = (this.burstCursor + 1) % MAX_BURST_PARTICLES;

      const speed = 30 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      const p = this.burstPool[idx];
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = speed * Math.sin(phi) * Math.cos(theta);
      p.vy = speed * Math.sin(phi) * Math.sin(theta);
      p.vz = speed * Math.cos(phi);
      p.life = 1.0;
      p.decay = 0.65 + Math.random() * 0.55;

      const useWhite = Math.random() < 0.3;
      _color.setRGB(
        useWhite ? 1.0 : burstColor.r,
        useWhite ? 0.96 : burstColor.g,
        useWhite ? 0.98 : burstColor.b,
      );
      this.burstMesh.setColorAt(idx, _color);
    }
    if (this.burstMesh.instanceColor) {
      this.burstMesh.instanceColor.needsUpdate = true;
    }
  }

  private spawnShootingStar(): void {
    const slot = this.shootingStarPool.find((s) => !s.active);
    if (!slot) return;

    slot.active = true;
    slot.px = (Math.random() - 0.5) * 220;
    slot.py = 100 + Math.random() * 80;
    slot.pz = (Math.random() - 0.5) * 220;

    _vec3
      .set((Math.random() - 0.5) * 8, -Math.random() * 6 - 4, (Math.random() - 0.5) * 8)
      .normalize()
      .multiplyScalar(220);

    slot.dx = _vec3.x;
    slot.dy = _vec3.y;
    slot.dz = _vec3.z;
    slot.life = 1.0;
    slot.decay = 0.65 + Math.random() * 0.5;
  }

  public setAutoRotate(enabled: boolean): void {
    this.isAutoRotating = enabled;
    this.callbacks.onModeChange?.(enabled);
  }

  public focusMemory(memoryIndex: number): void {
    const tulip = this.tulipStates.find((t) => t.memoryIndex === memoryIndex);
    if (!tulip) return;

    this.isIntroZooming = false;
    this.isAutoRotating = false;
    this.callbacks.onModeChange?.(false);

    const azimuth = Math.atan2(tulip.basePos.x, tulip.basePos.z);
    this.targetRotationY = azimuth;
    this.targetRotationX = 0.28;
    this.targetCameraRadius = 215;

    this.triggerBurst(
      tulip.basePos.x,
      tulip.basePos.y,
      tulip.basePos.z,
      tulip.burstColor,
    );
  }

  private updateCameraTransform(): void {
    this.camera.position.x =
      Math.sin(this.currentRotationY) * Math.cos(this.currentRotationX) * this.cameraRadius;
    this.camera.position.y = Math.sin(this.currentRotationX) * this.cameraRadius + 50;
    this.camera.position.z =
      Math.cos(this.currentRotationY) * Math.cos(this.currentRotationX) * this.cameraRadius;
    this.camera.lookAt(0, 0, 0);
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    window.addEventListener('resize', this.onResize);
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointerleave', this.onPointerCancel);
    dom.addEventListener('touchstart', this.onTouchStart, { passive: false });
    dom.addEventListener('touchmove', this.onTouchMove, { passive: false });
    dom.addEventListener('touchend', this.onTouchEnd);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private unbindEvents(): void {
    const dom = this.renderer.domElement;

    window.removeEventListener('resize', this.onResize);
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointerleave', this.onPointerCancel);
    dom.removeEventListener('touchstart', this.onTouchStart);
    dom.removeEventListener('touchmove', this.onTouchMove);
    dom.removeEventListener('touchend', this.onTouchEnd);
    dom.removeEventListener('wheel', this.onWheel);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost?.(true);
  };

  private onContextRestored = (): void => {
    this.callbacks.onContextLost?.(false);
  };

  private onResize = (): void => {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    const pixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
  };

  private updatePointerNDC(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.isIntroZooming) return;
    if (e.pointerType === 'touch') return;

    this.isDragging = true;
    this.dragDistance = 0;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.previousPointerPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.isIntroZooming) return;
    if (e.pointerType === 'touch') return;

    if (this.isDragging) {
      const dx = e.clientX - this.previousPointerPos.x;
      const dy = e.clientY - this.previousPointerPos.y;
      this.dragDistance += Math.hypot(dx, dy);

      if (this.dragDistance > 4 && this.isAutoRotating) {
        this.isAutoRotating = false;
        this.callbacks.onModeChange?.(false);
      }

      this.targetRotationY -= dx * 0.0055;
      this.targetRotationX = THREE.MathUtils.clamp(
        this.targetRotationX + dy * 0.0055,
        -Math.PI / 2.2,
        Math.PI / 2.2,
      );
      this.previousPointerPos = { x: e.clientX, y: e.clientY };
      return;
    }

    const now = performance.now();
    if (now - this.lastHoverCheck < 48) return;
    this.lastHoverCheck = now;

    this.updatePointerNDC(e.clientX, e.clientY);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObject(this.hitProxyMesh, false);
    const nextHover =
      hits.length > 0 && hits[0].instanceId !== undefined ? hits[0].instanceId : null;

    if (nextHover !== this.hoveredTulipId) {
      this.hoveredTulipId = nextHover;
      this.callbacks.onHoverChange?.(nextHover !== null);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const wasClick = this.isDragging && this.dragDistance < 6;
    this.isDragging = false;

    if (wasClick && !this.isIntroZooming) {
      this.pickTulipAt(e.clientX, e.clientY);
    }
  };

  private onPointerCancel = (): void => {
    this.isDragging = false;
    if (this.hoveredTulipId !== null) {
      this.hoveredTulipId = null;
      this.callbacks.onHoverChange?.(false);
    }
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (this.isIntroZooming) return;

    if (e.touches.length === 1) {
      this.isDragging = true;
      this.dragDistance = 0;
      const t = e.touches[0];
      this.pointerDownPos = { x: t.clientX, y: t.clientY };
      this.previousPointerPos = { x: t.clientX, y: t.clientY };
    } else if (e.touches.length === 2) {
      this.isDragging = false;
      this.initialPinchDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (this.isIntroZooming) return;

    if (this.isDragging && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - this.previousPointerPos.x;
      const dy = t.clientY - this.previousPointerPos.y;
      this.dragDistance += Math.hypot(dx, dy);

      if (this.dragDistance > 5 && this.isAutoRotating) {
        this.isAutoRotating = false;
        this.callbacks.onModeChange?.(false);
      }

      this.targetRotationY -= dx * 0.006;
      this.targetRotationX = THREE.MathUtils.clamp(
        this.targetRotationX + dy * 0.006,
        -Math.PI / 2.2,
        Math.PI / 2.2,
      );
      this.previousPointerPos = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    } else if (e.touches.length === 2 && this.initialPinchDistance !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const ratio = this.initialPinchDistance / Math.max(1, dist);
      this.targetCameraRadius = THREE.MathUtils.clamp(
        this.targetCameraRadius * (1 + (ratio - 1) * 0.65),
        90,
        1200,
      );
      this.initialPinchDistance = dist;
      e.preventDefault();
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (e.touches.length < 2) {
      this.initialPinchDistance = null;
    }
    if (e.touches.length === 0) {
      const wasTap = this.isDragging && this.dragDistance < 10;
      this.isDragging = false;
      if (wasTap && !this.isIntroZooming) {
        this.pickTulipAt(this.pointerDownPos.x, this.pointerDownPos.y);
      }
    }
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.isIntroZooming) return;
    e.preventDefault();
    this.targetCameraRadius = THREE.MathUtils.clamp(
      this.targetCameraRadius + e.deltaY * 0.3,
      90,
      1200,
    );
  };

  private pickTulipAt(clientX: number, clientY: number): void {
    this.updatePointerNDC(clientX, clientY);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObject(this.hitProxyMesh, false);
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      const id = hits[0].instanceId;
      const tulip = this.tulipStates[id];
      if (!tulip) return;

      const bobY =
        tulip.basePos.y + Math.sin(this.clock.elapsedTime * 2 + tulip.basePos.x) * 4;
      this.triggerBurst(tulip.basePos.x, bobY, tulip.basePos.z, tulip.burstColor);
      this.callbacks.onTulipSelect?.(tulip.memoryIndex);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    this.clock.start();
    const tick = () => {
      if (this.disposed) return;
      const delta = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.elapsedTime;

      this.updateScene(delta, elapsed);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private updateScene(delta: number, elapsed: number): void {
    if (this.isIntroZooming) {
      this.cameraRadius = THREE.MathUtils.damp(
        this.cameraRadius,
        this.targetCameraRadius,
        2.2,
        delta,
      );
      if (Math.abs(this.cameraRadius - this.targetCameraRadius) < 1.5) {
        this.cameraRadius = this.targetCameraRadius;
        this.isIntroZooming = false;
        this.callbacks.onIntroComplete?.();
      }
    } else {
      this.cameraRadius = THREE.MathUtils.damp(
        this.cameraRadius,
        this.targetCameraRadius,
        6.0,
        delta,
      );
    }

    if (!this.isIntroZooming && this.isAutoRotating) {
      this.targetRotationY = elapsed * 0.04;
      this.targetRotationX = Math.sin(elapsed * 0.2) * 0.15 + 0.3;
    }

    this.currentRotationY = THREE.MathUtils.damp(
      this.currentRotationY,
      this.targetRotationY,
      6.0,
      delta,
    );
    this.currentRotationX = THREE.MathUtils.damp(
      this.currentRotationX,
      this.targetRotationX,
      6.0,
      delta,
    );
    this.updateCameraTransform();

    // Original galaxy rotations & pulsing core
    this.galaxyParticles.rotation.y = elapsed * 0.04;
    this.nebulaClouds.rotation.y = elapsed * 0.025;
    this.backgroundStars.rotation.y = elapsed * 0.005;
    this.distantGalaxies.rotation.y = elapsed * 0.002;

    this.coreParticleCloud.rotation.y = elapsed * 0.03;
    const pulse = 1 + Math.sin(elapsed * 2.5) * 0.06;
    this.coreParticleCloud.scale.set(pulse, pulse, pulse);

    // High-quality instanced tulips gentle sway, spin, and hover scale
    for (let i = 0; i < TULIP_COUNT; i++) {
      const t = this.tulipStates[i];
      t.rotY += t.rotSpeed * delta;
      const desiredScale =
        this.hoveredTulipId === i ? t.baseScale * 1.24 : t.baseScale;
      t.currentScale = THREE.MathUtils.damp(t.currentScale, desiredScale, 10, delta);

      const bobY = t.basePos.y + Math.sin(elapsed * 2 + t.basePos.x) * 4;
      _dummy.position.set(t.basePos.x, bobY, t.basePos.z);
      _dummy.rotation.set(
        Math.sin(elapsed * 0.9 + t.phase) * 0.06,
        t.rotY,
        Math.cos(elapsed * 0.8 + t.phase) * 0.06,
      );
      _dummy.scale.setScalar(t.currentScale);
      _dummy.updateMatrix();

      this.stemMesh.setMatrixAt(i, _dummy.matrix);
      this.outerPetalMesh.setMatrixAt(i, _dummy.matrix);
      this.innerPetalMesh.setMatrixAt(i, _dummy.matrix);
      this.stamenMesh.setMatrixAt(i, _dummy.matrix);
      this.hitProxyMesh.setMatrixAt(i, _dummy.matrix);
    }

    this.stemMesh.instanceMatrix.needsUpdate = true;
    this.outerPetalMesh.instanceMatrix.needsUpdate = true;
    this.innerPetalMesh.instanceMatrix.needsUpdate = true;
    this.stamenMesh.instanceMatrix.needsUpdate = true;
    this.hitProxyMesh.instanceMatrix.needsUpdate = true;

    // Pooled supernova bursts
    let burstDirty = false;
    for (let i = 0; i < MAX_BURST_PARTICLES; i++) {
      const p = this.burstPool[i];
      if (!p.active) continue;
      burstDirty = true;

      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;
      p.life -= p.decay * delta;

      if (p.life <= 0) {
        p.active = false;
        _dummy.position.set(0, -99999, 0);
        _dummy.scale.setScalar(0.001);
      } else {
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.setScalar(Math.max(0.05, p.life));
      }
      _dummy.updateMatrix();
      this.burstMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (burstDirty) {
      this.burstMesh.instanceMatrix.needsUpdate = true;
    }

    // Pooled shooting stars
    if (elapsed - this.lastShootingStarTime > 2.2) {
      this.spawnShootingStar();
      this.lastShootingStarTime = elapsed;
    }

    let starsDirty = false;
    for (let i = 0; i < MAX_SHOOTING_STARS; i++) {
      const s = this.shootingStarPool[i];
      if (!s.active) continue;
      starsDirty = true;

      s.px += s.dx * delta;
      s.py += s.dy * delta;
      s.pz += s.dz * delta;
      s.life -= s.decay * delta;

      const vIdx = i * 6;
      if (s.life <= 0) {
        s.active = false;
        this.shootingStarPositions[vIdx + 1] = -99999;
        this.shootingStarPositions[vIdx + 4] = -99999;
      } else {
        this.shootingStarPositions[vIdx] = s.px;
        this.shootingStarPositions[vIdx + 1] = s.py;
        this.shootingStarPositions[vIdx + 2] = s.pz;
        this.shootingStarPositions[vIdx + 3] = s.px - s.dx * 0.16;
        this.shootingStarPositions[vIdx + 4] = s.py - s.dy * 0.16;
        this.shootingStarPositions[vIdx + 5] = s.pz - s.dz * 0.16;

        const alpha = Math.max(0, s.life);
        this.shootingStarColors[vIdx] = alpha;
        this.shootingStarColors[vIdx + 1] = alpha * 0.88;
        this.shootingStarColors[vIdx + 2] = alpha * 0.96;
        this.shootingStarColors[vIdx + 3] = alpha * 0.35;
        this.shootingStarColors[vIdx + 4] = alpha * 0.12;
        this.shootingStarColors[vIdx + 5] = alpha * 0.25;
      }
    }
    if (starsDirty) {
      this.shootingStarGeometry.attributes.position.needsUpdate = true;
      this.shootingStarGeometry.attributes.color.needsUpdate = true;
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.unbindEvents();

    this.disposableGeometries.forEach((g) => g.dispose());
    this.disposableMaterials.forEach((m) => m.dispose());
    this.particleTexture.dispose();
    this.envRenderTarget?.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
