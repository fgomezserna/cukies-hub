"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { SoundType } from '@/hooks/useAudio';

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
          'Aparece cuando se está acabando el tiempo. Recógelo para sumar 30 segundos al contador y continuar tu partida.',
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
          'Al completar un nivel, los segundos del contador se multiplicarán x5 y se sumarán a tu puntuación.',
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

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, onPlaySound }) => {
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [treasureImageIndex, setTreasureImageIndex] = useState(0);
  const [runeImageIndex, setRuneImageIndex] = useState(0);
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [maxContainerHeight, setMaxContainerHeight] = useState<number>(0);

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

  const currentGroup = infoGroups[currentGroupIndex];
  const arrangedItems = useMemo(() => {
    const items = [...currentGroup.items];
    if (items.length >= 3) {
      let longestIndex = 0;
      let longestLength = -Infinity;
      items.forEach((item, index) => {
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
        const [longestItem] = items.splice(longestIndex, 1);
        items.splice(2, 0, longestItem);
      }
    }
    return items;
  }, [currentGroup]);

  useEffect(() => {
    if (!isOpen) {
      setMaxContainerHeight(0);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const heights = containerRefs.current
        .map(ref => ref?.getBoundingClientRect().height ?? 0)
        .filter(height => height > 0);
      if (heights.length > 0) {
        const largest = Math.max(...heights);
        setMaxContainerHeight(prev => (largest > prev ? largest : prev));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, currentGroupIndex, arrangedItems]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4 py-6"
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

          <div className="flex-1">
            <div
              ref={el => {
                containerRefs.current[currentGroupIndex] = el;
              }}
              className="rounded-xl border border-pink-400/40 bg-slate-800/70 p-4 md:p-6 shadow-lg shadow-pink-500/10"
              style={maxContainerHeight ? { minHeight: maxContainerHeight } : undefined}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] font-pixellari text-pink-300/70">Grupo {currentGroupIndex + 1}</p>
                  <h3 className="text-2xl md:text-3xl font-pixellari text-pink-200">{currentGroup.title}</h3>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {arrangedItems.map((item, index) => {
                  const images = Array.isArray(item.image) ? item.image : [item.image];
                  const imageAlts = Array.isArray(item.imageAlt) ? item.imageAlt : images.map(() => item.imageAlt);
                  const isTreasureItem = item.name === 'Tesoros';
                  const isRuneItem = item.name === 'Runas';
                  const isHakuItem = item.name === 'Haku';
                  const imagesToRender = (() => {
                    if (isTreasureItem) {
                      const index =
                        treasureImagesLength > 0 ? treasureImageIndex % treasureImagesLength : 0;
                      return [images[index]];
                    }
                    if (isRuneItem) {
                      const index = runeImagesLength > 0 ? runeImageIndex % runeImagesLength : 0;
                      return [images[index]];
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

                    return imagesToRender.map((src, index) => {
                      const originalIndex = (() => {
                        if (isTreasureItem && treasureImagesLength) {
                          return treasureImageIndex % treasureImagesLength;
                        }
                        if (isRuneItem && runeImagesLength) {
                          return runeImageIndex % runeImagesLength;
                        }
                        return index;
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

                  const isThirdWide = arrangedItems.length >= 3 && index === 2;
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
                          <h4 className="text-xl font-pixellari text-pink-200 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]">{item.name}</h4>
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
