"use client";

import React from 'react';
import Image from 'next/image';
import { useIsMobile } from '../hooks/use-mobile';

type GameMode = 'single' | 'multiplayer';

interface ModeSelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelectMode: (mode: GameMode) => void;
  defaultMode?: GameMode;
  onRulesClick?: () => void;
}

const modeCopy: Record<GameMode, { title: string; description: string }> = {
  single: {
    title: '1 Jugador',
    description: 'Enfréntate solo al mercado. Mantén el score, supera niveles y evita los fees.',
  },
  multiplayer: {
    title: 'Multijugador',
    description: 'Compite en tiempo real contra otro jugador con condiciones iguales y marcador compartido.',
  },
};

const ModeSelectModal: React.FC<ModeSelectModalProps> = ({
  open,
  onClose,
  onSelectMode,
  defaultMode = 'single',
  onRulesClick,
}) => {
  const [hoveredMode, setHoveredMode] = React.useState<GameMode | null>(null);
  const isMobile = useIsMobile();

  React.useEffect(() => {
    if (!open) {
      setHoveredMode(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${isMobile ? 'max-w-[95vw] max-h-[95vh] overflow-y-auto' : 'max-w-5xl'} rounded-xl border border-pink-400/60 bg-slate-900/90 ${isMobile ? 'p-4' : 'p-6'} shadow-2xl shadow-pink-500/10`}
        onClick={event => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-red-600/80 hover:bg-red-500 text-white font-bold text-xl transition-colors duration-200 shadow-lg hover:shadow-red-500/50 focus:outline-none"
          aria-label="Cerrar selector de modo"
        >
          ×
        </button>
        <div className={`text-center ${isMobile ? 'mb-4' : 'mb-6'}`}>
          <h2 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-pixellari text-pink-200 tracking-wide`}>
            Selecciona modo de juego
          </h2>
          <p className={`mt-2 ${isMobile ? 'text-xs' : 'text-sm'} font-pixellari text-pink-200/80`}>
            Elige cómo quieres jugar.
          </p>
        </div>

        <div className={`flex flex-wrap justify-center ${isMobile ? 'gap-4' : 'gap-6'}`}>
          {/* Single Player Mode */}
          <button
            onClick={() => onSelectMode('single')}
            onMouseEnter={() => setHoveredMode('single')}
            onMouseLeave={() => setHoveredMode(null)}
            className={`group relative flex flex-col ${isMobile ? 'p-4' : 'p-6'} rounded-lg border border-pink-400/40 bg-slate-800/60 shadow-lg shadow-pink-500/10 hover:border-pink-400/80 hover:bg-slate-800/80 transition-all duration-200 focus:outline-none ${isMobile ? 'w-full max-w-[280px]' : 'w-[280px]'}`}
          >
            <div className="flex flex-col gap-4 items-center">
              <div className="flex items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-pink-400/60 bg-pink-400/20">
                  <span className="font-pixellari text-lg font-bold text-pink-200">1P</span>
                </div>
                <div>
                  <h3 className="font-pixellari text-2xl text-pink-200">
                    {modeCopy.single.title}
                  </h3>
                  <p className="text-xs uppercase tracking-[0.25em] font-pixellari text-pink-300/80">
                    MODO CLÁSICO
                  </p>
                </div>
              </div>
              <div className="flex justify-center">
                <Image
                  src="/assets/characters/1p.png"
                  alt="1P"
                  width={300}
                  height={300}
                  quality={100}
                  className={`object-contain ${isMobile ? 'w-[80px] h-[80px]' : 'w-[100px] h-[100px]'}`}
                />
              </div>
              {/* Botón de Reglas - debajo de la imagen */}
              {onRulesClick && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onRulesClick();
                  }}
                  className="focus:outline-none game-button relative mt-2 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label="Reglas"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onRulesClick();
                    }
                  }}
                >
                  <Image 
                    src="/assets/ui/buttons/caja-texto2.png"
                    alt="Reglas"
                    width={120}
                    height={50}
                    className={`game-img ${isMobile ? 'w-[100px] h-[42px]' : ''}`}
                  />
                  <span className={`absolute inset-0 flex items-center justify-center text-white font-pixellari ${isMobile ? 'text-base' : 'text-lg'}`} style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                    REGLAS
                  </span>
                </div>
              )}
            </div>
          </button>

          {/* Multiplayer Mode */}
          <div
            className={`group relative flex flex-col ${isMobile ? 'p-4' : 'p-6'} rounded-lg border border-pink-400/20 bg-slate-800/30 opacity-60 grayscale brightness-75 contrast-90 pointer-events-none select-none ${isMobile ? 'w-full max-w-[280px]' : 'w-[280px]'}`}
          >
            <div className="flex flex-col gap-4 items-center">
              <div className="flex items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-pink-400/30 bg-pink-400/10 opacity-60">
                  <span className="font-pixellari text-lg font-bold text-pink-200/60">2P</span>
                </div>
                <div>
                  <h3 className="font-pixellari text-2xl text-pink-200/60">
                    {modeCopy.multiplayer.title}
                  </h3>
                  <p className="text-xs uppercase tracking-[0.25em] font-pixellari text-pink-300/50">
                    NUEVO DESAFÍO
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-4">
                <div className="flex flex-row items-center justify-center">
                  <Image
                    src="/assets/characters/vs.png"
                    alt="VS"
                    width={600}
                    height={300}
                    quality={100}
                    className="object-contain w-[240px] h-[120px] opacity-60"
                  />
                </div>
              </div>
              {/* "Coming soon" badge - debajo de todo */}
              <div className="flex items-center justify-center gap-2 rounded-full border border-pink-400/40 bg-slate-900/90 px-4 py-1 shadow-lg shadow-pink-500/20">
                <span className="font-pixellari text-sm tracking-[0.35em] text-pink-200">
                  PRÓXIMAMENTE
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export type { GameMode };
export default ModeSelectModal;
