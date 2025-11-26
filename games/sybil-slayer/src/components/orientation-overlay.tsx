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

  // Estilos CSS para la animación de rotación del dispositivo
  const animationStyles = `
    @keyframes rotateDevice {
      0% {
        transform: rotate(0deg);
      }
      50% {
        transform: rotate(90deg);
      }
      100% {
        transform: rotate(90deg);
      }
    }

    .device-icon-rotate {
      animation: rotateDevice 2s ease-in-out infinite;
      transform-origin: center center;
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm px-6 text-center">
        <div className="flex flex-col items-center gap-6 max-w-md">
          {/* Icono de dispositivo con animación de rotación */}
          <div className="device-icon-rotate">
            <svg
              width="120"
              height="200"
              viewBox="0 0 120 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-white"
            >
              {/* Teléfono en vertical */}
              <rect
                x="20"
                y="10"
                width="80"
                height="180"
                rx="12"
                fill="currentColor"
                opacity="0.9"
              />
              {/* Pantalla */}
              <rect
                x="30"
                y="30"
                width="60"
                height="140"
                rx="4"
                fill="#0f172a"
              />
              {/* Botón home (círculo) */}
              <circle
                cx="60"
                cy="185"
                r="6"
                fill="currentColor"
                opacity="0.6"
              />
            </svg>
          </div>

          {/* Mensaje */}
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-white">
              Gira tu dispositivo
            </h2>
            <p className="text-lg text-slate-300">
              Este juego solo se puede jugar en modo horizontal.
              Por favor, rota tu dispositivo para continuar.
            </p>
          </div>

          {/* Indicador visual de rotación */}
          <div className="flex items-center gap-2 text-slate-400">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            <span className="text-sm">Rotando...</span>
          </div>
        </div>
      </div>
    </>
  );
}

