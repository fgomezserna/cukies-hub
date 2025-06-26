import { useRef, useEffect, useCallback } from 'react';

type GameLoopCallback = (deltaTime: number, isPaused: boolean) => void;

export function useGameLoop(callback: GameLoopCallback, fps: number = 60, isPaused: boolean = false) {
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();
  const interval = 1000 / fps; // Intervalo target en ms

  const loop = useCallback((time: number) => {
    if (previousTimeRef.current !== undefined) {
      const deltaTime = time - previousTimeRef.current;
      
      // Solo ejecutar el callback si ha pasado suficiente tiempo (limitación de FPS)
      // pero siempre pasar el deltaTime real transcurrido
      if (deltaTime >= interval) {
        // Pasar 0 como deltaTime si está pausado, para pausar todas las actualizaciones basadas en deltaTime
        const effectiveDeltaTime = isPaused ? 0 : deltaTime;
        callback(effectiveDeltaTime, isPaused);
        previousTimeRef.current = time - (deltaTime % interval); // Ajustar para evitar drift
      }
    } else {
      previousTimeRef.current = time; // Inicializar en el primer frame
    }
    
    requestRef.current = requestAnimationFrame(loop);
  }, [callback, interval, isPaused]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      previousTimeRef.current = undefined; // Reset time on unmount/restart
    };
  }, [loop]);
}
