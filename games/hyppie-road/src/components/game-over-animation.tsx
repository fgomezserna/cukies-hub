'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { GameResult } from '@/types/game';
import { useAudio } from '@/hooks/useAudio';

interface GameOverAnimationProps {
  result: GameResult;
  betAmount: number;
  onReturnToMenu: () => void;
}

export function GameOverAnimation({ result, betAmount, onReturnToMenu }: GameOverAnimationProps) {
  const [showHippie, setShowHippie] = useState(false);
  const { playSound, stopMusic } = useAudio();

  useEffect(() => {
    // La música de Game Over ya se reproduce desde hyppie-road-game.tsx
    // No necesitamos reproducirla aquí para evitar duplicación
    
    // Mostrar hippie después de 600ms
    const hippieTimer = setTimeout(() => {
      setShowHippie(true);
    }, 600);

    // CLEANUP: Detener TODA la música cuando el componente se desmonte
    return () => {
      clearTimeout(hippieTimer);
      
      console.log('🔇 CLEANUP: Componente GameOverAnimation desmontándose - Deteniendo TODA la música...');
      try {
        // Buscar y detener TODOS los elementos de audio en el DOM
        const allAudioElements = document.querySelectorAll('audio');
        let stoppedCount = 0;
        
        allAudioElements.forEach((audio, index) => {
          console.log(`🎵 CLEANUP Audio ${index}: src=${audio.src}, paused=${audio.paused}`);
          if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
            stoppedCount++;
            console.log(`🔇 ✅ CLEANUP Audio detenido: ${index}`);
          }
        });
        
        console.log(`🔇 ✅ CLEANUP Detenidos ${stoppedCount} audios en total`);
      } catch (error) {
        console.error('❌ CLEANUP Error deteniendo audios:', error);
      }
    };
  }, []);

  const handleReturnToMenu = () => {
    console.log('🎮 handleReturnToMenu called (Game Over)');
    
    // DETENER DIRECTAMENTE el audio de gameover_road
    console.log('🔇 Deteniendo gameover_road DIRECTAMENTE desde el botón...');
    try {
      // Buscar y detener TODOS los elementos de audio que contengan "gameover-road"
      const allAudioElements = document.querySelectorAll('audio');
      let stoppedCount = 0;
      
      allAudioElements.forEach((audio, index) => {
        console.log(`🎵 Audio ${index}: src=${audio.src}, paused=${audio.paused}`);
        if (audio.src && audio.src.includes('gameover-road')) {
          console.log(`🎵 Encontrado gameover-road en audio ${index}!`);
          if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
            stoppedCount++;
            console.log(`🔇 ✅ Audio gameover-road detenido: ${index}`);
          }
        }
      });
      
      if (stoppedCount === 0) {
        console.log('🔇 ⚠️ No se encontraron audios gameover-road reproduciéndose');
      } else {
        console.log(`🔇 ✅ Detenidos ${stoppedCount} audios gameover-road`);
      }
    } catch (error) {
      console.error('❌ Error deteniendo audio directamente:', error);
    }
    
    // Reproducir sonido del botón
    console.log('🔊 Intentando reproducir sonido del botón OK...');
    try {
      playSound('button_click');
      console.log('✅ Sonido botón reproducido exitosamente');
    } catch (error) {
      console.error('❌ Error reproduciendo sonido del botón:', error);
    }
    
    // Llamar a onReturnToMenu después de un pequeño delay
    setTimeout(() => {
      onReturnToMenu();
    }, 50);
  };

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/20"
    >
      {/* Contenedor principal con caja pixel art */}
      <div className="relative max-w-2xl mx-auto px-4 animate-fade-in">
          
          {/* Efecto de caída del hippie - relativo a la caja */}
          {showHippie && (
            <div 
              className="absolute top-0 -right-24 z-20 pointer-events-none"
            >
              <div 
                className="hippie-falling"
                style={{
                  width: '280px',
                  height: '280px',
                  backgroundImage: 'url(/assets/images/hippie_fall.png)',
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  imageRendering: 'pixelated'
                }}
              />
            </div>
          )}
        {/* Caja principal usando asset PNG */}
        <div 
          className="relative px-16 py-12 w-full max-w-xl min-h-[400px] flex flex-col items-center justify-between"
          style={{
            backgroundImage: 'url(/assets/images/box_game_over.png)',
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated'
          }}
        >
          {/* Título Game Over */}
          <div className="text-center space-y-6 pt-8">
            <h1 
              className="text-6xl md:text-8xl font-bold text-red-400 pixellari-title"
              style={{ 
                textShadow: '4px 4px 0px rgba(139, 0, 0, 0.8)'
              }}
            >
              GAME OVER
            </h1>

            {/* Mensaje de pérdida */}
            <div className="pixellari-title text-xl md:text-2xl text-white space-y-2">
              <p>You stepped on a trap!</p>
              <p 
                className="text-red-400 text-2xl md:text-3xl font-bold"
                style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.8)' }}
              >
                LOST: ${betAmount.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Botón OK dentro de la caja */}
          <div className="pb-8">
            <Button 
              onClick={handleReturnToMenu}
              onMouseDown={() => {
                // Reproducir sonido también en mouseDown para mayor garantía
                console.log('🔊 Sonido Game Over desde mouseDown');
                playSound('button_click');
              }}
              disableSound={true}
              className="game-over-button pixellari-title text-2xl px-12 py-4 border-none text-white font-bold hover:scale-105 transition-transform"
              style={{
                minWidth: '250px',
                height: '70px',
                textShadow: '2px 2px 0px rgba(0,0,0,0.8)'
              }}
            >
              OK
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
} 