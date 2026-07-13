"use client";

import Image from 'next/image';
import React from 'react';

import type { TreasureHuntMultiplayerEntryState } from '../lib/multiplayer-feature';
import {
  OrnamentalDivider,
  TreasureButton,
  TreasurePanel,
  joinClasses,
} from './treasure-hunt-ui';

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

const cardStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  minWidth: 0,
  minHeight: 430,
  flexDirection: 'column',
  overflow: 'hidden',
  padding: '22px 24px 20px',
  color: 'var(--th-cream)',
  border: '1px solid rgba(215, 163, 67, 0.55)',
  background:
    'linear-gradient(165deg, rgba(12, 52, 47, 0.96), rgba(3, 20, 18, 0.98) 66%)',
  clipPath:
    'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)',
  transition: 'border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',
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
        : 'Partida de prueba sin ranking ni recompensas.';
  const highlightedMode = hoveredMode ?? defaultMode;

  React.useEffect(() => {
    if (!open) {
      setHoveredMode(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="th-modal-layer"
      onClick={onClose}
      role="presentation"
    >
      <TreasurePanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="treasure-mode-title"
        onClick={event => event.stopPropagation()}
        style={{
          display: 'flex',
          width: 1004,
          height: 696,
          flexDirection: 'column',
          padding: '26px 30px 28px',
        }}
      >
        <header
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'start',
            gap: 24,
          }}
        >
          <div aria-hidden="true" />
          <div style={{ textAlign: 'center' }}>
            <p className="th-screen-kicker" style={{ marginBottom: 2 }}>
              Elige tu desafío
            </p>
            <h2
              id="treasure-mode-title"
              className="th-screen-title"
              style={{ fontSize: 38, lineHeight: '44px' }}
            >
              Selecciona modo de juego
            </h2>
            <p
              style={{
                margin: '5px 0 0',
                color: 'var(--th-cream-muted)',
                font: "600 15px/21px var(--th-font-ui)",
              }}
            >
              Misma caza. Dos formas de conquistar el tesoro.
            </p>
          </div>
          <button
            type="button"
            className="th-close-button"
            onClick={onClose}
            aria-label="Cerrar selector de modo"
            style={{ justifySelf: 'end' }}
          >
            ×
          </button>
        </header>

        <div style={{ margin: '18px 6px 20px' }}>
          <OrnamentalDivider />
        </div>

        <div
          style={{
            display: 'grid',
            minHeight: 0,
            flex: 1,
            gridTemplateColumns: '1fr 1fr',
            gap: 18,
          }}
        >
          <section
            className="th-mode-card"
            aria-labelledby="single-mode-title"
            onMouseEnter={() => setHoveredMode('single')}
            onMouseLeave={() => setHoveredMode(null)}
            onFocus={() => setHoveredMode('single')}
            onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setHoveredMode(null);
              }
            }}
            style={{
              ...cardStyle,
              borderColor:
                highlightedMode === 'single' ? 'var(--th-teal)' : 'rgba(215, 163, 67, 0.55)',
              boxShadow:
                highlightedMode === 'single'
                  ? 'inset 0 0 40px rgba(33, 221, 212, 0.08), 0 0 24px rgba(33, 221, 212, 0.13)'
                  : 'inset 0 0 28px rgba(33, 221, 212, 0.025)',
              transform: highlightedMode === 'single' ? 'translateY(-2px)' : 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 18,
              }}
            >
              <div>
                <span
                  style={{
                    color: 'var(--th-teal)',
                    font: "800 15px/20px var(--th-font-ui)",
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  Modo clásico
                </span>
                <h3
                  id="single-mode-title"
                  style={{
                    margin: '2px 0 0',
                    color: 'var(--th-cream)',
                    font: "800 34px/40px Georgia, 'Times New Roman', serif",
                    textTransform: 'uppercase',
                  }}
                >
                  {modeCopy.single.title}
                </h3>
              </div>
              <span
                aria-hidden="true"
                style={{
                  display: 'grid',
                  width: 54,
                  height: 54,
                  placeItems: 'center',
                  flex: '0 0 auto',
                  color: 'var(--th-cream)',
                  font: "800 22px/1 var(--th-font-ui)",
                  border: '2px solid var(--th-teal)',
                  background: 'rgba(33, 221, 212, 0.12)',
                  transform: 'rotate(45deg)',
                }}
              >
                <span style={{ transform: 'rotate(-45deg)' }}>1P</span>
              </span>
            </div>

            <div
              style={{
                position: 'relative',
                display: 'grid',
                height: 174,
                placeItems: 'center',
                margin: '6px 0 2px',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  width: 230,
                  height: 130,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(33, 221, 212, 0.18), transparent 68%)',
                }}
              />
              <Image
                src="/assets/characters/1p.png"
                alt="Personaje del modo para un jugador"
                width={300}
                height={300}
                quality={100}
                style={{
                  position: 'relative',
                  width: 190,
                  height: 180,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 16px 14px rgba(0, 0, 0, 0.62))',
                }}
              />
            </div>

            <p
              style={{
                minHeight: 44,
                margin: '0 4px 14px',
                color: 'var(--th-cream-muted)',
                font: "600 15px/22px var(--th-font-ui)",
                textAlign: 'center',
              }}
            >
              {modeCopy.single.description}
            </p>

            <TreasureButton
              variant="primary"
              size="medium"
              fullWidth
              onClick={() => onSelectMode('single')}
            >
              Jugar solo
            </TreasureButton>
          </section>

          <section
            className="th-mode-card"
            aria-labelledby="multiplayer-mode-title"
            onMouseEnter={() => setHoveredMode('multiplayer')}
            onMouseLeave={() => setHoveredMode(null)}
            onFocus={() => setHoveredMode('multiplayer')}
            onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setHoveredMode(null);
              }
            }}
            style={{
              ...cardStyle,
              borderColor:
                highlightedMode === 'multiplayer'
                  ? 'var(--th-teal)'
                  : 'rgba(215, 163, 67, 0.55)',
              boxShadow:
                highlightedMode === 'multiplayer'
                  ? 'inset 0 0 40px rgba(33, 221, 212, 0.08), 0 0 24px rgba(33, 221, 212, 0.13)'
                  : 'inset 0 0 28px rgba(33, 221, 212, 0.025)',
              transform: highlightedMode === 'multiplayer' ? 'translateY(-2px)' : 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 18,
              }}
            >
              <div>
                <span
                  style={{
                    color: multiplayerInteractive ? 'var(--th-teal)' : 'var(--th-gold-light)',
                    font: "800 15px/20px var(--th-font-ui)",
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  1 contra 1 · staging
                </span>
                <h3
                  id="multiplayer-mode-title"
                  style={{
                    margin: '2px 0 0',
                    color: 'var(--th-cream)',
                    font: "800 34px/40px Georgia, 'Times New Roman', serif",
                    textTransform: 'uppercase',
                  }}
                >
                  {modeCopy.multiplayer.title}
                </h3>
              </div>
              <span
                aria-hidden="true"
                style={{
                  display: 'grid',
                  width: 54,
                  height: 54,
                  placeItems: 'center',
                  flex: '0 0 auto',
                  color: 'var(--th-cream)',
                  font: "800 22px/1 var(--th-font-ui)",
                  border: `2px solid ${multiplayerInteractive ? 'var(--th-teal)' : 'var(--th-gold)'}`,
                  background: multiplayerInteractive
                    ? 'rgba(33, 221, 212, 0.12)'
                    : 'rgba(215, 163, 67, 0.1)',
                  transform: 'rotate(45deg)',
                }}
              >
                <span style={{ transform: 'rotate(-45deg)' }}>2P</span>
              </span>
            </div>

            <div
              style={{
                position: 'relative',
                display: 'grid',
                height: 174,
                placeItems: 'center',
                margin: '6px 0 2px',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  width: 270,
                  height: 130,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(215, 163, 67, 0.14), transparent 70%)',
                }}
              />
              <Image
                src="/assets/characters/vs.png"
                alt="Dos personajes preparados para un duelo"
                width={600}
                height={300}
                quality={100}
                className={joinClasses(!multiplayerInteractive && 'opacity-60')}
                style={{
                  position: 'relative',
                  width: 310,
                  height: 168,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 16px 14px rgba(0, 0, 0, 0.62))',
                }}
              />
            </div>

            <div style={{ minHeight: 58, margin: '0 4px 0', textAlign: 'center' }}>
              <p
                style={{
                  margin: 0,
                  color: 'var(--th-cream-muted)',
                  font: "700 15px/20px var(--th-font-ui)",
                }}
              >
                {multiplayerDescription}
              </p>
              <span
                style={{
                  color: 'var(--th-gold-light)',
                  font: "650 12px/18px var(--th-font-ui)",
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {modeCopy.multiplayer.description}
              </span>
            </div>

            <TreasureButton
              data-testid="treasure-hunt-multiplayer-mode"
              data-multiplayer-entry={multiplayerEntryState}
              variant={multiplayerInteractive ? 'secondary' : 'quiet'}
              size="medium"
              fullWidth
              disabled={!multiplayerInteractive}
              onClick={() => multiplayerInteractive && onSelectMode('multiplayer')}
            >
              {multiplayerActionCopy}
            </TreasureButton>
          </section>
        </div>

        {onRulesClick ? (
          <button
            type="button"
            onClick={onRulesClick}
            style={{
              alignSelf: 'center',
              marginTop: 16,
              color: 'var(--th-gold-light)',
              font: "650 14px/20px var(--th-font-ui)",
              letterSpacing: '0.08em',
              textDecoration: 'underline',
              textDecorationColor: 'rgba(215, 163, 67, 0.48)',
              textUnderlineOffset: 5,
              textTransform: 'uppercase',
            }}
          >
            Consultar reglas y controles
          </button>
        ) : null}
      </TreasurePanel>
    </div>
  );
};

export type { GameMode };
export default ModeSelectModal;
