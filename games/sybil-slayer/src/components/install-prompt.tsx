"use client";

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../hooks/use-mobile';
import { TreasureButton, TreasurePanel } from './treasure-hunt-ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallDebugInfo {
  readonly serviceWorker?: { readonly registered?: boolean; [key: string]: unknown };
  readonly manifest?: { readonly exists?: boolean; [key: string]: unknown };
}

type InstallRuntime = 'detecting' | 'embedded' | 'standalone';

/**
 * Verifica si la app está instalada usando múltiples métodos de detección
 * @returns Promise<boolean> - true si la app está instalada
 */
async function checkIfAppInstalled(): Promise<boolean> {
  // 1. Verificar display-mode (standalone, fullscreen, minimal-ui)
  const standaloneMode = window.matchMedia('(display-mode: standalone)').matches;
  const fullscreenMode = window.matchMedia('(display-mode: fullscreen)').matches;
  const minimalUIMode = window.matchMedia('(display-mode: minimal-ui)').matches;
  
  if (standaloneMode || fullscreenMode || minimalUIMode) {
    console.log('[INSTALL] App detectada por display-mode:', { standaloneMode, fullscreenMode, minimalUIMode });
    return true;
  }

  // 2. Verificar window.navigator.standalone (iOS específico)
  if ((window.navigator as any).standalone === true) {
    console.log('[INSTALL] App detectada por navigator.standalone (iOS)');
    return true;
  }

  // 3. Verificar flag en localStorage
  const installedFlag = localStorage.getItem('app-installed');
  if (installedFlag === 'true') {
    console.log('[INSTALL] App detectada por flag en localStorage');
    return true;
  }

  // 4. Verificar navigator.getInstalledRelatedApps() (API moderna)
  if ('getInstalledRelatedApps' in navigator) {
    try {
      const apps = await (navigator as any).getInstalledRelatedApps();
      if (apps && apps.length > 0) {
        console.log('[INSTALL] App detectada por getInstalledRelatedApps():', apps);
        return true;
      }
    } catch (error) {
      console.warn('[INSTALL] Error al verificar getInstalledRelatedApps():', error);
    }
  }

  return false;
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
  const [debugInfo, setDebugInfo] = useState<InstallDebugInfo>({});
  const [showManualInstall, setShowManualInstall] = useState(false);
  const [stageRoot, setStageRoot] = useState<HTMLElement | null>(null);
  const [gameShellActive, setGameShellActive] = useState(false);
  const [runtime, setRuntime] = useState<InstallRuntime>('detecting');
  const promptTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    try {
      setRuntime(window.self === window.top ? 'standalone' : 'embedded');
    } catch {
      setRuntime('embedded');
    }
  }, []);

  useEffect(() => {
    if (runtime !== 'standalone') return;

    const syncStageRoot = () => {
      const stage = document.querySelector<HTMLElement>('.th-stage');
      setStageRoot(stage);
      setGameShellActive(Boolean(stage?.querySelector('.th-game-shell')));
    };
    syncStageRoot();
    const observer = new MutationObserver(syncStageRoot);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [runtime]);

  useEffect(() => {
    if (runtime !== 'standalone') return;

    // Listener para cambios en display-mode (debe estar siempre activo)
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const fullscreenQuery = window.matchMedia('(display-mode: fullscreen)');
    const minimalUIQuery = window.matchMedia('(display-mode: minimal-ui)');

    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        console.log('[INSTALL] Display mode cambió a modo app, ocultando prompt');
        setIsInstalled(true);
        setShowPrompt(false);
        setDeferredPrompt(null);
        localStorage.setItem('app-installed', 'true');
        
        // Cancelar cualquier timeout pendiente
        if (promptTimeoutRef.current) {
          clearTimeout(promptTimeoutRef.current);
          promptTimeoutRef.current = null;
        }
      }
    };

    // Agregar listeners (usando addEventListener si está disponible, sino addListener)
    if (standaloneQuery.addEventListener) {
      standaloneQuery.addEventListener('change', handleDisplayModeChange);
      fullscreenQuery.addEventListener('change', handleDisplayModeChange);
      minimalUIQuery.addEventListener('change', handleDisplayModeChange);
    } else {
      // Fallback para navegadores antiguos
      (standaloneQuery as any).addListener(handleDisplayModeChange);
      (fullscreenQuery as any).addListener(handleDisplayModeChange);
      (minimalUIQuery as any).addListener(handleDisplayModeChange);
    }

    // Verificar si la app está instalada usando múltiples métodos
    const checkInstallation = async () => {
      const installed = await checkIfAppInstalled();
      if (installed) {
        setIsInstalled(true);
        console.log('[INSTALL] App ya está instalada, no se mostrará el prompt');
        return true;
      }
      return false;
    };

    // Verificar instalación de forma síncrona primero (métodos rápidos)
    const standaloneMode = window.matchMedia('(display-mode: standalone)').matches;
    const fullscreenMode = window.matchMedia('(display-mode: fullscreen)').matches;
    const minimalUIMode = window.matchMedia('(display-mode: minimal-ui)').matches;
    const iosStandalone = (window.navigator as any).standalone === true;
    const installedFlag = localStorage.getItem('app-installed') === 'true';

    if (standaloneMode || fullscreenMode || minimalUIMode || iosStandalone || installedFlag) {
      setIsInstalled(true);
      console.log('[INSTALL] App detectada (método rápido), no se mostrará el prompt');
      // Retornar cleanup solo con los listeners de display-mode
      return () => {
        if (standaloneQuery.removeEventListener) {
          standaloneQuery.removeEventListener('change', handleDisplayModeChange);
          fullscreenQuery.removeEventListener('change', handleDisplayModeChange);
          minimalUIQuery.removeEventListener('change', handleDisplayModeChange);
        } else {
          (standaloneQuery as any).removeListener(handleDisplayModeChange);
          (fullscreenQuery as any).removeListener(handleDisplayModeChange);
          (minimalUIQuery as any).removeListener(handleDisplayModeChange);
        }
      };
    }

    // Verificar métodos asíncronos
    checkInstallation().then((installed) => {
      if (installed) {
        // Si se detecta instalación, cancelar cualquier timeout pendiente
        if (promptTimeoutRef.current) {
          clearTimeout(promptTimeoutRef.current);
          promptTimeoutRef.current = null;
        }
        setShowPrompt(false);
        return;
      }

      // Respetar el rechazo del usuario entre sesiones. El aviso solo vuelve a
      // aparecer si se limpia explícitamente el almacenamiento del navegador.
    });

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
    const handleBeforeInstallPrompt = async (e: Event) => {
      console.log('[INSTALL] ✅ Evento beforeinstallprompt recibido!', e);
      e.preventDefault();
      
      // Verificar instalación ANTES de guardar el deferredPrompt
      const installed = await checkIfAppInstalled();
      if (installed) {
        console.log('[INSTALL] App ya está instalada, ignorando beforeinstallprompt');
        setIsInstalled(true);
        return;
      }
      
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Solo mostrar si es móvil y NO está instalada
      if (isMobile && !isInstalled) {
        console.log('[INSTALL] Dispositivo móvil detectado, verificando instalación antes de mostrar prompt');
        
        // Cancelar timeout anterior si existe
        if (promptTimeoutRef.current) {
          clearTimeout(promptTimeoutRef.current);
        }
        
        // Esperar un poco antes de mostrar para no ser intrusivo
        promptTimeoutRef.current = setTimeout(async () => {
          // Verificar de nuevo ANTES de mostrar (puede haber cambiado durante la espera)
          const stillInstalled = await checkIfAppInstalled();
          if (stillInstalled) {
            console.log('[INSTALL] App instalada durante la espera, cancelando prompt');
            setIsInstalled(true);
            setShowPrompt(false);
            setDeferredPrompt(null);
            return;
          }
          
          // Verificar el estado actual antes de mostrar
          // Usamos una función de callback para obtener el estado más reciente
          setShowPrompt(prevShow => {
            // Verificar una vez más antes de mostrar
            const currentStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                                     window.matchMedia('(display-mode: fullscreen)').matches ||
                                     window.matchMedia('(display-mode: minimal-ui)').matches ||
                                     (window.navigator as any).standalone === true ||
                                     localStorage.getItem('app-installed') === 'true';
            
            if (currentStandalone) {
              console.log('[INSTALL] App detectada justo antes de mostrar, cancelando');
              setIsInstalled(true);
              setDeferredPrompt(null);
              return false;
            }
            
            console.log('[INSTALL] Mostrando prompt de instalación');
            return true;
          });
        }, 3000);
      } else {
        console.log('[INSTALL] No es dispositivo móvil o app ya instalada, no se mostrará el prompt');
      }
    };

    // Escuchar cuando se instala la app
    const handleAppInstalled = () => {
      console.log('[INSTALL] ✅ App instalada exitosamente');
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      
      // Cancelar cualquier timeout pendiente
      if (promptTimeoutRef.current) {
        clearTimeout(promptTimeoutRef.current);
        promptTimeoutRef.current = null;
      }
      
      // Guardar flag en localStorage para detectar instalación incluso desde navegador
      localStorage.setItem('app-installed', 'true');
    };

    // Timeout para detectar si el evento nunca llega (3 segundos)
    const timeoutId = setTimeout(() => {
      const stillDismissed = localStorage.getItem('install-prompt-dismissed');
      if (!deferredPrompt && isMobile && !isInstalled && !stillDismissed) {
        console.warn('[INSTALL] ⚠️ beforeinstallprompt no recibido después de 3 segundos');
        console.warn('[INSTALL] Esto puede deberse a:');
        console.warn('  - Criterios de engagement del navegador no cumplidos');
        console.warn('  - Service Worker no registrado correctamente');
        console.warn('  - Manifest con problemas');
        console.warn('  - Primera visita (el navegador requiere visitas previas)');
        
        // Mostrar opción manual inmediatamente si no hay prompt
        console.log('[INSTALL] Mostrando opción de instalación manual');
        setShowManualInstall(true);
      }
    }, 3000);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Log inicial
    console.log('[INSTALL] Inicializando install prompt:', {
      isMobile,
      isStandalone: standaloneMode,
      installPromptDismissed: false, // Ya lo limpiamos arriba si no está instalada
      userAgent: navigator.userAgent,
    });

    return () => {
      clearTimeout(timeoutId);
      // Cancelar el timeout del prompt si existe
      if (promptTimeoutRef.current) {
        clearTimeout(promptTimeoutRef.current);
        promptTimeoutRef.current = null;
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      
      // Limpiar listeners de display-mode
      if (standaloneQuery.removeEventListener) {
        standaloneQuery.removeEventListener('change', handleDisplayModeChange);
        fullscreenQuery.removeEventListener('change', handleDisplayModeChange);
        minimalUIQuery.removeEventListener('change', handleDisplayModeChange);
      } else {
        (standaloneQuery as any).removeListener(handleDisplayModeChange);
        (fullscreenQuery as any).removeListener(handleDisplayModeChange);
        (minimalUIQuery as any).removeListener(handleDisplayModeChange);
      }
    };
  }, [runtime, isMobile, deferredPrompt, isInstalled]);

  // Efecto para cancelar el timeout si isInstalled cambia a true
  useEffect(() => {
    if (isInstalled && promptTimeoutRef.current) {
      console.log('[INSTALL] App instalada detectada, cancelando timeout del prompt');
      clearTimeout(promptTimeoutRef.current);
      promptTimeoutRef.current = null;
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  }, [isInstalled]);

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

  // La instalación pertenece a la app independiente, nunca al juego embebido
  // dentro del Hub, donde el aviso roba espacio útil y no instala el contenedor.
  if (runtime !== 'standalone' || isInstalled) {
    return null;
  }

  if (!stageRoot || gameShellActive) return null;

  const dismissManualInstall = () => {
    localStorage.setItem('install-prompt-dismissed', 'true');
    setShowManualInstall(false);
  };

  return createPortal(
    <>
      {isMobile && showPrompt && deferredPrompt && !isInstalled && (
        <div className="th-overlay th-overlay--critical" data-install-prompt>
          <TreasurePanel className="th-dialog th-dialog--small" role="dialog" aria-modal="true" aria-labelledby="install-game-title">
            <p className="th-screen-kicker">Acceso rápido</p>
            <h2 id="install-game-title" className="th-overlay-title">Instalar Treasure Hunt</h2>
            <p className="th-dialog-copy">
              Añade el juego a tu dispositivo para abrirlo a pantalla completa y acceder desde el inicio.
            </p>
            <div className="th-dialog-actions">
              <TreasureButton variant="secondary" size="small" onClick={handleDismiss}>Ahora no</TreasureButton>
              <TreasureButton size="small" onClick={handleInstallClick}>Instalar</TreasureButton>
            </div>
          </TreasurePanel>
        </div>
      )}

      {isMobile && showManualInstall && !deferredPrompt && !isInstalled && (
        <TreasurePanel className="th-install-toast" role="status" data-install-prompt>
          <div>
            <strong>¿Instalar el juego?</strong>
            <span>Ábrelo a pantalla completa desde tu dispositivo.</span>
          </div>
          <TreasureButton size="small" onClick={handleManualInstall}>Ver cómo</TreasureButton>
          <button type="button" className="th-close-button" onClick={dismissManualInstall} aria-label="Cerrar aviso de instalación">×</button>
        </TreasurePanel>
      )}
    </>,
    stageRoot,
  );
}
