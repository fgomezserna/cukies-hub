"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { SoundType } from '@/hooks/useAudio';
import { useIsMobile } from '../hooks/use-mobile';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlaySound?: (soundType: SoundType) => void;
}

interface InfoGroupItem {
  name: string;
  description: string;
  details?: string[];
  image: string | string[];
  imageAlt: string | string[];
}

interface InfoGroup {
  title: string;
  tagline: string;
  items: InfoGroupItem[];
}

const infoGroups: InfoGroup[] = [
  {
    title: 'Ítems Principales',
    tagline: 'Aprende lo básico para sobrevivir en el reino Cukie.',
    items: [
      {
        name: 'Cukie',
        description:
          '¡El héroe más dulce del reino! Usa las teclas ASDW para moverte por la pantalla de juego. Consigue la mayor puntuación posible antes de que se acabe el tiempo o pierdas las 3 vidas.',
        image: '/assets/characters/cukiesprites/south/cukie_walk_s_06.png',
        imageAlt: 'Cukie, el héroe del juego',
      },
      {
        name: 'Checkpoint',
        description:
          'Aparece cuando se está acabando el tiempo. Recógelo para sumar 30 segundos al reloj y continuar tu partida.',
        image: '/assets/collectibles/checkpointcukies_reglas.png',
        imageAlt: 'Checkpoint brillante',
      },
      {
        name: 'Corazón',
        description:
          'Si has perdido una vida, la recuperarás al instante. Si tienes todas las vidas, obtienes puntos crecientes: +20, +40, +60 y así sucesivamente.',
        image: '/assets/collectibles/corazoncukies_reglas.png',
        imageAlt: 'Corazón de Cukie',
      },
    ],
  },
  {
    title: 'Suma Puntos',
    tagline: 'Colecciona objetos brillantes para disparar tu marcador.',
    items: [
      {
        name: 'Gemas',
        description: '¡Las más codiciadas por los Cukies! Cada gema suma 1 punto a tu marcador.',
        image: '/assets/collectibles/gemas_reglas.png',
        imageAlt: 'Gemas resplandecientes',
      },
      {
        name: 'Monedas',
        description: '¡Son muy escasas! Cada moneda suma 5 puntos a tu marcador.',
        image: '/assets/collectibles/uki.png',
        imageAlt: 'Moneda Uki',
      },
      {
        name: 'Tesoros',
        description:
          '¡El botín más deseado! Aparecen en bloques de 3 y tendrás que ser rápido. Si no los recoges en unos segundos, desaparecen.',
        details: [
          'Bonificación progresiva por cada bloque de 3 recogido: 25, 50, 75 puntos, y así sucesivamente.',
        ],
        image: [
          '/assets/collectibles/tesoro.png',
          '/assets/collectibles/tesoro2.png',
          '/assets/collectibles/tesoro3.png',
        ],
        imageAlt: [
          'Tesoro dorado',
          'Tesoro púrpura',
          'Tesoro verde',
        ],
      },
    ],
  },
  {
    title: 'Power Ups',
    tagline: 'Activa ventajas temporales que cambian el curso de la partida.',
    items: [
      {
        name: 'Cofre',
        details: [
          'Doble de gemas y monedas en pantalla.',
          'Las gemas se convierten en monedas.',
          'Puntos x5 en gemas y monedas.',
        ],
        description: 'Concede un poder temporal durante 10-15 segundos:',
        image: '/assets/collectibles/vault.png',
        imageAlt: 'Cofre mágico',
      },
      {
        name: 'Piel de Goat',
        description:
          'El poder del GOAT aparece cada vez que pasas de nivel. Recógelo y tendrás 3 segundos para eliminar a todos los duendes que toques, y 3 segundos más en los que los duendes no te causarán daño.',
        image: '/assets/collectibles/goatskin.png',
        imageAlt: 'Piel de Goat',
      },
      {
        name: 'Haku',
        description: 'Este espíritu amigo aumenta tu velocidad x2 durante 7 segundos.',
        image: '/assets/collectibles/haku.png',
        imageAlt: 'Haku espíritu amigo',
      },
    ],
  },
  {
    title: 'Niveles',
    tagline: 'Completa el tótem y escala multiplicadores de puntos.',
    items: [
      {
        name: 'Runas',
        description:
          'Necesitas las 5 runas diferentes para completar el tótem mágico. Además otorgan puntos: la primera runa 5, la segunda 10, la tercera 15, y así sucesivamente.',
        image: [
          '/assets/collectibles/runa_chef_2.png',
          '/assets/collectibles/runa_engineer_2.png',
          '/assets/collectibles/runa_farmer_2.png',
          '/assets/collectibles/runa_gatherer_2.png',
          '/assets/collectibles/runa_miner_2.png',
        ],
        imageAlt: [
          'Runa Chef',
          'Runa Engineer',
          'Runa Farmer',
          'Runa Gatherer',
          'Runa Miner',
        ],
      },
      {
        name: 'Totem mágico',
        description:
          'Cuando lo completas avanzas al siguiente nivel, con multiplicadores en los puntos al recoger gemas, monedas y runas.',
        details: ['Nivel 2: x2', 'Nivel 3: x3', 'Nivel 4: x4', 'Nivel 5: x5'],
        image: '/assets/totem/totemlateral.png',
        imageAlt: 'Tótem mágico completo',
      },
      {
        name: 'Bonificación de nivel',
        description:
          'Al completar un nivel, los segundos del reloj se multiplicarán x5 y se sumarán a tu puntuación.',
        image: '/assets/collectibles/watch_sand.png',
        imageAlt: 'Reloj de arena mágico',
      },
    ],
  },
  {
    title: 'Enemigos',
    tagline: 'Evita perder vidas manteniéndote lejos de las amenazas.',
    items: [
      {
        name: 'Duende',
        description:
          'Cada golpe de un duende te hace perder 1 vida. Al principio parece sencillo, pero ten cuidado, ¡se irán multiplicando!',
        image: '/assets/characters/malvado1.png',
        imageAlt: 'Duende enemigo',
      },
      {
        name: 'Rayos',
        description:
          'Aparecen en bloques de 3. Observa sus avisos luminosos y ¡aléjate!. Si un rayo te alcanza perderás 1 vida.',
        image: '/assets/effects/rayos_reglas.png',
        imageAlt: 'Rayos peligrosos',
      },
      {
        name: 'Zonas de Barro',
        description:
          'No te dañarán directamente, pero si las pisas te moverás más lento, ¡y eso puede ser muy peligroso!',
        image: '/assets/obstacles/arenasmovedizas2.png',
        imageAlt: 'Zona de barro',
      },
    ],
  },
];

// Función helper para organizar items de un grupo
const arrangeGroupItems = (items: InfoGroupItem[]): InfoGroupItem[] => {
  const arranged = [...items];
  if (arranged.length >= 3) {
    let longestIndex = 0;
    let longestLength = -Infinity;
    arranged.forEach((item, index) => {
      const detailsLength = item.details?.join(' ').length ?? 0;
      const totalLength =
        (item.name?.length ?? 0) +
        (item.description?.length ?? 0) +
        detailsLength;
      if (totalLength > longestLength) {
        longestLength = totalLength;
        longestIndex = index;
      }
    });
    if (longestIndex !== 2) {
      const [longestItem] = arranged.splice(longestIndex, 1);
      arranged.splice(2, 0, longestItem);
    }
  }
  return arranged;
};

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, onPlaySound }) => {
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [treasureImageIndex, setTreasureImageIndex] = useState(0);
  const [runeImageIndex, setRuneImageIndex] = useState(0);
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [maxContainerHeight, setMaxContainerHeight] = useState<number>(0);
  const totemCardRef = useRef<HTMLDivElement | null>(null);
  const [totemCardDimensions, setTotemCardDimensions] = useState<{ width: number; height: number } | null>(null);
  const isMobile = useIsMobile();

  const treasureItem = infoGroups.flatMap(group => group.items).find(item => item.name === 'Tesoros');
  const treasureImagesLength =
    treasureItem && Array.isArray(treasureItem.image) ? treasureItem.image.length : 0;
  const runeItem = infoGroups.flatMap(group => group.items).find(item => item.name === 'Runas');
  const runeImagesLength = runeItem && Array.isArray(runeItem.image) ? runeItem.image.length : 0;

  const handlePrevGroup = () => {
    onPlaySound?.('button_click');
    setCurrentGroupIndex(prev => (prev === 0 ? infoGroups.length - 1 : prev - 1));
  };

  const handleNextGroup = () => {
    onPlaySound?.('button_click');
    setCurrentGroupIndex(prev => (prev === infoGroups.length - 1 ? 0 : prev + 1));
  };

  const handleClose = () => {
    onPlaySound?.('button_click');
    setCurrentGroupIndex(0);
    setTreasureImageIndex(0);
    setRuneImageIndex(0);
    onClose();
  };

  useEffect(() => {
    if (!isOpen || treasureImagesLength === 0) {
      return;
    }

    const durations = [2000, 2000, 5000];
    const timeoutId = window.setTimeout(() => {
      setTreasureImageIndex(prev => (prev + 1) % treasureImagesLength);
    }, durations[treasureImageIndex % durations.length]);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, treasureImagesLength, treasureImageIndex]);

  useEffect(() => {
    if (!isOpen || runeImagesLength === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRuneImageIndex(prev => (prev + 1) % runeImagesLength);
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, runeImagesLength, runeImageIndex]);

  useEffect(() => {
    if (!isOpen) {
      setTreasureImageIndex(0);
      setRuneImageIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setMaxContainerHeight(0);
      setTotemCardDimensions(null);
      return;
    }
    // Calcular altura máxima de todos los grupos cuando se abre el modal
    const calculateMaxHeight = () => {
      const heights = containerRefs.current
        .map(ref => ref?.getBoundingClientRect().height ?? 0)
        .filter(height => height > 0);
      if (heights.length > 0) {
        const largest = Math.max(...heights);
        setMaxContainerHeight(largest);
      }
    };
    
    // Medir dimensiones de la card del Totem mágico en móvil
    const measureTotemCard = () => {
      if (isMobile && totemCardRef.current) {
        const rect = totemCardRef.current.getBoundingClientRect();
        setTotemCardDimensions({
          width: rect.width,
          height: rect.height,
        });
      }
    };
    
    // Usar múltiples frames para asegurar que todos los grupos estén renderizados y medidos
    const frame1 = requestAnimationFrame(() => {
      const frame2 = requestAnimationFrame(() => {
        calculateMaxHeight();
        measureTotemCard();
      });
      return () => cancelAnimationFrame(frame2);
    });
    return () => cancelAnimationFrame(frame1);
  }, [isOpen, isMobile]);

  if (!isOpen) return null;

  // Log para verificar que el componente se está renderizando
  if (process.env.NODE_ENV === 'development') {
    console.log('[INFO-MODAL] Rendering modal, isMobile:', isMobile, 'isOpen:', isOpen);
  }

  // Estructura diferente para móvil: pantalla completa con elementos fijos
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm relative h-screen w-screen"
        onClick={handleClose}
        style={{ 
          pointerEvents: 'auto',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 100,
          display: 'flex',
          visibility: 'visible',
          opacity: 1
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-red-600/80 text-xl font-bold text-white shadow-lg transition-colors duration-200 hover:bg-red-500 focus:outline-none z-[110]"
          style={{ zIndex: 110 }}
          aria-label="Cerrar información del juego"
        >
          ×
        </button>

        {/* Contenedor con botones fijos a los lados */}
        <div
          className="flex-1 min-h-0 relative pt-4"
          onClick={event => event.stopPropagation()}
        >
          {/* Botón izquierdo - fijo, fuera del scroll */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrevGroup();
            }}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-20 flex-shrink-0 focus:outline-none transition-all duration-200 active:scale-95"
            aria-label="Grupo anterior"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-pink-400/60 bg-pink-500/20 shadow-lg shadow-pink-500/30 hover:border-pink-400 hover:bg-pink-500/30 hover:shadow-pink-500/50">
              <svg
                className="h-5 w-5 text-pink-200"
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

          {/* Botón derecho - fijo, fuera del scroll */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNextGroup();
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-20 flex-shrink-0 focus:outline-none transition-all duration-200 active:scale-95"
            aria-label="Grupo siguiente"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-pink-400/60 bg-pink-500/20 shadow-lg shadow-pink-500/30 hover:border-pink-400 hover:bg-pink-500/30 hover:shadow-pink-500/50">
              <svg
                className="h-5 w-5 text-pink-200"
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

          {/* Contenido scrolleable con padding para los botones */}
          <div className="overflow-y-auto h-full px-14 py-4">
            <div className="relative">
            {/* Renderizar todos los grupos ocultos para medir sus alturas */}
            {infoGroups.map((group, index) => {
              // En móvil, para el grupo 1 (Ítems Principales), reordenar: Cukie, Corazón, Checkpoint
              let arrangedItemsForGroup: InfoGroupItem[];
              if (isMobile && index === 0) {
                const cukieItem = group.items.find(item => item.name === 'Cukie');
                const corazonItem = group.items.find(item => item.name === 'Corazón');
                const checkpointItem = group.items.find(item => item.name === 'Checkpoint');
                
                if (cukieItem && corazonItem && checkpointItem) {
                  // Orden específico para móvil: Cukie, Corazón, Checkpoint
                  arrangedItemsForGroup = [cukieItem, corazonItem, checkpointItem];
                } else {
                  arrangedItemsForGroup = arrangeGroupItems(group.items);
                }
              } else {
                arrangedItemsForGroup = arrangeGroupItems(group.items);
              }

              return (
                <div
                  key={`hidden-${index}`}
                  ref={el => {
                    containerRefs.current[index] = el;
                  }}
                  className="rounded-xl border border-pink-400/40 bg-slate-800/70 p-3 shadow-lg shadow-pink-500/10"
                  style={{
                    position: index === currentGroupIndex ? 'relative' : 'absolute',
                    visibility: index === currentGroupIndex ? 'visible' : 'hidden',
                    top: 0,
                    left: 0,
                    right: 0,
                    minHeight: maxContainerHeight || undefined,
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.35em] font-pixellari text-pink-300/70">Grupo {index + 1}</p>
                      <h3 className="text-xl font-pixellari text-pink-200">{group.title}</h3>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2 pb-2">
                    {arrangedItemsForGroup.map((item, itemIndex) => {
                      const images = Array.isArray(item.image) ? item.image : [item.image];
                      const imageAlts = Array.isArray(item.imageAlt) ? item.imageAlt : images.map(() => item.imageAlt);
                      const isTreasureItem = item.name === 'Tesoros';
                      const isRuneItem = item.name === 'Runas';
                      const isHakuItem = item.name === 'Haku';
                      const imagesToRender = (() => {
                        if (isTreasureItem) {
                          const imgIndex = treasureImagesLength > 0 ? treasureImageIndex % treasureImagesLength : 0;
                          return [images[imgIndex]];
                        }
                        if (isRuneItem) {
                          const imgIndex = runeImagesLength > 0 ? runeImageIndex % runeImagesLength : 0;
                          return [images[imgIndex]];
                        }
                        return images;
                      })();
                      const renderIconContent = () => {
                        if (item.name === 'Bonificación de nivel') {
                          return (
                            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-800/60 p-1">
                              <svg
                                className="h-full w-full text-pink-400"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                viewBox="0 0 24 24"
                              >
                                <path d="M12 19V5M5 12l7-7 7 7" />
                              </svg>
                            </div>
                          );
                        }

                        return imagesToRender.map((src, imgIdx) => {
                          const originalIndex = (() => {
                            if (isTreasureItem && treasureImagesLength) {
                              return treasureImageIndex % treasureImagesLength;
                            }
                            if (isRuneItem && runeImagesLength) {
                              return runeImageIndex % runeImagesLength;
                            }
                            return imgIdx;
                          })();

                          return (
                            <div
                              key={`${item.name}-${originalIndex}`}
                              className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-800/60 p-1"
                            >
                              <Image
                                src={src}
                                alt={
                                  typeof imageAlts[originalIndex] === 'string'
                                    ? imageAlts[originalIndex]
                                    : item.name
                                }
                                width={448}
                                height={448}
                                quality={100}
                                unoptimized={false}
                                priority={false}
                                className="info-modal-img h-full w-full object-contain transition-opacity duration-500"
                              />
                            </div>
                          );
                        });
                      };

                      const isThirdWide = arrangedItemsForGroup.length >= 3 && itemIndex === 2;
                      const isTotemCard = item.name === 'Totem mágico';
                      const cardClassName = 'group flex h-full flex-1 flex-col gap-2 rounded-lg border border-pink-400/25 bg-slate-900/80 p-2 shadow-md shadow-pink-500/10 transition-transform duration-200 hover:-translate-y-1 hover:border-pink-400/70';

                      return (
                        <div
                          key={item.name}
                          ref={isTotemCard ? totemCardRef : null}
                          className={cardClassName}
                          style={isMobile && totemCardDimensions ? {
                            width: `${totemCardDimensions.width}px`,
                            height: `${totemCardDimensions.height}px`,
                            minWidth: `${totemCardDimensions.width}px`,
                            minHeight: `${totemCardDimensions.height}px`,
                          } : undefined}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex flex-wrap items-center gap-1">
                              {renderIconContent()}
                            </div>
                            <div className="flex-1 min-w-0">
                              {item.name === 'Bonificación de nivel' ? (
                                <h4 className="text-sm font-pixellari text-pink-200 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] leading-tight">
                                  Bonificacion<br/>de nivel
                                </h4>
                              ) : (
                                <h4 className="text-sm font-pixellari text-pink-200 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] truncate">{item.name}</h4>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-pink-100/90 leading-tight font-pixellari">
                            {isMobile && item.name === 'Cukie' 
                              ? item.description.replace(
                                  'Usa las teclas ASDW para moverte por la pantalla de juego.',
                                  'Usa el joystick que aparece al pulsar en pantalla para moverte.'
                                )
                              : item.description}
                          </p>
                          {item.details && (
                            <ul className="ml-3 list-disc space-y-0.5 text-[9px] text-pink-100/80 font-pixellari">
                              {item.name === 'Totem mágico' ? (
                                <div className="flex flex-wrap gap-2">
                                  {item.details.map(detail => (
                                    <span
                                      key={detail}
                                      className="rounded-full border border-pink-300/60 bg-pink-300/15 px-2 py-0.5 font-pixellari text-[10px] text-pink-100 shadow-sm shadow-pink-500/20"
                                    >
                                      {detail}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                item.details.map(detail => <li key={detail}>{detail}</li>)
                              )}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        {/* Indicadores fijos */}
        <div
          className="flex-shrink-0 flex items-center justify-center gap-2 py-3 bg-slate-900/50 border-t border-pink-400/30"
          onClick={event => event.stopPropagation()}
        >
          {infoGroups.map((_, index) => (
            <button
              key={`indicator-${index}`}
              onClick={() => {
                onPlaySound?.('button_click');
                setCurrentGroupIndex(index);
              }}
              className="h-2.5 w-2.5 rounded-full border-2 transition-all"
              style={{
                borderColor: index === currentGroupIndex ? 'rgb(244, 114, 182)' : 'rgba(236, 72, 153, 0.4)',
                backgroundColor: index === currentGroupIndex ? 'white' : 'rgba(236, 72, 153, 0.3)',
                boxShadow: index === currentGroupIndex ? '0 0 8px rgba(236,72,153,0.6)' : 'none',
                transform: index === currentGroupIndex ? 'scale(1.1)' : 'scale(1)',
              }}
              aria-label={`Ir al grupo ${index + 1}`}
            />
          ))}
        </div>
      </div>
    );
  }

  // Estructura original para escritorio
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4 py-6 overflow-y-auto"
      style={{ pointerEvents: 'auto' }}
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-5xl rounded-xl border border-pink-400/60 bg-slate-900/95 p-6 md:p-8 shadow-2xl shadow-pink-500/20"
        onClick={event => event.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-red-600/80 text-xl font-bold text-white shadow-lg transition-colors duration-200 hover:bg-red-500 focus:outline-none"
          aria-label="Cerrar información del juego"
        >
          ×
        </button>

        <div className="text-center mb-6">
          <h2 className="text-3xl font-pixellari text-pink-200 tracking-wide">Reglas de Treasure Hunt</h2>
        </div>

        <div className="flex items-stretch gap-4">
          <button
            onClick={handlePrevGroup}
            className="flex-shrink-0 self-center focus:outline-none transition-all duration-200 hover:scale-110 active:scale-95"
            aria-label="Grupo anterior"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-pink-400/60 bg-pink-500/20 shadow-lg shadow-pink-500/30 hover:border-pink-400 hover:bg-pink-500/30 hover:shadow-pink-500/50">
              <svg
                className="h-8 w-8 text-pink-200"
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

          <div className="flex-1 relative">
            {/* Renderizar todos los grupos ocultos para medir sus alturas */}
            {infoGroups.map((group, index) => {
              const arrangedItemsForGroup = arrangeGroupItems(group.items);

              return (
                <div
                  key={`hidden-${index}`}
                  ref={el => {
                    containerRefs.current[index] = el;
                  }}
                  className="rounded-xl border border-pink-400/40 bg-slate-800/70 p-4 md:p-6 shadow-lg shadow-pink-500/10"
                  style={{
                    position: index === currentGroupIndex ? 'relative' : 'absolute',
                    visibility: index === currentGroupIndex ? 'visible' : 'hidden',
                    top: 0,
                    left: 0,
                    right: 0,
                    minHeight: maxContainerHeight || undefined,
                  }}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] font-pixellari text-pink-300/70">Grupo {index + 1}</p>
                      <h3 className="text-2xl md:text-3xl font-pixellari text-pink-200">{group.title}</h3>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {arrangedItemsForGroup.map((item, itemIndex) => {
                      const images = Array.isArray(item.image) ? item.image : [item.image];
                      const imageAlts = Array.isArray(item.imageAlt) ? item.imageAlt : images.map(() => item.imageAlt);
                      const isTreasureItem = item.name === 'Tesoros';
                      const isRuneItem = item.name === 'Runas';
                      const isHakuItem = item.name === 'Haku';
                      const imagesToRender = (() => {
                        if (isTreasureItem) {
                          const imgIndex = treasureImagesLength > 0 ? treasureImageIndex % treasureImagesLength : 0;
                          return [images[imgIndex]];
                        }
                        if (isRuneItem) {
                          const imgIndex = runeImagesLength > 0 ? runeImageIndex % runeImagesLength : 0;
                          return [images[imgIndex]];
                        }
                        return images;
                      })();
                      const renderIconContent = () => {
                        if (item.name === 'Bonificación de nivel') {
                          return (
                            <div className="flex h-28 w-28 items-center justify-center rounded-lg bg-slate-800/60 p-2">
                              <svg
                                className="h-full w-full text-pink-400"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                viewBox="0 0 24 24"
                              >
                                <path d="M12 19V5M5 12l7-7 7 7" />
                              </svg>
                            </div>
                          );
                        }

                        return imagesToRender.map((src, imgIdx) => {
                          const originalIndex = (() => {
                            if (isTreasureItem && treasureImagesLength) {
                              return treasureImageIndex % treasureImagesLength;
                            }
                            if (isRuneItem && runeImagesLength) {
                              return runeImageIndex % runeImagesLength;
                            }
                            return imgIdx;
                          })();

                          return (
                            <div
                              key={`${item.name}-${originalIndex}`}
                              className="flex h-28 w-28 items-center justify-center rounded-lg bg-slate-800/60 p-2"
                            >
                              <Image
                                src={src}
                                alt={
                                  typeof imageAlts[originalIndex] === 'string'
                                    ? imageAlts[originalIndex]
                                    : item.name
                                }
                                width={448}
                                height={448}
                                quality={100}
                                unoptimized={false}
                                priority={false}
                                className="info-modal-img h-full w-full object-contain transition-opacity duration-500"
                              />
                            </div>
                          );
                        });
                      };

                      const isThirdWide = arrangedItemsForGroup.length >= 3 && itemIndex === 2;
                      const cardClassName = [
                        'group flex h-full flex-col gap-3 rounded-lg border border-pink-400/25 bg-slate-900/80 p-4 shadow-md shadow-pink-500/10 transition-transform duration-200 hover:-translate-y-1 hover:border-pink-400/70',
                        isThirdWide ? 'md:col-span-2 md:max-w-none' : '',
                        !isThirdWide && isHakuItem ? 'md:max-w-sm md:w-full md:mx-auto' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <div
                          key={item.name}
                          className={cardClassName}
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex flex-wrap items-center gap-2">
                              {renderIconContent()}
                            </div>
                            <div className="flex-1">
                              {item.name === 'Bonificación de nivel' ? (
                                <h4 className="text-xl font-pixellari text-pink-200 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] leading-tight">
                                  Bonificacion<br/>de nivel
                                </h4>
                              ) : (
                                <h4 className="text-xl font-pixellari text-pink-200 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]">{item.name}</h4>
                              )}
                            </div>
                          </div>
                          <p className="text-sm md:text-base text-pink-100/90 leading-snug font-pixellari">
                            {item.description}
                          </p>
                          {item.details && (
                            <ul className="ml-4 list-disc space-y-1 text-xs md:text-sm text-pink-100/80 font-pixellari">
                              {item.name === 'Totem mágico' ? (
                                <div className="flex flex-wrap gap-3">
                                  {item.details.map(detail => (
                                    <span
                                      key={detail}
                                      className="rounded-full border border-pink-300/60 bg-pink-300/15 px-4 py-1 font-pixellari text-sm text-pink-100 shadow-sm shadow-pink-500/20"
                                    >
                                      {detail}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                item.details.map(detail => <li key={detail}>{detail}</li>)
                              )}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleNextGroup}
            className="flex-shrink-0 self-center focus:outline-none transition-all duration-200 hover:scale-110 active:scale-95"
            aria-label="Grupo siguiente"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-pink-400/60 bg-pink-500/20 shadow-lg shadow-pink-500/30 hover:border-pink-400 hover:bg-pink-500/30 hover:shadow-pink-500/50">
              <svg
                className="h-8 w-8 text-pink-200"
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
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          {infoGroups.map((_, index) => (
            <button
              key={`indicator-${index}`}
              onClick={() => {
                onPlaySound?.('button_click');
                setCurrentGroupIndex(index);
              }}
              className={`h-3 w-3 rounded-full border-2 transition-all ${
                index === currentGroupIndex
                  ? 'border-pink-400 bg-white shadow-[0_0_8px_rgba(236,72,153,0.6)] scale-110'
                  : 'border-pink-500/40 bg-pink-500/30 hover:bg-pink-400/60'
              }`}
              aria-label={`Ir al grupo ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default InfoModal;
