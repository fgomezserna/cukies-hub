import { useEffect, RefObject } from 'react';

// Define los tipos de mensajes que se pueden intercambiar
type MessagePayload = {
  type: 'AUTH_STATE_CHANGED';
  payload: {
    isAuthenticated: boolean;
    user: any;
    token?: string;
  };
};

const TARGET_ORIGIN = process.env.NODE_ENV === 'production' 
  ? 'https://hyppie-road.vercel.app' // Dominio del juego en producción
  : 'http://localhost:9003';

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
    if (iframeRef.current && authData.isAuthenticated) {
      const message: MessagePayload = {
        type: 'AUTH_STATE_CHANGED',
        payload: authData,
      };
      // Esperamos a que el iframe esté cargado para enviar el mensaje
      iframeRef.current.onload = () => {
        iframeRef.current?.contentWindow?.postMessage(message, TARGET_ORIGIN);
      };
    }
  }, [iframeRef, authData]);
} 