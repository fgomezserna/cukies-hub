"use client";

import React, { useState } from 'react';
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
    title: 'Exploración Esencial',
    tagline: 'Aprende lo básico para sobrevivir en el reino Cukie.',
    items: [
      {
        name: 'Cukie',
        description: 'El héroe más dulce del reino. Mantén el ritmo para esquivar peligros y sumar puntos.',
        details: [
          'Usa las teclas ASDW para moverte por la pantalla.',
          'Consigue la mayor puntuación posible antes de que se acabe el tiempo o pierdas las 3 vidas.',
        ],
        image: '/assets/characters/cukiesprites/south/cukie_walk_s_06.png',
        imageAlt: 'Cukie, el héroe del juego',
      },
      {
        name: 'Checkpoint',
        description: 'Un salvavidas temporal que aparece cuando el reloj aprieta.',
        details: ['Recógelo para sumar 30 segundos al contador y continuar tu partida.'],
        image: '/assets/collectibles/checkpointcukies.png',
        imageAlt: 'Checkpoint brillante',
      },
      {
        name: 'Corazón',
        description: 'La dulzura que recupera tu energía.',
        details: [
          'Si has perdido una vida, la recuperas al instante.',
          'Si tus vidas están completas, obtienes puntos crecientes: +20, +40, +60 y así sucesivamente.',
        ],
        image: '/assets/collectibles/corazoncukies.png',
        imageAlt: 'Corazón de Cukie',
      },
    ],
  },
  {
    title: 'Tesoro Dulce',
    tagline: 'Colecciona objetos brillantes para disparar tu marcador.',
    items: [
      {
        name: 'Gemas',
        description: 'Las más codiciadas por los Cukies. ¡Brillan en todas partes!',
        details: ['Cada gema otorga 1 punto inmediato.'],
        image: '/assets/collectibles/gemas.png',
        imageAlt: 'Gemas resplandecientes',
      },
      {
        name: 'Monedas',
        description: 'Escasas pero poderosas. No las dejes escapar.',
        details: ['Cada moneda suma 5 puntos a tu marcador.'],
        image: '/assets/collectibles/uki.png',
        imageAlt: 'Moneda Uki',
      },
      {
        name: 'Tesoros',
        description: 'El botín más deseado aparece en bloques de tres. ¡Sé rápido!',
        details: [
          'Si no los recoges en unos segundos, desaparecen.',
          'Bonificación progresiva: 25, 50, 75 puntos y sigue aumentando por cada bloque consecutivo completado.',
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
    title: 'Poderes y Aliados',
    tagline: 'Activa ventajas temporales que cambian el curso de la partida.',
    items: [
      {
        name: 'Cofre',
        description: 'Un artefacto raro que concede un poder temporal de 10-15 segundos.',
        details: [
          'Doble cantidad de gemas y UKIs en pantalla.',
          'Transforma las gemas en UKIs.',
          'Multiplicador x5 en los puntos de gemas y UKIs.',
        ],
        image: '/assets/collectibles/vault.png',
        imageAlt: 'Cofre mágico',
      },
      {
        name: 'Haku',
        description: 'El espíritu amigo acelera tu recorrido.',
        details: ['Duplica tu velocidad durante 7 segundos.'],
        image: '/assets/collectibles/haku.png',
        imageAlt: 'Haku espíritu amigo',
      },
      {
        name: 'Piel de Goat',
        description: 'El poder del GOAT se activa cada vez que subes de nivel.',
        details: [
          'Durante 3 segundos eliminas a todos los duendes que toques.',
          'Durante 3 segundos adicionales eres invulnerable a los duendes.',
        ],
        image: '/assets/collectibles/goatskin.png',
        imageAlt: 'Piel de Goat',
      },
    ],
  },
  {
    title: 'Ascenso del Tótem',
    tagline: 'Completa el tótem y escala multiplicadores de puntos.',
    items: [
      {
        name: 'Runas',
        description: 'Necesitas las 5 runas diferentes para alimentar el tótem mágico.',
        details: [
          'Otorgan puntos escalonados en cada nivel: +5, +10, +15, +20 y +25.',
          'Colecciónalas todas para avanzar de nivel.',
        ],
        image: [
          '/assets/collectibles/runa_chef.png',
          '/assets/collectibles/runa_engineer.png',
          '/assets/collectibles/runa_farmer.png',
          '/assets/collectibles/runa_gatherer.png',
          '/assets/collectibles/runa_miner.png',
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
        name: 'Tótem mágico',
        description: 'Cuando completas el tótem accedes a un nuevo nivel con mejores multiplicadores.',
        details: [
          'Nivel 2: puntos x2',
          'Nivel 3: puntos x3',
          'Nivel 4: puntos x4',
          'Nivel 5: puntos x5',
        ],
        image: '/assets/totem/totemlateral.png',
        imageAlt: 'Tótem mágico completo',
      },
      {
        name: 'Bonificación de nivel',
        description: 'El tiempo restante nunca se desperdicia.',
        details: ['Al completar un nivel, los segundos que quedan se multiplican por 5 y se suman a tu puntuación.'],
        image: '/assets/collectibles/watch_sand.png',
        imageAlt: 'Reloj de arena mágico',
      },
    ],
  },
  {
    title: 'Peligros en el Camino',
    tagline: 'Evita perder vidas manteniéndote lejos de las amenazas.',
    items: [
      {
        name: 'Duende',
        description: 'Siempre al acecho y cada vez más numeroso.',
        details: ['Cada golpe de un duende te hace perder 1 vida.'],
        image: '/assets/characters/malvado3.png',
        imageAlt: 'Duende enemigo',
      },
      {
        name: 'Rayos',
        description: 'Surgen en bloques de tres. Observa sus avisos luminosos y mantente fuera de su alcance.',
        details: ['Si un rayo te alcanza, pierdes 1 vida.'],
        image: '/assets/effects/damagecukie.png',
        imageAlt: 'Impacto de rayo',
      },
      {
        name: 'Zonas de Barro',
        description: 'Parecen inofensivas, pero frenan tu avance.',
        details: ['Si las pisas te moverás más lento, lo que te deja vulnerable a otros peligros.'],
        image: '/assets/obstacles/arenasmovedizas2.png',
        imageAlt: 'Zona de barro',
      },
    ],
  },
];

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, onPlaySound }) => {
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);

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
    onClose();
  };

  if (!isOpen) return null;

  const currentGroup = infoGroups[currentGroupIndex];

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
          <h2 className="text-3xl font-pixellari text-pink-200 tracking-wide">Guía del Reino Cukie</h2>
          <p className="mt-2 text-sm font-pixellari text-pink-200/80">
            Desliza con las flechas para descubrir cada elemento del juego.
          </p>
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
            <div className="rounded-xl border border-pink-400/40 bg-slate-800/70 p-4 md:p-6 shadow-lg shadow-pink-500/10">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] font-pixellari text-pink-300/70">Grupo {currentGroupIndex + 1}</p>
                  <h3 className="text-2xl md:text-3xl font-pixellari text-pink-200">{currentGroup.title}</h3>
                </div>
                <p className="text-xs md:text-sm font-pixellari text-pink-200/70 text-left md:text-right max-w-md">
                  {currentGroup.tagline}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentGroup.items.map(item => {
                  const images = Array.isArray(item.image) ? item.image : [item.image];
                  const imageAlts = Array.isArray(item.imageAlt) ? item.imageAlt : images.map(() => item.imageAlt);

                  return (
                    <div
                      key={item.name}
                      className="group flex h-full flex-col gap-3 rounded-lg border border-pink-400/25 bg-slate-900/80 p-4 shadow-md shadow-pink-500/10 transition-transform duration-200 hover:-translate-y-1 hover:border-pink-400/70"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.name === 'Bonificación de nivel' ? (
                            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-800/60 p-1">
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
                          ) : (
                            images.map((src, index) => (
                              <div
                                key={`${item.name}-${index}`}
                                className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-800/60 p-1"
                              >
                                <Image
                                  src={src}
                                  alt={typeof imageAlts[index] === 'string' ? imageAlts[index] : item.name}
                                  width={224}
                                  height={224}
                                  quality={100}
                                  unoptimized={false}
                                  priority={false}
                                  className="info-modal-img h-full w-full object-contain"
                                />
                              </div>
                            ))
                          )}
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
                          {item.details.map(detail => (
                            <li key={detail}>{detail}</li>
                          ))}
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
