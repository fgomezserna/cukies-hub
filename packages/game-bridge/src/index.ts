import { useEffect, useState, RefObject } from 'react';

// 1. Define los tipos de mensajes que se pueden intercambiar
// Esto asegura que ambos lados (dapp y juego) hablen el mismo "idioma".
type MessagePayload = {
  type: 'AUTH_STATE_CHANGED';
  payload: {
    isAuthenticated: boolean;
    user: any; // Se puede tipar más estrictamente si se comparte el tipo de usuario
    token?: string;
  };
};

const TARGET_ORIGIN = process.env.NODE_ENV === 'production' 
  ? 'https://your-production-dapp-domain.com' // TODO: Reemplazar con el dominio de producción
  : 'http://localhost:3000';

/**
 * Hook para ser usado en la DApp (el contenedor padre).
 * Envía mensajes al iframe del juego.
 * @param iframeRef - Ref al elemento iframe del juego.
 * @param authData - Datos de autenticación para enviar al juego.
 */
export function useParentConnection(
  iframeRef: RefObject<HTMLIFrameElement>,
  authData: { isAuthenticated: boolean; user: any; token?: string }
) {
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !authData.isAuthenticated) return;

    const message: MessagePayload = {
      type: 'AUTH_STATE_CHANGED',
      payload: authData,
    };

    const sendMessage = () => {
      iframe.contentWindow?.postMessage(message, TARGET_ORIGIN);
    };

    if (iframe.contentWindow) {
      // Si el iframe ya está cargado, enviamos el mensaje inmediatamente
      sendMessage();
    } else {
      // Si aún no está cargado, esperamos al evento load
      iframe.addEventListener('load', sendMessage, { once: true });
      return () => iframe.removeEventListener('load', sendMessage);
    }
  }, [iframeRef, authData]);
}

/**
 * Hook para ser usado en el Juego (dentro del iframe).
 * Escucha los mensajes de la DApp y devuelve el estado de autenticación.
 */
export function useChildConnection() {
  const [auth, setAuth] = useState<{
    isAuthenticated: boolean;
    user: any;
    token?: string;
  }>({
    isAuthenticated: false,
    user: null,
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent<MessagePayload>) => {
      // Medida de seguridad: solo aceptar mensajes del origen esperado
      if (event.origin !== TARGET_ORIGIN) {
        console.warn(`Message from unexpected origin ${event.origin} was ignored.`);
        return;
      }
      
      if (event.data.type === 'AUTH_STATE_CHANGED') {
        setAuth(event.data.payload);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return auth;
} 