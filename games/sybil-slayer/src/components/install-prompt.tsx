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
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showManualInstall, setShowManualInstall] = useState(false);

  useEffect(() => {
    // Verificar si ya está instalada
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) {
      setIsInstalled(true);
      console.log('[INSTALL] App ya está instalada (standalone mode)');
      return;
    }

    // Verificar si ya se rechazó anteriormente (localStorage)
    const installPromptDismissed = localStorage.getItem('install-prompt-dismissed');
    if (installPromptDismissed) {
      console.log('[INSTALL] Prompt ya fue rechazado anteriormente');
      return;
    }

    // Verificar Service Worker
    const checkServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          const swInfo = {
            supported: true,
            registered: !!registration,
            scope: registration?.scope,
            active: !!registration?.active,
            installing: !!registration?.installing,
            waiting: !!registration?.waiting,
          };
          console.log('[INSTALL] Service Worker status:', swInfo);
          setDebugInfo(prev => ({ ...prev, serviceWorker: swInfo }));
        } catch (error) {
          console.error('[INSTALL] Error checking Service Worker:', error);
        }
      } else {
        console.warn('[INSTALL] Service Worker no soportado');
        setDebugInfo(prev => ({ ...prev, serviceWorker: { supported: false } }));
      }
    };

    // Verificar Manifest
    const checkManifest = async () => {
      try {
        const response = await fetch('/manifest.json');
        if (response.ok) {
          const manifest = await response.json();
          const manifestInfo = {
            exists: true,
            hasName: !!manifest.name || !!manifest.short_name,
            hasIcons: Array.isArray(manifest.icons) && manifest.icons.length > 0,
            hasStartUrl: !!manifest.start_url,
            hasDisplay: !!manifest.display,
            displayMode: manifest.display,
          };
          console.log('[INSTALL] Manifest status:', manifestInfo);
          setDebugInfo(prev => ({ ...prev, manifest: manifestInfo }));
        } else {
          console.error('[INSTALL] Manifest no encontrado');
          setDebugInfo(prev => ({ ...prev, manifest: { exists: false } }));
        }
      } catch (error) {
        console.error('[INSTALL] Error checking manifest:', error);
      }
    };

    checkServiceWorker();
    checkManifest();

    // Escuchar el evento beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('[INSTALL] ✅ Evento beforeinstallprompt recibido!', e);
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Solo mostrar si es móvil
      if (isMobile) {
        console.log('[INSTALL] Dispositivo móvil detectado, mostrando prompt en 3 segundos');
        // Esperar un poco antes de mostrar para no ser intrusivo
        setTimeout(() => {
          setShowPrompt(true);
        }, 3000);
      } else {
        console.log('[INSTALL] No es dispositivo móvil, no se mostrará el prompt');
      }
    };

    // Escuchar cuando se instala la app
    const handleAppInstalled = () => {
      console.log('[INSTALL] ✅ App instalada exitosamente');
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    // Timeout para detectar si el evento nunca llega
    const timeoutId = setTimeout(() => {
      const stillDismissed = localStorage.getItem('install-prompt-dismissed');
      if (!deferredPrompt && isMobile && !isInstalled && !stillDismissed) {
        console.warn('[INSTALL] ⚠️ beforeinstallprompt no recibido después de 10 segundos');
        console.warn('[INSTALL] Esto puede deberse a:');
        console.warn('  - Criterios de engagement del navegador no cumplidos');
        console.warn('  - Service Worker no registrado correctamente');
        console.warn('  - Manifest con problemas');
        console.warn('  - Primera visita (el navegador requiere visitas previas)');
        
        // Mostrar opción manual después de 15 segundos si no hay prompt
        setTimeout(() => {
          const stillDismissed2 = localStorage.getItem('install-prompt-dismissed');
          if (!deferredPrompt && !isInstalled && !stillDismissed2) {
            console.log('[INSTALL] Mostrando opción de instalación manual');
            setShowManualInstall(true);
          }
        }, 5000);
      }
    }, 10000);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Log inicial
    console.log('[INSTALL] Inicializando install prompt:', {
      isMobile,
      isStandalone,
      installPromptDismissed: !!installPromptDismissed,
      userAgent: navigator.userAgent,
    });

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isMobile, deferredPrompt, isInstalled]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      console.warn('[INSTALL] No hay deferredPrompt disponible');
      return;
    }

    console.log('[INSTALL] Usuario hizo click en instalar');
    // Mostrar el prompt nativo
    deferredPrompt.prompt();

    // Esperar la respuesta del usuario
    const { outcome } = await deferredPrompt.userChoice;

    console.log('[INSTALL] Usuario eligió:', outcome);
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
    console.log('[INSTALL] Usuario rechazó el prompt');
    localStorage.setItem('install-prompt-dismissed', 'true');
    setShowPrompt(false);
  };

  const handleManualInstall = () => {
    // Instrucciones para instalación manual
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    if (isIOS) {
      alert('Para instalar en iOS:\n1. Toca el botón de compartir\n2. Selecciona "Añadir a pantalla de inicio"');
    } else if (isAndroid) {
      alert('Para instalar en Android:\n1. Toca el menú (3 puntos) del navegador\n2. Selecciona "Instalar app" o "Añadir a pantalla de inicio"');
    } else {
      alert('Para instalar:\n1. Busca el ícono de instalación en la barra de direcciones\n2. O usa el menú del navegador');
    }
  };

  // No mostrar si ya está instalada
  if (isInstalled) {
    return null;
  }

  // Mostrar información de debug en desarrollo
  const isDev = process.env.NODE_ENV === 'development';
  const showDebug = isDev && debugInfo;

  return (
    <>
      {/* Debug info en desarrollo */}
      {showDebug && (
        <div className="fixed bottom-4 left-4 z-[100] bg-black/80 text-white text-xs p-3 rounded max-w-xs">
          <div className="font-bold mb-2">🔍 Debug Install Prompt</div>
          <div className="space-y-1">
            <div>Mobile: {isMobile ? '✅' : '❌'}</div>
            <div>SW: {debugInfo.serviceWorker?.registered ? '✅' : '❌'}</div>
            <div>Manifest: {debugInfo.manifest?.exists ? '✅' : '❌'}</div>
            <div>Prompt: {deferredPrompt ? '✅' : '⏳'}</div>
          </div>
        </div>
      )}

      {/* Prompt automático */}
      {isMobile && showPrompt && deferredPrompt && (
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
      )}

      {/* Opción manual si el prompt automático no aparece */}
      {isMobile && showManualInstall && !deferredPrompt && !isInstalled && (
        <div className="fixed bottom-4 right-4 z-[90] bg-slate-900 border border-slate-700 rounded-lg p-4 max-w-xs shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-white font-medium text-sm mb-1">
                ¿Quieres instalar la app?
              </div>
              <div className="text-slate-400 text-xs">
                Toca para ver instrucciones
              </div>
            </div>
            <button
              onClick={handleManualInstall}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Instalar
            </button>
            <button
              onClick={() => setShowManualInstall(false)}
              className="text-slate-400 hover:text-slate-300"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}

