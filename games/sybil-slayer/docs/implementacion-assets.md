# Guía de Implementación de Assets en Token Runner

Este documento describe cómo implementar los assets gráficos PNG en el juego Token Runner, reemplazando las formas geométricas actuales.

## Pasos para la Implementación

1. Colocar todos los archivos PNG en las carpetas adecuadas:
   - `/public/assets/characters/`
   - `/public/assets/obstacles/`
   - `/public/assets/collectibles/`
   - `/public/assets/effects/`
   - `/public/assets/ui/`

2. Integrar el sistema de carga de assets (`assetLoader.ts`) en el juego

3. Modificar el componente `GameCanvas` para usar imágenes en lugar de dibujar formas

4. Actualizar los tipos y constantes para incluir información sobre los assets

## Ejemplo de Implementación

### 1. Modificación de `GameCanvas.tsx`

```tsx
"use client";

import React, { useRef, useEffect } from 'react';
import type { GameState, Token, Obstacle, Collectible } from '@/types/game';
import { FRENZY_MODE_START_SECONDS } from '@/lib/constants';
import { assetLoader, drawAsset } from '@/lib/assetLoader';

interface GameCanvasProps {
  gameState: GameState;
  width: number;
  height: number;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Función para dibujar un objeto usando su asset correspondiente
  const drawObject = (ctx: CanvasRenderingContext2D, obj: Token | Obstacle | Collectible) => {
     // Determinar qué asset usar basado en el tipo de objeto
     let assetKey: string;
     
     if ('type' in obj) {
       if (obj.type === 'fee') assetKey = 'fee';
       else if (obj.type === 'bug') assetKey = 'bug';
       else if (obj.type === 'hacker') assetKey = 'hacker';
       else if (obj.type === 'energy') assetKey = 'energy';
       else if (obj.type === 'megaNode') assetKey = 'megaNode';
       else assetKey = 'token'; // Fallback
     } else {
       assetKey = 'token'; // Si es un token
     }
     
     // Aplicar efectos si es necesario
     if (obj.glow) {
       ctx.shadowBlur = 15;
       ctx.shadowColor = obj.color || 'white';
     } else {
       ctx.shadowBlur = 0;
     }
     
     // Dibujar el asset
     drawAsset(
       ctx, 
       assetKey as any, // Cast necesario hasta actualizar los tipos
       obj.x, 
       obj.y, 
       obj.radius * 2, // Ancho = diámetro
       obj.radius * 2, // Alto = diámetro
       'rotation' in obj ? obj.rotation : 0 // Aplicar rotación si existe
     );
     
     // Resetear sombra
     ctx.shadowBlur = 0;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Dibujar el fondo con grid
    ctx.strokeStyle = 'hsl(var(--border) / 0.3)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Dibujar todos los objetos del juego
    gameState.collectibles.forEach(collectible => drawObject(ctx, collectible));
    gameState.obstacles.forEach(obstacle => drawObject(ctx, obstacle));
    
    // Dibujar el token del jugador
    if (gameState.token) {
      drawObject(ctx, gameState.token);
      
      // Añadir efecto visual de boost si está activo
      if (gameState.token.boostTimer > 0) {
        drawAsset(
          ctx, 
          'boost' as any, // Cast necesario hasta actualizar los tipos
          gameState.token.x, 
          gameState.token.y, 
          gameState.token.radius * 2.5, 
          gameState.token.radius * 2.5
        );
      }
    }

    // --- Dibujar elementos de UI ---
    
    // Puntuación y tiempo usando los iconos
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '24px Geist Mono';
    
    // Mostrar icono de puntuación + valor
    drawAsset(ctx, 'scoreIcon' as any, 25, 25, 30, 30);
    ctx.fillStyle = 'hsl(var(--foreground))';
    ctx.fillText(`${gameState.score}`, 45, 25);
    
    // Mostrar icono de tiempo + valor
    const timerColor = gameState.timer <= FRENZY_MODE_START_SECONDS ? 
      'hsl(var(--destructive))' : 'hsl(var(--foreground))';
    drawAsset(ctx, 'timerIcon' as any, width - 60, 25, 30, 30);
    ctx.fillStyle = timerColor;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(gameState.timer)}`, width - 80, 25);

    // Indicador de modo Frenzy
    if (gameState.isFrenzyMode) {
      drawAsset(ctx, 'frenzy' as any, width / 2, 50, 100, 40);
    }

    // Pantallas de estado
    if (gameState.status === 'gameOver') {
      drawAsset(ctx, 'gameOver' as any, width / 2, height / 2, width * 0.8, height * 0.6);
      
      // Texto de puntuación final
      ctx.textAlign = 'center';
      ctx.fillStyle = 'white';
      ctx.font = '24px Geist Mono';
      ctx.fillText(`Final Score: ${gameState.score}`, width / 2, height / 2 + 20);
      ctx.fillText('Press SPACE to Restart', width / 2, height / 2 + 60);
    }

    if (gameState.status === 'idle') {
      drawAsset(ctx, 'startScreen' as any, width / 2, height / 2, width * 0.8, height * 0.6);
    }

    if (gameState.status === 'paused') {
      drawAsset(ctx, 'paused' as any, width / 2, height / 2, width * 0.6, height * 0.4);
    }

  }, [gameState, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="block border border-border rounded-lg shadow-lg"
    />
  );
};

export default GameCanvas;
```

### 2. Actualización de `GameContainer.tsx`

Es necesario precargar los assets antes de iniciar el juego:

```tsx
// En GameContainer.tsx
import { useEffect, useState } from 'react';
import { assetLoader } from '@/lib/assetLoader';

const GameContainer: React.FC = () => {
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  // Resto del código...
  
  // Precargar assets al montar el componente
  useEffect(() => {
    assetLoader.preloadAll(progress => {
      setLoadingProgress(progress);
    }).then(() => {
      setAssetsLoaded(true);
    });
  }, []);
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-4xl shadow-xl border-primary">
        <CardHeader className="text-center border-b border-border pb-4">
          <CardTitle className="text-3xl font-bold text-primary">TOKEN RUNNER</CardTitle>
          <p className="text-muted-foreground">Esquiva fees y recolecta energía!</p>
        </CardHeader>
        <CardContent className="p-4 md:p-6 flex flex-col items-center">
          {!assetsLoaded ? (
            <div className="w-full flex flex-col items-center justify-center py-10">
              <Progress value={loadingProgress * 100} className="w-3/4 mb-4" />
              <p className="text-muted-foreground">Cargando assets: {Math.round(loadingProgress * 100)}%</p>
            </div>
          ) : (
            <>
              <div ref={containerRef} className="w-full flex justify-center items-center mb-4">
                {canvasSize.width > 0 && canvasSize.height > 0 && (
                  <GameCanvas
                    gameState={gameState}
                    width={canvasSize.width}
                    height={canvasSize.height}
                  />
                )}
              </div>
              <div className="flex space-x-4">
                {/* Botones de control... */}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
```

## Consideraciones Adicionales

1. **Tamaños y escalas**: Asegúrate de que los PNG tengan el tamaño adecuado o ajusta la escala en la función `drawAsset`.

2. **Efectos visuales**: Algunos efectos como el brillo (glow) pueden ser parte de las imágenes PNG o aplicarse mediante código.

3. **Animaciones**: Para elementos animados, se pueden usar múltiples frames o spritesheets.

4. **Rendimiento**: Precarga todos los assets al inicio para evitar retrasos durante el juego.

5. **Fallbacks**: Mantén el código original de dibujo como fallback en caso de que algún asset no se cargue correctamente. 