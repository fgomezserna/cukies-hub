"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { usePusherConnection } from '../hooks/usePusherConnection';
import GameCanvas from './game-canvas';
import InfoModal from './info-modal';
import ModeSelectModal, { GameMode } from './mode-select-modal';
import { useGameState } from '../hooks/useGameState';
import { useGameInput } from '../hooks/useGameInput';
import { useGameLoop } from '../hooks/useGameLoop';
import { useAudio } from '../hooks/useAudio';
import useMultiplayerMatch from '../hooks/useMultiplayerMatch';
import { useIsMobile } from '../hooks/use-mobile';
import { useOrientation } from '../hooks/use-orientation';
import TouchZones from './touch-zones';
import OrientationOverlay from './orientation-overlay';
import { Button } from "./ui/button";
import { Github, Play, Pause, RotateCcw } from 'lucide-react';
import { FPS, BASE_GAME_WIDTH, BASE_GAME_HEIGHT, RUNE_CONFIG } from '../lib/constants';
import { assetLoader } from '../lib/assetLoader';
import { spriteManager } from '../lib/spriteManager';
import { performanceMonitor } from '../lib/performanceMonitor';
import type { Collectible, RuneState, LevelStatsEntry, GameState, RuneType } from '@/types/game';


const getLevelScoreMultiplier = (level: number): number => {
  // Multiplicador basado en el nivel: nivel 2 = x2, nivel 3 = x3, nivel 4 = x4, nivel 5 = x5
  if (level >= 2) return level;
  return 1; // Nivel 1 = x1
};

const RuneTotemPanel: React.FC<{
  runeState: RuneState;
  level: number;
  collectibles: Collectible[];
}> = ({ runeState, level, collectibles }) => {
  const collectedCount = runeState.slots.filter(slot => slot.collected).length;
  const levelMultiplier = getLevelScoreMultiplier(level);
  const hasRuneOnField = collectibles.some(item => item.type === 'rune');

  if (!runeState.active && level >= 5) {
    return (
      <div className="rune-totem rune-totem--inactive">
        <h3 className="rune-totem__title">Nivel {level}</h3>
        <p className="rune-totem__text">Tótem desactivado</p>
        <p className="rune-totem__text">Multiplicador x{levelMultiplier}</p>
      </div>
    );
  }

  return (
    <div className="rune-totem">
      <div className="rune-totem__header">
        <span>Tótem de runas</span>
        <span className="rune-totem__multiplier">x{levelMultiplier}</span>
      </div>
      <div className="rune-totem__slots">
        {runeState.slots.map(slot => {
          const config = RUNE_CONFIG[slot.type];
          const label = config?.label ?? slot.type;
          const color = config?.color ?? '#9fa8da';
          return (
            <div
              key={slot.type}
              className={`rune-slot${slot.collected ? ' rune-slot--active' : ''}`}
              style={{ borderColor: color }}
            >
              <div
                className="rune-slot__icon"
                style={{
                  backgroundColor: slot.collected ? color : 'transparent',
                  color: slot.collected ? '#0f172a' : color,
                }}
              >
                {label.charAt(0)}
              </div>
              <span className="rune-slot__label">{label}</span>
            </div>
          );
        })}
      </div>
      <div className="rune-totem__footer">
        <span>{collectedCount}/5 runas colocadas</span>
        <span>Runas recogidas: {runeState.runePickupCount}</span>
        <span>{hasRuneOnField ? '¡Runa disponible en el mapa!' : 'Una runa aparece cada 20s'}</span>
      </div>
    </div>
  );
};

const RUNE_TOTEM_ORDER: RuneType[] = ['miner', 'engineer', 'farmer', 'gatherer', 'chef'];

const RUNE_TOTEM_OVERLAY_IMAGES: Record<RuneType, string> = {
  miner: '/assets/totem/miner_totem.png',
  engineer: '/assets/totem/engineer_totem.png',
  farmer: '/assets/totem/farmer_totem.png',
  gatherer: '/assets/totem/gatherer_totem.png',
  chef: '/assets/totem/chef_totem.png',
};

const RuneTotemSidebar: React.FC<{ runeState: RuneState; height: number }> = ({ runeState, height }) => {
  const collectedTypes = new Set<RuneType>();

  if (runeState.active) {
    runeState.slots.forEach(slot => {
      if (slot.collected) {
        collectedTypes.add(slot.type);
      }
    });
  }

  return (
    <div className="rune-totem-sidebar" style={{ height: `${height}px` }}>
      <img
        src="/assets/totem/totemlateral.png"
        alt="Tótem lateral"
        className="rune-totem-sidebar__image"
        loading="lazy"
      />
      {RUNE_TOTEM_ORDER.map(type =>
        collectedTypes.has(type) ? (
          <img
            key={type}
            src={RUNE_TOTEM_OVERLAY_IMAGES[type]}
            alt={`Runa ${type}`}
            className="rune-totem-sidebar__overlay"
            loading="lazy"
          />
        ) : null
      )}
    </div>
  );
};

const numberFormatter = new Intl.NumberFormat('es-ES');

const formatDuration = (ms?: number | null): string => {
  if (!ms || ms <= 0) {
    return '0:00';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const LevelStatsOverlay: React.FC<{ stats: LevelStatsEntry[]; onClose: () => void }> = ({ stats, onClose }) => {
  const sortedStats = [...stats].sort((a, b) => a.level - b.level);
  const hasStats = sortedStats.length > 0;
  const isMobile = useIsMobile();
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);

  useEffect(() => {
    setCurrentLevelIndex(0);
  }, [stats, isMobile]);

  const buildRows = (entry: LevelStatsEntry) => [
    {
      key: 'gems',
      label: 'Gemas',
      count: entry.counts.gems,
      points: entry.points.gems,
    },
    {
      key: 'gemsX5',
      label: 'Gemas x5',
      count: entry.counts.gemsX5,
      points: entry.points.gemsX5,
    },
    {
      key: 'ukis',
      label: 'Monedas',
      count: entry.counts.ukis,
      points: entry.points.ukis,
    },
    {
      key: 'ukisX5',
      label: 'Monedas x5',
      count: entry.counts.ukisX5,
      points: entry.points.ukisX5,
    },
    {
      key: 'treasures',
      label: 'Tesoros',
      count: entry.counts.treasures,
      points: entry.points.treasures,
    },
    {
      key: 'hearts',
      label: 'Corazones',
      count: entry.counts.hearts,
      points: entry.points.hearts,
    },
    {
      key: 'runes',
      label: 'Runas',
      count: entry.counts.runes,
      points: entry.points.runes,
    },
    {
      key: 'levelCompletionBonus',
      label: 'Bonificación nivel',
      count: entry.counts.levelCompletionBonus,
      points: entry.points.levelCompletionBonus,
    },
  ];

  const handlePrevLevel = () => {
    setCurrentLevelIndex(prev =>
      prev === 0 ? Math.max(sortedStats.length - 1, 0) : prev - 1
    );
  };

  const handleNextLevel = () => {
    setCurrentLevelIndex(prev =>
      prev === sortedStats.length - 1 ? 0 : prev + 1
    );
  };

  if (isMobile) {
    if (!hasStats) {
      return (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm px-4 py-6"
          onClick={onClose}
        >
          <div
            className="relative w-full max-w-md rounded-xl border border-pink-400/60 bg-slate-900/90 p-6 shadow-2xl shadow-pink-500/15"
            onClick={event => event.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-red-600/80 hover:bg-red-500 text-white font-bold text-xl transition-colors duration-200 shadow-lg hover:shadow-red-500/50"
              aria-label="Cerrar"
            >
              ×
            </button>
            <p className="text-center font-pixellari text-pink-200">
              No se registraron estadísticas en esta partida.
            </p>
          </div>
        </div>
      );
    }

    const safeIndex = Math.min(currentLevelIndex, Math.max(sortedStats.length - 1, 0));
    const currentEntry = sortedStats[safeIndex];
    const rows = buildRows(currentEntry);
    const totalPoints = rows.reduce((sum, row) => sum + Math.round(row.points || 0), 0);
    const showNavigation = sortedStats.length > 1;

    return (
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-red-600/80 hover:bg-red-500 text-white font-bold text-xl transition-colors duration-200 shadow-lg hover:shadow-red-500/50 z-30"
          aria-label="Cerrar"
        >
          ×
        </button>

        <div
          className="relative flex-1 w-full px-4 py-6 overflow-y-auto"
          onClick={event => event.stopPropagation()}
        >
          {showNavigation && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrevLevel();
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex-shrink-0 focus:outline-none transition-all duration-200 active:scale-95"
              aria-label="Nivel anterior"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-pink-400/60 bg-pink-500/20 shadow-lg shadow-pink-500/30 hover:border-pink-400 hover:bg-pink-500/30 hover:shadow-pink-500/50">
                <svg
                  className="h-6 w-6 text-pink-200"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </div>
            </button>
          )}

          {showNavigation && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNextLevel();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex-shrink-0 focus:outline-none transition-all duration-200 active:scale-95"
              aria-label="Nivel siguiente"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-pink-400/60 bg-pink-500/20 shadow-lg shadow-pink-500/30 hover:border-pink-400 hover:bg-pink-500/30 hover:shadow-pink-500/50">
                <svg
                  className="h-6 w-6 text-pink-200"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </button>
          )}

          <div className="mx-auto w-full max-w-md rounded-xl border border-pink-400/60 bg-slate-900/90 p-4 shadow-2xl shadow-pink-500/15">
            <div className="mb-3 relative flex items-center justify-between gap-3">
              <span className="rounded-full border border-pink-300/60 bg-pink-300/15 px-3 py-1 text-[11px] tracking-[0.25em] font-pixellari text-pink-100">
                Estadísticas
              </span>
              <span className="absolute left-1/2 -translate-x-1/2 text-sm font-pixellari text-pink-100 uppercase">NIVEL {currentEntry.level}</span>
            </div>

            <div className="pr-1">
              <table className="w-full table-fixed text-sm font-pixellari text-pink-100 leading-tight">
                <thead className="text-[11px] uppercase tracking-wide text-pink-300">
                  <tr>
                    <th className="w-[45%] px-1 py-1 text-left">Elemento</th>
                    <th className="w-[25%] px-1 py-1 text-right">Recogidos</th>
                    <th className="w-[30%] px-1 py-1 text-right">Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.key} className="odd:bg-slate-900/40">
                      <td className="px-1 py-1 pr-0">{row.label}</td>
                      <td className="px-1 py-1 text-right">
                        {numberFormatter.format(row.count)}
                      </td>
                      <td className="px-1 py-1 text-right text-amber-200">
                        {numberFormatter.format(Math.round(row.points || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-pink-400/40 text-pink-200">
                    <td className="px-1 pt-2 text-sm font-semibold">Total</td>
                    <td className="px-1 pt-2" />
                    <td className="px-1 pt-2 text-right text-amber-300 font-semibold">
                      {numberFormatter.format(totalPoints)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] font-pixellari text-pink-200 uppercase tracking-wide">
              <span>Tiempo</span>
              <span className="text-pink-100">{formatDuration(currentEntry.durationMs)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6">
      <div className="w-full max-w-5xl rounded-xl border border-pink-400/60 bg-slate-900/90 p-6 shadow-2xl shadow-pink-500/10 relative">
        {/* Botón de cierre */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-red-600/80 hover:bg-red-500 text-white font-bold text-xl transition-colors duration-200 shadow-lg hover:shadow-red-500/50"
          aria-label="Cerrar"
        >
          ×
        </button>
        <h2 className="mb-4 text-center text-3xl font-pixellari text-pink-200 tracking-wide">
          Estadísticas por nivel
        </h2>
        {hasStats ? (
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2">
              {sortedStats.map(entry => {
                const rows = buildRows(entry);
                const totalPoints = rows.reduce((sum, row) => sum + Math.round(row.points || 0), 0);

                return (
                  <div
                    key={entry.level}
                    className="rounded-lg border border-pink-400/40 bg-slate-800/60 p-4 shadow-lg shadow-pink-500/10"
                  >
                    <h3 className="mb-3 text-center text-xl font-pixellari text-pink-100">
                      Nivel {entry.level}
                    </h3>
                    <table className="w-full text-sm font-pixellari text-pink-100">
                      <thead className="text-xs uppercase tracking-wide text-pink-300">
                        <tr>
                          <th className="px-2 py-1 text-left">Elemento</th>
                          <th className="px-2 py-1 text-right">Recogidos</th>
                          <th className="px-2 py-1 text-right">Puntos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(row => (
                          <tr key={row.key} className="odd:bg-slate-900/40">
                            <td className="px-2 py-1">{row.label}</td>
                            <td className="px-2 py-1 text-right">
                              {numberFormatter.format(row.count)}
                            </td>
                            <td className="px-2 py-1 text-right text-amber-200">
                              {numberFormatter.format(Math.round(row.points || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-pink-400/40 text-pink-200">
                          <td className="px-2 pt-2 text-sm font-semibold">Total</td>
                          <td className="px-2 pt-2" />
                          <td className="px-2 pt-2 text-right text-amber-300 font-semibold">
                            {numberFormatter.format(totalPoints)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    <div className="mt-3 flex items-center justify-between text-xs font-pixellari text-pink-200 uppercase tracking-wide">
                      <span>Tiempo:</span>
                      <span className="text-pink-200">{formatDuration(entry.durationMs)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-center font-pixellari text-pink-200">
            No se registraron estadísticas en esta partida.
          </p>
        )}
      </div>
    </div>
  );
};


interface GameContainerProps {
  width?: number;
  height?: number;
}

const GameContainer: React.FC<GameContainerProps> = ({ width, height }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const parentContainerRef = useRef<HTMLDivElement | null>(null);
  const [matchRoomId, setMatchRoomId] = useState<string | null>(null);
  const { 
    isConnected,
    connectionState,
    sessionData, 
    sendCheckpoint, 
    sendGameEnd, 
    startCheckpointInterval,
    channel,
    matchChannel,
  } = usePusherConnection({ matchRoomId });
  const multiplayer = useMultiplayerMatch({
    channel: matchChannel ?? channel,
    sessionData,
    isConnected,
    targetDifference: 500,
  });
  const [canvasSize, setCanvasSize] = useState({ width: width || 800, height: height || 600 });
  // Estado para alineación horizontal con el canvas
  const [canvasHorizontalOffset, setCanvasHorizontalOffset] = useState(0);
  // Estado para notificar recogida de energía
  const [energyCollectedFlag, setEnergyCollectedFlag] = useState(0);
  // Estado para notificar daño
  const [damageFlag, setDamageFlag] = useState(0);
  
  // Estado para rastrear la energía recolectada por el hacker
  const [hackerEnergyCollected, setHackerEnergyCollected] = useState(0);
  const [hackerActive, setHackerActive] = useState(false);
  
  // Estado para controlar el modal de información
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const infoButtonClickedRef = useRef(false);
  
  // Estado para controlar el popup de estadísticas por nivel
  const [isLevelStatsVisible, setIsLevelStatsVisible] = useState(false);
  
  // Estado para controlar la animación de jeff_goit
  const [jeffGoitAnimation, setJeffGoitAnimation] = useState<{
    active: boolean;
    start: number;
    phase: 'entering' | 'visible' | 'exiting';
  } | null>(null);
  
  // Estado para controlar la animación de whalechadmode
  const [whaleChadAnimation, setWhaleChadAnimation] = useState<{
    active: boolean;
    start: number;
    phase: 'entering' | 'visible' | 'exiting';
  } | null>(null);
  
  // Estado para controlar la animación de meow (purr effect)
  const [meowAnimation, setMeowAnimation] = useState<{
    active: boolean;
    start: number;
    phase: 'entering' | 'visible' | 'exiting';
    immunityDuration: number; // Duración total de la inmunidad
  } | null>(null);
  
  
  // Estado para controlar la animación de giga vault (vaul effect)
  const [gigaVaultAnimation, setGigaVaultAnimation] = useState<{
    active: boolean;
    start: number;
    phase: 'entering' | 'visible' | 'exiting';
  } | null>(null);
  
  // Estado para controlar la animación del hacker (cuando toca al token)
  const [hackerAnimation, setHackerAnimation] = useState<{
    active: boolean;
    start: number;
    phase: 'entering' | 'visible' | 'exiting';
  } | null>(null);
  
  // Ref para la imagen de jeff_goit
  const jeffGoitImgRef = useRef<HTMLImageElement | null>(null);
  
  // Ref para la imagen de whalechadmode
  const whaleChadImgRef = useRef<HTMLImageElement | null>(null);
  
  // Ref para la imagen de meow
  const meowImgRef = useRef<HTMLImageElement | null>(null);
  
  
  // Ref para la imagen de giga vault
  const gigaVaultImgRef = useRef<HTMLImageElement | null>(null);
  
  // Ref para la imagen del hacker (trump)
  const hackerTrumpImgRef = useRef<HTMLImageElement | null>(null);
  
  // Ref para rastrear si se recolectó un checkpoint
  const lastGlowTimerRef = useRef<number>(0);
  
  // Ref para rastrear si apareció un checkpoint en pantalla
  const checkpointOnFieldRef = useRef<boolean>(false);
  
  // Ref para rastrear si se recolectó un Haku (antes mega node)
  const lastBoostTimerRef = useRef<number>(0);
  
  // Ref para rastrear si se recolectó purr
  const purrCollectionCountRef = useRef<number>(0);
  
  // Ref para rastrear el nivel actual y detectar cambios
  const lastLevelRef = useRef<number>(1);
  
  
  // Ref para rastrear cuando se recoge un vaul
  const lastVaulCollectionTimeRef = useRef<number>(0);
  
  // Ref para rastrear el último daño por hacker
  const lastHackerDamageTimeRef = useRef<number>(0);
  
  // Initialize audio system
  const { playSound, playMusic, stopMusic, setVolume, toggleMusic, isMusicEnabled, playGameOverSound, toggleSounds, isSoundsEnabled } = useAudio();
  
  // Estado para controlar el botón de música
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [soundsEnabled, setSoundsEnabled] = useState(true); // NUEVO: Estado para sonidos de efectos
  const [modeSelectOpen, setModeSelectOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<GameMode>('single');
  const isMultiplayerMode = currentMode === 'multiplayer';
  const lastPublishedSnapshotRef = useRef<{
    score: number;
    hearts: number;
    status: 'waiting' | 'ready' | 'playing' | 'eliminated' | 'finished';
    gameStatus: GameState['status'];
    gameOverReason?: GameState['gameOverReason'];
  } | null>(null);

  const resolveLifecycleStatus = useCallback((state: GameState): 'waiting' | 'ready' | 'playing' | 'eliminated' | 'finished' => {
    switch (state.status) {
      case 'idle':
        return 'waiting';
      case 'countdown':
        return 'ready';
      case 'playing':
      case 'paused':
        return 'playing';
      case 'gameOver':
        return state.hearts > 0 ? 'finished' : 'eliminated';
      default:
        return 'waiting';
    }
  }, []);

  // Generar ID único para la sala de partida
  const generateMatchRoomId = useCallback(() => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `room-${timestamp}-${random}`;
  }, []);
  
  // Sincronizar estado inicial con el hook de audio
  useEffect(() => {
    setMusicEnabled(isMusicEnabled());
    setSoundsEnabled(isSoundsEnabled()); // NUEVO: Sincronizar sonidos también
  }, [isMusicEnabled, isSoundsEnabled]);
  
  // Estado para loading de assets optimizado
  const [criticalAssetsLoaded, setCriticalAssetsLoaded] = useState(false);
  const [allAssetsLoaded, setAllAssetsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingPhase, setLoadingPhase] = useState<'preload' | 'full'>('preload');

  // Carga progresiva y optimizada de assets con monitoreo de rendimiento
  useEffect(() => {
    const loadAssets = async () => {
      try {
        // Inicializar monitoreo de rendimiento
        performanceMonitor.startTimer('totalAssets');
        performanceMonitor.startTimer('criticalAssets');
        performanceMonitor.startTimer('sprites');
        
        console.log('🚀 Iniciando carga optimizada de assets...');
        setLoadingPhase('preload');
        
        // Cargar assets críticos en paralelo
        const [, ] = await Promise.all([
          assetLoader.preloadCritical((progress) => {
            setLoadingProgress(progress * 0.6); // 60% para assets críticos
          }),
          spriteManager.loadGameSprites().then(() => {
            performanceMonitor.endTimer('sprites');
            setLoadingProgress(prev => prev + 0.3); // 30% para sprites
          })
        ]);
        
        performanceMonitor.endTimer('criticalAssets');
        console.log('✅ Assets críticos y sprites cargados - juego puede iniciar');
        setCriticalAssetsLoaded(true);
        
        // Fase 2: Cargar assets restantes en background
        setTimeout(async () => {
          console.log('⏳ Cargando assets decorativos en background...');
          setLoadingPhase('full');
          
          await assetLoader.loadRemaining((progress, phase) => {
            setLoadingProgress(0.9 + (progress * 0.1)); // 10% restante
            setLoadingPhase(phase);
          });
          
          performanceMonitor.endTimer('totalAssets');
          console.log('🎉 Todos los assets cargados');
          setAllAssetsLoaded(true);
          
          // Mostrar reporte de rendimiento en desarrollo
          if (process.env.NODE_ENV === 'development') {
            setTimeout(() => {
              performanceMonitor.printReport();
            }, 1000);
          }
        }, 300); // Delay reducido para mejor UX
        
      } catch (error) {
        console.error('❌ Error cargando assets:', error);
        performanceMonitor.recordAssetFailed();
        // Aún así permitir que el juego inicie con assets básicos
        setCriticalAssetsLoaded(true);
      }
    };
    
    loadAssets();
  }, []);
  
  // Estilos CSS para las animaciones
  const animationStyles = `
    @keyframes pulse {
      0% {
        transform: scale(1);
        filter: brightness(1) drop-shadow(0 0 10px rgba(138, 43, 226, 0.5));
      }
      50% {
        transform: scale(1.12);
        filter: brightness(1.3) drop-shadow(0 0 20px rgba(138, 43, 226, 0.8));
      }
      100% {
        transform: scale(1.05);
        filter: brightness(1.15) drop-shadow(0 0 15px rgba(138, 43, 226, 0.7));
      }
    }
  `;

  // Callback para explosion
  const handleEnergyCollected = useCallback(() => {
    setEnergyCollectedFlag(flag => flag + 1);
    // Sonido se reproduce directamente en useGameState.ts según el tipo de coleccionable
  }, []);

  // Callback para daño
  const handleDamage = useCallback(() => {
    setDamageFlag(flag => flag + 1);
    playSound('collision_damage');
  }, [playSound]);

  // Initialize gameState AFTER determining canvas size
  // Callback para cuando el hacker escapa después de recoger 5 energy
  const handleHackerEscape = useCallback(() => {
    console.log("¡Hacker escapó después de recoger 5 energy! Activando animación lateral");
    
    // Activar la animación del hacker (misma que cuando toca al token)
    setHackerAnimation({
      active: true,
      start: Date.now(),
      phase: 'entering'
    });
  }, []);

  useEffect(() => {
    if (width && height && (canvasSize.width !== width || canvasSize.height !== height)) {
      setCanvasSize({ width, height });
    }
  }, [width, height, canvasSize.width, canvasSize.height]);

  const {
    pauseToggled,
    startToggled,
    setTouchDirection,
    clearTouchDirection,
    subscribeToDirection,
  } = useGameInput();
  const isMobile = useIsMobile();
  const isPortrait = useOrientation();
  
  // Ref para rastrear si pausamos automáticamente por orientación
  const pausedByOrientationRef = useRef<boolean>(false);
  
  // Debug: Log mobile detection
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[GameContainer] isMobile:', isMobile, {
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      });
    }
  }, [isMobile]);

  // Prevenir scroll vertical en móvil
  useEffect(() => {
    if (!isMobile) return;

    // Guardar posición de scroll actual antes de aplicar position: fixed
    let scrollY = window.scrollY;

    // Prevenir scroll vertical con CSS
    const originalHtmlOverflow = document.documentElement.style.overflowY;
    const originalBodyOverflow = document.body.style.overflowY;
    const originalBodyPosition = document.body.style.position;
    const originalBodyTop = document.body.style.top;
    const originalBodyWidth = document.body.style.width;
    const originalBodyHeight = document.body.style.height;

    // Aplicar estilos para prevenir scroll
    document.documentElement.style.overflowY = 'hidden';
    document.body.style.overflowY = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    // Prevenir scroll vertical con event listeners
    const preventVerticalScroll = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      
      // Permitir scroll en elementos específicos que lo necesitan (modales, contenido scrolleable)
      const isModal = target.closest('[role="dialog"], [class*="z-[60"], [class*="z-[70"]');
      const isScrollableContent = target.closest('[class*="overflow-y-auto"], [class*="overflow-y-scroll"], [class*="max-h-\\["]');
      
      // Solo prevenir scroll en el body principal, no en modales o contenido scrolleable
      if (!isModal && !isScrollableContent) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventVerticalScroll, { passive: false });

    return () => {
      // Restaurar estilos originales y posición de scroll
      document.documentElement.style.overflowY = originalHtmlOverflow;
      document.body.style.overflowY = originalBodyOverflow;
      document.body.style.position = originalBodyPosition;
      document.body.style.top = originalBodyTop;
      document.body.style.width = originalBodyWidth;
      document.body.style.height = originalBodyHeight;
      
      // Restaurar posición de scroll
      if (originalBodyTop) {
        window.scrollTo(0, scrollY);
      }
      
      document.removeEventListener('touchmove', preventVerticalScroll);
    };
  }, [isMobile]);
  
  const { gameState, updateGame, updateInputRef, startGame, togglePause, resetGame, forceGameOver } = useGameState(canvasSize.width, canvasSize.height, handleEnergyCollected, handleDamage, playSound, handleHackerEscape);

  // Pausar automáticamente cuando el dispositivo se gira a vertical (portrait)
  useEffect(() => {
    // Solo aplicar en móviles
    if (!isMobile) return;

    // Si está en portrait y el juego está jugando, pausar automáticamente
    if (isPortrait && gameState.status === 'playing') {
      console.log('[GameContainer] Dispositivo en vertical, pausando juego automáticamente');
      pausedByOrientationRef.current = true;
      togglePause();
    }
    
    // Cuando vuelve a landscape, NO reanudar automáticamente
    // El usuario debe presionar Play manualmente
    if (!isPortrait && pausedByOrientationRef.current && gameState.status === 'paused') {
      // Resetear el flag cuando vuelve a landscape
      // El juego permanecerá pausado hasta que el usuario presione Play
      pausedByOrientationRef.current = false;
    }
  }, [isPortrait, gameState.status, isMobile, togglePause]);

  // Resetear el flag cuando el usuario presiona Play manualmente
  useEffect(() => {
    if (gameState.status === 'playing' && pausedByOrientationRef.current) {
      // El usuario presionó Play, resetear el flag
      pausedByOrientationRef.current = false;
    }
  }, [gameState.status]);
  const localScore = Math.floor(gameState.score);
  const opponentScore = Math.floor(multiplayer.opponent?.score ?? 0);
  const scoreDifference = isMultiplayerMode ? multiplayer.scoreDifference : 0;
  const advantageTarget = multiplayer.targetDifference;
  const advantageProgress = isMultiplayerMode
    ? Math.min(Math.max((scoreDifference + advantageTarget) / (advantageTarget * 2), 0), 1)
    : 0.5;
  const advantageLeader = scoreDifference === 0 ? null : scoreDifference > 0 ? 'local' : 'opponent';
  const matchStatus = multiplayer.status;
  
  // Debug multiplayer status changes
  useEffect(() => {
    console.log('🎮 [MULTIPLAYER] Status changed:', {
      status: matchStatus,
      isMultiplayerMode,
      hasOpponent: multiplayer.hasOpponent,
      isHost: multiplayer.isHost,
      isConnected,
      hasChannel: !!channel
    });
  }, [matchStatus, isMultiplayerMode, multiplayer.hasOpponent, multiplayer.isHost, isConnected, channel]);

  const showWaitingOverlay = isMultiplayerMode && ['searching', 'waiting', 'configuring'].includes(matchStatus) && !multiplayer.matchConfig;
  const now = Date.now();
  const countdownMs = multiplayer.matchConfig ? multiplayer.matchConfig.startAt - now : null;
  const countdownSeconds = countdownMs !== null ? Math.max(0, Math.ceil(countdownMs / 1000)) : null;
  const showCountdownOverlay = isMultiplayerMode && matchStatus === 'countdown' && gameState.status === 'idle';
  const showSuddenDeathBanner = isMultiplayerMode && matchStatus === 'sudden_death';
  const opponentHearts = multiplayer.opponent?.hearts ?? 0;
  const opponentColor = 'rgba(244, 63, 94, 0.65)';
  const localColor = 'rgba(16, 185, 129, 0.75)';
  const advantageGradient = `linear-gradient(90deg, ${opponentColor} 0%, ${opponentColor} ${advantageProgress * 100}%, ${localColor} ${advantageProgress * 100}%, ${localColor} 100%)`;
  const localSessionId = sessionData?.sessionId ?? 'local';
  const matchResult = multiplayer.matchResult;
  const localIsWinner = matchResult ? matchResult.winnerId === localSessionId : null;
  const opponentId = multiplayer.opponentId;
  const localFinalScore = matchResult?.finalScores?.[localSessionId] ?? localScore;
  const opponentFinalScore = opponentId ? (matchResult?.finalScores?.[opponentId] ?? opponentScore) : opponentScore;
  const advantageBar = isMultiplayerMode && multiplayer.opponent ? (
    <div className="w-full mt-3 space-y-2 lg:pr-[300px] xl:pr-[360px]" style={{ width: BASE_GAME_WIDTH }}>
      <div className="flex justify-between text-xs font-pixellari uppercase tracking-wide text-cyan-100/80">
        <span>Tu score: {localScore}</span>
        <span>Objetivo: {advantageTarget}</span>
        <span>Rival: {opponentScore}</span>
      </div>
      <div className="relative h-4 rounded-full border border-cyan-500/60 bg-slate-900/80 shadow-inner shadow-cyan-500/20 overflow-hidden">
        <div className="absolute inset-0 transition-all duration-500" style={{ background: advantageGradient }} />
        <div className="absolute inset-y-0 left-1/2 w-[1px] bg-cyan-200/60" />
        <div className="absolute inset-0 flex items-center justify-between px-3 text-[11px] font-pixellari uppercase tracking-wide">
          <span className="text-emerald-200">{scoreDifference >= 0 ? `+${scoreDifference}` : scoreDifference} pts</span>
          <span className="text-rose-200">{scoreDifference <= 0 ? `+${Math.abs(scoreDifference)}` : `-${scoreDifference}`} pts</span>
        </div>
      </div>
      {showSuddenDeathBanner ? (
        <div className="rounded-md border border-amber-400/70 bg-amber-500/10 px-3 py-1 text-xs font-pixellari uppercase tracking-wide text-amber-200">
          Sudden Death · El rival debe superar {multiplayer.suddenDeath?.targetScore ?? localScore} pts
        </div>
      ) : (
        <div className="flex justify-between text-[11px] font-pixellari uppercase tracking-wide text-cyan-100/70">
          <span>Ventaja actual: {scoreDifference >= 0 ? `+${scoreDifference}` : scoreDifference}</span>
          <span>Hearts rival: {opponentHearts}</span>
        </div>
      )}
    </div>
  ) : null;

  const vaultEffectBadgesElement = useMemo(() => {
    const badges: Array<{ key: string; text: string; color: string }> = [];
    const multiplierTime = Math.max(0, Math.ceil(gameState.multiplierTimeRemaining ?? 0));
    if (gameState.scoreMultiplier > 1 && multiplierTime > 0) {
      const isMaxMultiplier = gameState.scoreMultiplier === 5;
      badges.push({
        key: 'multiplier',
        text: `${isMaxMultiplier ? 'Puntos x5' : `x${gameState.scoreMultiplier}`} ${multiplierTime}s`,
        color: '#EC4899',
      });
    }

    const vaulTime = Math.max(0, Math.ceil(gameState.vaulEffectTimeRemaining ?? 0));
    if (gameState.activeVaulEffect === 'double_collectibles' && vaulTime > 0) {
      badges.push({
        key: 'double_collectibles',
        text: `2x Items ${vaulTime}s`,
        color: '#EC4899',
      });
    }

    if (gameState.activeVaulEffect === 'energy_to_uki' && vaulTime > 0) {
      badges.push({
        key: 'energy_to_uki',
        text: `Gemas→Monedas ${vaulTime}s`,
        color: '#EC4899',
      });
    }

    if (gameState.eliminateEnemiesDisplay) {
      badges.push({
        key: 'eliminate_enemies',
        text: `💥 ${gameState.eliminateEnemiesDisplay.count} Enemigos`,
        color: '#FF4500',
      });
    }

    if (!badges.length) {
      return null;
    }

    return (
      <div
        className="pointer-events-none absolute flex justify-center"
        style={{
          top: '-38px',
          left: `calc(50% + ${canvasHorizontalOffset}px)`,
          transform: 'translateX(-50%)',
          zIndex: 1000,
          maxWidth: 'min(420px, 90%)',
          padding: '0 8px',
        }}
      >
        <div className="flex flex-wrap justify-center gap-2">
          {badges.map(({ key, text, color }) => {
            const dropShadowColor = color === '#FF4500' ? 'rgba(255, 69, 0, 0.85)' : 'rgba(236, 72, 153, 0.85)';
            return (
              <div
                key={key}
                className="flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 font-bold text-sm md:text-base"
                style={{
                  color,
                  borderColor: color,
                  backgroundColor: 'rgba(0, 0, 0, 0.78)',
                  textShadow: `0 0 10px ${color}CC, 2px 2px 4px rgba(0, 0, 0, 0.8)`,
                  fontFamily: 'Mitr-Bold, monospace',
                  animation: 'pulse 1s infinite alternate',
                  maxWidth: '100%',
                  filter: `drop-shadow(0 0 6px ${dropShadowColor})`,
                }}
              >
                <span className="whitespace-nowrap">{text}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [
    gameState.scoreMultiplier,
    gameState.multiplierTimeRemaining,
    gameState.activeVaulEffect,
    gameState.vaulEffectTimeRemaining,
    gameState.eliminateEnemiesDisplay,
    canvasHorizontalOffset,
  ]);

  const waitingOverlay = isMultiplayerMode && showWaitingOverlay ? (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm px-6 text-center">
      <div className="rounded-xl border border-cyan-500/60 bg-slate-900/90 px-6 py-5 shadow-2xl shadow-cyan-500/20 space-y-4">
        <p className="text-2xl font-pixellari text-cyan-100">Buscando oponente...</p>
        <p className="text-sm font-pixellari text-cyan-200/70">
          Comparte el enlace de la partida o espera a que otro jugador se conecte.
        </p>
        
        {/* Botón para generar enlace de invitación */}
        <div className="space-y-3">
          <button
            onClick={async () => {
              if (!matchRoomId) {
                console.warn('⚠️ [MULTIPLAYER] No room ID available yet');
                return;
              }
              
              // Generar URL del dapp con el juego embebido y sala específica
              const baseUrl = process.env.NODE_ENV === 'development' 
                ? 'http://localhost:3000/games/sybil-slayer'
                : 'https://hyppieliquid.com/games/sybil-slayer';
              const invitationUrl = `${baseUrl}?room=${matchRoomId}`;
              
              // Copiar al portapapeles con fallbacks por políticas/iframes
              const legacyCopy = (text: string) => {
                try {
                  const textarea = document.createElement('textarea');
                  textarea.value = text;
                  textarea.setAttribute('readonly', '');
                  textarea.style.position = 'absolute';
                  textarea.style.left = '-9999px';
                  document.body.appendChild(textarea);
                  textarea.select();
                  const ok = document.execCommand('copy');
                  document.body.removeChild(textarea);
                  return ok;
                } catch {
                  return false;
                }
              };

              const showManual = () => {
                try {
                  window.prompt('Copia este enlace de invitación:', invitationUrl);
                } catch {
                  alert(`Comparte este enlace:\n${invitationUrl}`);
                }
              };

              const onSuccessUI = () => {
                // Feedback visual en el botón
                const button = document.querySelector('[data-invite-button]') as HTMLElement;
                if (button) {
                  const originalText = button.textContent;
                  button.textContent = '¡Copiado!';
                  button.className = button.className.replace('border-cyan-500/50', 'border-emerald-500/50');
                  setTimeout(() => {
                    button.textContent = originalText;
                    button.className = button.className.replace('border-emerald-500/50', 'border-cyan-500/50');
                  }, 2000);
                }
              };

              let copied = false;
              // 1) Intento con API moderna si está disponible y en contexto seguro
              try {
                if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
                  await navigator.clipboard.writeText(invitationUrl);
                  console.log('🔗 [MULTIPLAYER] Link copiado con Clipboard API');
                  onSuccessUI();
                  copied = true;
                }
              } catch (err) {
                console.warn('⚠️ [MULTIPLAYER] Clipboard API bloqueada o falló:', err);
              }

              // 2) Fallback legacy (execCommand)
              if (!copied) {
                const ok = legacyCopy(invitationUrl);
                if (ok) {
                  console.log('🔗 [MULTIPLAYER] Link copiado con execCommand');
                  onSuccessUI();
                  copied = true;
                }
              }

              // 3) Último recurso: mostrar manual
              if (!copied) {
                console.error('❌ [MULTIPLAYER] No se pudo copiar automáticamente, mostrando manual.');
                showManual();
              }
            }}
            data-invite-button
            disabled={!matchRoomId}
            className={`inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-pixellari transition-colors ${
              matchRoomId 
                ? 'border-pink-500/50 bg-pink-500/20 text-pink-100 hover:bg-pink-500/30' 
                : 'border-gray-500/50 bg-gray-500/20 text-gray-400 cursor-not-allowed'
            }`}
          >
            {matchRoomId ? '📋 Copiar enlace de invitación' : '⏳ Generando sala...'}
          </button>
          
          {matchRoomId && (
            <div className="space-y-2">
              <p className="text-xs text-cyan-200/60">
                El segundo jugador debe abrir este enlace en un perfil diferente del navegador
              </p>
              <p className="text-xs text-cyan-300/80 font-mono">
                ID de sala: {matchRoomId}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const countdownOverlay = isMultiplayerMode && showCountdownOverlay ? (
    <div className="absolute inset-0 z-[58] flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur">
      <div className="rounded-xl border border-pink-400/60 bg-slate-900/90 px-6 py-4 shadow-pink-400/30">
        <p className="text-xl font-pixellari text-pink-200">
          La partida comienza en {countdownSeconds ?? 0}s
        </p>
      </div>
    </div>
  ) : null;

  const resultOverlay = isMultiplayerMode && matchResult ? (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-cyan-500/50 bg-slate-900/95 p-6 text-center shadow-[0_30px_80px_rgba(8,145,178,0.35)] space-y-4">
        <h3 className={`text-2xl font-pixellari ${localIsWinner ? 'text-emerald-300' : 'text-rose-300'}`}>
          {localIsWinner ? '¡Victoria!' : 'Derrota'}
        </h3>
        <div className="space-y-2 text-sm font-pixellari text-cyan-100">
          <p>Tu puntuación: {localFinalScore}</p>
          <p>Puntuación rival: {opponentFinalScore}</p>
          <p className="text-cyan-200/70 capitalize">Motivo: {matchResult.reason.replace('_', ' ')}</p>
        </div>
        <button
          onClick={() => {
            multiplayer.reset();
            setCurrentMode('single');
            resetGame();
          }}
          className="mx-auto inline-flex items-center justify-center rounded-lg border border-pink-500/50 bg-pink-500/20 px-4 py-2 text-sm font-pixellari text-pink-100 hover:bg-pink-500/30"
        >
          Salir a Single Player
        </button>
      </div>
    </div>
  ) : null;

  const opponentStatusLabel = (() => {
    if (!isMultiplayerMode) return '';
    if (!multiplayer.opponent) return 'Esperando rival';
    switch (multiplayer.opponent.status) {
      case 'waiting':
        return 'Preparando';
      case 'ready':
        return 'Listo';
      case 'playing':
        return 'Jugando';
      case 'eliminated':
        return 'Eliminado';
      case 'finished':
        return 'Finalizado';
      default:
        return 'Activo';
    }
  })();

  const opponentInfoBox = isMultiplayerMode ? (
    <div className="relative">
      <Image
        src="/assets/ui/buttons/CartelMadera.png"
        alt="Opponent box"
        width={200}
        height={60}
        className="game-img"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-xs font-pixellari text-shadow text-cyan-100">
        <span className="text-primary text-base">
          {multiplayer.opponent ? `Rival: ${opponentScore}` : 'Rival: ---'}
        </span>
        <span className="text-cyan-200/80 uppercase tracking-wide mt-1">
          Estado: {opponentStatusLabel}
        </span>
        {multiplayer.opponent && (
          <span className="text-cyan-200/70 uppercase tracking-wide mt-1">
            Hearts: {opponentHearts}
          </span>
        )}
      </div>
    </div>
  ) : null;
  
  // Handle pause toggle from keyboard (P key) - TEMPORALMENTE DESHABILITADO
  // useEffect(() => {
  //   if (pauseToggled) {
  //     // Ejecutar exactamente la misma lógica que el botón de pausa
  //     if (gameState.status === 'playing') {
  //       playSound('pause');
  //       togglePause();
  //     } else if (gameState.status === 'paused') {
  //       playSound('resume');
  //       togglePause();
  //     }
  //   }
  // }, [pauseToggled, gameState.status, togglePause, playSound]);

  // Handle start game from keyboard (Space key)
  useEffect(() => {
    if (!startToggled) return;
    if (gameState.status !== 'idle') return;
    if (modeSelectOpen) return;
    if (currentMode !== 'single') return;
    playSound('game_start');
    startGame();
  }, [startToggled, gameState.status, startGame, playSound, modeSelectOpen, currentMode]);
  
  // Reset flags when starting a new game (moved after gameState initialization)
  useEffect(() => {
    if (gameState.status === 'countdown') {
      setDamageFlag(0);
      setEnergyCollectedFlag(0);
    }
    // Reset checkpoint ref when game is idle (restarted)
    if (gameState.status === 'idle') {
      checkpointOnFieldRef.current = false;
    }
  }, [gameState.status]);
  
  // Ref para acceder al estado actual del juego en intervalos
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Log para verificar el estado de conexión con Pusher
  useEffect(() => {
    console.log('🔗 [GAME-PUSHER] Connection state changed:', {
      connectionState,
      isConnected,
      hasSessionData: !!sessionData,
      sessionId: sessionData?.sessionId,
      hasChannel: !!channel
    });
  }, [connectionState, isConnected, sessionData, channel]);

  // Handle game session start with Pusher
  useEffect(() => {
    if (isConnected && sessionData && gameState.status === 'playing') {
      console.log('🎮 [GAME-PUSHER] Starting checkpoint interval for session:', sessionData.sessionId);
      
      const stopInterval = startCheckpointInterval(
        () => gameStateRef.current.score,
        () => {
          const now = Date.now();
          const startTime = gameStateRef.current.gameStartTime || now;
          return now - startTime;
        }
      );
      
      return stopInterval;
    }
  }, [isConnected, sessionData, gameState.status, startCheckpointInterval]);

  // Handle game session end with Pusher
  const gameEndSentRef = useRef<string | null>(null); // Track which session already sent game end
  
  useEffect(() => {
    if (sessionData && gameState.status === 'gameOver') {
      // Prevent duplicate sends for the same session
      const sessionKey = `${sessionData.sessionId}_${gameState.score}`;
      if (gameEndSentRef.current === sessionKey) {
        console.log('🔄 [GAME-PUSHER] Game end already sent for this session, skipping');
        return;
      }
      
      console.log('🏁 [GAME-PUSHER] Ending session with score:', gameState.score);
      
      const gameTime = gameState.gameStartTime 
        ? Date.now() - gameState.gameStartTime 
        : 0;
      
      console.log('📤 [GAME-PUSHER] Attempting to send game end immediately');
      sendGameEnd({
        finalScore: gameState.score,
        gameTime,
        metadata: {
          gameOverReason: gameState.gameOverReason,
          level: gameState.level,
          hearts: gameState.hearts
        }
      });
      
      // Mark this session as having sent game end
      gameEndSentRef.current = sessionKey;
    }
  }, [sessionData, gameState.status, gameState.score, gameState.gameOverReason, gameState.level, gameState.hearts, gameState.gameStartTime, sendGameEnd]);

  // Update the gameState hook's internal input ref whenever useGameInput changes
  useEffect(() => {
    const unsubscribe = subscribeToDirection((direction) => {
      const nextInputState = {
        direction,
        pauseToggled,
        startToggled,
      };

      if (
        startToggled &&
        (gameState.status === 'idle' || gameState.status === 'gameOver')
      ) {
        setModeSelectOpen(true);
        nextInputState.startToggled = false;
      }

      updateInputRef(nextInputState);
    });

    return unsubscribe;
  }, [subscribeToDirection, pauseToggled, startToggled, updateInputRef, gameState.status]);

  const hasStartedMultiplayerRef = useRef(false);
  useEffect(() => {
    if (!isMultiplayerMode) {
      hasStartedMultiplayerRef.current = false;
      return;
    }
    if (!multiplayer.startSignal) return;
    if (hasStartedMultiplayerRef.current) return;

    if (gameState.status !== 'idle') {
      resetGame();
    }

    hasStartedMultiplayerRef.current = true;
    playSound('game_start');
    startGame();
  }, [isMultiplayerMode, multiplayer.startSignal, gameState.status, resetGame, playSound, startGame]);

  useEffect(() => {
    if (!isMultiplayerMode) {
      lastPublishedSnapshotRef.current = null;
      return;
    }
    const lifecycle = resolveLifecycleStatus(gameState);
    const snapshot = {
      score: Math.floor(gameState.score),
      hearts: gameState.hearts,
      status: lifecycle,
      gameStatus: gameState.status,
      gameOverReason: gameState.gameOverReason,
    };

    const lastSnapshot = lastPublishedSnapshotRef.current;
    const hasChanged = !lastSnapshot
      || lastSnapshot.score !== snapshot.score
      || lastSnapshot.hearts !== snapshot.hearts
      || lastSnapshot.status !== snapshot.status
      || lastSnapshot.gameStatus !== snapshot.gameStatus
      || lastSnapshot.gameOverReason !== snapshot.gameOverReason;

    if (!hasChanged) {
      return;
    }

    multiplayer.publishLocalSnapshot(snapshot);
    lastPublishedSnapshotRef.current = snapshot;
  }, [
    isMultiplayerMode,
    gameState.score,
    gameState.hearts,
    gameState.status,
    gameState.gameOverReason,
    resolveLifecycleStatus,
    multiplayer,
  ]);

  const hasAnnouncedStartRef = useRef(false);
  useEffect(() => {
    if (!isMultiplayerMode || gameState.status === 'idle') {
      hasAnnouncedStartRef.current = false;
      return;
    }
    if (gameState.status === 'playing' && !hasAnnouncedStartRef.current) {
      multiplayer.notifyGameStart();
      hasAnnouncedStartRef.current = true;
    }
  }, [isMultiplayerMode, gameState.status, multiplayer]);

  const hasAnnouncedGameOverRef = useRef(false);
  useEffect(() => {
    if (!isMultiplayerMode || gameState.status === 'idle') {
      hasAnnouncedGameOverRef.current = false;
      return;
    }
    if (gameState.status === 'gameOver' && !hasAnnouncedGameOverRef.current) {
      const lifecycleStatus = gameState.hearts > 0 ? 'finished' : 'eliminated';
      multiplayer.notifyGameOver(gameState.gameOverReason ?? 'multiplayer', Math.floor(gameState.score), lifecycleStatus);
      hasAnnouncedGameOverRef.current = true;
    }
  }, [isMultiplayerMode, gameState.status, gameState.gameOverReason, gameState.score, gameState.hearts, multiplayer]);

  useEffect(() => {
    if (!isMultiplayerMode) return;
    if (!multiplayer.matchResult) return;
    if (gameState.status === 'gameOver') return;

    forceGameOver('multiplayer');
  }, [isMultiplayerMode, multiplayer.matchResult, gameState.status, forceGameOver]);

  useEffect(() => {
    return () => {
      multiplayer.reset();
    };
  }, []);

  // Helper para obtener tiempo pausable para animaciones
  const getPausableTime = useCallback(() => {
    if (gameState.status === 'paused') {
      // Si está pausado, devolver el tiempo que tenía cuando se pausó
      // Para esto necesitamos almacenar cuándo se pausó
      return Date.now(); // Por ahora usar tiempo real como fallback
    }
    return Date.now();
  }, [gameState.status]);

  // NUEVO: Pausa automática cuando se cambia de pestaña
  useEffect(() => {
    let wasPlayingBeforeHidden = false;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // La pestaña se ocultó (cambió a otra pestaña o minimizó)
        if (gameState.status === 'playing') {
          wasPlayingBeforeHidden = true;
          console.log('📱 Pestaña oculta - Pausando juego automáticamente');
          playSound('pause');
          togglePause();
        }
      } else {
        // La pestaña volvió a estar visible
        if (wasPlayingBeforeHidden && gameState.status === 'paused') {
          console.log('📱 Pestaña visible de nuevo - El juego queda pausado (presiona P para reanudar)');
          // Nota: No reanudamos automáticamente, el usuario debe presionar P
          wasPlayingBeforeHidden = false;
        }
      }
    };

    // Añadir listener para detectar cambios de visibilidad
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [gameState.status, togglePause, playSound]); // Dependencias para que react re-evalúe cuando cambien


 // Game loop integration using the custom hook
  useGameLoop((deltaTime, isPaused) => {
    // Pass deltaTime to the updateGame function provided by useGameState
    // El deltaTime será 0 si está pausado, pausando efectivamente todas las actualizaciones
    updateGame(deltaTime);
  }, FPS, gameState.status === 'paused'); // Target FPS, pasar estado de pausa


  // UI Button Handlers
  const handleStartPauseClick = () => {
    if (gameState.status === 'playing') {
      playSound('pause');
      togglePause();
      return;
    }

    if (gameState.status === 'paused') {
      // No permitir reanudar si el dispositivo está en portrait
      if (isMobile && isPortrait) {
        console.log('[GameContainer] No se puede reanudar el juego en modo vertical');
        return;
      }
      playSound('resume');
      togglePause();
      return;
    }

    if (gameState.status === 'idle' || gameState.status === 'gameOver') {
      setModeSelectOpen(true);
    }
  };

  const startMultiplayerGame = useCallback((roomIdOverride?: string | null) => {
    // Permitir reutilizar una sala existente (invitación) o crear una nueva
    const roomId = roomIdOverride ?? generateMatchRoomId();
    setMatchRoomId(roomId);
    
    console.log('🎮 [MULTIPLAYER] Starting multiplayer game...', {
      hasSessionData: !!sessionData,
      sessionId: sessionData?.sessionId,
      isConnected,
      hasChannel: !!channel,
      roomId
    });
    
    console.log('🎮 [MULTIPLAYER] Resetting game and multiplayer state...');
    resetGame();
    multiplayer.reset();
    
    console.log('🎮 [MULTIPLAYER] Initiating match...');
    // Even if session isn't ready yet, call initiateMatch so it enters 'searching'
    // and will auto-continue once the connection/session is available
    multiplayer.initiateMatch();
  }, [multiplayer, resetGame, sessionData, isConnected, channel, generateMatchRoomId]);

  const handleModeSelected = useCallback((mode: GameMode) => {
    console.log('🎮 [MODE] Mode selected:', mode);
    setModeSelectOpen(false);
    setCurrentMode(mode);

    if (mode === 'single') {
      console.log('🎮 [MODE] Starting single player mode');
      multiplayer.reset();
      setMatchRoomId(null); // Limpiar room ID al cambiar a single
      if (gameState.status === 'gameOver') {
        console.log('🎮 Start desde Game Over - Deteniendo sonido de game over');
        stopMusic();
      }
      playSound('game_start');
      startGame();
      return;
    }

    console.log('🎮 [MODE] Starting multiplayer mode');
    playSound('button_click');
    startMultiplayerGame();
  }, [gameState.status, playSound, startGame, startMultiplayerGame, stopMusic, multiplayer]);

  // Detectar si se está uniendo a una sala específica
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    
    if (roomParam && !matchRoomId) {
      console.log('🎮 [MULTIPLAYER] Joining existing room:', roomParam);
      setMatchRoomId(roomParam);
      // Si hay un room ID en la URL, automáticamente iniciar multiplayer
      if (!isMultiplayerMode) {
        setCurrentMode('multiplayer');
        startMultiplayerGame(roomParam);
      } else {
        startMultiplayerGame(roomParam);
      }
    }
  }, [matchRoomId, isMultiplayerMode, startMultiplayerGame]);

   const handleResetClick = () => {
      playSound('button_click');
      
      // Si estamos en game over, detener el sonido de game over
      if (gameState.status === 'gameOver') {
        console.log('🔄 Reset desde Game Over - Deteniendo sonido de game over');
        stopMusic();
      }
      
      resetGame();
      
      // CORREGIDO: Ya no reactivamos música en reset, 
      // se activará automáticamente cuando el status cambie a 'playing'
   };

   const handleMusicToggle = () => {
      playSound('button_click');
      const newState = toggleMusic();
      setMusicEnabled(newState);
      
      // CORREGIDO: No reiniciar música al toggle, el sistema de audio maneja esto automáticamente
   };

   // NUEVO: Handler para el toggle de sonidos de efectos
   const handleSoundsToggle = () => {
      playSound('button_click');
      const newState = toggleSounds();
      setSoundsEnabled(newState);
   };

   const handleInfoToggle = () => {
      // Prevenir doble ejecución
      if (infoButtonClickedRef.current) {
        console.log('[INFO] handleInfoToggle already executing, skipping');
        return;
      }
      infoButtonClickedRef.current = true;
      
      playSound('button_click');
      const currentStatus = gameState.status;
      
      console.log('[INFO] handleInfoToggle called, status:', currentStatus, 'modal open:', isInfoModalOpen);
      
      // Si el juego está en idle, hacer toggle normal
      if (currentStatus === 'idle') {
        setIsInfoModalOpen(!isInfoModalOpen);
      } else {
        // Si está en playing o paused, pausar si es necesario y abrir el modal
        if (currentStatus === 'playing') {
          console.log('[INFO] Pausing game before opening modal');
          togglePause();
        }
        // Siempre abrir el modal cuando no está en idle
        console.log('[INFO] Opening info modal');
        setIsInfoModalOpen(true);
      }
      
      // Resetear el flag después de un breve delay
      setTimeout(() => {
        infoButtonClickedRef.current = false;
      }, 300);
   };

   const handleOpenInfo = () => {
      playSound('button_click');
      // Si el juego está en playing, pausar automáticamente
      if (gameState.status === 'playing') {
        togglePause();
      }
      setIsInfoModalOpen(true);
   };

  // Detectar cuando se recoge un checkpoint
  useEffect(() => {
    // Verificar si el token tiene efecto glow y glowTimer, lo que indica que se recogió un checkpoint
    if (gameState.token.glow && gameState.token.glowTimer && gameState.token.glowTimer > 0) {
      // Si es un valor nuevo de glowTimer, considerarlo como una nueva recolección
      if (lastGlowTimerRef.current === 0 || gameState.token.glowTimer > lastGlowTimerRef.current) {
        console.log("¡Checkpoint recogido!");
        
        // Reproducir sonidos al recoger checkpoint
        playSound('checkpoint_collect'); // Sonido "Checkpoint 1"
        playSound('jeff_goit');
        
        // DESACTIVADO: Animación de jeff_goit
        // setJeffGoitAnimation({
        //   active: true,
        //   start: Date.now(),
        //   phase: 'entering'
        // });
        
        // Actualizar el valor del último glowTimer
        lastGlowTimerRef.current = gameState.token.glowTimer;
      } 
    } else if (gameState.token.glowTimer === 0) {
      // Reiniciar el valor de referencia cuando el efecto termina
      lastGlowTimerRef.current = 0;
    }
  }, [gameState.token.glow, gameState.token.glowTimer, playSound]);

  // Detectar cuando se recoge un Haku (antes mega node)
  useEffect(() => {
    // Verificar si el token tiene boostTimer, lo que indica que se recogió un Haku
    if (gameState.token.boostTimer && gameState.token.boostTimer > 0) {
      // Si es un valor nuevo de boostTimer, considerarlo como una nueva recolección
      if (lastBoostTimerRef.current === 0 || gameState.token.boostTimer > lastBoostTimerRef.current) {
        console.log("¡Haku recogido!");
        
        // Reproducir sonidos
        playSound('mega_node_collect');
        playSound('whale_chad');
        
        // DESACTIVADO: Animación de whalechadmode
        // setWhaleChadAnimation({
        //   active: true,
        //   start: Date.now(),
        //   phase: 'entering'
        // });
        
        // Actualizar el valor del último boostTimer
        lastBoostTimerRef.current = gameState.token.boostTimer;
      } 
    } else if (gameState.token.boostTimer === 0) {
      // Reiniciar el valor de referencia cuando el efecto termina
      lastBoostTimerRef.current = 0;
    }
  }, [gameState.token.boostTimer, playSound]);

  // Detectar cuando aparece un checkpoint en pantalla
  useEffect(() => {
    const hasCheckpoint = gameState.collectibles.some(c => c.type === 'checkpoint');
    
    if (hasCheckpoint && !checkpointOnFieldRef.current) {
      // Nuevo checkpoint apareció en pantalla
      console.log("¡Checkpoint apareció en pantalla!");
      playSound('checkpoint'); // Sonido "Aparece Checkpoint"
      checkpointOnFieldRef.current = true;
    } else if (!hasCheckpoint && checkpointOnFieldRef.current) {
      // Checkpoint desapareció (fue recogido)
      checkpointOnFieldRef.current = false;
    }
  }, [gameState.collectibles, playSound]);

  // Detectar cuando se recoge purr
  useEffect(() => {
    // Detectar cuando el immunityTimer está en su valor máximo (recién recolectado)
    // PURR_IMMUNITY_DURATION_MS = 5000, así que detectamos valores >= 4900
    if (gameState.token.immunityTimer >= 4900) {
      // Verificar que no hayamos procesado ya esta recolección
      const currentCount = Math.floor(gameState.token.immunityTimer / 100); // Usar como ID único
      
      if (currentCount !== purrCollectionCountRef.current && !meowAnimation?.active) {
        console.log("¡Purr recogido! Inmunidad activada");
        console.log("🐱 Intentando reproducir sonido purr_collect...");
        
        // Reproducir sonido de purr
        playSound('purr_collect');
        console.log("🐱 Comando playSound('purr_collect') ejecutado");
        
        // ✅ PROTECCIÓN: Solo activar si no hay ya una animación activa
        // Activar la animación de meow
        setMeowAnimation({
          active: true,
          start: Date.now(),
          phase: 'entering',
          immunityDuration: gameState.token.immunityTimer
        });
        console.log("🐱 Activando animación de meow");
        
        // Actualizar contador para evitar duplicados
        purrCollectionCountRef.current = currentCount;
      }
    }
    
    // Resetear contador cuando la inmunidad termina
    if (gameState.token.immunityTimer === 0) {
      purrCollectionCountRef.current = 0;
    }
  }, [gameState.token.immunityTimer, playSound, meowAnimation?.active]);

  // Detectar cambios de nivel
  useEffect(() => {
    if (gameState.level > lastLevelRef.current) {
      console.log(`¡Subida de nivel! Nivel ${gameState.level}`);
      playSound('level_up');
      lastLevelRef.current = gameState.level;
    }
  }, [gameState.level, playSound]);

  // Removido: Ya no mostramos automáticamente las estadísticas al terminar el juego

  // Rastrear el estado del hacker y su energía recolectada
  useEffect(() => {
    const activeHacker = gameState.obstacles.find(obstacle => 
      obstacle.type === 'hacker' && 
      !obstacle.isBanished && 
      !obstacle.isRetreating
    );
    
    if (activeHacker) {
      console.log(`[HACKER UI] Hacker activo detectado - Energía recolectada: ${activeHacker.energyCollected || 0}`);
      setHackerActive(true);
      setHackerEnergyCollected(activeHacker.energyCollected || 0);
    } else {
      console.log(`[HACKER UI] No hay hacker activo`);
      setHackerActive(false);
      setHackerEnergyCollected(0);
    }
  }, [gameState.obstacles]);

  // Log del estado del hacker para depuración
  useEffect(() => {
    if (hackerActive) {
      console.log(`[HACKER UI] Hacker activo - Energía recolectada: ${hackerEnergyCollected}/5`);
    }
  }, [hackerActive, hackerEnergyCollected]);


  // Detectar cuando se recoge un vaul
  useEffect(() => {
    // Verificar si se activó el multiplicador (vaul recogido)
    if (gameState.multiplierEndTime && 
        gameState.multiplierEndTime > lastVaulCollectionTimeRef.current) {
      // Se recogió un vaul, activar animación de giga vault
      console.log("¡Vaul recogido! Activando animación de giga vault");
      
      // Reproducir sonido específico para vaul
      playSound('vaul_collect');
      
      // Activar la animación de giga vault
      setGigaVaultAnimation({
        active: true,
        start: Date.now(),
        phase: 'entering'
      });
      
      // Actualizar el tiempo del último vaul recogido
      lastVaulCollectionTimeRef.current = gameState.multiplierEndTime;
    }
  }, [gameState.multiplierEndTime, playSound]);

  // Detectar cuando el hacker toca al token
  useEffect(() => {
    // Verificar si hubo daño reciente por un hacker específicamente
    if (gameState.lastDamageTime && 
        gameState.lastDamageTime > lastHackerDamageTimeRef.current &&
        gameState.lastDamageSource === 'hacker') {
      // Este es un nuevo daño causado por un hacker, activar animación
      console.log("¡Hacker tocó al token! Activando animación de Trump");
      
      // Reproducir sonido específico para hacker collision (ya se reproduce en useGameState)
      // playSound('hacker_collision'); // Ya se reproduce automáticamente
      
      // Activar la animación del hacker
      setHackerAnimation({
        active: true,
        start: Date.now(),
        phase: 'entering'
      });
      
      // Actualizar el tiempo del último daño por hacker
      lastHackerDamageTimeRef.current = gameState.lastDamageTime;
    }
  }, [gameState.lastDamageTime, gameState.lastDamageSource, playSound]);

  // Advertencia de tiempo bajo
  useEffect(() => {
    if (gameState.status === 'playing' && gameState.timer <= 10 && gameState.timer > 0) {
      // Solo mostrar advertencia en intervalos específicos para evitar spam
      const timeLeft = Math.ceil(gameState.timer);
      if (timeLeft === 10 || timeLeft === 5 || timeLeft === 3 || timeLeft === 1) {
        console.log(`¡Advertencia! Quedan ${timeLeft} segundos`);
      }
    }
  }, [gameState.timer, gameState.status]);

  // Manejar música de fondo según el estado del juego
  useEffect(() => {
    if (gameState.status === 'gameOver') {
      // Reproducir sonido de game over independientemente del control de música
      console.log('💀 Game Over - Reproduciendo sonido de game over');
      playGameOverSound();
    } else if (gameState.status === 'playing' || gameState.status === 'countdown') {
      // CORREGIDO: Solo iniciar música cuando realmente empezamos a jugar
      // NO reiniciar música cuando está pausado, ya que debe continuar donde se quedó
      playMusic('background_music');
    }
    // En estado 'idle' o 'paused' no cambiar la música
  }, [gameState.status, playGameOverSound]); // CORREGIDO: Removido playMusic, stopMusic, y gameState.score

  // Iniciar música de fondo automáticamente al cargar el componente
  useEffect(() => {
    // Pequeño delay para asegurar que el sistema de audio esté listo
    const timer = setTimeout(() => {
      if (gameState.status !== 'gameOver') {
        playMusic('background_music');
      }
    }, 1000); // 1 segundo de delay

    return () => clearTimeout(timer);
  }, []); // Solo ejecutar una vez al montar el componente
  
  // Manejar las fases de la animación de jeff_goit
  useEffect(() => {
    if (!jeffGoitAnimation || !jeffGoitAnimation.active) return;
    
    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - jeffGoitAnimation.start;
      
      // Fases de la animación actualizadas:
      // 1. entering - 800ms - deslizándose desde fuera izquierda hacia dentro
      // 2. visible - 2000ms - visible completamente PARADO
      // 3. exiting - 800ms - retrocediendo hacia fuera izquierda
      
      if (jeffGoitAnimation.phase === 'entering' && elapsed >= 800) {
        // Cambiar a fase visible
        console.log("Cambiando a fase VISIBLE");
        setJeffGoitAnimation({
          active: true,
          start: now,
          phase: 'visible'
        });
      } else if (jeffGoitAnimation.phase === 'visible' && elapsed >= 2000) {
        // Cambiar a fase saliente
        console.log("Cambiando a fase EXITING");
        setJeffGoitAnimation({
          active: true,
          start: now,
          phase: 'exiting'
        });
      } else if (jeffGoitAnimation.phase === 'exiting' && elapsed >= 800) {
        // Terminar la animación
        console.log("Terminando animación");
        setJeffGoitAnimation(null);
      }
    }, 50);
    
    return () => clearInterval(intervalId);
  }, [jeffGoitAnimation]);
  
  // Manejar las fases de la animación de whalechadmode
  useEffect(() => {
    if (!whaleChadAnimation || !whaleChadAnimation.active) return;
    
    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - whaleChadAnimation.start;
      
      // Fases de la animación iguales a jeff pero desde el lado derecho:
      // 1. entering - 800ms - deslizándose desde fuera derecha hacia dentro
      // 2. visible - 2000ms - visible completamente PARADO
      // 3. exiting - 800ms - retrocediendo hacia fuera derecha
      
      if (whaleChadAnimation.phase === 'entering' && elapsed >= 800) {
        // Cambiar a fase visible
        console.log("Whale Chad: Cambiando a fase VISIBLE");
        setWhaleChadAnimation({
          active: true,
          start: now,
          phase: 'visible'
        });
      } else if (whaleChadAnimation.phase === 'visible' && elapsed >= 2000) {
        // Cambiar a fase saliente
        console.log("Whale Chad: Cambiando a fase EXITING");
        setWhaleChadAnimation({
          active: true,
          start: now,
          phase: 'exiting'
        });
      } else if (whaleChadAnimation.phase === 'exiting' && elapsed >= 800) {
        // Terminar la animación
        console.log("Whale Chad: Terminando animación");
        setWhaleChadAnimation(null);
      }
    }, 50);
    
    return () => clearInterval(intervalId);
  }, [whaleChadAnimation]);
  
  // Manejar las fases de la animación de meow (purr effect)
  useEffect(() => {
    if (!meowAnimation || !meowAnimation.active) return;
    // Pausar animaciones cuando el juego está pausado
    if (gameState.status === 'paused') return;
    
    const intervalId = setInterval(() => {
      // No ejecutar animaciones si el juego está pausado
      if (gameState.status === 'paused') return;
      
      const now = Date.now();
      const elapsed = now - meowAnimation.start;
      const currentImmunityTimer = gameState.token.immunityTimer;
      
      // ✅ CORREGIDO: Sincronizado con el contador de inmunidad
      // Fases de la animación:
      // 1. entering - 800ms - deslizándose desde fuera derecha hacia dentro
      // 2. visible - HASTA QUE immunityTimer ≤ 500ms - visible con contador
      // 3. exiting - 800ms - retrocediendo hacia fuera derecha
      
      if (meowAnimation.phase === 'entering' && elapsed >= 800) {
        // Cambiar a fase visible
        console.log("🐱 Meow: Cambiando a fase VISIBLE");
        setMeowAnimation({
          active: true,
          start: now,
          phase: 'visible',
          immunityDuration: meowAnimation.immunityDuration
        });
      } else if (meowAnimation.phase === 'visible' && currentImmunityTimer <= 500) {
        // ✅ Salir cuando queden ≤500ms de inmunidad (como estaba originalmente)
        console.log("🐱 Meow: Inmunidad casi terminada, cambiando a fase EXITING");
        setMeowAnimation({
          active: true,
          start: now,
          phase: 'exiting',
          immunityDuration: meowAnimation.immunityDuration
        });
      } else if (meowAnimation.phase === 'exiting' && elapsed >= 800) {
        // Terminar la animación
        console.log("🐱 Meow: Terminando animación");
        setMeowAnimation(null);
      }
      
      // ✅ PROTECCIÓN EXTRA: Si inmunidad terminó completamente, terminar inmediatamente
      if (currentImmunityTimer <= 0) {
        console.log("🐱 Meow: Inmunidad terminada completamente, terminando animación");
        setMeowAnimation(null);
      }
    }, 50);
    
    return () => clearInterval(intervalId);
  }, [meowAnimation, gameState.status, gameState.token.immunityTimer]);
  

  // Manejar las fases de la animación de giga vault (vaul effect)
  useEffect(() => {
    if (!gigaVaultAnimation || !gigaVaultAnimation.active) return;
    // Pausar animaciones cuando el juego está pausado
    if (gameState.status === 'paused') return;
    
    const intervalId = setInterval(() => {
      // No ejecutar animaciones si el juego está pausado
      if (gameState.status === 'paused') return;
      
      const now = Date.now();
      const elapsed = now - gigaVaultAnimation.start;
      
      // Fases de la animación iguales a whalechadmode desde el lado izquierdo inferior:
      // 1. entering - 800ms - deslizándose desde fuera izquierda hacia dentro
      // 2. visible - 2000ms - visible completamente PARADO  
      // 3. exiting - 800ms - retrocediendo hacia fuera izquierda
      
      if (gigaVaultAnimation.phase === 'entering' && elapsed >= 800) {
        // Cambiar a fase visible
        console.log("Giga Vault: Cambiando a fase VISIBLE");
        setGigaVaultAnimation({
          active: true,
          start: now,
          phase: 'visible'
        });
      } else if (gigaVaultAnimation.phase === 'visible' && elapsed >= 2000) {
        // Cambiar a fase saliente
        console.log("Giga Vault: Cambiando a fase EXITING");
        setGigaVaultAnimation({
          active: true,
          start: now,
          phase: 'exiting'
        });
      } else if (gigaVaultAnimation.phase === 'exiting' && elapsed >= 800) {
        // Terminar la animación
        console.log("Giga Vault: Terminando animación");
        setGigaVaultAnimation(null);
      }
    }, 50);
    
    return () => clearInterval(intervalId);
  }, [gigaVaultAnimation, gameState.status]);

  // Manejar las fases de la animación del hacker
  useEffect(() => {
    if (!hackerAnimation || !hackerAnimation.active) return;
    // Pausar animaciones cuando el juego está pausado
    if (gameState.status === 'paused') return;
    
    const intervalId = setInterval(() => {
      // No ejecutar animaciones si el juego está pausado
      if (gameState.status === 'paused') return;
      
      const now = Date.now();
      const elapsed = now - hackerAnimation.start;
      
      // Fases de la animación del hacker:
      // 1. entering - 800ms - deslizándose desde fuera derecha hacia dentro
      // 2. visible - 2000ms - visible completamente con mensaje
      // 3. exiting - 800ms - retrocediendo hacia fuera derecha
      
      if (hackerAnimation.phase === 'entering' && elapsed >= 800) {
        // Cambiar a fase visible
        console.log("Hacker: Cambiando a fase VISIBLE");
        setHackerAnimation({
          active: true,
          start: now,
          phase: 'visible'
        });
      } else if (hackerAnimation.phase === 'visible' && elapsed >= 2000) {
        // Cambiar a fase exiting
        console.log("Hacker: Cambiando a fase EXITING");
        setHackerAnimation({
          active: true,
          start: now,
          phase: 'exiting'
        });
      } else if (hackerAnimation.phase === 'exiting' && elapsed >= 800) {
        // Terminar animación
        console.log("Hacker: Terminando animación");
        setHackerAnimation(null);
      }
    }, 50);
    
    return () => clearInterval(intervalId);
  }, [hackerAnimation, gameState.status]);

  // Usar assets del AssetLoader optimizado en lugar de carga individual
  useEffect(() => {
    // Actualizar referencias cuando los assets estén disponibles
    const updateImageRefs = () => {
      jeffGoitImgRef.current = assetLoader.getAsset('jeff_goit');
      whaleChadImgRef.current = assetLoader.getAsset('whalechadmode');
      meowImgRef.current = assetLoader.getAsset('meow');
      gigaVaultImgRef.current = assetLoader.getAsset('giga_vault');
      hackerTrumpImgRef.current = assetLoader.getAsset('pay_tariffs');
    };
    
    // Actualizar inmediatamente si ya están cargados
    updateImageRefs();
    
    // Verificar periódicamente hasta que todos estén cargados
    const interval = setInterval(() => {
      updateImageRefs();
      
      // Detener cuando todos los assets críticos estén disponibles
      if (jeffGoitImgRef.current && whaleChadImgRef.current && 
          meowImgRef.current && gigaVaultImgRef.current && hackerTrumpImgRef.current) {
        clearInterval(interval);
        console.log('✅ Todas las referencias de imágenes actualizadas desde AssetLoader');
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [allAssetsLoaded]);

  // Escalado responsivo
  const [scale, setScale] = useState(1);

  const calculateScale = useCallback(() => {
    const newScale = Math.min(
      window.innerWidth / BASE_GAME_WIDTH,
      window.innerHeight / BASE_GAME_HEIGHT,
      1 // no ampliamos por encima del 100%
    );
    setScale(newScale);
  }, []);

  const normalizedCanvasOffset = useMemo(() => {
    if (scale === 0) {
      return canvasHorizontalOffset;
    }
    return canvasHorizontalOffset / scale;
  }, [canvasHorizontalOffset, scale]);

  // Función para calcular el offset horizontal del canvas para alinear elementos
  const calculateCanvasHorizontalOffset = useCallback(() => {
    if (!containerRef.current) {
      setCanvasHorizontalOffset(0);
      return;
    }

    const canvasElement = containerRef.current.querySelector('canvas');
    if (!canvasElement) {
      setCanvasHorizontalOffset(0);
      return;
    }

    // Usar la referencia al contenedor padre si está disponible, sino buscarlo
    let parentContainer = parentContainerRef.current;
    if (!parentContainer) {
      // Buscar el contenedor padre que tiene max-w-[1100px] - subir en el DOM
      let current = containerRef.current.parentElement;
      while (current) {
        // Buscar por clase que contenga max-w o por el estilo transform scale
        if (current.className && (
          current.className.includes('max-w') || 
          current.getAttribute('style')?.includes('scale')
        )) {
          parentContainer = current as HTMLDivElement;
          break;
        }
        current = current.parentElement;
      }
    }
    
    if (!parentContainer) {
      // Fallback: usar la ventana como referencia
      const canvasRect = canvasElement.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const canvasCenter = canvasRect.left + canvasRect.width / 2;
      const windowCenter = windowWidth / 2;
      setCanvasHorizontalOffset(canvasCenter - windowCenter);
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const parentRect = parentContainer.getBoundingClientRect();
    
    // Calcular el centro del canvas y el centro del contenedor padre
    const canvasCenter = canvasRect.left + canvasRect.width / 2;
    const parentCenter = parentRect.left + parentRect.width / 2;
    
    // El offset es la diferencia entre el centro del canvas y el centro del contenedor padre
    // Esto alineará los elementos (que están centrados en el contenedor) con el canvas
    const offset = canvasCenter - parentCenter;
    
    setCanvasHorizontalOffset(offset);
  }, []);

  // Recalcular al montar y al redimensionar
  useEffect(() => {
    const handleResize = () => {
      calculateScale();
      calculateCanvasHorizontalOffset();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateScale, calculateCanvasHorizontalOffset]);

  // Recalcular offset cuando cambia el tamaño del canvas - usar useLayoutEffect para medir después del render
  useLayoutEffect(() => {
    // Usar requestAnimationFrame para asegurar que el DOM se haya actualizado completamente
    const frameId = requestAnimationFrame(() => {
      calculateCanvasHorizontalOffset();
    });
    return () => cancelAnimationFrame(frameId);
  }, [canvasSize.width, canvasSize.height, calculateCanvasHorizontalOffset, gameState.status]);

  // Loading screen optimizado con fases
  if (!criticalAssetsLoaded) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50">
        <div className="w-full flex flex-col items-center justify-center py-10">
          <div className="w-3/4 mb-4">
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-4 bg-pink-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.round(loadingProgress * 100)}%` }}
              ></div>
            </div>
          </div>
          <p className="text-pink-200 text-lg font-pixellari mt-2">
            {loadingPhase === 'preload' 
              ? `Cargando elementos esenciales: ${Math.round(loadingProgress * 100)}%`
              : `Optimizando experiencia: ${Math.round(loadingProgress * 100)}%`
            }
          </p>
          <p className="text-pink-200/70 text-sm font-pixellari mt-1">
            {loadingPhase === 'preload' 
              ? 'Preparando juego...'
              : 'Cargando efectos especiales...'
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center min-h-screen">
      <ModeSelectModal
        open={modeSelectOpen}
        onClose={() => setModeSelectOpen(false)}
        onSelectMode={handleModeSelected}
        defaultMode={currentMode}
        onRulesClick={handleOpenInfo}
      />
      {waitingOverlay}
      {countdownOverlay}
      {resultOverlay}
      {/* Menú de bienvenida */}
      {gameState.status === 'idle' ? (
        <>
          {/* Fondo del juego */}
           <div 
            className="fixed inset-0 w-full h-full overflow-hidden -z-10"
            style={{
              backgroundImage: "url('/assets/ui/game-container/fondo1.PNG')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundAttachment: 'fixed',
              backgroundRepeat: 'no-repeat'
            }}
          ></div>
          <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 z-20 px-4 py-6">
            <div
              className="relative w-full max-w-5xl rounded-xl border border-pink-400/60 bg-slate-900/90 p-6 shadow-2xl shadow-pink-500/10"
              style={{ transform: `scale(${isMobile ? scale * 1.5 : scale})`, transformOrigin: 'center' }}
            >
              <h1 className="text-4xl md:text-6xl font-pixellari text-pink-200 mb-6 text-center select-none tracking-wide">
                TREASURE HUNT
              </h1>
              <p className="text-base md:text-lg font-pixellari text-pink-200/80 mb-6 text-center select-none">
                {isMobile 
                  ? "Utiliza el joystick que aparece al pulsar en pantalla para mover el personaje y consigue la mayor puntuacion posible."
                  : "Utiliza las teclas ASDW para mover al personaje, y consigue la mayor puntuación posible."
                }<br/>
                <br/>
                La partida termina cuando se acaba el tiempo o pierdes las 3 vidas.
              </p>
              <div className="flex flex-row justify-center gap-4">
                <button 
                  onClick={handleStartPauseClick} 
                  className="focus:outline-none game-button relative"
                  aria-label="Jugar"
                >
                  <Image 
                    src="/assets/ui/buttons/caja-texto2.png"
                    alt="Jugar"
                    width={160}
                    height={60}
                    className="game-img"
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-xl" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                    JUGAR
                  </span>
                </button>
                <button 
                  onClick={handleOpenInfo} 
                  className="focus:outline-none game-button relative"
                  aria-label="Reglas"
                >
                  <Image 
                    src="/assets/ui/buttons/caja-texto2.png"
                    alt="Reglas"
                    width={160}
                    height={60}
                    className="game-img"
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-xl" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                    REGLAS
                  </span>
                </button>
              </div>
            </div>
          </div>
        </>
      ) : gameState.status === 'countdown' ? (
        /* ✅ CORREGIDO: Durante countdown, NO mostrar fondos para que solo se vea grid-background.png */
        <div className="game-container mx-auto flex flex-col items-center p-4 md:p-8">
          {/* Estilos para las animaciones */}
          <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
          
          {/* Sin fondos durante countdown - solo el grid del canvas será visible */}
          
        <div
          ref={parentContainerRef}
          className="flex flex-col items-center justify-center w-full max-w-[1100px] mx-auto my-2 relative" 
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: BASE_GAME_WIDTH }}
        >
          {vaultEffectBadgesElement}
            {/* Score, Level, Hearts y Timer con cajas - alineados con el canvas */}
            <div 
              className="flex flex-wrap justify-center gap-4 mb-2 items-center" 
              style={{ 
                width: `${canvasSize.width}px`,
                marginLeft: 'auto',
                marginRight: 'auto',
                transform: `translate(${normalizedCanvasOffset}px, -50px)`
              }}
            >
              <div className="relative">
               <Image 
                 src="/assets/ui/buttons/CartelMadera.png"
                  alt="Score box"
                  width={150}
                  height={50}
                  className="game-img"
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-shadow">
                  <span className="text-white" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                    Score: {localScore}
                  </span>
                </div>
              </div>

              <div className="relative">
               <Image 
                 src="/assets/ui/buttons/CartelMadera.png"
                  alt="Level box"
                  width={150}
                  height={50}
                  className="game-img"
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-shadow">
                  <span className="text-white" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                    Level: {gameState.level}
                  </span>
                </div>
              </div>

              {/* Caja de corazones centrada */}
              <div className="relative">
               <Image 
                 src="/assets/ui/buttons/CartelMadera.png"
                  alt="Hearts box"
                  width={Math.max(120, 60 + gameState.maxHearts * 32)}
                  height={50}
                  className="game-img"
                  style={{ objectFit: 'fill' }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-primary text-shadow">
                  {Array.from({ length: gameState.maxHearts }).map((_, i) => (
                    <Image
                      key={i}
                      src="/assets/collectibles/corazoncukies.png"
                      alt={i < gameState.hearts ? "Full Heart" : "Empty Heart"}
                      width={28}
                      height={28}
                      className={`inline-block mr-1 align-middle ${i < gameState.hearts ? 'opacity-100' : 'opacity-30'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="relative">
               <Image 
                 src="/assets/ui/buttons/CartelMadera.png"
                  alt="Time box"
                  width={150}
                  height={50}
                  className="game-img"
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-shadow">
                  <span className="text-white" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                    Time: {Math.ceil(gameState.timer)}
                  </span>
                </div>
              </div>
            </div>
            {opponentInfoBox}
            {advantageBar}
            
            {/* Canvas del juego con tótem lateral y panel inferior */}
            <div className="w-full flex flex-col items-center justify-center gap-0">
              <div className="w-full flex flex-row items-center justify-center gap-0" style={{ transform: `translate(${isMobile ? 300 : 0}px, -50px)` }}>
                <div ref={containerRef} className="w-full lg:w-auto flex justify-center items-center mb-0 lg:mb-0 lg:-mr-6 -mr-3 relative">
                  {/* Render canvas only when size is determined */}
                  {canvasSize.width > 0 && canvasSize.height > 0 && (
                    <div className="relative">
                      <GameCanvas
                        gameState={gameState}
                        width={canvasSize.width}
                        height={canvasSize.height}
                        energyCollectedFlag={energyCollectedFlag}
                        damageFlag={damageFlag}
                      />
                      
                      {/* Botones de game over */}
                      {gameState.status === 'gameOver' && (
                        <div className="absolute inset-0 flex items-end justify-center pointer-events-auto pb-16">
                          <div className="flex flex-row items-center gap-4">
                            {/* Botón Score Details */}
                            <button
                              onClick={() => setIsLevelStatsVisible(true)}
                              className="focus:outline-none game-button relative"
                              aria-label="Score Details"
                            >
                              <Image 
                                src="/assets/ui/buttons/caja-texto2.png"
                                alt="Score Details" 
                                width={180} 
                                height={50}
                                className="game-img"
                              />
                              <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-lg whitespace-nowrap" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                                SCORE DETAILS
                              </span>
                            </button>
                            
                            {/* Botón Play Again */}
                            <button
                              onClick={() => {
                                playSound('button_click');
                                if (gameState.status === 'gameOver') {
                                  console.log('🔄 Play Again desde Game Over - Deteniendo sonido de game over');
                                  stopMusic();
                                }
                                resetGame();
                                setModeSelectOpen(true);
                              }}
                              className="focus:outline-none game-button relative"
                              aria-label="Play Again"
                            >
                              <Image 
                                src="/assets/ui/buttons/caja-texto2.png" 
                                alt="Play Again" 
                                width={180} 
                                height={50}
                                className="game-img"
                              />
                              <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-lg whitespace-nowrap" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                                PLAY AGAIN
                              </span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-0 lg:mt-0 lg:-ml-6 -ml-3">
                  <RuneTotemSidebar runeState={gameState.runeState} height={canvasSize.height} />
                </div>
              </div>
            </div>
            
            {/* Botones principales - alineados con el canvas */}
            <div 
              className="flex space-x-8 mb-3 justify-center items-center"
              style={{ 
                width: `${canvasSize.width}px`,
                marginLeft: 'auto',
                marginRight: 'auto',
                transform: `translate(${normalizedCanvasOffset}px, -50px)` 
              }}
            >
              <button 
                onClick={handleStartPauseClick} 
                className="focus:outline-none game-button relative"
                aria-label="Start"
              >
                <Image 
                  src="/assets/ui/buttons/caja-texto2.png"
                  alt="Play" 
                  width={120} 
                  height={50}
                  className="game-img"
                />
                <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-lg" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                  PLAY
                </span>
              </button>
              <button 
                onClick={handleResetClick} 
                className="focus:outline-none game-button relative"
                aria-label="Reset game"
              >
                <Image 
                  src="/assets/ui/buttons/caja-texto2.png" 
                  alt="Reset" 
                  width={120} 
                  height={50}
                  className="game-img"
                />
                <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-lg" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                  RESET
                </span>
              </button>
              
              {/* Indicador del hacker - solo visible cuando hay un hacker activo */}
              {hackerActive && (
                <div className="flex items-center space-x-2 ml-4">
                                      <div className="relative" style={{ width: 60, height: 25 }}>
                      <Image 
                        src="/assets/collectibles/trump_imagen.png" 
                        alt="Trump" 
                        width={60} 
                        height={25}
                        className="game-img"
                        style={{ 
                          objectFit: 'contain',
                          objectPosition: 'center center',
                          transform: 'translateY(-12px)'
                        }}
                        onLoad={() => console.log('[HACKER UI] Imagen trump_imagen cargada correctamente')}
                        onError={(e) => console.error('[HACKER UI] Error cargando imagen trump_imagen:', e)}
                      />
                    </div>
                  {/* Barra de progreso del hacker con progress_barr */}
                  <div className="flex items-center space-x-2">
                    <div className="relative w-[120px] h-[30px]">
                      {/* Imagen de fondo (barr.png) */}
                      <Image 
                        src="/assets/ui/game-container/barr.png" 
                        alt="Hacker Energy Bar Background" 
                        width={120} 
                        height={30}
                        className="absolute inset-0 w-full h-full"
                        onLoad={() => console.log('[HACKER UI] Imagen barr cargada correctamente')}
                        onError={(e) => console.error('[HACKER UI] Error cargando imagen barr:', e)}
                      />
                      
                      {/* Barra de progreso (barra_trump.png) con 5 saltos */}
                      <Image 
                        src="/assets/ui/game-container/barra_trump_hacker.png" 
                        alt="Hacker Energy Progress" 
                        width={120} 
                        height={30}
                        className="absolute inset-0 w-full h-full"
                        style={{
                          clipPath: `inset(0 ${100 - (hackerEnergyCollected * 20)}% 0 0)`,
                          transition: 'clip-path 0.3s ease-in-out'
                        }}
                        onLoad={() => console.log('[HACKER UI] Imagen barra_trump_hacker cargada correctamente')}
                        onError={(e) => console.error('[HACKER UI] Error cargando imagen barra_trump_hacker:', e)}
                      />
                      
                      {/* Efecto de brillo cuando está lleno */}
                      {hackerEnergyCollected >= 5 && (
                        <div 
                          className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-red-500 opacity-40 animate-pulse"
                          style={{
                            clipPath: 'inset(0 0% 0 0)'
                          }}
                        />
                      )}
                    </div>
                    
                    {/* Contador de energía */}
                    <div className="flex items-center space-x-1 h-[30px]">
                      <span 
                        className="text-white font-pixellari text-sm leading-none flex items-center justify-center h-full"
                        style={{ transform: 'translateY(2px)' }}
                      >
                        {hackerEnergyCollected}/5
                      </span>
                      
                      {/* Imagen de energía (resource) */}
                      <Image 
                        src="/assets/collectibles/resource_rare_metals.png" 
                        alt="Resource" 
                        width={20} 
                        height={20}
                        className="game-img flex-shrink-0"
                        onLoad={() => console.log('[HACKER UI] Imagen resource_rare_metals cargada correctamente')}
                        onError={(e) => console.error('[HACKER UI] Error cargando imagen resource_rare_metals:', e)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ✅ Estados normales (playing, paused, gameOver): mostrar fondos completos */
        <div className="game-container mx-auto flex flex-col items-center p-4 md:p-8">
          {/* Estilos para las animaciones */}
          <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
          
          {/* Fondo del juego */}
          <div 
            className="fixed inset-0 w-full h-full overflow-hidden -z-10"
            style={{
              backgroundImage: "url('/assets/ui/game-container/fondo2.PNG')",
              backgroundImage: "url('/assets/ui/game-container/fondo2.PNG')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundAttachment: 'fixed',
              backgroundRepeat: 'no-repeat'
            }}
          ></div>
          
          <div
            className="flex flex-col items-center justify-center w-full max-w-[1100px] mx-auto my-2 relative"
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: BASE_GAME_WIDTH }}
          >
            {vaultEffectBadgesElement}
            {/* Score, Level, Hearts y Timer con cajas - alineados con el canvas */}
            <div 
              className="flex flex-wrap justify-center gap-4 mb-2 items-center" 
              style={{ 
                width: `${canvasSize.width}px`,
                marginLeft: 'auto',
                marginRight: 'auto',
                transform: `translate(${normalizedCanvasOffset}px, -50px)`
              }}
            >
              <div className="relative">
                {/* Aura roja expansiva cuando el hacker roba score */}
                {gameState.scoreStealEffect && gameState.scoreStealEffect.active && (
                  <>
                    {/* Múltiples capas de aura roja para efecto expansivo */}
                    <div 
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: 'radial-gradient(circle, rgba(255, 0, 0, 0.3) 0%, rgba(255, 0, 0, 0.1) 50%, transparent 100%)',
                        animation: 'redAuraExpand 3s ease-out forwards',
                        transform: 'scale(1)',
                        zIndex: -1
                      }}
                    />
                    <div 
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: 'radial-gradient(circle, rgba(255, 50, 50, 0.4) 0%, rgba(255, 50, 50, 0.15) 40%, transparent 80%)',
                        animation: 'redAuraExpand 3s ease-out 0.2s forwards',
                        transform: 'scale(1)',
                        zIndex: -1
                      }}
                    />
                    <div 
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: 'radial-gradient(circle, rgba(255, 100, 100, 0.5) 0%, rgba(255, 100, 100, 0.2) 30%, transparent 70%)',
                        animation: 'redAuraExpand 3s ease-out 0.4s forwards',
                        transform: 'scale(1)',
                        zIndex: -1
                      }}
                    />
                  </>
                )}
                
               <Image 
                 src="/assets/ui/buttons/CartelMadera.png"
                  alt="Score box"
                  width={150}
                  height={50}
                  className="game-img"
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-shadow">
                  <span 
                    style={{
                      color: gameState.scoreMultiplier > 1 ? '#EC4899' : '#FFFFFF', // pink-500 cuando multiplicador activo
                      textShadow: gameState.scoreMultiplier > 1 
                        ? '0 0 10px rgba(236, 72, 153, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.8)' 
                        : '2px 2px 4px rgba(0, 0, 0, 0.8)',
                      animation: gameState.scoreMultiplier > 1 ? 'pulse 1s infinite alternate' : 'none',
                      WebkitTextStroke: '1px #000000'
                    }}
                  >
                    Score: {localScore}
                  </span>
                </div>
              </div>

              <div className="relative">
                <Image 
                  src="/assets/ui/buttons/CartelMadera.png"
                  alt="Level box"
                  width={150}
                  height={50}
                  className="game-img"
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-shadow">
                  <span className="text-white" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                    Level: {gameState.level}
                  </span>
                </div>
              </div>

              {/* Caja de corazones centrada */}
              <div className="relative">
                <Image 
                  src="/assets/ui/buttons/CartelMadera.png"
                  alt="Hearts box"
                  width={Math.max(120, 60 + gameState.maxHearts * 32)}
                  height={50}
                  className="game-img"
                  style={{ objectFit: 'fill' }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-primary text-shadow">
                  {Array.from({ length: gameState.maxHearts }).map((_, i) => (
                    <Image
                      key={i}
                      src="/assets/collectibles/corazoncukies.png"
                      alt={i < gameState.hearts ? "Full Heart" : "Empty Heart"}
                      width={28}
                      height={28}
                      className={`inline-block mr-1 align-middle ${i < gameState.hearts ? 'opacity-100' : 'opacity-30'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="relative">
                <Image 
                  src="/assets/ui/buttons/CartelMadera.png"
                  alt="Time box"
                  width={150}
                  height={50}
                  className="game-img"
                />
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-pixellari text-shadow">
                  <span className={gameState.timer <= 10 ? 'text-destructive' : 'text-white'} style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                    Time: {Math.ceil(gameState.timer)}
                  </span>
                </div>
              </div>
            </div>
            {opponentInfoBox}
            {advantageBar}

            {/* Canvas del juego con tótem lateral y panel inferior */}
            <div className="w-full flex flex-col items-center justify-center gap-0">
              <div className="w-full flex flex-row items-center justify-center gap-0" style={{ transform: `translate(${isMobile ? 300 : 0}px, -50px)` }}>
                <div ref={containerRef} className="w-full lg:w-auto flex justify-center items-center mb-0 lg:mb-0 lg:-mr-6 -mr-3 relative">

              {/* Animación de jeff_goit al lado izquierdo del grid */}
              {jeffGoitAnimation && jeffGoitAnimation.active && (
                <div 
                  className="absolute" 
                  style={{
                    bottom: '20px',
                    left: (() => {
                      const containerWidth = canvasSize.width;
                      const imageWidth = 250;
                      const stopDistance = 100; // Aumentado de 20px a 100px para que no toque el grid
                      
                      if (jeffGoitAnimation.phase === 'entering') {
                        // Entra desde -250px hasta la posición de parada
                        const progress = (Date.now() - jeffGoitAnimation.start) / 800;
                        const startPos = -imageWidth;
                        const endPos = -stopDistance;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      } else if (jeffGoitAnimation.phase === 'visible') {
                        // Se mantiene quieto en la posición de parada
                        return `${-stopDistance}px`;
                      } else {
                        // Retrocede desde la posición de parada hacia fuera
                        const progress = (Date.now() - jeffGoitAnimation.start) / 800;
                        const startPos = -stopDistance;
                        const endPos = -imageWidth;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      }
                    })(),
                    width: '250px',
                    height: '250px',
                    transition: 'none', // Removemos transition CSS para usar cálculo manual
                    filter: 'drop-shadow(0 0 15px rgba(255, 215, 0, 0.8))'
                  }}
                >
                  <img 
                    src="/assets/collectibles/jeff_goit.png" 
                    alt="¡Go it!" 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      animation: jeffGoitAnimation.phase === 'visible' 
                        ? 'pulse 0.8s infinite alternate'
                        : 'none'
                    }}
                  />
                </div>
              )}

              {/* Animación de whalechadmode al lado derecho del grid */}
              {whaleChadAnimation && whaleChadAnimation.active && (
                <div 
                  className="absolute" 
                  style={{
                    bottom: '20px',
                    right: (() => {
                      const containerWidth = canvasSize.width;
                      const imageWidth = 250;
                      const stopDistance = 140; // Aumentado de 100px a 140px para alejarlo del grid
                      
                      if (whaleChadAnimation.phase === 'entering') {
                        // Entra desde fuera derecha hasta la posición de parada
                        const progress = (Date.now() - whaleChadAnimation.start) / 800;
                        const startPos = -imageWidth; // Comienza fuera de la pantalla por la derecha
                        const endPos = -stopDistance; // Se detiene a 140px del grid
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      } else if (whaleChadAnimation.phase === 'visible') {
                        // Se mantiene quieto en la posición de parada
                        return `${-stopDistance}px`;
                      } else {
                        // Retrocede desde la posición de parada hacia fuera derecha
                        const progress = (Date.now() - whaleChadAnimation.start) / 800;
                        const startPos = -stopDistance;
                        const endPos = -imageWidth;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      }
                    })(),
                    width: '250px',
                    height: '250px',
                    transition: 'none', // Removemos transition CSS para usar cálculo manual
                    filter: 'drop-shadow(0 0 15px rgba(0, 191, 255, 0.8))' // Azul cyan para diferenciarlo de jeff
                  }}
                >
                  <img 
                    src="/assets/collectibles/whalechadmode.png" 
                    alt="¡Whale Chad Mode!" 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      animation: whaleChadAnimation.phase === 'visible' 
                        ? 'pulse 0.8s infinite alternate'
                        : 'none'
                    }}
                  />
                </div>
              )}

              {/* Animación de meow (purr effect) al lado derecho superior del grid */}
              {meowAnimation && meowAnimation.active && (
                <div 
                  className="absolute" 
                  style={{
                    top: '20px', // Posicionado arriba para no solaparse con whale chad
                    right: (() => {
                      const imageWidth = 200; // Más pequeño que whale chad
                      const stopDistance = 120; // Aumentado de 80px a 120px para alejarlo del grid
                      
                      if (meowAnimation.phase === 'entering') {
                        // ✅ CORREGIDO: Usar 800ms como jeff_goit
                        const progress = (Date.now() - meowAnimation.start) / 800;
                        const startPos = -imageWidth;
                        const endPos = -stopDistance;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      } else if (meowAnimation.phase === 'visible') {
                        // Se mantiene quieto en la posición de parada
                        return `${-stopDistance}px`;
                      } else {
                        // ✅ CORREGIDO: Usar 800ms como jeff_goit
                        const progress = (Date.now() - meowAnimation.start) / 800;
                        const startPos = -stopDistance;
                        const endPos = -imageWidth;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      }
                    })(),
                    width: '200px',
                    height: '200px',
                    transition: 'none', // ✅ CORREGIDO: Removemos transition CSS
                    filter: 'drop-shadow(0 0 15px rgba(138, 43, 226, 0.8))' // CORRECCIÓN: Violeta para el gato
                  }}
                >
                  <img 
                    src="/assets/collectibles/meow.png" 
                    alt="¡Meow! Inmunidad activada" 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      animation: meowAnimation.phase === 'visible' 
                        ? 'pulse 0.6s infinite alternate'
                        : 'none'
                    }}
                  />
                  
                  {/* Contador de inmunidad - CORRECCIÓN: Mostrar desde el inicio y más separado */}
                  {(meowAnimation.phase === 'entering' || meowAnimation.phase === 'visible') && (
                    <div 
                      style={{
                        position: 'absolute',
                        bottom: '-30px', // CORRECCIÓN: Más separado del PNG (era '10px')
                        left: '50%',
                        transform: 'translateX(-50%)',
                        color: '#8A2BE2', // CORRECCIÓN: Violeta para coincidir con el resplandor
                        fontSize: '18px',
                        fontWeight: 'bold',
                        fontFamily: 'Mitr-Bold, monospace',
                        textShadow: '0 0 10px rgba(138, 43, 226, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.8)', // CORRECCIÓN: Violeta
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '2px solid #8A2BE2', // CORRECCIÓN: Borde violeta
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {Math.ceil(gameState.token.immunityTimer / 1000)}s
                    </div>
                  )}
                </div>
              )}


              {/* Animación de giga_vault al lado izquierdo del grid - NUEVA */}
              {gigaVaultAnimation && gigaVaultAnimation.active && (
                <div 
                  className="absolute" 
                  style={{
                    bottom: '300px', // Arriba de jeff_goit
                    left: (() => {
                      const imageWidth = 250;
                      const stopDistance = 100; // Misma distancia que jeff
                      
                      if (gigaVaultAnimation.phase === 'entering') {
                        // Entra desde fuera izquierda
                        const progress = (Date.now() - gigaVaultAnimation.start) / 800;
                        const startPos = -imageWidth;
                        const endPos = -stopDistance;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      } else if (gigaVaultAnimation.phase === 'visible') {
                        // Se mantiene quieto en la posición de parada
                        return `${-stopDistance}px`;
                      } else {
                        // Retrocede hacia fuera izquierda
                        const progress = (Date.now() - gigaVaultAnimation.start) / 800;
                        const startPos = -stopDistance;
                        const endPos = -imageWidth;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      }
                    })(),
                    width: '250px',
                    height: '250px',
                    transition: 'none',
                    filter: 'drop-shadow(0 0 15px rgba(255, 215, 0, 0.8))' // Dorado como el vaul
                  }}
                >
                  <img 
                    src="/assets/collectibles/giga_vault.png" 
                    alt="¡Giga Vault! Multiplicador x5!" 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      animation: gigaVaultAnimation.phase === 'visible' 
                        ? 'pulse 0.8s infinite alternate'
                        : 'none'
                    }}
                  />
                </div>
              )}
              
              {/* Animación del hacker (hacker collision effect) al lado derecho del grid */}
              {hackerAnimation && hackerAnimation.active && (
                <div 
                  className="absolute" 
                  style={{
                    top: '50%', // Centrado verticalmente
                    transform: 'translateY(-50%)',
                    right: (() => {
                      const imageWidth = 300; // Tamaño más grande para el hacker
                      const stopDistance = 150; // Distancia de parada
                      
                      if (hackerAnimation.phase === 'entering') {
                        // Entra desde fuera derecha hacia dentro
                        const progress = (Date.now() - hackerAnimation.start) / 800;
                        const startPos = -imageWidth;
                        const endPos = -stopDistance;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      } else if (hackerAnimation.phase === 'visible') {
                        // Se mantiene quieto en la posición de parada
                        return `${-stopDistance}px`;
                      } else {
                        // Retrocede hacia fuera derecha
                        const progress = (Date.now() - hackerAnimation.start) / 800;
                        const startPos = -stopDistance;
                        const endPos = -imageWidth;
                        return `${startPos + (endPos - startPos) * Math.min(progress, 1)}px`;
                      }
                    })(),
                    width: '300px',
                    height: '300px',
                    transition: 'none',
                    filter: 'drop-shadow(0 0 20px rgba(255, 69, 0, 0.9))' // Efecto de resplandor rojo/naranja
                  }}
                >
                  <img 
                    src="/assets/collectibles/pay_tariffs.png" 
                    alt="Pay Tariffs!" 
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      animation: hackerAnimation.phase === 'visible' 
                        ? 'pulse 0.7s infinite alternate'
                        : 'none'
                    }}
                  />
                </div>
              )}
              
              {/* Render canvas only when size is determined */}
              {canvasSize.width > 0 && canvasSize.height > 0 && (
                <div className="relative">
                  <GameCanvas
                    gameState={gameState}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    energyCollectedFlag={energyCollectedFlag}
                    damageFlag={damageFlag}
                  />
                  
                  {/* Botones de game over */}
                  {gameState.status === 'gameOver' && (
                    <div className="absolute inset-0 flex items-end justify-center pointer-events-auto pb-16">
                      <div className="flex flex-row items-center gap-4">
                        {/* Botón Score Details */}
                        <button
                          onClick={() => setIsLevelStatsVisible(true)}
                          className="focus:outline-none game-button relative"
                          aria-label="Score Details"
                        >
                          <Image 
                            src="/assets/ui/buttons/caja-texto2.png"
                            alt="Score Details" 
                            width={180} 
                            height={50}
                            className="game-img"
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-lg whitespace-nowrap" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                            SCORE DETAILS
                          </span>
                        </button>
                        
                        {/* Botón Play Again */}
                        <button
                          onClick={() => {
                            playSound('button_click');
                            if (gameState.status === 'gameOver') {
                              console.log('🔄 Play Again desde Game Over - Deteniendo sonido de game over');
                              stopMusic();
                            }
                            resetGame();
                            setModeSelectOpen(true);
                          }}
                          className="focus:outline-none game-button relative"
                          aria-label="Play Again"
                        >
                          <Image 
                            src="/assets/ui/buttons/caja-texto2.png" 
                            alt="Play Again" 
                            width={180} 
                            height={50}
                            className="game-img"
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-lg whitespace-nowrap" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                            PLAY AGAIN
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Mensaje de pausa como overlay sobre el grid */}
              {gameState.status === 'paused' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
                  <h2 className="text-3xl font-bold text-white mb-2 font-pixellari text-shadow-glow">PAUSA</h2>
                  <p className="text-xl text-white font-pixellari text-shadow">Pulsa el botón &quot;Play&quot; para continuar.</p>
                  <p className="text-sm text-white/80 font-pixellari text-shadow mt-2">El juego se pausa automáticamente al cambiar de ventana.</p>
                </div>
              )}
                </div>
                <div className="mt-0 lg:mt-0 lg:-ml-6 -ml-3">
                  <RuneTotemSidebar runeState={gameState.runeState} height={canvasSize.height} />
                </div>
              </div>
            </div>
            
            {/* Botones principales - alineados con el canvas */}
            <div 
              className="flex space-x-8 mb-3 justify-center items-center"
              style={{ 
                width: `${canvasSize.width}px`,
                marginLeft: 'auto',
                marginRight: 'auto',
                transform: `translate(${normalizedCanvasOffset}px, -50px)` 
              }}
            >
              <button 
                onClick={handleStartPauseClick} 
                className="focus:outline-none game-button relative"
                aria-label={gameState.status === 'playing' ? 'Pause' : gameState.status === 'paused' ? 'Resume' : 'Start'}
              >
                <Image 
                  src="/assets/ui/buttons/caja-texto2.png"
                  alt={gameState.status === 'playing' ? "Pause" : "Play"} 
                  width={120} 
                  height={50}
                  className="game-img"
                />
                <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-lg" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                  {gameState.status === 'playing' ? 'PAUSE' : 'PLAY'}
                </span>
              </button>
              <button 
                onClick={handleResetClick} 
                className="focus:outline-none game-button relative"
                aria-label="Reset game"
              >
                <Image 
                  src="/assets/ui/buttons/caja-texto2.png" 
                  alt="Reset" 
                  width={120} 
                  height={50}
                  className="game-img"
                />
                <span className="absolute inset-0 flex items-center justify-center text-white font-pixellari text-lg" style={{ WebkitTextStroke: '1px #000000', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)' }}>
                  RESET
                </span>
              </button>
              
              {/* Indicador del hacker - solo visible cuando hay un hacker activo */}
              {hackerActive && (
                <div className="flex items-center space-x-2 ml-4">
                                      <div className="relative" style={{ width: 60, height: 25 }}>
                      <Image 
                        src="/assets/collectibles/trump_imagen.png" 
                        alt="Trump" 
                        width={60} 
                        height={25}
                        className="game-img"
                        style={{ 
                          objectFit: 'contain',
                          objectPosition: 'center center',
                          transform: 'translateY(-12px)'
                        }}
                        onLoad={() => console.log('[HACKER UI] Imagen trump_imagen cargada correctamente')}
                        onError={(e) => console.error('[HACKER UI] Error cargando imagen trump_imagen:', e)}
                      />
                    </div>
                  {/* Barra de progreso del hacker con progress_barr */}
                  <div className="flex items-center space-x-2">
                    <div className="relative w-[120px] h-[30px]">
                      {/* Imagen de fondo (barr.png) */}
                      <Image 
                        src="/assets/ui/game-container/barr.png" 
                        alt="Hacker Energy Bar Background" 
                        width={120} 
                        height={30}
                        className="absolute inset-0 w-full h-full"
                        onLoad={() => console.log('[HACKER UI] Imagen barr cargada correctamente')}
                        onError={(e) => console.error('[HACKER UI] Error cargando imagen barr:', e)}
                      />
                      
                      {/* Barra de progreso (barra_trump.png) con 5 saltos */}
                      <Image 
                        src="/assets/ui/game-container/barra_trump_hacker.png" 
                        alt="Hacker Energy Progress" 
                        width={120} 
                        height={30}
                        className="absolute inset-0 w-full h-full"
                        style={{
                          clipPath: `inset(0 ${100 - (hackerEnergyCollected * 20)}% 0 0)`,
                          transition: 'clip-path 0.3s ease-in-out'
                        }}
                        onLoad={() => console.log('[HACKER UI] Imagen barra_trump_hacker cargada correctamente')}
                        onError={(e) => console.error('[HACKER UI] Error cargando imagen barra_trump_hacker:', e)}
                      />
                      
                      {/* Efecto de brillo cuando está lleno */}
                      {hackerEnergyCollected >= 5 && (
                        <div 
                          className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-red-500 opacity-40 animate-pulse"
                          style={{
                            clipPath: 'inset(0 0% 0 0)'
                          }}
                        />
                      )}
                    </div>
                    
                    {/* Contador de energía */}
                    <div className="flex items-center space-x-1 h-[30px]">
                      <span 
                        className="text-white font-pixellari text-sm leading-none flex items-center justify-center h-full"
                        style={{ transform: 'translateY(2px)' }}
                      >
                        {hackerEnergyCollected}/5
                      </span>
                      
                      {/* Imagen de energía (resource) */}
                      <Image 
                        src="/assets/collectibles/resource_rare_metals.png" 
                        alt="Resource" 
                        width={20} 
                        height={20}
                        className="game-img flex-shrink-0"
                        onLoad={() => console.log('[HACKER UI] Imagen resource_rare_metals cargada correctamente')}
                        onError={(e) => console.error('[HACKER UI] Error cargando imagen resource_rare_metals:', e)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de información - Siempre disponible */}
      {process.env.NODE_ENV === 'development' && console.log('[INFO] Rendering InfoModal, isOpen:', isInfoModalOpen)}
      <InfoModal 
        isOpen={isInfoModalOpen}
        onClose={() => {
          console.log('[INFO] Closing info modal');
          setIsInfoModalOpen(false);
        }}
        onPlaySound={playSound}
      />

      {/* Botones de control - Esquina inferior derecha - Siempre visibles */}
      <div 
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
        style={{ transform: `scale(${scale})`, transformOrigin: 'bottom right' }}
        onTouchStart={(e) => {
          // Detener propagación para que TouchZones no capture estos botones
          e.stopPropagation();
        }}
      >
        {/* Botón de música */}
        <button 
          onClick={handleMusicToggle} 
          className="focus:outline-none game-button"
          aria-label={musicEnabled ? 'Disable music' : 'Enable music'}
        >
          <Image 
            src={musicEnabled 
              ? "/assets/ui/buttons/musicasi.png" 
              : "/assets/ui/buttons/musicano.png"}
            alt={musicEnabled ? "Music On" : "Music Off"} 
            width={110} 
            height={110}
            quality={100}
            className="game-img w-[50px] h-[50px]"
          />
        </button>

        {/* Botón de sonidos */}
        <button 
          onClick={handleSoundsToggle} 
          className="focus:outline-none game-button"
          aria-label={soundsEnabled ? 'Disable sounds' : 'Enable sounds'}
        >
          <Image 
            src={soundsEnabled 
              ? "/assets/ui/buttons/efectossi.png" 
              : "/assets/ui/buttons/efectosno.png"}
            alt={soundsEnabled ? "Sounds On" : "Sounds Off"} 
            width={110} 
            height={110}
            quality={100}
            className="game-img w-[50px] h-[50px]"
          />
        </button>

        {/* Botón de información */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            // En móvil, onTouchStart ya maneja el evento, así que prevenir doble ejecución
            if (!isMobile) {
              handleInfoToggle();
            }
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            // No usar preventDefault aquí porque causa error con passive listeners
            handleInfoToggle();
          }}
          className="focus:outline-none game-button relative"
          aria-label="Información del juego"
        >
          <Image 
            src="/assets/ui/buttons/botoninfo.png"
            alt="Información" 
            width={110} 
            height={110}
            quality={100}
            className="game-img w-[50px] h-[50px]"
          />
        </button>
      </div>

      {gameState.status === 'gameOver' && isLevelStatsVisible && (
        <LevelStatsOverlay 
          stats={gameState.levelStats} 
          onClose={() => setIsLevelStatsVisible(false)}
        />
      )}

      {/* Mobile touch controls */}
      {/* Always render in development to debug, or when isMobile is true */}
      {(process.env.NODE_ENV === 'development' || isMobile) && (
        <>
          {process.env.NODE_ENV === 'development' && console.log('[GameContainer] Rendering TouchZones, isMobile:', isMobile)}
          <TouchZones
            onDirectionChange={setTouchDirection}
            onDirectionClear={clearTouchDirection}
          />
        </>
      )}

      {/* Orientation overlay - muestra mensaje cuando el dispositivo está en vertical */}
      <OrientationOverlay />
    </div>
  );
};

export default GameContainer;
