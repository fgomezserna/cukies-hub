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

  // Estilo de texto blanco con borde negro como en HUD (score/nivel)
  const outlinedTextStyle: React.CSSProperties = React.useMemo(
    () => ({
      WebkitTextStroke: '1px #000000',
      textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)'
    }),
    []
  );

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
        className="relative w-full max-w-3xl"
        onClick={event => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 z-[20] flex h-10 w-10 items-center justify-center rounded-full bg-red-600/80 text-xl font-bold text-white shadow-lg hover:bg-red-500 focus:outline-none"
          aria-label="Cerrar selector de modo"
        >
          ×
        </button>
        <Image
          src="/assets/ui/game-container/tableromodojuego.png"
          alt="Selector de modo de juego"
          width={1080}
          height={720}
          className="h-auto w-full select-none"
          priority
        />
        {/* Overlay content on top of the board image */}
        <div className="absolute inset-0 z-[10] flex flex-col justify-center p-6">
          <div className="text-center">
            <h2 className="font-pixellari text-3xl text-white tracking-wide" style={outlinedTextStyle}>
              Selecciona modo de juego
            </h2>
            <p className="mt-2 text-sm text-white/90" style={outlinedTextStyle}>
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
                'group relative flex flex-col p-6 text-left transition-all duration-200 focus:outline-none',
                defaultMode === 'single' ? 'scale-[1.01]' : '',
              ].join(' ')}
            >
              {/* Background board image */}
              <div className="absolute inset-0 -z-0 pointer-events-none transform origin-center">
                <Image
                  src="/assets/ui/buttons/cartel2.png"
                  alt="Card background"
                  fill
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </div>
              <div className="relative z-[1] flex flex-col gap-4 pt-8 md:pt-10">
                <div className="flex w-full items-center justify-center gap-3 text-center">
                  <div className={[hoveredMode === 'single' ? 'scale-105' : '', 'relative h-12 w-12 transition-transform duration-200'].join(' ')}>
                    <Image
                      src="/assets/ui/buttons/I_ButtonRounded.png"
                      alt="1P"
                      fill
                      className="object-contain"
                      sizes="48px"
                    />
                    <span className="absolute inset-0 flex items-center justify-center font-pixellari text-lg text-white" style={outlinedTextStyle}>1P</span>
                  </div>
                  <div>
                    <h3 className="font-pixellari text-2xl text-white" style={outlinedTextStyle}>
                      {modeCopy.single.title}
                    </h3>
                    <p className="text-xs uppercase tracking-[0.25em] text-white/80" style={outlinedTextStyle}>
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
                    className="object-contain w-[100px] h-[100px]"
                  />
                </div>
              </div>
            </button>

            {/* Multiplayer Mode */}
            <div
              className={[
                'group relative flex flex-col p-6 text-left transition-all duration-200',
                'opacity-90',
              ].join(' ')}
            >
              {/* Background board image */}
              <div className="absolute inset-0 -z-0 pointer-events-none transform origin-center">
                <Image
                  src="/assets/ui/buttons/cartel2.png"
                  alt="Card background"
                  fill
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </div>
              <div className="relative z-[1] flex flex-col gap-4 pt-8 md:pt-10">
                <div className="flex w-full items-center justify-center gap-3 text-center">
                  <div className="relative h-12 w-12">
                    <Image
                      src="/assets/ui/buttons/I_ButtonRounded.png"
                      alt="2P"
                      fill
                      className="object-contain"
                      sizes="48px"
                    />
                    <span className="absolute inset-0 flex items-center justify-center font-pixellari text-lg text-white" style={outlinedTextStyle}>2P</span>
                  </div>
                  <div>
                    <h3 className="font-pixellari text-2xl text-white" style={outlinedTextStyle}>
                      {modeCopy.multiplayer.title}
                    </h3>
                    <p className="text-xs uppercase tracking-[0.25em] text-white/80" style={outlinedTextStyle}>
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
                      className="object-contain w-[240px] h-[120px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3 text-xs text-white/80" style={outlinedTextStyle}>
            <span>Tip:</span>
            <span className="rounded-full border border-cyan-500/40 bg-slate-900/60 px-3 py-1 font-pixellari text-white" style={outlinedTextStyle}>
              Puedes invitar a un amigo con el modo Multiplayer
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export type { GameMode };
export default ModeSelectModal;

