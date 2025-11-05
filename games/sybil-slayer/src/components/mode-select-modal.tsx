"use client";

import React from 'react';
import Image from 'next/image';

type GameMode = 'single' | 'multiplayer';

interface ModeSelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelectMode: (mode: GameMode) => void;
  defaultMode?: GameMode;
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
}) => {
  const [hoveredMode, setHoveredMode] = React.useState<GameMode | null>(null);

  React.useEffect(() => {
    if (!open) {
      setHoveredMode(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-md px-4 py-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl border border-cyan-400/60 bg-slate-900/90 p-6 shadow-[0_40px_120px_rgba(14,165,233,0.35)]"
        onClick={event => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-600/80 text-xl font-bold text-white shadow-lg hover:bg-red-500 focus:outline-none"
          aria-label="Cerrar selector de modo"
        >
          ×
        </button>
        <div className="text-center">
          <h2 className="font-pixellari text-3xl text-cyan-200 tracking-wide">
            Selecciona modo de juego
          </h2>
          <p className="mt-2 text-sm text-cyan-100/80">
            Elige cómo quieres jugar.
          </p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {/* Single Player Mode */}
          <button
            onClick={() => onSelectMode('single')}
            onMouseEnter={() => setHoveredMode('single')}
            onMouseLeave={() => setHoveredMode(null)}
            className={[
              'group relative flex flex-col rounded-xl border bg-slate-950/40 p-6 text-left shadow-lg transition-all duration-200 focus:outline-none',
              'border-cyan-500/40 hover:border-cyan-300/80 focus-visible:ring-2 focus-visible:ring-cyan-400/80',
              defaultMode === 'single' ? 'ring-1 ring-cyan-500/60' : '',
            ].join(' ')}
          >
            <div
              className={[
                'absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400/10 via-transparent to-transparent opacity-0 transition-opacity duration-200',
                hoveredMode === 'single' ? 'opacity-100' : '',
              ].join(' ')}
            />
            <div className="relative flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={[
                    'flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/40 bg-slate-900/70 font-pixellari text-lg text-cyan-200 shadow-inner transition-transform duration-200',
                    hoveredMode === 'single' ? 'scale-105' : '',
                  ].join(' ')}
                >
                  1P
                </div>
                <div>
                  <h3 className="font-pixellari text-2xl text-cyan-100">
                    {modeCopy.single.title}
                  </h3>
                  <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/60">
                    MODO CLÁSICO
                  </p>
                </div>
              </div>
              <div className="flex justify-center">
                <Image
                  src="/assets/characters/1p.png"
                  alt="1P"
                  width={200}
                  height={200}
                  className="object-contain"
                />
              </div>
            </div>
          </button>

          {/* Multiplayer Mode */}
          <div
            className={[
              'group relative flex flex-col rounded-xl border bg-slate-950/40 p-6 text-left shadow-lg transition-all duration-200',
              'border-cyan-500/40 opacity-75',
            ].join(' ')}
          >
            <div className="relative flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/40 bg-slate-900/70 font-pixellari text-lg text-cyan-200 shadow-inner">
                  2P
                </div>
                <div>
                  <h3 className="font-pixellari text-2xl text-cyan-100">
                    {modeCopy.multiplayer.title}
                  </h3>
                  <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/60">
                    NUEVO DESAFÍO
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-4">
                <p className="font-pixellari text-xl text-cyan-200">
                  PROXIMAMENTE
                </p>
                <div className="flex flex-row gap-4">
                  <Image
                    src="/assets/characters/1p.png"
                    alt="1P"
                    width={100}
                    height={100}
                    className="object-contain"
                  />
                  <Image
                    src="/assets/characters/2p.png"
                    alt="2P"
                    width={100}
                    height={100}
                    className="object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-cyan-200/60">
          <span>Tip:</span>
          <span className="rounded-full border border-cyan-500/40 bg-slate-900/60 px-3 py-1 font-pixellari text-cyan-200">
            Puedes invitar a un amigo con el modo Multiplayer
          </span>
        </div>
      </div>
    </div>
  );
};

export type { GameMode };
export default ModeSelectModal;

