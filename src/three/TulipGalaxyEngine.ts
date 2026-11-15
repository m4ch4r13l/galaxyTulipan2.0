import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  COLOR_FILTERS,
  type ColorFilterId,
  type ColorFilterPreset,
  type FlowerType,
  TULIP_MEMORIES,
} from '../data/tulips';
import {
  buildFlowerGeometries,
  type TulipSharedGeometries,
} from './tulipGeometry';

export interface TulipGalaxyCallbacks {
  onIntroComplete: () => void;
  onModeChange: (isOrbit: boolean) => void;
  onTulipSelect: (memoryIndex: number) => void;
  onHoverChange: (isHovering: boolean) => void;
  onContextLost: (lost: boolean) => void;
}

export interface TulipGalaxyInitialConfig {
  flowerType?: FlowerType;
  colorFilter?: ColorFilterId;
}

interface TulipInstanceMeta {
  basePos: THREE.Vector3;
  baseScale: number;
  rotY: number;
  tiltZ: number;
  phase: number;
  bobSpeed: number;
  spinSpeed: number;
  memoryIndex: number; // -1 for decorative galaxy flowers, 0..6 for interactive memory flowers
  paletteSeed: number;
}

interface ShootingStar {
  line: THREE.Line;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  tailLen: number;
  life: number;
  maxLife: number;
}

// Module-scope reusable scratch objects (zero per-frame GC)
const _vec3 = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _color = new THREE.Color();
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorC = new THREE.Color();
const _ndc = new THREE.Vector2();

function detectSoftwareGl(): boolean {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function createStarSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.22, 'rgba(255, 235, 248, 0.92)');
    grad.addColorStop(0.55, 'rgba(244, 114, 182, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getFilterPreset(filterId: ColorFilterId): ColorFilterPreset {
  return COLOR_FILTERS.find((f) => f.id === filterId) ?? COLOR_FILTERS[0];
}

export class TulipGalaxyEngine {
  private readonly container: HTMLElement;
  private readonly callbacks: TulipGalaxyCallbacks;
  private readonly isSoftwareGl: boolean;

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();

  private readonly galaxyGroup = new THREE.Group();
  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly disposableTextures: THREE.Texture[] = [];

  private corePoints: THREE.Points | null = null;
  private coreMaterial: THREE.PointsMaterial | null = null;
  private coreRadii: Float32Array = new Float32Array(0);
  private spiralPoints: THREE.Points | null = null;
  private spiralRadii: Float32Array = new Float32Array(0);
  private dustPoints: THREE.Points | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private starSpriteTexture: THREE.CanvasTexture;
  private envRenderTargetTexture: THREE.Texture | null = null;

  // Customization state & cached flower geometries
  private currentFlowerType: FlowerType;
  private currentFilter: ColorFilterPreset;
  private readonly geometryCache = new Map<FlowerType, TulipSharedGeometries>();

  // High-detail instanced flower components
  private readonly tulipMetas: TulipInstanceMeta[] = [];
  private stemMesh!: THREE.InstancedMesh;
  private outerPetalMesh!: THREE.InstancedMesh;
  private innerPetalMesh!: THREE.InstancedMesh;
  private stamenMesh!: THREE.InstancedMesh;
  private petalMaterial!: THREE.MeshPhysicalMaterial;

  // Interactive memory flower proxies
  private readonly memoryHitMeshes: THREE.Mesh[] = [];
  private hoveredMemoryIndex: number | null = null;

  // Intro & gentle camera glide
  private introActive = true;
  private introElapsed = 0;
  private readonly introDuration = 3.2;
  private readonly introStartPos = new THREE.Vector3(0, 120, 320);
  private readonly defaultOverviewPos = new THREE.Vector3(0, 82, 168);
  private readonly targetCameraPos = new THREE.Vector3().copy(
    this.defaultOverviewPos,
  );
  private shouldGlideCameraPos = false;

  // Shooting stars
  private readonly shootingStars: ShootingStar[] = [];
  private nextShootingStarAt = 1.6;

  // Interaction state (desktop + mobile touch)
  private frameId = 0;
  private disposed = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerLastX = 0;
  private pointerLastY = 0;
  private cumulativeDragDist = 0;
  private lastHoverCheckMs = 0;

  constructor(
    container: HTMLElement,
    callbacks: TulipGalaxyCallbacks,
    initialConfig?: TulipGalaxyInitialConfig,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    this.currentFlowerType = initialConfig?.flowerType ?? 'tulip';
    this.currentFilter = getFilterPreset(
      initialConfig?.colorFilter ?? 'multicolor',
    );

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.currentFilter.bgHex);
    this.scene.fog = new THREE.FogExp2(this.currentFilter.bgHex, 0.00145);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(54, width / height, 0.5, 1800);
    this.camera.position.copy(this.introStartPos);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(width, height);

    const dom = this.renderer.domElement;
    dom.style.display = 'block';
    dom.style.width = '100%';
    dom.style.height = '100%';
    dom.style.touchAction = 'none';
    container.appendChild(dom);

    // Studio environment reflection for realistic PBR petal clearcoat & sheen
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    this.envRenderTargetTexture = envTarget.texture;
    this.scene.environment = this.envRenderTargetTexture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // OrbitControls centered on the galaxy
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 24;
    this.controls.maxDistance = 320;
    this.controls.maxPolarAngle = Math.PI * 0.86;
    this.controls.minPolarAngle = Math.PI * 0.08;
    this.controls.autoRotate = !this.isSoftwareGl;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.enabled = false;

    this.controls.addEventListener('start', this.handleControlsStart);

    // Dedicated raycaster layer for interactive memory hit proxies
    this.raycaster.layers.set(1);

    this.starSpriteTexture = createStarSpriteTexture();
    this.disposableTextures.push(this.starSpriteTexture);

    this.setupLighting();
    this.scene.add(this.galaxyGroup);
    this.buildCosmicBackdrop();
    this.buildSpiralGalaxy();
    this.buildInstancedFlowers();
    this.applyColorFilter(this.currentFilter);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.startLoop();
  }

  private getOrBuildGeometries(type: FlowerType): TulipSharedGeometries {
    let cached = this.geometryCache.get(type);
    if (!cached) {
      cached = buildFlowerGeometries(type);
      this.geometryCache.set(type, cached);
    }
    return cached;
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight(0xfbcfe8, 0x1e1b4b, 0.85);
    this.scene.add(hemi);

    const coreLight = new THREE.PointLight(0xffedd5, 3.8, 340, 1.3);
    coreLight.position.set(0, 14, 0);
    this.scene.add(coreLight);

    const keyLight = new THREE.DirectionalLight(0xfff1f2, 2.2);
    keyLight.position.set(60, 110, 75);
    this.scene.add(keyLight);

    this.rimLight = new THREE.DirectionalLight(0xe879f9, 1.4);
    this.rimLight.position.set(-80, 40, -90);
    this.scene.add(this.rimLight);
  }

  private buildCosmicBackdrop(): void {
    // 1. 8,000 crisp deep-field stars
    const starCount = 8000;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const r = 240 + Math.random() * 680;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);

      const tint = Math.random();
      if (tint < 0.55) {
        _color.setHex(0xffffff);
      } else if (tint < 0.8) {
        _color.setHex(0xfbcfe8);
      } else {
        _color.setHex(0xc4b5fd);
      }
      starCol[i * 3] = _color.r;
      starCol[i * 3 + 1] = _color.g;
      starCol[i * 3 + 2] = _color.b;
    }

    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeom.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({
      size: 1.8,
      map: this.starSpriteTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposableGeometries.push(starGeom);
    this.disposableMaterials.push(starMat);
    this.scene.add(new THREE.Points(starGeom, starMat));

    // 2. 250 distant background galaxies
    const bgGalCount = 250;
    const bgPos = new Float32Array(bgGalCount * 3);
    const bgCol = new Float32Array(bgGalCount * 3);
    for (let i = 0; i < bgGalCount; i++) {
      const r = 420 + Math.random() * 480;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      bgPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      bgPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      bgPos[i * 3 + 2] = r * Math.cos(phi);

      _color.setHSL(0.78 + Math.random() * 0.2, 0.75, 0.72);
      bgCol[i * 3] = _color.r;
      bgCol[i * 3 + 1] = _color.g;
      bgCol[i * 3 + 2] = _color.b;
    }
    const bgGeom = new THREE.BufferGeometry();
    bgGeom.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
    bgGeom.setAttribute('color', new THREE.BufferAttribute(bgCol, 3));
    const bgMat = new THREE.PointsMaterial({
      size: 7.5,
      map: this.starSpriteTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposableGeometries.push(bgGeom);
    this.disposableMaterials.push(bgMat);
    this.scene.add(new THREE.Points(bgGeom, bgMat));

    // 3. 1,200 ambient nebula dust motes
    const dustCount = 1200;
    const dustPos = new Float32Array(dustCount * 3);
    const dustCol = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const r = 30 + Math.random() * 190;
      const theta = Math.random() * Math.PI * 2;
      dustPos[i * 3] = Math.cos(theta) * r;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 75;
      dustPos[i * 3 + 2] = Math.sin(theta) * r;
      _color.setHex(Math.random() > 0.5 ? 0xf472b6 : 0xa855f7);
      dustCol[i * 3] = _color.r;
      dustCol[i * 3 + 1] = _color.g;
      dustCol[i * 3 + 2] = _color.b;
    }
    const dustGeom = new THREE.BufferGeometry();
    dustGeom.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeom.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 3.4,
      map: this.starSpriteTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dustPoints = new THREE.Points(dustGeom, dustMat);
    this.disposableGeometries.push(dustGeom);
    this.disposableMaterials.push(dustMat);
    this.galaxyGroup.add(this.dustPoints);
  }

  private buildSpiralGalaxy(): void {
    // Diffuse pulsing galactic core (3,500 particles)
    const coreCount = 3500;
    const corePos = new Float32Array(coreCount * 3);
    const coreCol = new Float32Array(coreCount * 3);
    this.coreRadii = new Float32Array(coreCount);

    for (let i = 0; i < coreCount; i++) {
      const r = Math.pow(Math.random(), 1.8) * 26;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      corePos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      corePos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.58;
      corePos[i * 3 + 2] = r * Math.cos(phi);
      this.coreRadii[i] = r / 26;
    }

    const coreGeom = new THREE.BufferGeometry();
    coreGeom.setAttribute('position', new THREE.BufferAttribute(corePos, 3));
    coreGeom.setAttribute('color', new THREE.BufferAttribute(coreCol, 3));
    const coreMat = new THREE.PointsMaterial({
      size: 3.1,
      map: this.starSpriteTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.corePoints = new THREE.Points(coreGeom, coreMat);
    this.coreMaterial = coreMat;
    this.disposableGeometries.push(coreGeom);
    this.disposableMaterials.push(coreMat);
    this.galaxyGroup.add(this.corePoints);

    // 22,000 crisp 6-arm spiral galaxy star particles
    const count = 22000;
    const branches = 6;
    const maxRadius = 155;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.spiralRadii = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = Math.pow(Math.random(), 1.15) * maxRadius;
      const branchAngle = ((i % branches) / branches) * Math.PI * 2;
      const spinAngle = r * 0.048;

      const spread = 0.25 + (r / maxRadius) * 1.1;
      const rx =
        Math.pow(Math.random(), 3) *
        (Math.random() < 0.5 ? 1 : -1) *
        spread *
        14;
      const ry = (Math.random() - 0.5) * (6.5 - (r / maxRadius) * 2.5);
      const rz =
        Math.pow(Math.random(), 3) *
        (Math.random() < 0.5 ? 1 : -1) *
        spread *
        14;

      const angle = branchAngle + spinAngle;
      positions[i * 3] = Math.cos(angle) * r + rx;
      positions[i * 3 + 1] = ry;
      positions[i * 3 + 2] = Math.sin(angle) * r + rz;
      this.spiralRadii[i] = r / maxRadius;
    }

    const galGeom = new THREE.BufferGeometry();
    galGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    galGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const galMat = new THREE.PointsMaterial({
      size: 1.55,
      map: this.starSpriteTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.spiralPoints = new THREE.Points(galGeom, galMat);
    this.disposableGeometries.push(galGeom);
    this.disposableMaterials.push(galMat);
    this.galaxyGroup.add(this.spiralPoints);
  }

  private buildInstancedFlowers(): void {
    const geoms = this.getOrBuildGeometries(this.currentFlowerType);

    const decorativeCount = 135;
    const memoryCount = TULIP_MEMORIES.length; // 7 interactive memory flowers
    const totalCount = decorativeCount + memoryCount;

    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.petalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.28,
      metalness: 0.04,
      clearcoat: 0.45,
      clearcoatRoughness: 0.25,
      sheen: 0.65,
      sheenRoughness: 0.45,
      sheenColor: new THREE.Color(0xffe4e6),
      side: THREE.DoubleSide,
    });
    const stamenMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
      roughness: 0.4,
      metalness: 0.15,
    });
    const hitProxyMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.disposableMaterials.push(
      stemMat,
      this.petalMaterial,
      stamenMat,
      hitProxyMat,
    );

    this.stemMesh = new THREE.InstancedMesh(
      geoms.stemAndLeaves,
      stemMat,
      totalCount,
    );
    this.outerPetalMesh = new THREE.InstancedMesh(
      geoms.outerPetals,
      this.petalMaterial,
      totalCount,
    );
    this.innerPetalMesh = new THREE.InstancedMesh(
      geoms.innerPetals,
      this.petalMaterial,
      totalCount,
    );
    this.stamenMesh = new THREE.InstancedMesh(
      geoms.stamenCore,
      stamenMat,
      totalCount,
    );

    const allInstanced = [
      this.stemMesh,
      this.outerPetalMesh,
      this.innerPetalMesh,
      this.stamenMesh,
    ];

    allInstanced.forEach((im) => {
      im.frustumCulled = false;
      this.galaxyGroup.add(im);
    });

    // First 7 indices = interactive memory flowers
    const branches = 6;
    for (let m = 0; m < memoryCount; m++) {
      const r = 34 + (m / (memoryCount - 1)) * 78;
      const branchAngle = ((m % branches) / branches) * Math.PI * 2 + 0.25;
      const angle = branchAngle + r * 0.048;
      const y = (m % 2 === 0 ? 1 : -1) * (3 + (m % 3) * 2.2);

      const basePos = new THREE.Vector3(
        Math.cos(angle) * r,
        y,
        Math.sin(angle) * r,
      );

      this.tulipMetas.push({
        basePos,
        baseScale: 2.05,
        rotY: Math.random() * Math.PI * 2,
        tiltZ: (Math.random() - 0.5) * 0.16,
        phase: m * 0.9,
        bobSpeed: 1.05,
        spinSpeed: 0.22,
        memoryIndex: m,
        paletteSeed: m,
      });

      // Invisible hit proxy on layer 1 for effortless tapping/clicking
      const proxy = new THREE.Mesh(geoms.hitProxy, hitProxyMat);
      proxy.position.copy(basePos);
      proxy.layers.set(1);
      proxy.userData.memoryIndex = m;
      this.galaxyGroup.add(proxy);
      this.memoryHitMeshes.push(proxy);
    }

    // Remaining 135 indices = decorative cosmic flowers woven along the 6 spiral arms
    for (let i = memoryCount; i < totalCount; i++) {
      const r = 18 + Math.random() * 125;
      const branch = i % branches;
      const angle =
        (branch / branches) * Math.PI * 2 +
        r * 0.048 +
        (Math.random() - 0.5) * 0.55;
      const y = (Math.random() - 0.5) * 16;

      this.tulipMetas.push({
        basePos: new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r),
        baseScale: 0.95 + Math.random() * 0.75,
        rotY: Math.random() * Math.PI * 2,
        tiltZ: (Math.random() - 0.5) * 0.35,
        phase: Math.random() * Math.PI * 2,
        bobSpeed: 0.65 + Math.random() * 0.65,
        spinSpeed: (Math.random() - 0.5) * 0.24,
        memoryIndex: -1,
        paletteSeed: i,
      });
    }

    this.updateFlowerMatrices(0);
  }

  private applyColorFilter(preset: ColorFilterPreset): void {
    this.currentFilter = preset;

    this.scene.background = new THREE.Color(preset.bgHex);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(preset.bgHex);
    }

    if (this.rimLight) {
      this.rimLight.color.set(preset.galaxyMiddleHex);
    }

    if (this.petalMaterial) {
      this.petalMaterial.sheenColor.set(preset.galaxyInsideHex);
    }

    // Recolor flower petal instances
    const palette = preset.palette;
    for (let i = 0; i < this.tulipMetas.length; i++) {
      const entry = palette[this.tulipMetas[i].paletteSeed % palette.length];
      _color.setHex(entry.outerHex);
      this.outerPetalMesh.setColorAt(i, _color);
      _color.setHex(entry.innerHex);
      this.innerPetalMesh.setColorAt(i, _color);
    }
    if (this.outerPetalMesh.instanceColor) {
      this.outerPetalMesh.instanceColor.needsUpdate = true;
    }
    if (this.innerPetalMesh.instanceColor) {
      this.innerPetalMesh.instanceColor.needsUpdate = true;
    }

    // Recolor galactic core vertex colors
    if (this.corePoints) {
      const colAttr = this.corePoints.geometry.getAttribute(
        'color',
      ) as THREE.BufferAttribute;
      _colorA.set(preset.galaxyInsideHex);
      _colorB.set(preset.galaxyMiddleHex);
      for (let i = 0; i < this.coreRadii.length; i++) {
        _color.copy(_colorA).lerp(_colorB, this.coreRadii[i]);
        colAttr.setXYZ(i, _color.r, _color.g, _color.b);
      }
      colAttr.needsUpdate = true;
    }

    // Recolor 6-arm spiral galaxy vertex colors
    if (this.spiralPoints) {
      const colAttr = this.spiralPoints.geometry.getAttribute(
        'color',
      ) as THREE.BufferAttribute;
      _colorA.set(preset.galaxyInsideHex);
      _colorB.set(preset.galaxyMiddleHex);
      _colorC.set(preset.galaxyOutsideHex);
      for (let i = 0; i < this.spiralRadii.length; i++) {
        const t = this.spiralRadii[i];
        if (t < 0.45) {
          _color.copy(_colorA).lerp(_colorB, t / 0.45);
        } else {
          _color.copy(_colorB).lerp(_colorC, (t - 0.45) / 0.55);
        }
        colAttr.setXYZ(i, _color.r, _color.g, _color.b);
      }
      colAttr.needsUpdate = true;
    }

    // Recolor nebula dust motes
    if (this.dustPoints) {
      const colAttr = this.dustPoints.geometry.getAttribute(
        'color',
      ) as THREE.BufferAttribute;
      _colorA.set(preset.galaxyMiddleHex);
      _colorB.set(preset.galaxyOutsideHex);
      for (let i = 0; i < colAttr.count; i++) {
        const c = i % 2 === 0 ? _colorA : _colorB;
        colAttr.setXYZ(i, c.r, c.g, c.b);
      }
      colAttr.needsUpdate = true;
    }
  }

  public setFlowerType(type: FlowerType): void {
    if (this.disposed || type === this.currentFlowerType) return;
    this.currentFlowerType = type;

    const geoms = this.getOrBuildGeometries(type);
    this.stemMesh.geometry = geoms.stemAndLeaves;
    this.outerPetalMesh.geometry = geoms.outerPetals;
    this.innerPetalMesh.geometry = geoms.innerPetals;
    this.stamenMesh.geometry = geoms.stamenCore;

    for (let i = 0; i < this.memoryHitMeshes.length; i++) {
      this.memoryHitMeshes[i].geometry = geoms.hitProxy;
    }
  }

  public setColorFilter(filterId: ColorFilterId): void {
    if (this.disposed || filterId === this.currentFilter.id) return;
    const preset = getFilterPreset(filterId);
    this.applyColorFilter(preset);
  }

  private updateFlowerMatrices(elapsed: number): void {
    const count = this.tulipMetas.length;

    for (let i = 0; i < count; i++) {
      const meta = this.tulipMetas[i];
      const bobY = Math.sin(elapsed * meta.bobSpeed + meta.phase) * 0.75;
      const swayX = Math.cos(elapsed * 0.7 + meta.phase) * 0.05;
      const rotY = meta.rotY + elapsed * meta.spinSpeed;

      const isHovered =
        meta.memoryIndex >= 0 && meta.memoryIndex === this.hoveredMemoryIndex;
      const hoverBoost = isHovered ? 1.18 : 1;
      const s = meta.baseScale * hoverBoost;

      _vec3.set(meta.basePos.x, meta.basePos.y + bobY, meta.basePos.z);
      _euler.set(swayX, rotY, meta.tiltZ);
      _quat.setFromEuler(_euler);
      _scale.set(s, s, s);
      _mat4.compose(_vec3, _quat, _scale);

      this.stemMesh.setMatrixAt(i, _mat4);
      this.outerPetalMesh.setMatrixAt(i, _mat4);
      this.innerPetalMesh.setMatrixAt(i, _mat4);
      this.stamenMesh.setMatrixAt(i, _mat4);

      if (meta.memoryIndex >= 0) {
        const proxy = this.memoryHitMeshes[meta.memoryIndex];
        if (proxy) {
          proxy.position.set(_vec3.x, _vec3.y, _vec3.z);
        }
      }
    }

    this.stemMesh.instanceMatrix.needsUpdate = true;
    this.outerPetalMesh.instanceMatrix.needsUpdate = true;
    this.innerPetalMesh.instanceMatrix.needsUpdate = true;
    this.stamenMesh.instanceMatrix.needsUpdate = true;
  }

  private spawnShootingStar(): void {
    const angle = Math.random() * Math.PI * 2;
    const radius = 120 + Math.random() * 140;
    const start = new THREE.Vector3(
      Math.cos(angle) * radius,
      35 + Math.random() * 65,
      Math.sin(angle) * radius,
    );
    const vel = new THREE.Vector3(
      -Math.cos(angle) * (110 + Math.random() * 75) +
        (Math.random() - 0.5) * 40,
      -42 - Math.random() * 36,
      -Math.sin(angle) * (110 + Math.random() * 75) +
        (Math.random() - 0.5) * 40,
    );

    const geom = new THREE.BufferGeometry();
    const tailLen = 13;
    const positions = new Float32Array([
      start.x,
      start.y,
      start.z,
      start.x,
      start.y,
      start.z,
    ]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const palette = this.currentFilter.palette;
    const pick =
      Math.random() < 0.25
        ? 0xffffff
        : palette[Math.floor(Math.random() * palette.length)].burstHex;

    const mat = new THREE.LineBasicMaterial({
      color: pick,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });

    const line = new THREE.Line(geom, mat);
    this.scene.add(line);

    this.shootingStars.push({
      line,
      pos: start,
      vel,
      tailLen,
      life: 0,
      maxLife: 1.15,
    });
  }

  private updateEffects(delta: number, elapsed: number): void {
    if (elapsed >= this.nextShootingStarAt) {
      this.spawnShootingStar();
      this.nextShootingStarAt = elapsed + 2.2 + Math.random() * 2.8;
    }

    if (this.corePoints && this.coreMaterial) {
      const pulse = 1 + Math.sin(elapsed * 2.1) * 0.055;
      this.corePoints.scale.setScalar(pulse);
      this.coreMaterial.size = 3.1 + Math.sin(elapsed * 2.1) * 0.35;
    }

    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const star = this.shootingStars[i];
      star.life += delta;
      if (star.life >= star.maxLife) {
        this.scene.remove(star.line);
        star.line.geometry.dispose();
        (star.line.material as THREE.Material).dispose();
        this.shootingStars.splice(i, 1);
        continue;
      }

      star.pos.addScaledVector(star.vel, delta);
      const posAttr = star.line.geometry.attributes
        .position as THREE.BufferAttribute;
      _vec3.copy(star.vel).normalize().multiplyScalar(-star.tailLen);
      posAttr.setXYZ(0, star.pos.x, star.pos.y, star.pos.z);
      posAttr.setXYZ(
        1,
        star.pos.x + _vec3.x,
        star.pos.y + _vec3.y,
        star.pos.z + _vec3.z,
      );
      posAttr.needsUpdate = true;

      const fade = 1 - star.life / star.maxLife;
      (star.line.material as THREE.LineBasicMaterial).opacity = fade;
    }
  }

  private getCanvasNdc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return _ndc;
  }

  private pickMemoryAtClientPoint(
    clientX: number,
    clientY: number,
  ): number | null {
    const ndc = this.getCanvasNdc(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.camera);

    const hits = this.raycaster.intersectObjects(this.memoryHitMeshes, false);
    if (hits.length > 0) {
      const idx = hits[0].object.userData.memoryIndex;
      if (typeof idx === 'number') return idx;
    }

    // Screen-space NDC proximity fallback for small mobile screens
    let closestIdx: number | null = null;
    let closestDist = 0.085;

    for (let i = 0; i < this.memoryHitMeshes.length; i++) {
      const proxy = this.memoryHitMeshes[i];
      proxy.getWorldPosition(_vec3);
      _vec3.project(this.camera);
      if (_vec3.z > 1 || _vec3.z < -1) continue;
      const dist = Math.hypot(_vec3.x - ndc.x, _vec3.y - ndc.y);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    return closestIdx;
  }

  private readonly handleControlsStart = (): void => {
    this.shouldGlideCameraPos = false;
    if (this.controls.autoRotate) {
      this.controls.autoRotate = false;
      this.callbacks.onModeChange(false);
    }
  };

  private readonly handlePointerDown = (e: PointerEvent): void => {
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.pointerLastX = e.clientX;
    this.pointerLastY = e.clientY;
    this.cumulativeDragDist = 0;
  };

  private readonly handlePointerMove = (e: PointerEvent): void => {
    const dx = e.clientX - this.pointerLastX;
    const dy = e.clientY - this.pointerLastY;
    this.cumulativeDragDist += Math.hypot(dx, dy);
    this.pointerLastX = e.clientX;
    this.pointerLastY = e.clientY;

    if (e.pointerType !== 'mouse') return;

    const now = performance.now();
    if (now - this.lastHoverCheckMs < 60) return;
    this.lastHoverCheckMs = now;

    const hovered = this.pickMemoryAtClientPoint(e.clientX, e.clientY);
    if (hovered !== this.hoveredMemoryIndex) {
      this.hoveredMemoryIndex = hovered;
      this.callbacks.onHoverChange(hovered !== null);
    }
  };

  private readonly handlePointerUp = (e: PointerEvent): void => {
    const netMove = Math.hypot(
      e.clientX - this.pointerStartX,
      e.clientY - this.pointerStartY,
    );
    if (netMove < 22 && this.cumulativeDragDist < 30) {
      const hitIdx = this.pickMemoryAtClientPoint(e.clientX, e.clientY);
      if (hitIdx !== null) {
        this.focusMemory(hitIdx);
        this.callbacks.onTulipSelect(hitIdx);
      }
    }
  };

  private readonly handleTouchStart = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    this.pointerStartX = t.clientX;
    this.pointerStartY = t.clientY;
    this.pointerLastX = t.clientX;
    this.pointerLastY = t.clientY;
    this.cumulativeDragDist = 0;
  };

  private readonly handleTouchMove = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    this.cumulativeDragDist += Math.hypot(
      t.clientX - this.pointerLastX,
      t.clientY - this.pointerLastY,
    );
    this.pointerLastX = t.clientX;
    this.pointerLastY = t.clientY;
  };

  private readonly handleTouchEnd = (e: TouchEvent): void => {
    if (e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const netMove = Math.hypot(
      t.clientX - this.pointerStartX,
      t.clientY - this.pointerStartY,
    );
    if (netMove < 22 && this.cumulativeDragDist < 30) {
      const hitIdx = this.pickMemoryAtClientPoint(t.clientX, t.clientY);
      if (hitIdx !== null) {
        this.focusMemory(hitIdx);
        this.callbacks.onTulipSelect(hitIdx);
      }
    }
  };

  private readonly handleTouchCancel = (): void => {
    this.cumulativeDragDist = 999;
  };

  private readonly handleResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
  };

  private readonly handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private readonly handleContextRestored = (): void => {
    this.callbacks.onContextLost(false);
  };

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointermove', this.handlePointerMove);
    dom.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    dom.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    dom.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    dom.addEventListener('touchcancel', this.handleTouchCancel, {
      passive: true,
    });
    dom.addEventListener('webglcontextlost', this.handleContextLost);
    dom.addEventListener('webglcontextrestored', this.handleContextRestored);
    window.addEventListener('resize', this.handleResize);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
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
    const tick = () => {
      if (this.disposed) return;

      const delta = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.getElapsedTime();

      this.galaxyGroup.rotation.y += delta * 0.04;

      this.updateFlowerMatrices(elapsed);
      this.updateEffects(delta, elapsed);

      if (this.introActive) {
        this.introElapsed += delta;
        const rawT = Math.min(1, this.introElapsed / this.introDuration);
        const eased = 1 - Math.pow(1 - rawT, 3);
        this.camera.position.lerpVectors(
          this.introStartPos,
          this.defaultOverviewPos,
          eased,
        );
        this.camera.lookAt(0, 0, 0);

        if (rawT >= 1) {
          this.introActive = false;
          this.controls.enabled = true;
          this.controls.target.set(0, 0, 0);
          this.callbacks.onIntroComplete();
        }
      } else {
        if (this.shouldGlideCameraPos) {
          this.camera.position.x = THREE.MathUtils.damp(
            this.camera.position.x,
            this.targetCameraPos.x,
            3.6,
            delta,
          );
          this.camera.position.y = THREE.MathUtils.damp(
            this.camera.position.y,
            this.targetCameraPos.y,
            3.6,
            delta,
          );
          this.camera.position.z = THREE.MathUtils.damp(
            this.camera.position.z,
            this.targetCameraPos.z,
            3.6,
            delta,
          );

          if (
            this.camera.position.distanceToSquared(this.targetCameraPos) < 0.25
          ) {
            this.shouldGlideCameraPos = false;
          }
        }

        this.controls.update();
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.renderer.render(this.scene, this.camera);
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled && !this.isSoftwareGl;
  }

  public focusMemory(memoryIndex: number): void {
    const proxy = this.memoryHitMeshes[memoryIndex];
    if (!proxy) return;

    this.introActive = false;
    this.controls.enabled = true;

    proxy.getWorldPosition(_vec3B);
    _vec3C.copy(_vec3B);
    _vec3C.y = 0;
    if (_vec3C.lengthSq() < 1) {
      _vec3C.set(0, 0, 1);
    }
    _vec3C.normalize();

    this.targetCameraPos.set(
      _vec3B.x + _vec3C.x * 36,
      _vec3B.y + 24,
      _vec3B.z + _vec3C.z * 36,
    );
    this.shouldGlideCameraPos = true;
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('pointermove', this.handlePointerMove);
    dom.removeEventListener('pointerup', this.handlePointerUp);
    dom.removeEventListener('touchstart', this.handleTouchStart);
    dom.removeEventListener('touchmove', this.handleTouchMove);
    dom.removeEventListener('touchend', this.handleTouchEnd);
    dom.removeEventListener('touchcancel', this.handleTouchCancel);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);
    dom.removeEventListener('webglcontextrestored', this.handleContextRestored);
    window.removeEventListener('resize', this.handleResize);

    this.controls.removeEventListener('start', this.handleControlsStart);
    this.controls.dispose();

    this.geometryCache.forEach((geoms) => {
      geoms.stemAndLeaves.dispose();
      geoms.outerPetals.dispose();
      geoms.innerPetals.dispose();
      geoms.stamenCore.dispose();
      geoms.hitProxy.dispose();
    });
    this.geometryCache.clear();

    this.disposableGeometries.forEach((g) => g.dispose());
    this.disposableMaterials.forEach((m) => m.dispose());
    this.disposableTextures.forEach((t) => t.dispose());
    this.envRenderTargetTexture?.dispose();

    this.shootingStars.forEach((s) => {
      s.line.geometry.dispose();
      (s.line.material as THREE.Material).dispose();
    });

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
