"use client";

import Image from 'next/image';
import React, { useEffect, useMemo, useState } from 'react';
import { SoundType } from '@/hooks/useAudio';
import { TreasureButton, TreasurePanel } from './treasure-hunt-ui';

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
  shortTitle: string;
  icon: string;
  tagline: string;
  items: InfoGroupItem[];
}

const infoGroups: InfoGroup[] = [
  {
    title: 'Ítems principales',
    shortTitle: 'Esenciales',
    icon: '◆',
    tagline: 'Aprende lo básico para sobrevivir en el reino Cukie.',
    items: [
      {
        name: 'Cukie',
        description:
          '¡El héroe más dulce del reino! Usa WASD o los controles táctiles para moverte. Consigue la mayor puntuación posible antes de que se acabe el tiempo o pierdas las 3 vidas.',
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
    title: 'Suma puntos',
    shortTitle: 'Puntuación',
    icon: '✦',
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
          'Aparecen en bloques de 3 y tendrás que ser rápido. Si no los recoges en unos segundos, desaparecen.',
        details: [
          'Bonificación progresiva por cada bloque de 3 recogido: 25, 50, 75 puntos, y así sucesivamente.',
        ],
        image: [
          '/assets/collectibles/tesoro.png',
          '/assets/collectibles/tesoro2.png',
          '/assets/collectibles/tesoro3.png',
        ],
        imageAlt: ['Tesoro dorado', 'Tesoro púrpura', 'Tesoro verde'],
      },
    ],
  },
  {
    title: 'Power ups',
    shortTitle: 'Power ups',
    icon: '⚡',
    tagline: 'Activa ventajas temporales que cambian el curso de la partida.',
    items: [
      {
        name: 'Cofre',
        description: 'Concede uno de estos poderes durante 10-15 segundos:',
        details: [
          'Doble de gemas y monedas en pantalla.',
          'Las gemas se convierten en monedas.',
          'Puntos x5 en gemas y monedas.',
        ],
        image: '/assets/collectibles/vault.png',
        imageAlt: 'Cofre mágico',
      },
      {
        name: 'Piel de Goat',
        description:
          'Aparece cada vez que pasas de nivel. Tienes 3 segundos para eliminar a los duendes que toques y 3 segundos más sin recibir daño de ellos.',
        image: '/assets/collectibles/goatskin.png',
        imageAlt: 'Piel de Goat',
      },
      {
        name: 'Haku',
        description: 'Este espíritu amigo aumenta tu velocidad x2 durante 7 segundos.',
        image: '/assets/collectibles/haku.png',
        imageAlt: 'Haku, espíritu amigo',
      },
    ],
  },
  {
    title: 'Niveles y tótem',
    shortTitle: 'Niveles',
    icon: '△',
    tagline: 'Completa el tótem y escala multiplicadores de puntos.',
    items: [
      {
        name: 'Runas',
        description:
          'Necesitas las 5 runas diferentes para completar el tótem mágico. También dan puntos: la primera 5, la segunda 10, la tercera 15 y así sucesivamente.',
        image: [
          '/assets/collectibles/runa_chef_2.png',
          '/assets/collectibles/runa_engineer_2.png',
          '/assets/collectibles/runa_farmer_2.png',
          '/assets/collectibles/runa_gatherer_2.png',
          '/assets/collectibles/runa_miner_2.png',
        ],
        imageAlt: ['Runa Chef', 'Runa Engineer', 'Runa Farmer', 'Runa Gatherer', 'Runa Miner'],
      },
      {
        name: 'Tótem mágico',
        description:
          'Cuando lo completas avanzas al siguiente nivel y aumentan los puntos al recoger gemas, monedas y runas.',
        details: ['Nivel 2: x2', 'Nivel 3: x3', 'Nivel 4: x4', 'Nivel 5: x5'],
        image: '/assets/totem/totemlateral.png',
        imageAlt: 'Tótem mágico completo',
      },
      {
        name: 'Bonificación de nivel',
        description:
          'Al completar un nivel, los segundos que queden en el reloj se multiplican x5 y se suman a tu puntuación.',
        image: '/assets/collectibles/watch_sand.png',
        imageAlt: 'Reloj de arena mágico',
      },
    ],
  },
  {
    title: 'Enemigos y peligros',
    shortTitle: 'Peligros',
    icon: '☠',
    tagline: 'Evita perder vidas manteniéndote lejos de las amenazas.',
    items: [
      {
        name: 'Duende',
        description:
          'Cada golpe de un duende te hace perder 1 vida. Al principio parece sencillo, pero se irán multiplicando.',
        image: '/assets/characters/malvado1.png',
        imageAlt: 'Duende enemigo',
      },
      {
        name: 'Rayos',
        description:
          'Aparecen en bloques de 3. Observa sus avisos luminosos y aléjate: si uno te alcanza perderás 1 vida.',
        image: '/assets/effects/rayos_reglas.png',
        imageAlt: 'Rayos peligrosos',
      },
      {
        name: 'Zonas de barro',
        description:
          'No te dañan directamente, pero si las pisas te moverás más lento. Eso puede dejarte expuesto ante otros peligros.',
        image: '/assets/obstacles/arenasmovedizas2.png',
        imageAlt: 'Zona de barro',
      },
    ],
  },
  {
    title: 'Reglas del modo 1v1',
    shortTitle: 'Modo 1v1',
    icon: '⚔',
    tagline: 'Dos jugadores, un mismo tiempo oficial y una única puntuación ganadora.',
    items: [
      {
        name: 'Duelo de puntuación',
        description:
          'Compite por conseguir más puntos que tu rival antes de que termine la partida. El resultado final muestra la puntuación oficial de ambos jugadores.',
        image: '/assets/characters/1p.png',
        imageAlt: 'Jugador local de Treasure Hunt',
      },
      {
        name: 'Marcador compartido',
        description:
          'El HUD muestra tus puntos, los puntos del rival, el tiempo oficial y la ventaja actual. Durante un duelo no se puede pausar ni reiniciar la partida.',
        image: '/assets/characters/2p.png',
        imageAlt: 'Jugador rival de Treasure Hunt',
      },
      {
        name: 'Desempate y conexión',
        description:
          'Un empate puede activar la muerte súbita. Si la conexión se interrumpe, espera en la pantalla de reconexión hasta que la partida confirme si puede continuar.',
        image: '/assets/characters/vs.png',
        imageAlt: 'Emblema versus del modo multijugador',
      },
    ],
  },
];

function getActiveMedia(
  item: InfoGroupItem,
  treasureImageIndex: number,
  runeImageIndex: number,
) {
  const images = Array.isArray(item.image) ? item.image : [item.image];
  const alts = Array.isArray(item.imageAlt) ? item.imageAlt : [item.imageAlt];
  const requestedIndex = item.name === 'Tesoros'
    ? treasureImageIndex
    : item.name === 'Runas'
      ? runeImageIndex
      : 0;
  const index = requestedIndex % images.length;

  return {
    src: images[index],
    alt: alts[index] ?? alts[0] ?? item.name,
  };
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, onPlaySound }) => {
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [treasureImageIndex, setTreasureImageIndex] = useState(0);
  const [runeImageIndex, setRuneImageIndex] = useState(0);
  const currentGroup = useMemo(() => infoGroups[currentGroupIndex], [currentGroupIndex]);

  const selectGroup = (index: number) => {
    onPlaySound?.('button_click');
    setCurrentGroupIndex(index);
  };

  const handleClose = () => {
    onPlaySound?.('button_click');
    setCurrentGroupIndex(0);
    setTreasureImageIndex(0);
    setRuneImageIndex(0);
    onClose();
  };

  const handlePrevious = () => {
    selectGroup((currentGroupIndex - 1 + infoGroups.length) % infoGroups.length);
  };

  const handleNext = () => {
    selectGroup((currentGroupIndex + 1) % infoGroups.length);
  };

  useEffect(() => {
    if (!isOpen) {
      setCurrentGroupIndex(0);
      setTreasureImageIndex(0);
      setRuneImageIndex(0);
      return;
    }

    const treasureDurations = [2000, 2000, 5000];
    const treasureTimeout = window.setTimeout(() => {
      setTreasureImageIndex(previous => (previous + 1) % 3);
    }, treasureDurations[treasureImageIndex % treasureDurations.length]);

    return () => {
      window.clearTimeout(treasureTimeout);
    };
  }, [isOpen, treasureImageIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const runeTimeout = window.setTimeout(() => {
      setRuneImageIndex(previous => (previous + 1) % 5);
    }, 2000);

    return () => window.clearTimeout(runeTimeout);
  }, [isOpen, runeImageIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onPlaySound?.('button_click');
      onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, onPlaySound]);

  if (!isOpen) return null;

  return (
    <div className="th-modal-layer" role="presentation" onClick={handleClose}>
      <div
        className="th-rules-layout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="treasure-hunt-rules-title"
        onClick={event => event.stopPropagation()}
      >
        <nav className="th-rules-rail" aria-label="Categorías de reglas" role="tablist">
          {infoGroups.map((group, index) => (
            <button
              key={group.title}
              type="button"
              className="th-rules-tab"
              role="tab"
              aria-selected={index === currentGroupIndex}
              aria-controls="treasure-hunt-rules-panel"
              tabIndex={index === currentGroupIndex ? 0 : -1}
              onClick={() => selectGroup(index)}
            >
              <span aria-hidden="true">{group.icon}</span>
              <span>{group.shortTitle}</span>
            </button>
          ))}
        </nav>

        <TreasurePanel
          id="treasure-hunt-rules-panel"
          className="th-rules-panel"
          role="tabpanel"
        >
          <header className="th-rules-header">
            <div>
              <p className="th-screen-kicker">Manual del explorador</p>
              <h2 id="treasure-hunt-rules-title" className="th-screen-title">
                {currentGroup.title}
              </h2>
              <p>{currentGroup.tagline}</p>
            </div>
            <button
              type="button"
              className="th-close-button"
              onClick={handleClose}
              aria-label="Cerrar reglas"
            >
              ×
            </button>
          </header>

          <div className="th-rule-grid">
            {currentGroup.items.map(item => {
              const media = getActiveMedia(item, treasureImageIndex, runeImageIndex);

              return (
                <article className="th-rule-card" key={item.name}>
                  <div className="th-rule-card__media">
                    <Image
                      src={media.src}
                      alt={media.alt}
                      width={172}
                      height={172}
                      className="info-modal-img"
                    />
                  </div>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    {item.details ? (
                      <ul>
                        {item.details.map(detail => <li key={detail}>{detail}</li>)}
                      </ul>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          <footer className="th-rules-footer">
            <TreasureButton variant="quiet" size="small" onClick={handlePrevious}>
              ← Anterior
            </TreasureButton>
            <div className="th-rules-dots" aria-label={`Sección ${currentGroupIndex + 1} de ${infoGroups.length}`}>
              {infoGroups.map((group, index) => (
                <span
                  key={group.title}
                  className={`th-rules-dot${index === currentGroupIndex ? ' th-rules-dot--active' : ''}`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <TreasureButton variant="quiet" size="small" onClick={handleNext}>
              Siguiente →
            </TreasureButton>
          </footer>
        </TreasurePanel>
      </div>
    </div>
  );
};

export default InfoModal;
