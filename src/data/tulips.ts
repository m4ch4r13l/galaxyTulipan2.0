export type FlowerType = 'tulip' | 'rose' | 'lily';

export type ColorFilterId =
  | 'multicolor'
  | 'romantic_rose'
  | 'solar_gold'
  | 'galactic_blue'
  | 'mystic_violet'
  | 'lunar_white';

export interface TulipMemory {
  id: number;
  title: string;
  verse: string;
  image: string;
}

export interface TulipPaletteEntry {
  outerHex: number;
  innerHex: number;
  burstHex: number;
}

export interface ColorFilterPreset {
  id: ColorFilterId;
  label: string;
  swatchHex: string;
  bgHex: number;
  galaxyInsideHex: string;
  galaxyMiddleHex: string;
  galaxyOutsideHex: string;
  palette: TulipPaletteEntry[];
}

export interface CustomizationConfig {
  flowerType: FlowerType;
  colorFilter: ColorFilterId;
  memories: TulipMemory[];
}

const BASE = import.meta.env.BASE_URL;
const STORAGE_KEY = 'galaxia_flores_config_v1';

export const DEFAULT_MEMORIES: TulipMemory[] = [
  {
    id: 0,
    title: 'Conexión Infinita',
    verse:
      '"Una conexión\ncomo la nuestra,\nestará...\nHasta cuando nosotros\ndejemos de estar."',
    image: `${BASE}assets/aistudio/img1_22161a26.jpeg`,
  },
  {
    id: 1,
    title: 'Sueño Estelar',
    verse:
      '"¿Cómo no amarte vida mía?\nSi eres un sueño,\nen un mundo de pesadillas."',
    image: `${BASE}assets/aistudio/img2_a12b6e5d.jpeg`,
  },
  {
    id: 2,
    title: 'Más Bella Que La Vida',
    verse:
      '"La vida es bella,\npero tú... mi vida...\neres más bella\nque la vida en sí misma."',
    image: `${BASE}assets/aistudio/img3_ec320f2a.jpeg`,
  },
  {
    id: 3,
    title: 'Versos Escritos En El Cielo',
    verse:
      '"Si Dios existe, seguro es poeta,\ny te escribió a ti,\ncon perfección y amor en cada\nuna de tus letras..."',
    image: `${BASE}assets/aistudio/img4_3ab1da46.jpeg`,
  },
  {
    id: 4,
    title: 'Vínculo Perpetuo',
    verse:
      '"Eres mía,\nporque ni tan tuya has sido,\ncomo ya has sido mía.\nY no eras mía como pertenencia,\ncomo un objeto...\nEres mía como vínculo perpetuo."',
    image: `${BASE}assets/aistudio/img5_f7abd738.jpeg`,
  },
  {
    id: 5,
    title: 'Bendita Coincidencia',
    verse:
      '"Bendito sea Dios, su física\ny su perfecta ciencia.\nBendita sea cada coincidencia\nque permitió tu bendita existencia..."',
    image: `${BASE}assets/aistudio/img6_e1c2e0d2.jpeg`,
  },
  {
    id: 6,
    title: 'Toda Mi Vida Contigo',
    verse:
      '"Sé que no será fácil, pero\nquiero que sigamos siendo\ntú y yo por mucho tiempo más;\nquiero estar contigo\ntoda mi vida."',
    image: `${BASE}assets/aistudio/img7_cfff7819.jpeg`,
  },
];

export const TULIP_MEMORIES = DEFAULT_MEMORIES;

export const COLOR_FILTERS: ColorFilterPreset[] = [
  {
    id: 'multicolor',
    label: 'Multicolor',
    swatchHex: '#ec4899',
    bgHex: 0x0b0212,
    galaxyInsideHex: '#fff1f2',
    galaxyMiddleHex: '#ec4899',
    galaxyOutsideHex: '#831843',
    palette: [
      { outerHex: 0xf43f5e, innerHex: 0xfb7185, burstHex: 0xf43f5e },
      { outerHex: 0xd946ef, innerHex: 0xe879f9, burstHex: 0xe879f9 },
      { outerHex: 0xef4444, innerHex: 0xf87171, burstHex: 0xf87171 },
      { outerHex: 0xfbbf24, innerHex: 0xfde047, burstHex: 0xfbbf24 },
      { outerHex: 0x38bdf8, innerHex: 0x7dd3fc, burstHex: 0x38bdf8 },
      { outerHex: 0xfff1f2, innerHex: 0xffffff, burstHex: 0xfbcfe8 },
    ],
  },
  {
    id: 'romantic_rose',
    label: 'Rosa Carmesí',
    swatchHex: '#f43f5e',
    bgHex: 0x11020d,
    galaxyInsideHex: '#fff1f2',
    galaxyMiddleHex: '#f43f5e',
    galaxyOutsideHex: '#6d0b2c',
    palette: [
      { outerHex: 0xe11d48, innerHex: 0xfb7185, burstHex: 0xf43f5e },
      { outerHex: 0xf43f5e, innerHex: 0xfda4af, burstHex: 0xfb7185 },
      { outerHex: 0xbe123c, innerHex: 0xf43f5e, burstHex: 0xe11d48 },
      { outerHex: 0xfb7185, innerHex: 0xffe4e6, burstHex: 0xfda4af },
    ],
  },
  {
    id: 'solar_gold',
    label: 'Dorado Solar',
    swatchHex: '#fbbf24',
    bgHex: 0x100803,
    galaxyInsideHex: '#fefce8',
    galaxyMiddleHex: '#f59e0b',
    galaxyOutsideHex: '#78350f',
    palette: [
      { outerHex: 0xf59e0b, innerHex: 0xfde047, burstHex: 0xfbbf24 },
      { outerHex: 0xd97706, innerHex: 0xfbbf24, burstHex: 0xf59e0b },
      { outerHex: 0xfbbf24, innerHex: 0xfef08a, burstHex: 0xfde047 },
      { outerHex: 0xfb923c, innerHex: 0xfed7aa, burstHex: 0xfb923c },
    ],
  },
  {
    id: 'galactic_blue',
    label: 'Azul Galáctico',
    swatchHex: '#38bdf8',
    bgHex: 0x030816,
    galaxyInsideHex: '#f0f9ff',
    galaxyMiddleHex: '#38bdf8',
    galaxyOutsideHex: '#1e3a8a',
    palette: [
      { outerHex: 0x0284c7, innerHex: 0x7dd3fc, burstHex: 0x38bdf8 },
      { outerHex: 0x38bdf8, innerHex: 0xbae6fd, burstHex: 0x7dd3fc },
      { outerHex: 0x6366f1, innerHex: 0xa5b4fc, burstHex: 0x818cf8 },
      { outerHex: 0x22d3ee, innerHex: 0xa5f3fc, burstHex: 0x22d3ee },
    ],
  },
  {
    id: 'mystic_violet',
    label: 'Violeta Místico',
    swatchHex: '#a855f7',
    bgHex: 0x0b0318,
    galaxyInsideHex: '#faf5ff',
    galaxyMiddleHex: '#a855f7',
    galaxyOutsideHex: '#4c1d95',
    palette: [
      { outerHex: 0x9333ea, innerHex: 0xd8b4fe, burstHex: 0xa855f7 },
      { outerHex: 0xc026d3, innerHex: 0xf0abfc, burstHex: 0xe879f9 },
      { outerHex: 0x7c3aed, innerHex: 0xc4b5fd, burstHex: 0x8b5cf6 },
      { outerHex: 0xd946ef, innerHex: 0xf5d0fe, burstHex: 0xd946ef },
    ],
  },
  {
    id: 'lunar_white',
    label: 'Blanco Lunar',
    swatchHex: '#f8fafc',
    bgHex: 0x070812,
    galaxyInsideHex: '#ffffff',
    galaxyMiddleHex: '#cbd5e1',
    galaxyOutsideHex: '#334155',
    palette: [
      { outerHex: 0xf8fafc, innerHex: 0xffffff, burstHex: 0xf1f5f9 },
      { outerHex: 0xffe4e6, innerHex: 0xfff1f2, burstHex: 0xfecdd3 },
      { outerHex: 0xe2e8f0, innerHex: 0xf8fafc, burstHex: 0xe2e8f0 },
      { outerHex: 0xfef3c7, innerHex: 0xfffbeb, burstHex: 0xfde68a },
    ],
  },
];

export const TULIP_PALETTE = COLOR_FILTERS[0].palette;

export function getFlowerSingularLabel(type: FlowerType): string {
  switch (type) {
    case 'rose':
      return 'Rosa';
    case 'lily':
      return 'Lirio';
    default:
      return 'Tulipán';
  }
}

export function getFlowerPluralLabel(type: FlowerType): string {
  switch (type) {
    case 'rose':
      return 'Rosas';
    case 'lily':
      return 'Lirios';
    default:
      return 'Tulipanes';
  }
}

export function loadCustomizationConfig(): CustomizationConfig {
  const fallback: CustomizationConfig = {
    flowerType: 'tulip',
    colorFilter: 'multicolor',
    memories: DEFAULT_MEMORIES.map((m) => ({ ...m })),
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<CustomizationConfig>;

    const flowerType: FlowerType =
      parsed.flowerType === 'rose' ||
      parsed.flowerType === 'lily' ||
      parsed.flowerType === 'tulip'
        ? parsed.flowerType
        : 'tulip';

    const validFilter = COLOR_FILTERS.some((f) => f.id === parsed.colorFilter)
      ? (parsed.colorFilter as ColorFilterId)
      : 'multicolor';

    const memories = DEFAULT_MEMORIES.map((def, idx) => {
      const saved = parsed.memories?.[idx];
      if (!saved) return { ...def };
      return {
        id: def.id,
        title: typeof saved.title === 'string' ? saved.title : def.title,
        verse: typeof saved.verse === 'string' ? saved.verse : def.verse,
        image:
          typeof saved.image === 'string' && saved.image.length > 0
            ? saved.image
            : def.image,
      };
    });

    return { flowerType, colorFilter: validFilter, memories };
  } catch {
    return fallback;
  }
}

export function saveCustomizationConfig(config: CustomizationConfig): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function resizeImageFileToDataUrl(
  file: File,
  maxDim = 720,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen inválido'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
