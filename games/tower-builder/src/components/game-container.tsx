"use client";

import { useEffect, useRef } from 'react';
import { ASSETS_CONFIG } from '../lib/assets-config';

const GameContainer = () => {
  const gameRef = useRef<HTMLDivElement>(null);
  const gameInstance = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (gameInstance.current) {
      return;
    }

    const loadGame = async () => {
      if (typeof window !== 'undefined' && gameRef.current) {
        const Phaser = await import('phaser');
        const Matter = (await import('matter-js')).default; // Matter.js is a CJS module

        class TowerScene extends Phaser.Scene {
            private tower: Phaser.Physics.Matter.Image[] = [];
            private topBlock: Phaser.Physics.Matter.Image | null = null;
            private blockWidth = 100;
            private initialBlockWidth = 300;
            private blockHeight = 100; // Aumentada considerablemente para mejores proporciones
            private baseHeight = 100; // Altura específica para la base, igual que blockHeight
            private baseSpeed = 2; // Velocidad base inicial
            private moveSpeed = 2;
            private gameState: 'ready' | 'playing' | 'gameOver' = 'ready';
            private separationHeight = 15; // Reducida para evitar separación visual excesiva
            private isBlockFalling = false; // Para controlar si el bloque está cayendo

            private score = 0;
            private scoreText: Phaser.GameObjects.Text | null = null;
            private speedText: Phaser.GameObjects.Text | null = null;
            private overlayText: Phaser.GameObjects.Text | null = null;
            
            // Parallax clouds
            private cloudsLayers: Phaser.GameObjects.TileSprite[] = [];
            private cloudsSpeeds = [0.15, 0.25, 0.35]; // Velocidades más lentas y suaves para el parallax
      
            constructor() {
              super({ key: 'TowerScene' });
            }
      
            preload() {
              // Cargar assets locales
              this.load.image('block', ASSETS_CONFIG.images.block);
              this.load.image('baseTower', ASSETS_CONFIG.images.baseTower);
              this.load.image('background', ASSETS_CONFIG.images.background);
              this.load.image('cloudsPanner', ASSETS_CONFIG.images.cloudsPanner);
              
              // Cargar el PNG personalizado para bloques sobrantes
              this.load.image('blockPiece', '/assets/images/fall-block.png');

              // Precargar la fuente Pixellari
              this.preloadPixellariFont();
            }
      
            create() {
              const width = this.game.config.width as number;
              const height = this.game.config.height as number;

              this.matter.world.setBounds(0, 0, width, height);

              // Agregar fondo
              const background = this.add.image(width / 2, height / 2, 'background');
              background.setDisplaySize(width, height);
              background.setScrollFactor(0); // Mantener fijo mientras la cámara se mueve
              background.setDepth(-1); // Enviar al fondo

              // Crear capas de nubes parallax en la parte superior
              this.createCloudsParallax(width, height);

              // Crear textos del juego directamente
              this.createGameTexts(width, height);

              // Extend world bounds upward for camera scrolling
              this.cameras.main.setBounds(0, -10000, width, height + 10000);
            }
      
            update() {
              if (this.gameState === 'playing' && this.topBlock && !this.isBlockFalling) {
                this.topBlock.x += this.moveSpeed;

                if (
                  this.topBlock.x > (this.game.config.width as number) - this.topBlock.displayWidth / 2 ||
                  this.topBlock.x < this.topBlock.displayWidth / 2
                ) {
                  this.moveSpeed *= -1;
                }
              }

              // Verificar si el bloque que cae ya se ha asentado
              if (this.isBlockFalling && this.topBlock) {
                const velocity = this.topBlock.body?.velocity?.y || 0;
                // Si la velocidad es muy pequeña, considerar que se ha asentado
                if (Math.abs(velocity) < 0.1) {
                  this.onBlockLanded();
                }
              }

              // Animar las nubes parallax
              this.updateCloudsParallax();
            }
      
            createBase() {
              const baseImg = this.matter.add.image(
                (this.game.config.width as number) / 2,
                (this.game.config.height as number) - this.baseHeight / 2,
                'baseTower'
              );
              baseImg.setDisplaySize(this.initialBlockWidth, this.baseHeight);
              baseImg.setStatic(true);
              this.tower.push(baseImg);
            }

            spawnBlock() {
              const lastBlock = this.tower[this.tower.length - 1];
              // Posicionar el bloque con separación visual
              const blockImg = this.matter.add.image(
                (this.game.config.width as number) / 2,
                (lastBlock.y) - this.blockHeight - this.separationHeight,
                'block'
              );
              
              // El primer bloque móvil debe ser igual de ancho que la base
              if (this.tower.length === 1) {
                // Para el primer bloque, usar el ancho completo sin crop
                blockImg.setDisplaySize(this.initialBlockWidth, this.blockHeight);
                this.blockWidth = 100; // Para los siguientes bloques
              } else {
                // Para bloques posteriores, cortar por los laterales (no desde abajo)
                const originalTextureWidth = blockImg.texture.source[0].width; // Ancho real del PNG
                const originalTextureHeight = blockImg.texture.source[0].height; // Altura real del PNG
                const cropOffsetX = (originalTextureWidth - (originalTextureWidth * this.blockWidth / this.initialBlockWidth)) / 2;
                
                // Recortar LATERALMENTE: mantener altura completa, reducir ancho desde los lados
                const croppedWidth = originalTextureWidth * this.blockWidth / this.initialBlockWidth;
                blockImg.setCrop(cropOffsetX, 0, croppedWidth, originalTextureHeight);
                // El tamaño de display debe coincidir con el tamaño deseado
                blockImg.setDisplaySize(this.blockWidth, this.blockHeight);
              }
              
              // Hacer el bloque estático durante el movimiento horizontal
              blockImg.setStatic(true);
              this.topBlock = blockImg;
              this.isBlockFalling = false;
            }

            resetGame = () => {
              // Reset game state
              this.gameState = 'ready';
              this.score = 0;
              this.isBlockFalling = false;
              this.moveSpeed = this.baseSpeed; // Reset to base speed
              this.blockWidth = 100;
              
              // Reset UI
              if (this.scoreText) this.scoreText.setText('Score: 0');
              if (this.speedText) {
                this.speedText.setText('Speed: x1.0');
                this.speedText.setColor('#FFD700'); // Reset to gold
              }
              if (this.overlayText) {
                this.overlayText.setText('Tap to Start');
                this.overlayText.setVisible(true);
              }

              // Clean up existing tower and blocks
              if (this.topBlock) {
                this.topBlock.destroy();
                this.topBlock = null;
              }
              
              this.tower.forEach(img => {
                if (img && img.body) {
                  img.destroy();
                }
              });
              this.tower = [];

              // Reset camera position
              this.cameras.main.scrollY = 0;

              // Recrear las nubes parallax
              const width = this.game.config.width as number;
              const height = this.game.config.height as number;
              this.createCloudsParallax(width, height);
            };

            startGame = () => {
              this.gameState = 'playing';
              this.score = 0;
              this.isBlockFalling = false;
              this.moveSpeed = this.baseSpeed; // Reset to base speed
              
              if (this.scoreText) this.scoreText.setText('Score: 0');
              if (this.speedText) {
                this.speedText.setText('Speed: x1.0');
                this.speedText.setColor('#FFD700'); // Reset to gold
              }
              if (this.overlayText) this.overlayText.setVisible(false);

              // Clean up any existing blocks
              if (this.topBlock) {
                this.topBlock.destroy();
                this.topBlock = null;
              }
              
              this.tower.forEach(img => {
                if (img && img.body) {
                  img.destroy();
                }
              });
              this.tower = [];
              this.blockWidth = 100;

              // Reset camera
              this.cameras.main.scrollY = 0;

              // Recrear las nubes parallax
              const width = this.game.config.width as number;
              const height = this.game.config.height as number;
              this.createCloudsParallax(width, height);

              this.createBase();
              // El primer bloque móvil debe ser igual de ancho que la base
              this.blockWidth = this.initialBlockWidth;
              this.spawnBlock();
              this.blockWidth = 100; // Para los siguientes bloques
            };

            placeBlock() {
              if (!this.topBlock || this.isBlockFalling) return;

              // Activar la física para que el bloque caiga
              this.topBlock.setStatic(false);
              this.isBlockFalling = true;
              
              // Aplicar una pequeña fricción al aire para un movimiento más controlado
              this.topBlock.setFrictionAir(0.01);
            }

            onBlockLanded() {
              if (!this.topBlock) return;

              const lastBlock = this.tower[this.tower.length - 1];

              // Calcular la superposición para verificar si el juego debe continuar
              const topLeft = this.topBlock.x - this.topBlock.displayWidth / 2;
              const topRight = this.topBlock.x + this.topBlock.displayWidth / 2;

              const lastLeft = lastBlock.x - lastBlock.displayWidth / 2;
              const lastRight = lastBlock.x + lastBlock.displayWidth / 2;

              const overlap = Math.max(0, Math.min(topRight, lastRight) - Math.max(topLeft, lastLeft));

              // Verificar si hay suficiente superposición para continuar (mínimo 10px)
              if (overlap > 10) {
                // Calcular las coordenadas de la parte que realmente está apoyada
                const supportedLeft = Math.max(topLeft, lastLeft);
                const supportedRight = Math.min(topRight, lastRight);
                const supportedWidth = supportedRight - supportedLeft;
                const supportedCenterX = (supportedLeft + supportedRight) / 2;

                // Calcular la posición Y ideal para depositar (sin separación, pegado al anterior)
                const idealYPos = lastBlock.y - this.blockHeight;
                
                // Crear efectos de partes que caen ANTES de destruir el bloque original
                this.createFallingPieces(this.topBlock, supportedLeft, supportedRight);
                
                // Destruir el bloque original
                this.topBlock.destroy();
                this.topBlock = null;

                // Crear un nuevo bloque solo con la parte apoyada en la posición ideal
                const supportedBlock = this.matter.add.image(supportedCenterX, idealYPos, 'block');
                
                // Cortar por los laterales (no desde abajo) para mantener la calidad del PNG
                const originalTextureWidth = supportedBlock.texture.source[0].width; // Ancho real del PNG
                const originalTextureHeight = supportedBlock.texture.source[0].height; // Altura real del PNG
                const cropOffsetX = (originalTextureWidth - (originalTextureWidth * supportedWidth / this.initialBlockWidth)) / 2;
                
                // Recortar LATERALMENTE: mantener altura completa, reducir ancho desde los lados
                const croppedWidth = originalTextureWidth * supportedWidth / this.initialBlockWidth;
                supportedBlock.setCrop(cropOffsetX, 0, croppedWidth, originalTextureHeight);
                supportedBlock.setDisplaySize(supportedWidth, this.blockHeight);
                supportedBlock.setStatic(true);

                // Agregar el bloque apoyado a la torre
                this.tower.push(supportedBlock);

                // Para el próximo bloque, usar el ancho de la parte que quedó apoyada
                this.blockWidth = supportedWidth;

                // Update score
                this.score += 1;
                if (this.scoreText) this.scoreText.setText(`Score: ${this.score}`);

                // Incremento de velocidad: 50% por cada 10 bloques acumulados
                const speedMultiplier = 1 + (0.5 * Math.floor(this.score / 10));
                const sign = Math.sign(this.moveSpeed) || 1;
                const newSpeed = this.baseSpeed * speedMultiplier;
                this.moveSpeed = sign * newSpeed;

                // Actualizar texto de velocidad
                if (this.speedText) {
                  this.speedText.setText(`Speed: x${speedMultiplier.toFixed(1)}`);
                  // Resaltar cuando hay incremento de velocidad
                  if (speedMultiplier > 1) {
                    this.speedText.setColor('#FFA500'); // Naranja dorado para velocidad aumentada
                  } else {
                    this.speedText.setColor('#FFD700'); // Dorado normal
                  }
                }

                // Camera scroll up suave - animación gradual en lugar de salto brusco
                const cameraRelativeY = idealYPos - this.cameras.main.scrollY;
                if (cameraRelativeY < 250) { // Threshold aumentado de 150 a 250px
                  // Scroll suave: animar la cámara hacia arriba gradualmente
                  const targetScrollY = this.cameras.main.scrollY - 200;
                  this.tweens.add({
                    targets: this.cameras.main,
                    scrollY: targetScrollY,
                    duration: 800, // 800ms para transición suave
                    ease: 'Power2.easeOut' // Easing suave
                  });
                }

                // Spawn the next moving block on top
                this.spawnBlock();
              } else {
                this.gameOver();
              }
            }

            createFallingPieces(block: Phaser.Physics.Matter.Image, supportedLeft: number, supportedRight: number) {
              const blockLeft = block.x - block.displayWidth / 2;
              const blockRight = block.x + block.displayWidth / 2;
              const blockY = block.y;

              // Parte izquierda sobresaliente (si existe)
              if (blockLeft < supportedLeft) {
                const leftOverhangWidth = supportedLeft - blockLeft;
                const leftOverhangCenterX = blockLeft + leftOverhangWidth / 2;
                
                // Crear una pieza con la textura específica para bloques sobrantes
                const leftPiece = this.matter.add.image(leftOverhangCenterX, blockY, 'blockPiece');
                
                // Usar solo setDisplaySize sin crop para que se vean bien
                leftPiece.setDisplaySize(leftOverhangWidth, this.blockHeight);
                leftPiece.setStatic(false); // Hacer que caiga
                
                // Efectos físicos más suaves
                leftPiece.setBounce(0.3); // Reducido de 0.8 a 0.3
                leftPiece.setFrictionAir(0.02); // Aumentado para que caigan más rápido
                leftPiece.setFriction(0.5); // Más fricción al tocar el suelo
                
                // Impulso menos dramático
                const horizontalForce = -1.5 - Math.random() * 1; // Reducido: entre -1.5 y -2.5
                const verticalForce = -0.5 - Math.random() * 1; // Reducido: entre -0.5 y -1.5
                leftPiece.setVelocity(horizontalForce, verticalForce);
                
                // Rotación más suave
                leftPiece.setAngularVelocity(-0.05 - Math.random() * 0.1); // Reducido
                
                // Destruir después de menos tiempo
                this.time.delayedCall(3000, () => {
                  if (leftPiece && leftPiece.body) {
                    leftPiece.destroy();
                  }
                });
              }

              // Parte derecha sobresaliente (si existe)
              if (blockRight > supportedRight) {
                const rightOverhangWidth = blockRight - supportedRight;
                const rightOverhangCenterX = supportedRight + rightOverhangWidth / 2;
                
                // Crear una pieza con la textura específica para bloques sobrantes
                const rightPiece = this.matter.add.image(rightOverhangCenterX, blockY, 'blockPiece');
                
                // Usar solo setDisplaySize sin crop para que se vean bien
                rightPiece.setDisplaySize(rightOverhangWidth, this.blockHeight);
                rightPiece.setStatic(false); // Hacer que caiga
                
                // Efectos físicos más suaves
                rightPiece.setBounce(0.3); // Reducido de 0.8 a 0.3
                rightPiece.setFrictionAir(0.02); // Aumentado para que caigan más rápido
                rightPiece.setFriction(0.5); // Más fricción al tocar el suelo
                
                // Impulso menos dramático
                const horizontalForce = 1.5 + Math.random() * 1; // Reducido: entre 1.5 y 2.5
                const verticalForce = -0.5 - Math.random() * 1; // Reducido: entre -0.5 y -1.5
                rightPiece.setVelocity(horizontalForce, verticalForce);
                
                // Rotación más suave
                rightPiece.setAngularVelocity(0.05 + Math.random() * 0.1); // Reducido
                
                // Destruir después de menos tiempo
                this.time.delayedCall(3000, () => {
                  if (rightPiece && rightPiece.body) {
                    rightPiece.destroy();
                  }
                });
              }
            }
      
            createCloudsParallax(width: number, height: number) {
              // Limpiar capas existentes
              this.cloudsLayers.forEach(layer => layer.destroy());
              this.cloudsLayers = [];

              // Crear múltiples capas de nubes con diferentes profundidades
              for (let i = 0; i < this.cloudsSpeeds.length; i++) {
                const cloudsLayer = this.add.tileSprite(
                  0, 
                  i * 40, // Posicionar cada capa un poco más abajo
                  width * 2, // Hacer el tile más ancho para mejor efecto
                  120, // Altura de las nubes
                  'cloudsPanner'
                );
                
                cloudsLayer.setOrigin(0, 0);
                cloudsLayer.setScrollFactor(0); // Fijo en la pantalla
                cloudsLayer.setDepth(0); // Por encima del fondo, pero debajo del juego
                cloudsLayer.setAlpha(0.8 - i * 0.15); // Transparencia creciente para profundidad
                cloudsLayer.setScale(0.8 + i * 0.1); // Escala diferente para cada capa
                
                this.cloudsLayers.push(cloudsLayer);
              }
            }

            updateCloudsParallax() {
              // Mover cada capa de nubes a diferente velocidad
              this.cloudsLayers.forEach((layer, index) => {
                layer.tilePositionX += this.cloudsSpeeds[index];
              });
            }

            preloadPixellariFont() {
              console.log('🎨 Preparando fuente Pixellari para Phaser');
              
              // Crear un elemento invisible para forzar la carga de la fuente
              if (!document.getElementById('pixellari-preloader')) {
                const preloader = document.createElement('div');
                preloader.id = 'pixellari-preloader';
                preloader.className = 'pixellari-preload';
                preloader.innerHTML = 'Pixellari font preload';
                document.body.appendChild(preloader);
                console.log('✅ Preloader de Pixellari creado');
              }
              
              // Verificar que la fuente esté disponible
              try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.font = '16px Pixellari';
                  console.log('✅ Fuente Pixellari configurada en canvas test');
                }
              } catch (e) {
                console.log('⚠️ Test de canvas falló, pero continuando');
              }
            }

            createGameTexts(width: number, height: number) {
              console.log('🎮 Creando textos del juego con fuente Pixellari');
              
              // Score text (always visible)
              this.scoreText = this.add.text(10, 10, 'Score: 0', {
                fontSize: 24,
                color: '#40E0D0',  // Turquesa
                fontFamily: '"Pixellari", "Courier New", monospace',
                stroke: '#000000',
                strokeThickness: 3
              }).setDepth(1).setScrollFactor(0);

              // Speed multiplier text (always visible)
              this.speedText = this.add.text(10, 40, 'Speed: x1.0', {
                fontSize: 18,
                color: '#FFD700',  // Dorado (Gold)
                fontFamily: '"Pixellari", "Courier New", monospace',
                stroke: '#000000',
                strokeThickness: 2
              }).setDepth(1).setScrollFactor(0);

              // Overlay instruction text (shown in ready / gameOver)
              this.overlayText = this.add.text(width / 2, height / 2, 'Tap to Start', {
                fontSize: 36,
                color: '#40E0D0',  // Turquesa
                fontFamily: '"Pixellari", "Courier New", monospace',
                align: 'center',
                stroke: '#000000',
                strokeThickness: 4,
                shadow: {
                  offsetX: 2,
                  offsetY: 2,
                  color: '#000000',
                  blur: 0,
                  fill: true
                }
              }).setOrigin(0.5).setScrollFactor(0);

              console.log('✅ Textos creados con fuente Pixellari');

              // Setup input events after texts are created
              this.input.on('pointerdown', () => {
                if (this.gameState === 'ready') {
                  this.startGame();
                } else if (this.gameState === 'playing') {
                  this.placeBlock();
                } else if (this.gameState === 'gameOver') {
                  this.resetGame();
                }
              });
            }

            gameOver() {
              this.gameState = 'gameOver';
              this.isBlockFalling = false;

              // Clean up the falling block if it exists
              if (this.topBlock) {
                this.topBlock.destroy();
                this.topBlock = null;
              }

              if (this.overlayText) {
                this.overlayText.setText(`Game Over\nScore: ${this.score}\nTap to Replay`);
                this.overlayText.setVisible(true);
              }
            }
          }

        const gameConfig: Phaser.Types.Core.GameConfig = {
          type: Phaser.AUTO,
          width: 375,
          height: 667,
          parent: gameRef.current!,
          backgroundColor: 'transparent',
          physics: {
            default: 'matter',
            matter: {
              gravity: { x: 0, y: 1 }, // Activar la gravedad para física realista
              debug: false
            }
          },
          scene: [TowerScene]
        };

        gameInstance.current = new Phaser.Game(gameConfig);
      }
    };

    loadGame();

    return () => {
      gameInstance.current?.destroy(true);
      gameInstance.current = null;
    };
  }, []);

  return <div ref={gameRef} className="rounded-lg overflow-hidden shadow-2xl w-[375px] h-[667px]" />;
};

export default GameContainer; 