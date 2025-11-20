"use client";

import React, { useEffect, useState } from 'react';
import { useIsMobile } from '../hooks/use-mobile';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Componente que muestra un popup para instalar la PWA en dispositivos móviles
 * Solo aparece cuando la app es instalable y el usuario está en móvil
 */
export default function InstallPrompt() {
  const isMobile = useIsMobile();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Verificar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Verificar si ya se rechazó anteriormente (localStorage)
    const installPromptDismissed = localStorage.getItem('install-prompt-dismissed');
    if (installPromptDismissed) {
      return;
    }

    // Escuchar el evento beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Solo mostrar si es móvil
      if (isMobile) {
        // Esperar un poco antes de mostrar para no ser intrusivo
        setTimeout(() => {
          setShowPrompt(true);
        }, 3000);
      }
    };

    // Escuchar cuando se instala la app
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isMobile]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Mostrar el prompt nativo
    deferredPrompt.prompt();

    // Esperar la respuesta del usuario
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowPrompt(false);
      setDeferredPrompt(null);
    } else {
      // Guardar que el usuario rechazó para no mostrar de nuevo
      localStorage.setItem('install-prompt-dismissed', 'true');
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('install-prompt-dismissed', 'true');
    setShowPrompt(false);
  };

  // No mostrar si ya está instalada, no es móvil, o no hay prompt disponible
  if (isInstalled || !isMobile || !showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full shadow-2xl">
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Icono de instalación */}
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
            >
              <path d="M12 2v20M2 12h20" />
            </svg>
          </div>

          {/* Título y mensaje */}
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">
              Instalar como App
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Instala Sybil Slayer en tu dispositivo para una mejor experiencia:
            </p>
            <ul className="text-slate-400 text-sm text-left space-y-1 mt-3">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>Pantalla completa sin barras del navegador</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>Acceso rápido desde el escritorio</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>Mejor rendimiento y experiencia</span>
              </li>
            </ul>
          </div>

          {/* Botones */}
          <div className="flex gap-3 w-full mt-2">
            <button
              onClick={handleDismiss}
              className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm font-medium"
            >
              Ahora no
            </button>
            <button
              onClick={handleInstallClick}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Instalar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

