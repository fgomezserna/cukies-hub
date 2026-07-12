"use client";

import React from 'react';
import Image from 'next/image';
import { useIsMobile } from '../hooks/use-mobile';
import type { TreasureHuntMultiplayerEntryState } from '../lib/multiplayer-feature';

type GameMode = 'single' | 'multiplayer';

interface ModeSelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelectMode: (mode: GameMode) => void;
  defaultMode?: GameMode;
  onRulesClick?: () => void;
  multiplayerEntryState: TreasureHuntMultiplayerEntryState;
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
  multiplayerEntryState,
}) => {
  const [hoveredMode, setHoveredMode] = React.useState<GameMode | null>(null);
  const isMobile = useIsMobile();
  const multiplayerInteractive =
    multiplayerEntryState === 'ready' || multiplayerEntryState === 'hub';
  const multiplayerActionCopy =
    multiplayerEntryState === 'ready'
      ? 'JUGAR 2P'
      : multiplayerEntryState === 'hub'
        ? 'ABRIR HUB'
        : multiplayerEntryState === 'connecting'
          ? 'CONECTA WALLET'
          : 'PRÓXIMAMENTE';
  const multiplayerDescription =
    multiplayerEntryState === 'hub'
      ? 'Abre Cukies Hub y conecta la wallet para jugar.'
      : multiplayerEntryState === 'connecting'
        ? 'Conecta la wallet en Cukies Hub para activar el modo 2P.'
        : 'Prueba sin ranking ni recompensas.';

  React.useEffect(() => {
    if (!open) {
      setHoveredMode(null);
    }
  }, [open]);

  if (!open) return null;

  // Estructura diferente para móvil: pantalla completa
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[70] flex flex-col bg-black/95 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Header fijo */}
        <div className="relative flex-shrink-0 bg-slate-900/95 border-b border-pink-400/60 px-4 py-3">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-red-600/80 hover:bg-red-500 text-white font-bold text-xl transition-colors duration-200 shadow-lg hover:shadow-red-500/50 focus:outline-none z-10"
            aria-label="Cerrar selector de modo"
          >
            ×
          </button>
          <div className="text-center pr-10">
            <h2 className="text-xl font-pixellari text-pink-200 tracking-wide leading-tight">
              Selecciona modo de juego
            </h2>
          </div>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
          <div className="flex flex-wrap justify-center gap-4">
          {/* Single Player Mode */}
          <button
            onClick={() => onSelectMode('single')}
            onMouseEnter={() => setHoveredMode('single')}
            onMouseLeave={() => setHoveredMode(null)}
            className="group relative flex flex-col p-4 rounded-lg border border-pink-400/40 bg-slate-800/60 shadow-lg shadow-pink-500/10 hover:border-pink-400/80 hover:bg-slate-800/80 transition-all duration-200 focus:outline-none w-full max-w-[280px]"
          >
            <div className="flex flex-col gap-4 items-center w-full">
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
              <div className="flex justify-center w-full">
                <Image
                  src="/assets/characters/1p.png"
                  alt="1P"
                  width={300}
                  height={300}
                  quality={100}
                  className="object-contain w-[100px] h-[100px]"
                />
              </div>
              {/* Botón de Reglas - debajo de la imagen */}
              {onRulesClick && (
                <div className="flex justify-center w-full">
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
                      className="game-img"
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-lg" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                      REGLAS
                    </span>
                  </div>
                </div>
              )}
            </div>
          </button>

          {/* Multiplayer Mode */}
          <button
            type="button"
            data-testid="treasure-hunt-multiplayer-mode"
            data-multiplayer-entry={multiplayerEntryState}
            disabled={!multiplayerInteractive}
            onClick={() => multiplayerInteractive && onSelectMode('multiplayer')}
            className={`group relative flex flex-col p-4 rounded-lg border w-full max-w-[280px] transition-all duration-200 ${
              multiplayerInteractive
                ? 'border-cyan-400/60 bg-slate-800/70 hover:border-cyan-300 hover:bg-slate-800/90 focus:outline-none'
                : 'border-pink-400/20 bg-slate-800/30 opacity-60 grayscale brightness-75 contrast-90 cursor-not-allowed select-none'
            }`}
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
                  <p className="text-xs uppercase tracking-[0.2em] font-pixellari text-pink-300/70">
                    STAGING · SIN RANKING
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
                    className={`object-contain w-[240px] h-[120px] ${multiplayerInteractive ? '' : 'opacity-60'}`}
                  />
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 rounded-full border border-pink-400/40 bg-slate-900/90 px-4 py-1 shadow-lg shadow-pink-500/20">
                <span className="font-pixellari text-sm tracking-[0.35em] text-pink-200">
                  {multiplayerActionCopy}
                </span>
              </div>
              <p className="text-center text-xs font-pixellari text-cyan-100/70">
                {multiplayerDescription}
              </p>
            </div>
          </button>
          </div>
        </div>
      </div>
    );
  }

  // Estructura original para escritorio
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl rounded-xl border border-pink-400/60 bg-slate-900/90 p-6 shadow-2xl shadow-pink-500/10"
        onClick={event => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-red-600/80 hover:bg-red-500 text-white font-bold text-xl transition-colors duration-200 shadow-lg hover:shadow-red-500/50 focus:outline-none"
          aria-label="Cerrar selector de modo"
        >
          ×
        </button>
        <div className="text-center mb-6">
          <h2 className="text-3xl font-pixellari text-pink-200 tracking-wide">
            Selecciona modo de juego
          </h2>
          <p className="mt-2 text-sm font-pixellari text-pink-200/80">
            Elige cómo quieres jugar.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-6">
          {/* Single Player Mode */}
          <button
            onClick={() => onSelectMode('single')}
            onMouseEnter={() => setHoveredMode('single')}
            onMouseLeave={() => setHoveredMode(null)}
            className="group relative flex flex-col p-6 rounded-lg border border-pink-400/40 bg-slate-800/60 shadow-lg shadow-pink-500/10 hover:border-pink-400/80 hover:bg-slate-800/80 transition-all duration-200 focus:outline-none w-[280px]"
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
                  className="object-contain w-[100px] h-[100px]"
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
                    className="game-img"
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-lg" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                    REGLAS
                  </span>
                </div>
              )}
            </div>
          </button>

          {/* Multiplayer Mode */}
          <button
            type="button"
            data-testid="treasure-hunt-multiplayer-mode"
            data-multiplayer-entry={multiplayerEntryState}
            disabled={!multiplayerInteractive}
            onClick={() => multiplayerInteractive && onSelectMode('multiplayer')}
            className={`group relative flex flex-col p-6 rounded-lg border w-[280px] transition-all duration-200 ${
              multiplayerInteractive
                ? 'border-cyan-400/60 bg-slate-800/70 hover:border-cyan-300 hover:bg-slate-800/90 focus:outline-none'
                : 'border-pink-400/20 bg-slate-800/30 opacity-60 grayscale brightness-75 contrast-90 cursor-not-allowed select-none'
            }`}
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
                  <p className="text-xs uppercase tracking-[0.2em] font-pixellari text-pink-300/70">
                    STAGING · SIN RANKING
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
                    className={`object-contain w-[240px] h-[120px] ${multiplayerInteractive ? '' : 'opacity-60'}`}
                  />
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 rounded-full border border-pink-400/40 bg-slate-900/90 px-4 py-1 shadow-lg shadow-pink-500/20">
                <span className="font-pixellari text-sm tracking-[0.35em] text-pink-200">
                  {multiplayerActionCopy}
                </span>
              </div>
              <p className="text-center text-xs font-pixellari text-cyan-100/70">
                {multiplayerDescription}
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export type { GameMode };
export default ModeSelectModal;
