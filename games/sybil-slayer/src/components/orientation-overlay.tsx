"use client";

import React from 'react';
import { useIsMobile } from '../hooks/use-mobile';
import { useOrientation } from '../hooks/use-orientation';

/**
 * Overlay que se muestra cuando el dispositivo está en modo vertical (portrait)
 * Indica al usuario que debe rotar el dispositivo a horizontal para jugar
 */
export default function OrientationOverlay() {
  const isMobile = useIsMobile();
  const isPortrait = useOrientation();

  // Solo mostrar en móviles y cuando está en portrait
  if (!isMobile || !isPortrait) {
    return null;
  }

  return (
    <div className="th-orientation" role="dialog" aria-modal="true" aria-labelledby="orientation-title">
      <div className="th-orientation__frame">
        <p className="th-orientation__brand">Cukies World · Treasure Hunt</p>
        <div className="th-orientation__device" aria-hidden="true">
          <span />
        </div>
        <p className="th-orientation__kicker">Vista de juego</p>
        <h2 id="orientation-title">Gira tu dispositivo</h2>
        <p className="th-orientation__copy">
          Treasure Hunt mantiene una proporción horizontal fija para que el mapa y los controles
          sean iguales en todas las pantallas.
        </p>
        <div className="th-orientation__hint" aria-live="polite">
          <span aria-hidden="true">↻</span>
          <strong>Usa el modo horizontal</strong>
        </div>
      </div>
    </div>
  );
}
