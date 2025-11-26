"use client";

import { useEffect } from 'react';
import InstallPrompt from './install-prompt';

/**
 * Componente que registra el Service Worker y muestra el prompt de instalación
 */
export default function PWASetup() {
  useEffect(() => {
    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('Service Worker registrado:', registration.scope);
          })
          .catch((error) => {
            console.log('Error al registrar Service Worker:', error);
          });
      });
    }

    // Intentar forzar orientación landscape si está disponible
    if ('screen' in window && 'orientation' in window.screen) {
      const lockOrientation = async () => {
        try {
          // Screen Orientation API
          if ('orientation' in screen && 'lock' in screen.orientation) {
            await (screen.orientation as any).lock('landscape').catch(() => {
              // Ignorar errores si no se puede bloquear
            });
          }
        } catch (error) {
          // Ignorar errores
        }
      };

      // Solo intentar bloquear si la app está instalada (standalone mode)
      if (window.matchMedia('(display-mode: standalone)').matches) {
        lockOrientation();
      }
    }
  }, []);

  return <InstallPrompt />;
}

