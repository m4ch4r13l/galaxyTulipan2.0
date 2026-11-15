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

const BASE = import.meta.env.BASE_URL;

export const TULIP_MEMORIES: TulipMemory[] = [
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

export const TULIP_PALETTE: TulipPaletteEntry[] = [
  { outerHex: 0xf43f5e, innerHex: 0xfb7185, burstHex: 0xf43f5e },
  { outerHex: 0xd946ef, innerHex: 0xe879f9, burstHex: 0xe879f9 },
  { outerHex: 0xef4444, innerHex: 0xf87171, burstHex: 0xf87171 },
  { outerHex: 0xfbbf24, innerHex: 0xfde047, burstHex: 0xfbbf24 },
  { outerHex: 0x38bdf8, innerHex: 0x7dd3fc, burstHex: 0x38bdf8 },
  { outerHex: 0xfff1f2, innerHex: 0xffffff, burstHex: 0xfbcfe8 },
];
