import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Flower2,
  Hand,
  Heart,
  ImagePlus,
  Music,
  Palette,
  Pencil,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import {
  COLOR_FILTERS,
  type ColorFilterId,
  type CustomizationConfig,
  DEFAULT_MEMORIES,
  type FlowerType,
  getFlowerPluralLabel,
  getFlowerSingularLabel,
  loadCustomizationConfig,
  resizeImageFileToDataUrl,
  saveCustomizationConfig,
} from './data/tulips';
import { AmbientChimeEngine } from './three/ambientAudio';
import { TulipGalaxyEngine } from './three/TulipGalaxyEngine';

const FLOWER_OPTIONS: {
  id: FlowerType;
  label: string;
  subtitle: string;
}[] = [
  {
    id: 'tulip',
    label: 'Tulipanes',
    subtitle: 'Copa elegante de 6 pétalos',
  },
  {
    id: 'rose',
    label: 'Rosas',
    subtitle: 'Espiral romántica en capas',
  },
  {
    id: 'lily',
    label: 'Lirios',
    subtitle: 'Estrella abierta con estambres',
  },
];

type CustomizeTab = 'style' | 'memories';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TulipGalaxyEngine | null>(null);
  const audioRef = useRef<AmbientChimeEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [config, setConfig] = useState<CustomizationConfig>(() =>
    loadCustomizationConfig(),
  );
  const initialEngineConfigRef = useRef({
    flowerType: config.flowerType,
    colorFilter: config.colorFilter,
  });

  const [showIntro, setShowIntro] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);
  const [isOrbitMode, setIsOrbitMode] = useState(true);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isHoveringTulip, setIsHoveringTulip] = useState(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const [activeMemoryIndex, setActiveMemoryIndex] = useState<number | null>(
    null,
  );
  const [currentFocusIndex, setCurrentFocusIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  // Personalization modal state
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customizeTab, setCustomizeTab] = useState<CustomizeTab>('style');
  const [editingMemoryIndex, setEditingMemoryIndex] = useState(0);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const memories = config.memories;
  const singularFlower = getFlowerSingularLabel(config.flowerType);
  const pluralFlower = getFlowerPluralLabel(config.flowerType);

  const activeFilter = useMemo(
    () =>
      COLOR_FILTERS.find((f) => f.id === config.colorFilter) ??
      COLOR_FILTERS[0],
    [config.colorFilter],
  );
  const bgHexCss = `#${activeFilter.bgHex.toString(16).padStart(6, '0')}`;

  // Persist customization to localStorage
  useEffect(() => {
    const ok = saveCustomizationConfig(config);
    setStorageWarning(
      ok
        ? null
        : 'Espacio local lleno: intenta usar una foto más ligera para guardar todos los cambios.',
    );
  }, [config]);

  // Sync 3D flower species & color filter without recreating the WebGL canvas
  useEffect(() => {
    engineRef.current?.setFlowerType(config.flowerType);
  }, [config.flowerType]);

  useEffect(() => {
    engineRef.current?.setColorFilter(config.colorFilter);
  }, [config.colorFilter]);

  const openMemory = useCallback(
    (index: number) => {
      const normalized =
        ((index % memories.length) + memories.length) % memories.length;
      setCurrentFocusIndex(normalized);
      setActiveMemoryIndex(normalized);
      audioRef.current?.playSelectionSpark();
    },
    [memories.length],
  );

  const closeMemoryModal = useCallback(() => {
    setActiveMemoryIndex(null);
  }, []);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const audio = new AmbientChimeEngine();
    audioRef.current = audio;

    const engine = new TulipGalaxyEngine(
      mount,
      {
        onIntroComplete: () => {
          setShowIntro(true);
        },
        onModeChange: (orbit) => {
          setIsOrbitMode(orbit);
        },
        onTulipSelect: (memoryIndex) => {
          openMemory(memoryIndex);
        },
        onHoverChange: (hovering) => {
          setIsHoveringTulip(hovering);
        },
        onContextLost: (lost) => {
          setContextLost(lost);
        },
      },
      initialEngineConfigRef.current,
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
      audio.dispose();
      audioRef.current = null;
    };
  }, [openMemory]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingField =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (isCustomizing) {
          setIsCustomizing(false);
          return;
        }
        if (activeMemoryIndex !== null) {
          closeMemoryModal();
          return;
        }
      }

      if (isEditingField || isCustomizing) return;

      if (activeMemoryIndex !== null) {
        if (e.key === 'ArrowRight') {
          const next = (activeMemoryIndex + 1) % memories.length;
          engineRef.current?.focusMemory(next);
          openMemory(next);
        } else if (e.key === 'ArrowLeft') {
          const prev =
            (activeMemoryIndex - 1 + memories.length) % memories.length;
          engineRef.current?.focusMemory(prev);
          openMemory(prev);
        }
        return;
      }

      if (e.key.toLowerCase() === 'h') {
        setIsDockCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeMemoryIndex,
    closeMemoryModal,
    isCustomizing,
    memories.length,
    openMemory,
  ]);

  const handleToggleOrbit = () => {
    const next = !isOrbitMode;
    setIsOrbitMode(next);
    engineRef.current?.setAutoRotate(next);
  };

  const handleToggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isAudioPlaying) {
      audio.stop();
      setIsAudioPlaying(false);
    } else {
      const started = audio.start();
      setIsAudioPlaying(started);
    }
  };

  const handleStepTulip = (direction: -1 | 1) => {
    const base =
      activeMemoryIndex !== null ? activeMemoryIndex : currentFocusIndex;
    const nextIdx = (base + direction + memories.length) % memories.length;
    setIntroDismissed(true);
    setShowIntro(false);
    engineRef.current?.focusMemory(nextIdx);
    openMemory(nextIdx);
  };

  const handleOpenCurrentTulip = () => {
    setIntroDismissed(true);
    setShowIntro(false);
    engineRef.current?.focusMemory(currentFocusIndex);
    openMemory(currentFocusIndex);
  };

  const handleOpenCustomize = (tab: CustomizeTab = 'style', index?: number) => {
    setIntroDismissed(true);
    setShowIntro(false);
    setActiveMemoryIndex(null);
    setCustomizeTab(tab);
    if (typeof index === 'number') {
      setEditingMemoryIndex(index);
    }
    setUploadError(null);
    setIsCustomizing(true);
  };

  const handleSelectFlowerType = (flowerType: FlowerType) => {
    setConfig((prev) => ({ ...prev, flowerType }));
  };

  const handleSelectColorFilter = (colorFilter: ColorFilterId) => {
    setConfig((prev) => ({ ...prev, colorFilter }));
  };

  const handleMemoryFieldChange = (
    index: number,
    field: 'title' | 'verse',
    value: string,
  ) => {
    setConfig((prev) => ({
      ...prev,
      memories: prev.memories.map((mem, i) =>
        i === index ? { ...mem, [field]: value } : mem,
      ),
    }));
  };

  const handlePhotoFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    setIsUploadingPhoto(true);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 680);
      setConfig((prev) => ({
        ...prev,
        memories: prev.memories.map((mem, i) =>
          i === editingMemoryIndex ? { ...mem, image: dataUrl } : mem,
        ),
      }));
      setFailedImages((prev) => ({ ...prev, [editingMemoryIndex]: false }));
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar la imagen seleccionada.',
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleResetSingleMemory = (index: number) => {
    const def = DEFAULT_MEMORIES[index];
    if (!def) return;
    setConfig((prev) => ({
      ...prev,
      memories: prev.memories.map((mem, i) =>
        i === index ? { ...def } : mem,
      ),
    }));
    setFailedImages((prev) => ({ ...prev, [index]: false }));
    setUploadError(null);
  };

  const handleResetAll = () => {
    setConfig({
      flowerType: 'tulip',
      colorFilter: 'multicolor',
      memories: DEFAULT_MEMORIES.map((m) => ({ ...m })),
    });
    setFailedImages({});
    setUploadError(null);
  };

  const activeMemory =
    activeMemoryIndex !== null ? memories[activeMemoryIndex] : null;
  const editingMemory = memories[editingMemoryIndex] ?? memories[0];

  return (
    <div
      className="relative w-screen h-screen overflow-hidden text-pink-100 transition-colors duration-500"
      style={{ backgroundColor: bgHexCss }}
    >
      {/* Isolated WebGL canvas container */}
      <div
        ref={canvasMountRef}
        className={`fixed inset-0 z-0 ${
          isHoveringTulip
            ? 'cursor-pointer'
            : 'cursor-grab active:cursor-grabbing'
        }`}
        aria-label={`Galaxia 3D interactiva de ${pluralFlower.toLowerCase()}`}
      />

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-[#0b0212]/95">
          <div className="cosmos-surface rounded-2xl p-8 max-w-md text-center">
            <Flower2 className="w-10 h-10 text-pink-400 mx-auto mb-4" />
            <h2 className="font-display text-xl font-bold text-pink-100 mb-2">
              Contexto 3D pausado
            </h2>
            <p className="text-sm text-pink-200/80 mb-5">
              El navegador liberó temporalmente los recursos gráficos. Puedes
              explorar los recuerdos directamente desde aquí.
            </p>
            <button
              type="button"
              onClick={() => openMemory(0)}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium transition-colors"
            >
              Ver recuerdos
            </button>
          </div>
        </div>
      )}

      {/* Minimal Top Bar */}
      <header className="fixed top-0 inset-x-0 z-10 pointer-events-none px-4 py-4 md:px-8 md:py-5 flex items-center justify-between gap-6">
        <div className="pointer-events-auto flex items-center gap-3">
          <Heart className="w-4 h-4 text-pink-400 shrink-0" />
          <span className="font-display text-sm md:text-base font-bold tracking-wide text-pink-100 whitespace-nowrap">
            Galaxia de {pluralFlower}
          </span>
        </div>
      </header>

      {/* Intro Welcome Card */}
      {showIntro &&
        !introDismissed &&
        activeMemory === null &&
        !isCustomizing && (
          <div className="fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
            <div className="cosmos-surface rounded-3xl p-7 md:p-9 max-w-md w-full text-center pointer-events-auto transition-all duration-300">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-pink-500/30 to-rose-500/30 border border-pink-400/30 flex items-center justify-center text-pink-300">
                <Flower2 className="w-7 h-7" />
              </div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-pink-50 mb-3 text-balance">
                Galaxia de {pluralFlower}
              </h1>
              <p className="font-script text-2xl md:text-3xl text-pink-200 leading-relaxed mb-6">
                "Toca los {pluralFlower.toLowerCase()} de la galaxia para
                descubrir cada uno de los {memories.length} recuerdos dedicados
                a ti."
              </p>
              <button
                type="button"
                onClick={() => {
                  setIntroDismissed(true);
                  setShowIntro(false);
                }}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 text-white font-semibold text-sm transition-transform duration-150 active:scale-95 inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <Heart className="w-4 h-4" />
                <span>Entrar a la Galaxia</span>
              </button>
            </div>
          </div>
        )}

      {/* Collapsible Bottom Control Dock with Flower Navigator & Personalize */}
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center transition-transform duration-200 ${
          isDockCollapsed ? 'translate-y-[calc(100%-28px)]' : 'translate-y-0'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsDockCollapsed((prev) => !prev)}
          aria-expanded={!isDockCollapsed}
          aria-label={isDockCollapsed ? 'Mostrar controles' : 'Ocultar controles'}
          className="cosmos-surface px-3.5 py-1 rounded-t-xl border-b-0 text-[11px] font-medium text-pink-200/85 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          {isDockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Controles</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Ocultar</span>
            </>
          )}
        </button>

        <nav
          aria-label="Controles de la galaxia"
          className="cosmos-surface rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2 sm:gap-2.5 max-w-[95vw] overflow-x-auto shadow-2xl"
        >
          <button
            type="button"
            onClick={handleToggleOrbit}
            className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isOrbitMode
                ? 'bg-pink-500/20 text-pink-100 border border-pink-400/40'
                : 'bg-white/5 text-pink-200/80 border border-white/10 hover:text-white'
            }`}
          >
            {isOrbitMode ? (
              <Compass className="w-4 h-4 text-pink-300" />
            ) : (
              <Hand className="w-4 h-4 text-pink-300" />
            )}
            <span className="hidden sm:inline">
              {isOrbitMode ? 'Vista Órbita' : 'Control Manual'}
            </span>
            <span className="sm:hidden">
              {isOrbitMode ? 'Órbita' : 'Manual'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleAudio}
            className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isAudioPlaying
                ? 'bg-pink-500/20 text-pink-100 border border-pink-400/40'
                : 'bg-white/5 text-pink-200/80 border border-white/10 hover:text-white'
            }`}
          >
            {isAudioPlaying ? (
              <Volume2 className="w-4 h-4 text-pink-300" />
            ) : (
              <Music className="w-4 h-4 text-pink-300" />
            )}
            <span className="hidden sm:inline">
              {isAudioPlaying ? 'Melodía Activa' : 'Melodía'}
            </span>
            <span className="sm:hidden">Audio</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenCustomize('style')}
            className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isCustomizing
                ? 'bg-pink-500/25 text-white border border-pink-400/50'
                : 'bg-white/5 text-pink-200/85 border border-white/10 hover:text-white hover:bg-white/10'
            }`}
          >
            <Palette className="w-4 h-4 text-pink-300" />
            <span className="hidden sm:inline">Personalizar</span>
            <span className="sm:hidden">Estilo</span>
          </button>

          {/* Flower Memory Navigator in Bottom Dock */}
          <div className="flex items-center gap-1 pl-1 border-l border-pink-400/15 shrink-0">
            <button
              type="button"
              onClick={() => handleStepTulip(-1)}
              aria-label={`${singularFlower} anterior`}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-pink-200 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleOpenCurrentTulip}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
            >
              <Flower2 className="w-4 h-4" />
              <span>
                {singularFlower} {currentFocusIndex + 1}/{memories.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleStepTulip(1)}
              aria-label={`Siguiente ${singularFlower.toLowerCase()}`}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-pink-200 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <span className="hidden xl:inline text-xs text-pink-200/60 pl-2 border-l border-pink-400/15 whitespace-nowrap">
            Arrastra para girar · Zoom con rueda o pellizco
          </span>
        </nav>
      </div>

      {/* Interactive Verse & Memory Modal */}
      {activeMemory && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-memory-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeMemoryModal();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 cosmos-modal-backdrop"
        >
          <div className="cosmos-surface rounded-3xl p-6 md:p-8 max-w-md w-full text-center relative max-h-[90vh] overflow-y-auto border-pink-400/35">
            <div className="flex items-center justify-between gap-2 mb-4">
              <button
                type="button"
                onClick={() => handleOpenCustomize('memories', activeMemory.id)}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-pink-400/20 text-[11px] font-medium text-pink-200 hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>

              <span className="text-xs text-pink-300/80 tabular-nums">
                {singularFlower} {activeMemory.id + 1} de {memories.length}
              </span>

              <button
                type="button"
                onClick={closeMemoryModal}
                aria-label="Cerrar mensaje"
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-pink-200 hover:text-white flex items-center justify-center border border-pink-400/25 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="w-48 h-48 sm:w-56 sm:h-56 mx-auto mb-5 rounded-2xl overflow-hidden border border-pink-400/35 bg-[#190628] flex items-center justify-center">
              {!failedImages[activeMemory.id] ? (
                <img
                  src={activeMemory.image}
                  alt={activeMemory.title}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedImages((prev) => ({
                      ...prev,
                      [activeMemory.id]: true,
                    }))
                  }
                  className="w-full h-full object-cover object-center"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-rose-950/70 to-fuchsia-950/70 p-4">
                  <Heart className="w-8 h-8 text-pink-400" />
                  <span className="font-display text-xs text-pink-200/80">
                    {activeMemory.title}
                  </span>
                </div>
              )}
            </div>

            <h2
              id="modal-memory-title"
              className="font-display text-lg md:text-xl font-bold text-pink-100 mb-3 text-balance"
            >
              {activeMemory.title}
            </h2>

            <p className="font-script text-2xl md:text-[28px] text-pink-200 my-3 leading-relaxed whitespace-pre-line">
              {activeMemory.verse}
            </p>

            <div className="mt-6 pt-4 border-t border-pink-400/15 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => handleStepTulip(-1)}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-pink-400/20 text-xs font-medium text-pink-100 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              <span className="text-[11px] text-pink-300/75 font-display tracking-wider">
                Para la estrella de mi vida
              </span>

              <button
                type="button"
                onClick={() => handleStepTulip(1)}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-pink-400/20 text-xs font-medium text-pink-100 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personalization Modal */}
      {isCustomizing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="customize-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCustomizing(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 cosmos-modal-backdrop"
        >
          <div className="cosmos-surface rounded-3xl p-5 sm:p-7 max-w-lg w-full relative max-h-[90vh] overflow-y-auto border-pink-400/35 text-left">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-400/30 flex items-center justify-center text-pink-300">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2
                    id="customize-modal-title"
                    className="font-display text-base sm:text-lg font-bold text-pink-50"
                  >
                    Personalizar Galaxia
                  </h2>
                  <p className="text-xs text-pink-200/70">
                    Flores, filtro de color, fotos y dedicatorias
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCustomizing(false)}
                aria-label="Cerrar personalización"
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-pink-200 hover:text-white flex items-center justify-center border border-pink-400/25 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-white/5 border border-pink-400/15 mb-5">
              <button
                type="button"
                onClick={() => setCustomizeTab('style')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  customizeTab === 'style'
                    ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white'
                    : 'text-pink-200/80 hover:text-white'
                }`}
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Estilo 3D</span>
              </button>

              <button
                type="button"
                onClick={() => setCustomizeTab('memories')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  customizeTab === 'memories'
                    ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white'
                    : 'text-pink-200/80 hover:text-white'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Fotos y Mensajes</span>
              </button>
            </div>

            {storageWarning && (
              <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/35 text-xs text-amber-200">
                {storageWarning}
              </div>
            )}

            {customizeTab === 'style' ? (
              <div className="space-y-6">
                {/* Flower Type Selector */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-pink-300/85 mb-2.5">
                    Tipo de flor 3D
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {FLOWER_OPTIONS.map((opt) => {
                      const selected = config.flowerType === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSelectFlowerType(opt.id)}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                            selected
                              ? 'bg-pink-500/20 border-pink-400/60 text-white'
                              : 'bg-white/5 border-white/10 text-pink-200/80 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display text-sm font-bold">
                              {opt.label}
                            </span>
                            {selected && (
                              <Check className="w-4 h-4 text-pink-300 shrink-0" />
                            )}
                          </div>
                          <span className="text-[11px] text-pink-200/70 leading-snug">
                            {opt.subtitle}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Filter Selector */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-pink-300/85 mb-2.5">
                    Filtro de color
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {COLOR_FILTERS.map((filter) => {
                      const selected = config.colorFilter === filter.id;
                      return (
                        <button
                          key={filter.id}
                          type="button"
                          onClick={() => handleSelectColorFilter(filter.id)}
                          className={`px-3 py-2.5 rounded-2xl border flex items-center gap-2.5 text-left transition-all cursor-pointer ${
                            selected
                              ? 'bg-pink-500/20 border-pink-400/60 text-white'
                              : 'bg-white/5 border-white/10 text-pink-200/80 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <span
                            className="w-5 h-5 rounded-full border border-white/30 shrink-0"
                            style={{ backgroundColor: filter.swatchHex }}
                          />
                          <span className="text-xs font-medium truncate">
                            {filter.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Memory Selector 1..7 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-pink-300/85">
                      Selecciona {singularFlower.toLowerCase()} a editar
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        engineRef.current?.focusMemory(editingMemoryIndex);
                        openMemory(editingMemoryIndex);
                        setIsCustomizing(false);
                      }}
                      className="text-[11px] text-pink-300 hover:text-white underline underline-offset-2 cursor-pointer"
                    >
                      Ver en la galaxia
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {memories.map((mem, idx) => {
                      const active = idx === editingMemoryIndex;
                      return (
                        <button
                          key={mem.id}
                          type="button"
                          onClick={() => {
                            setEditingMemoryIndex(idx);
                            setUploadError(null);
                          }}
                          className={`py-2 rounded-xl text-xs font-bold tabular-nums border transition-colors cursor-pointer ${
                            active
                              ? 'bg-gradient-to-r from-pink-500 to-rose-600 border-pink-300/60 text-white'
                              : 'bg-white/5 border-white/10 text-pink-200/80 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Photo Editor */}
                <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-pink-400/15">
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-pink-400/30 bg-[#190628] shrink-0 flex items-center justify-center">
                    {!failedImages[editingMemory.id] ? (
                      <img
                        src={editingMemory.image}
                        alt={editingMemory.title}
                        className="w-full h-full object-cover object-center"
                        onError={() =>
                          setFailedImages((prev) => ({
                            ...prev,
                            [editingMemory.id]: true,
                          }))
                        }
                      />
                    ) : (
                      <Heart className="w-6 h-6 text-pink-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoFileChange}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isUploadingPhoto}
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-pink-500/25 hover:bg-pink-500/35 border border-pink-400/40 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>
                          {isUploadingPhoto ? 'Cargando...' : 'Cambiar foto'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleResetSingleMemory(editingMemoryIndex)
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-pink-200/85 hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Original</span>
                      </button>
                    </div>
                    {uploadError ? (
                      <p className="text-[11px] text-rose-300">{uploadError}</p>
                    ) : (
                      <p className="text-[11px] text-pink-200/65">
                        Sube cualquier foto desde tu galería o cámara.
                      </p>
                    )}
                  </div>
                </div>

                {/* Title Input */}
                <div>
                  <label
                    htmlFor="memory-title-input"
                    className="block text-xs font-semibold text-pink-200/85 mb-1.5"
                  >
                    Título del recuerdo #{editingMemoryIndex + 1}
                  </label>
                  <input
                    id="memory-title-input"
                    type="text"
                    maxLength={60}
                    value={editingMemory.title}
                    onChange={(e) =>
                      handleMemoryFieldChange(
                        editingMemoryIndex,
                        'title',
                        e.target.value,
                      )
                    }
                    placeholder="Ej. Nuestra primera noche bajo las estrellas"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#11041d] border border-pink-400/25 focus:border-pink-400 focus:outline-none text-sm text-white placeholder:text-pink-200/35"
                  />
                </div>

                {/* Message / Verse Textarea */}
                <div>
                  <label
                    htmlFor="memory-verse-input"
                    className="block text-xs font-semibold text-pink-200/85 mb-1.5"
                  >
                    Mensaje o dedicatoria
                  </label>
                  <textarea
                    id="memory-verse-input"
                    rows={4}
                    maxLength={400}
                    value={editingMemory.verse}
                    onChange={(e) =>
                      handleMemoryFieldChange(
                        editingMemoryIndex,
                        'verse',
                        e.target.value,
                      )
                    }
                    placeholder="Escribe aquí tu dedicatoria..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#11041d] border border-pink-400/25 focus:border-pink-400 focus:outline-none text-sm text-white placeholder:text-pink-200/35 leading-relaxed resize-y"
                  />
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="mt-6 pt-4 border-t border-pink-400/15 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetAll}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-pink-200/80 hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar todo</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCustomizing(false)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
