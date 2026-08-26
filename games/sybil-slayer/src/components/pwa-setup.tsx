"use client";

import { useEffect } from 'react';
import InstallPrompt from './install-prompt';
import { gamePublicPath, gameServiceWorkerScope } from '@/lib/public-path';

/**
 * Componente que registra el Service Worker y muestra el prompt de instalación
 */
export default function PWASetup() {
  useEffect(() => {
    let removePendingRegistration: (() => void) | undefined;

    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      const cacheVersion = encodeURIComponent(
        process.env.NEXT_PUBLIC_GAME_CACHE_VERSION ?? 'dev',
      );
      const registerServiceWorker = () => {
        void navigator.serviceWorker
          .register(`${gamePublicPath('/sw.js')}?v=${cacheVersion}`, {
            scope: gameServiceWorkerScope(),
          })
          .then((registration) => {
            console.log('Service Worker registrado:', registration.scope);
          })
          .catch((error) => {
            console.log('Error al registrar Service Worker:', error);
          });
      };

      if (document.readyState === 'complete') {
        registerServiceWorker();
      } else {
        window.addEventListener('load', registerServiceWorker, { once: true });
        removePendingRegistration = () => {
          window.removeEventListener('load', registerServiceWorker);
        };
      }
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

    return removePendingRegistration;
  }, []);

  return <InstallPrompt />;
}
