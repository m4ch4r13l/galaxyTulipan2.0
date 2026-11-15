import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Flower2,
  Hand,
  Heart,
  Music,
  Volume2,
  X,
} from 'lucide-react';
import { TULIP_MEMORIES } from './data/tulips';
import { AmbientChimeEngine } from './three/ambientAudio';
import { TulipGalaxyEngine } from './three/TulipGalaxyEngine';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TulipGalaxyEngine | null>(null);
  const audioRef = useRef<AmbientChimeEngine | null>(null);

  const [showIntro, setShowIntro] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);
  const [isOrbitMode, setIsOrbitMode] = useState(true);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isHoveringTulip, setIsHoveringTulip] = useState(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const [activeMemoryIndex, setActiveMemoryIndex] = useState<number | null>(null);
  const [currentFocusIndex, setCurrentFocusIndex] = useState(0);
  const [discoveredIds, setDiscoveredIds] = useState<number[]>([]);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  const openMemory = useCallback((index: number) => {
    const normalized =
      ((index % TULIP_MEMORIES.length) + TULIP_MEMORIES.length) %
      TULIP_MEMORIES.length;
    setCurrentFocusIndex(normalized);
    setActiveMemoryIndex(normalized);
    setDiscoveredIds((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized],
    );
    audioRef.current?.playSelectionSpark();
  }, []);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const audio = new AmbientChimeEngine();
    audioRef.current = audio;

    const engine = new TulipGalaxyEngine(mount, {
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
    });
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
      if (activeMemoryIndex !== null) {
        if (e.key === 'Escape') {
          setActiveMemoryIndex(null);
        } else if (e.key === 'ArrowRight') {
          const next = (activeMemoryIndex + 1) % TULIP_MEMORIES.length;
          engineRef.current?.focusMemory(next);
          openMemory(next);
        } else if (e.key === 'ArrowLeft') {
          const prev =
            (activeMemoryIndex - 1 + TULIP_MEMORIES.length) %
            TULIP_MEMORIES.length;
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
  }, [activeMemoryIndex, openMemory]);

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
    const nextIdx =
      (base + direction + TULIP_MEMORIES.length) % TULIP_MEMORIES.length;
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

  const activeMemory =
    activeMemoryIndex !== null ? TULIP_MEMORIES[activeMemoryIndex] : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0b0212] text-pink-100">
      {/* Isolated WebGL canvas container */}
      <div
        ref={canvasMountRef}
        className={`fixed inset-0 z-0 ${
          isHoveringTulip ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
        }`}
        aria-label="Galaxia 3D interactiva de tulipanes"
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
            Galaxia de Tulipanes
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 text-xs text-pink-200/80 whitespace-nowrap tabular-nums">
          <span>
            {discoveredIds.length} / {TULIP_MEMORIES.length} recuerdos
          </span>
          <span aria-hidden="true" className="text-pink-400/60">
            ·
          </span>
          <span className="hidden sm:inline text-pink-200/65">
            Toca un tulipán
          </span>
        </div>
      </header>

      {/* Intro Welcome Card */}
      {showIntro && !introDismissed && activeMemory === null && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
          <div className="cosmos-surface rounded-3xl p-7 md:p-9 max-w-md w-full text-center pointer-events-auto transition-all duration-300">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-pink-500/30 to-rose-500/30 border border-pink-400/30 flex items-center justify-center text-pink-300">
              <Flower2 className="w-7 h-7" />
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-pink-50 mb-3 text-balance">
              Galaxia de Tulipanes
            </h1>
            <p className="font-script text-2xl md:text-3xl text-pink-200 leading-relaxed mb-6">
              "Toca cualquier tulipán flotante del universo 3D para descubrir su
              mensaje."
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

      {/* Collapsible Bottom Control Dock with Tulip Navigator */}
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

          {/* Tulip Memory Navigator in Bottom Dock */}
          <div className="flex items-center gap-1 pl-1 border-l border-pink-400/15 shrink-0">
            <button
              type="button"
              onClick={() => handleStepTulip(-1)}
              aria-label="Tulipán anterior"
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
                Tulipán {currentFocusIndex + 1}/{TULIP_MEMORIES.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleStepTulip(1)}
              aria-label="Siguiente tulipán"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-pink-200 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <span className="hidden lg:inline text-xs text-pink-200/60 pl-2 border-l border-pink-400/15 whitespace-nowrap">
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
            if (e.target === e.currentTarget) setActiveMemoryIndex(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 cosmos-modal-backdrop"
        >
          <div className="cosmos-surface rounded-3xl p-6 md:p-8 max-w-md w-full text-center relative max-h-[90vh] overflow-y-auto border-pink-400/35">
            <button
              type="button"
              onClick={() => setActiveMemoryIndex(null)}
              aria-label="Cerrar mensaje"
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-pink-200 hover:text-white flex items-center justify-center border border-pink-400/25 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-xs text-pink-300/75 mb-4 tabular-nums">
              Tulipán {activeMemory.id + 1} de {TULIP_MEMORIES.length}
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
    </div>
  );
}
