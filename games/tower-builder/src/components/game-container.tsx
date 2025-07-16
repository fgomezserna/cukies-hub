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
            private blockVariants = ['block', 'block-1', 'block-2']; // Variantes de bloques disponibles
            private recentBlocks: string[] = []; // Historial de últimos bloques para evitar repetición

            private score = 0;
            private scoreText: Phaser.GameObjects.Text | null = null;
            private speedText: Phaser.GameObjects.Text | null = null;
            private overlayText: Phaser.GameObjects.Text | null = null;
            private levelUpText: Phaser.GameObjects.Text | null = null;
            private lastSpeedLevel = 0; // Para trackear el último nivel de velocidad mostrado
            
            // Parallax clouds con configuración mejorada
            private cloudsLayers: Phaser.GameObjects.TileSprite[] = [];
            private cloudsOriginalY: number[] = []; // Posiciones Y originales de las nubes
            private cloudsCurrentY: number[] = []; // Posiciones Y actuales (para interpolación suave)
            
            // Sistema de avión
            private airplane: Phaser.GameObjects.Image | null = null;
            private airplaneActive = false;
            private airplaneWaitTime = 0; // Tiempo de espera entre apariciones (en milisegundos)
            
            // Sistema de cohete
            private rocket: Phaser.GameObjects.Image | null = null;
            private rocketText: Phaser.GameObjects.Text | null = null;
            private rocketActive = false;
            private rocketWaitTime = 0; // Tiempo de espera entre apariciones (en milisegundos)
            
            // Sistema de transición de background
            private backgroundTransition25Triggered = false;
            private backgroundTransition35Triggered = false;
            private backgroundTransitionActive = false;
            private currentBackground: Phaser.GameObjects.Image | null = null;
            private newBackground: Phaser.GameObjects.Image | null = null;
            private cloudsParallaxStopped = false;
            private cloudsConfigs = [
              { speed: 0.1, alpha: 0.3, scale: 1.2, offsetY: 0, tint: 0xffffff },      // Fondo - muy lento, grande, transparente
              { speed: 0.2, alpha: 0.5, scale: 1.0, offsetY: 50, tint: 0xf0f0f0 },    // Medio - velocidad media, tamaño normal
              { speed: 0.4, alpha: 0.7, scale: 0.8, offsetY: 120, tint: 0xe0e0e0 },   // Frente - rápido, pequeño, más opaco
              { speed: 0.6, alpha: 0.4, scale: 0.6, offsetY: 190, tint: 0xd0d0d0 }    // Primer plano - muy rápido, muy pequeño
            ];
      
            constructor() {
              super({ key: 'TowerScene' });
            }
      
            preload() {
              // Cargar assets locales
              this.load.image('block', ASSETS_CONFIG.images.block);
              this.load.image('block-1', ASSETS_CONFIG.images.block1);
              this.load.image('block-2', ASSETS_CONFIG.images.block2);
              this.load.image('baseTower', ASSETS_CONFIG.images.baseTower);
              this.load.image('background', ASSETS_CONFIG.images.background);
              this.load.image('sky-space', ASSETS_CONFIG.images.skySpace);
              this.load.image('sky-stars', ASSETS_CONFIG.images.skyStars);
              this.load.image('cloudsPanner', ASSETS_CONFIG.images.cloudsPanner);
              this.load.image('cityBack', ASSETS_CONFIG.images.cityBack);
              this.load.image('airplane', ASSETS_CONFIG.images.airplane);
              this.load.image('rocket', ASSETS_CONFIG.images.rocket);

              // Precargar la fuente Pixellari
              this.preloadPixellariFont();
            }
      
            create() {
              const width = this.game.config.width as number;
              const height = this.game.config.height as number;

              this.matter.world.setBounds(0, 0, width, height);

              // Agregar fondo
              this.currentBackground = this.add.image(width / 2, height / 2, 'background');
              this.currentBackground.setDisplaySize(width, height);
              this.currentBackground.setScrollFactor(0); // Mantener fijo mientras la cámara se mueve
              this.currentBackground.setDepth(-1); // Enviar al fondo

              // Agregar edificios del fondo con efecto parallax
              const cityBackground = this.add.image(width / 2, height, 'cityBack');
              
              // Escalar manteniendo proporciones para que cubra el ancho completo
              const naturalWidth = cityBackground.texture.source[0].width;
              const naturalHeight = cityBackground.texture.source[0].height;
              const scaleX = width / naturalWidth;
              cityBackground.setScale(scaleX);
              
              cityBackground.setScrollFactor(0.3); // Parallax: se mueve más lento que la cámara
              cityBackground.setDepth(-0.8); // Entre el cielo y las nubes
              cityBackground.setOrigin(0.5, 1); // Anclado en la parte inferior

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
              
              // Animar el avión (siempre, independiente del estado)
              this.updateAirplane();
              
              // Animar el cohete (siempre, independiente del estado)
              this.updateRocket();
              
              // Verificar transición de background
              this.checkBackgroundTransition();
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

            getRandomBlockVariant(): string {
              let selectedVariant: string;
              
              // Si ya tenemos 2 bloques recientes y son iguales, evitar ese tipo
              if (this.recentBlocks.length >= 2 && 
                  this.recentBlocks[0] === this.recentBlocks[1]) {
                
                // Filtrar las opciones disponibles para excluir el tipo repetido
                const availableVariants = this.blockVariants.filter(
                  variant => variant !== this.recentBlocks[0]
                );
                
                // Elegir aleatoriamente de las opciones disponibles
                const randomIndex = Math.floor(Math.random() * availableVariants.length);
                selectedVariant = availableVariants[randomIndex];
              } else {
                // Elección completamente aleatoria si no hay restricciones
                const randomIndex = Math.floor(Math.random() * this.blockVariants.length);
                selectedVariant = this.blockVariants[randomIndex];
              }
              
              // Actualizar el historial de bloques recientes
              this.recentBlocks.unshift(selectedVariant);
              
              // Mantener solo los últimos 2 bloques en el historial
              if (this.recentBlocks.length > 2) {
                this.recentBlocks.pop();
              }
              
              return selectedVariant;
            }

            spawnBlock() {
              const lastBlock = this.tower[this.tower.length - 1];
              // Posicionar el bloque con separación visual usando una variante aleatoria
              const blockImg = this.matter.add.image(
                (this.game.config.width as number) / 2,
                (lastBlock.y) - this.blockHeight - this.separationHeight,
                this.getRandomBlockVariant()
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
              this.lastSpeedLevel = 0; // Reset level tracking
              this.recentBlocks = []; // Reset block history
              
              // Reset airplane
              if (this.airplane) {
                this.airplane.destroy();
                this.airplane = null;
              }
              this.airplaneActive = false;
              this.airplaneWaitTime = 0;
              
              // Reset rocket
              if (this.rocket) {
                this.rocket.destroy();
                this.rocket = null;
              }
              if (this.rocketText) {
                this.rocketText.destroy();
                this.rocketText = null;
              }
              this.rocketActive = false;
              this.rocketWaitTime = 0;
              
              // Reset background transition
              this.backgroundTransition25Triggered = false;
              this.backgroundTransition35Triggered = false;
              this.backgroundTransitionActive = false;
              this.cloudsParallaxStopped = false;
              if (this.newBackground) {
                this.newBackground.destroy();
                this.newBackground = null;
              }
              
              // Restaurar background original
              if (this.currentBackground) {
                this.currentBackground.destroy();
              }
              const gameWidth = this.game.config.width as number;
              const gameHeight = this.game.config.height as number;
              this.currentBackground = this.add.image(gameWidth / 2, gameHeight / 2, 'background');
              this.currentBackground.setDisplaySize(gameWidth, gameHeight);
              this.currentBackground.setScrollFactor(0);
              this.currentBackground.setDepth(-1);
              
              // Recrear las nubes parallax si fueron destruidas
              this.createCloudsParallax(gameWidth, gameHeight);
              
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
              this.lastSpeedLevel = 0; // Reset level tracking
              this.recentBlocks = []; // Reset block history
              
              // Reset airplane
              if (this.airplane) {
                this.airplane.destroy();
                this.airplane = null;
              }
              this.airplaneActive = false;
              this.airplaneWaitTime = 0;
              
              // Reset rocket
              if (this.rocket) {
                this.rocket.destroy();
                this.rocket = null;
              }
              if (this.rocketText) {
                this.rocketText.destroy();
                this.rocketText = null;
              }
              this.rocketActive = false;
              this.rocketWaitTime = 0;
              
              // Reset background transition
              this.backgroundTransition25Triggered = false;
              this.backgroundTransition35Triggered = false;
              this.backgroundTransitionActive = false;
              this.cloudsParallaxStopped = false;
              if (this.newBackground) {
                this.newBackground.destroy();
                this.newBackground = null;
              }
              
              // Restaurar background original si es necesario
              if (this.currentBackground && this.currentBackground.texture.key === 'sky-space') {
                this.currentBackground.destroy();
                const gameWidth = this.game.config.width as number;
                const gameHeight = this.game.config.height as number;
                this.currentBackground = this.add.image(gameWidth / 2, gameHeight / 2, 'background');
                this.currentBackground.setDisplaySize(gameWidth, gameHeight);
                this.currentBackground.setScrollFactor(0);
                this.currentBackground.setDepth(-1);
                
                // Recrear las nubes parallax
                this.createCloudsParallax(gameWidth, gameHeight);
              }
              
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
                
                // Capturar la textura del bloque original antes de destruirlo
                const originalBlockTexture = this.topBlock.texture.key;
                
                // Destruir el bloque original
                this.topBlock.destroy();
                this.topBlock = null;

                // Crear un nuevo bloque solo con la parte apoyada usando la misma textura
                const supportedBlock = this.matter.add.image(supportedCenterX, idealYPos, originalBlockTexture);
                
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
                const currentSpeedLevel = Math.floor(this.score / 10);
                const sign = Math.sign(this.moveSpeed) || 1;
                const newSpeed = this.baseSpeed * speedMultiplier;
                this.moveSpeed = sign * newSpeed;

                // Detectar si hay un nuevo nivel de velocidad
                if (currentSpeedLevel > this.lastSpeedLevel && currentSpeedLevel > 0) {
                  this.showLevelUpMessage();
                  this.lastSpeedLevel = currentSpeedLevel;
                }

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
                
                // Crear una pieza con una variante aleatoria de bloque
                const leftPiece = this.matter.add.image(leftOverhangCenterX, blockY, this.getRandomBlockVariant());
                
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
                
                // Crear una pieza con una variante aleatoria de bloque
                const rightPiece = this.matter.add.image(rightOverhangCenterX, blockY, this.getRandomBlockVariant());
                
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
              this.cloudsOriginalY = []; // Reset posiciones originales
              this.cloudsCurrentY = []; // Reset posiciones actuales

              console.log('🌤️ Creando parallax de nubes mejorado con', this.cloudsConfigs.length, 'capas');

              // Crear múltiples capas de nubes con configuraciones únicas
              this.cloudsConfigs.forEach((config, i) => {
                const cloudsLayer = this.add.tileSprite(
                  0, 
                  config.offsetY, // Posición Y específica para cada capa
                  width * 2.5, // Más ancho para mejor seamless scrolling
                  100, // Altura de las nubes
                  'cloudsPanner'
                );
                
                cloudsLayer.setOrigin(0, 0);
                cloudsLayer.setScrollFactor(0); // Fijo en la pantalla
                cloudsLayer.setDepth(-0.5 + i * 0.1); // Depth creciente, pero detrás del juego
                cloudsLayer.setAlpha(config.alpha); // Transparencia específica
                cloudsLayer.setScale(config.scale); // Escala específica
                cloudsLayer.setTint(config.tint); // Tinte específico para diferenciación
                
                this.cloudsLayers.push(cloudsLayer);
                this.cloudsOriginalY.push(config.offsetY); // Almacenar posición Y original
                this.cloudsCurrentY.push(config.offsetY); // Inicializar posición actual
                
                console.log(`  ☁️ Capa ${i+1}: velocidad=${config.speed}, alpha=${config.alpha}, escala=${config.scale}`);
              });
            }

            updateCloudsParallax() {
              // Si las nubes están detenidas, no hacer nada
              if (this.cloudsParallaxStopped) {
                return;
              }
              
              // Mover cada capa de nubes con sus velocidades específicas
              this.cloudsLayers.forEach((layer, index) => {
                if (this.cloudsConfigs[index] && this.cloudsOriginalY[index] !== undefined) {
                  // Movimiento horizontal normal
                  layer.tilePositionX += this.cloudsConfigs[index].speed;
                  
                  // Calcular posición objetivo Y basada en score
                  let targetY: number;
                  if (this.score >= 10) {
                    // Calcular cuánto deben descender las nubes
                    const descentProgress = (this.score - 10) * 15; // 15px por cada punto después del 10
                    targetY = this.cloudsOriginalY[index] + descentProgress;
                  } else {
                    // Mantener posición Y original si score < 10
                    targetY = this.cloudsOriginalY[index];
                  }
                  
                  // Interpolación suave hacia la posición objetivo (lerp)
                  const lerpSpeed = 0.02; // Velocidad de interpolación (más bajo = más suave)
                  this.cloudsCurrentY[index] = this.lerp(this.cloudsCurrentY[index], targetY, lerpSpeed);
                  
                  // Aplicar la posición interpolada
                  layer.y = this.cloudsCurrentY[index];
                  
                  // Efecto de fade gradual cuando las nubes bajan mucho
                  const gameHeight = this.game.config.height as number;
                  if (this.cloudsCurrentY[index] > gameHeight * 0.8) {
                    // Empezar a desvanecer cuando están muy abajo
                    const fadeProgress = Math.max(0, 1 - (this.cloudsCurrentY[index] - gameHeight * 0.8) / (gameHeight * 0.3));
                    layer.setAlpha(this.cloudsConfigs[index].alpha * fadeProgress);
                  } else {
                    // Restaurar alpha original si las nubes suben de nuevo
                    layer.setAlpha(this.cloudsConfigs[index].alpha);
                  }
                }
              });
            }

            // Función de interpolación lineal para movimiento suave
            lerp(start: number, end: number, factor: number): number {
              return start + (end - start) * factor;
            }

            checkBackgroundTransition() {
              // Activar transición de score 25 (sky-tower -> sky-space)
              if (this.score >= 25 && !this.backgroundTransition25Triggered && !this.backgroundTransitionActive) {
                this.backgroundTransition25Triggered = true;
                this.backgroundTransitionActive = true;
                this.startBackgroundTransition('sky-space');
              }
              
              // Activar transición de score 35 (sky-space -> sky-stars)
              if (this.score >= 35 && !this.backgroundTransition35Triggered && !this.backgroundTransitionActive) {
                this.backgroundTransition35Triggered = true;
                this.backgroundTransitionActive = true;
                this.startBackgroundTransition('sky-stars');
              }
            }
            
            startBackgroundTransition(backgroundKey: string) {
              const gameWidth = this.game.config.width as number;
              const gameHeight = this.game.config.height as number;
              
              // Hacer desaparecer las nubes completamente solo en la primera transición (score 25)
              if (backgroundKey === 'sky-space') {
                this.cloudsLayers.forEach(layer => {
                  this.tweens.add({
                    targets: layer,
                    alpha: 0, // Fade out
                    duration: 3000, // 3 segundos para desvanecerse
                    onComplete: () => {
                      layer.destroy();
                    }
                  });
                });
                this.cloudsLayers = [];
                this.cloudsParallaxStopped = true;
              }
              
              // Crear el nuevo background desde arriba
              this.newBackground = this.add.image(gameWidth / 2, -gameHeight / 2, backgroundKey);
              this.newBackground.setDisplaySize(gameWidth, gameHeight);
              this.newBackground.setScrollFactor(0);
              this.newBackground.setDepth(-1); // Mismo depth que el anterior
              
              // Animar background actual hacia abajo (10 segundos)
              this.tweens.add({
                targets: this.currentBackground,
                y: gameHeight + gameHeight / 2, // Salir por abajo
                duration: 10000, // 10 segundos
                ease: 'Power2.easeInOut'
              });
              
              // Animar nuevo background desde arriba (10 segundos)
              this.tweens.add({
                targets: this.newBackground,
                y: gameHeight / 2, // Posición final centrada
                duration: 10000, // 10 segundos
                ease: 'Power2.easeInOut',
                onComplete: () => {
                  // Al finalizar la transición
                  if (this.currentBackground) {
                    this.currentBackground.destroy();
                    this.currentBackground = null;
                  }
                  this.currentBackground = this.newBackground;
                  this.newBackground = null;
                  this.backgroundTransitionActive = false;
                }
              });
            }

            updateAirplane() {
              // Crear avión solo entre score 15 y 24 (no después del 25)
              if (this.score >= 15 && this.score < 25 && !this.airplaneActive && this.airplaneWaitTime <= 0) {
                this.createAirplane();
                this.airplaneActive = true;
              }
              
              // Desactivar avión si score baja de 15 O si llega a 25 o más
              if ((this.score < 15 || this.score >= 25) && this.airplaneActive) {
                if (this.airplane) {
                  this.airplane.destroy();
                  this.airplane = null;
                }
                this.airplaneActive = false;
                this.airplaneWaitTime = 0; // Reset timer
              }
              
              // Actualizar tiempo de espera
              if (this.airplaneWaitTime > 0) {
                this.airplaneWaitTime -= this.game.loop.delta;
              }
              
              // Mover avión si está activo
              if (this.airplane && this.airplaneActive) {
                // Movimiento horizontal suave
                this.airplane.x += 2; // Velocidad horizontal
                
                // Cuando sale de pantalla, iniciar pausa de 15 segundos
                const gameWidth = this.game.config.width as number;
                if (this.airplane.x > gameWidth + 100) {
                  // Destruir avión y iniciar pausa
                  this.airplane.destroy();
                  this.airplane = null;
                  this.airplaneActive = false;
                  this.airplaneWaitTime = 15000; // 15 segundos en milisegundos
                }
              }
            }

            createAirplane() {
              const gameWidth = this.game.config.width as number;
              const gameHeight = this.game.config.height as number;
              
              // Verificar si la textura existe
              if (!this.textures.exists('airplane')) {
                return;
              }
              
              // Crear avión como Image simple (no TileSprite)
              this.airplane = this.add.image(-100, gameHeight * 0.2, 'airplane');
              
              if (this.airplane) {
                // Configuración visual
                this.airplane.setOrigin(0.5, 0.5);       // Origen en el centro
                this.airplane.setScrollFactor(0);        // Fijo en pantalla (no se mueve con cámara)  
                this.airplane.setDepth(-0.5);            // Por detrás de los bloques pero delante del background
                this.airplane.setAlpha(1.0);             // Sin transparencia
                this.airplane.setScale(0.2);             // Tamaño más pequeño
              }
            }

            updateRocket() {
              // Crear cohete a partir del score 30
              if (this.score >= 30 && !this.rocketActive && this.rocketWaitTime <= 0) {
                this.createRocket();
                this.rocketActive = true;
              }
              
              // Desactivar cohete si score baja de 30
              if (this.score < 30 && this.rocketActive) {
                if (this.rocket) {
                  this.rocket.destroy();
                  this.rocket = null;
                }
                if (this.rocketText) {
                  this.rocketText.destroy();
                  this.rocketText = null;
                }
                this.rocketActive = false;
                this.rocketWaitTime = 0; // Reset timer
              }
              
              // Actualizar tiempo de espera
              if (this.rocketWaitTime > 0) {
                this.rocketWaitTime -= this.game.loop.delta;
              }
              
              // Mover cohete si está activo
              if (this.rocket && this.rocketActive) {
                // Movimiento diagonal desde esquina inferior derecha hacia esquina superior izquierda
                this.rocket.x -= 4; // Velocidad horizontal hacia la izquierda
                this.rocket.y -= 3; // Velocidad vertical hacia arriba (diagonal más pronunciada)
                
                // Mover el texto junto con el cohete
                if (this.rocketText) {
                  this.rocketText.x = this.rocket.x + 40; // Posicionar el texto al lado del cohete
                  this.rocketText.y = this.rocket.y - 20; // Ligeramente arriba del cohete
                }
                
                // Cuando sale de pantalla por la esquina superior izquierda, iniciar pausa de 12 segundos
                if (this.rocket.x < -100 || this.rocket.y < -100) {
                  // Destruir cohete, texto y iniciar pausa
                  this.rocket.destroy();
                  this.rocket = null;
                  if (this.rocketText) {
                    this.rocketText.destroy();
                    this.rocketText = null;
                  }
                  this.rocketActive = false;
                  this.rocketWaitTime = 12000; // 12 segundos en milisegundos (más rápido que el avión)
                }
              }
            }

            createRocket() {
              const gameWidth = this.game.config.width as number;
              const gameHeight = this.game.config.height as number;
              
              // Verificar si la textura existe
              if (!this.textures.exists('rocket')) {
                return;
              }
              
              // Crear cohete desde la esquina inferior derecha visible en pantalla
              this.rocket = this.add.image(gameWidth - 20, gameHeight - 20, 'rocket'); // Aparece desde esquina inferior derecha visible
              
              if (this.rocket) {
                // Configuración visual
                this.rocket.setOrigin(0.5, 0.5);       // Origen en el centro
                this.rocket.setScrollFactor(0);        // Fijo en pantalla (no se mueve con cámara)  
                this.rocket.setDepth(-0.4);            // Un poco más adelante que el avión
                this.rocket.setAlpha(1.0);             // Sin transparencia
                this.rocket.setScale(0.3);             // Más grande para ser más visible
                this.rocket.setRotation(-0.015);       // Rotado 45 grados a la derecha desde la posición anterior
              }
              
              // Crear texto "To the moon!!" junto al cohete
              this.rocketText = this.add.text(
                gameWidth + 20, gameHeight - 40, 
                'To the\nmoon!!', 
                {
                  fontFamily: 'Pixellari',
                  fontSize: '16px',
                  color: '#FFD700',
                  stroke: '#000000',
                  strokeThickness: 2,
                  align: 'center'
                }
              );
              
              if (this.rocketText) {
                this.rocketText.setOrigin(0, 0.5);     // Origen en el lado izquierdo del texto
                this.rocketText.setScrollFactor(0);    // Fijo en pantalla
                this.rocketText.setDepth(-0.3);        // Delante del cohete
              }
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
                color: '#20B2AA',  // Turquesa verde oscuro (Light Sea Green)
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
                color: '#20B2AA',  // Turquesa verde oscuro (Light Sea Green)
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

              // Level up text (initially hidden)
              this.levelUpText = this.add.text(width / 2, height / 2 - 50, 'NEXT LEVEL!!!', {
                fontSize: 48,
                color: '#FF6B35',  // Naranja vibrante
                fontFamily: '"Pixellari", "Courier New", monospace',
                align: 'center',
                stroke: '#FFFFFF',
                strokeThickness: 4,
                shadow: {
                  offsetX: 3,
                  offsetY: 3,
                  color: '#000000',
                  blur: 2,
                  fill: true
                }
              }).setOrigin(0.5).setScrollFactor(0).setVisible(false).setDepth(100);
              
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

            showLevelUpMessage() {
              if (!this.levelUpText) return;

              // Mostrar el texto
              this.levelUpText.setVisible(true);
              
              // Animación de aparición: escala desde 0 y fade in
              this.levelUpText.setScale(0);
              this.levelUpText.setAlpha(0);
              
              this.tweens.add({
                targets: this.levelUpText,
                scaleX: 1.2,
                scaleY: 1.2,
                alpha: 1,
                duration: 300,
                ease: 'Power2.easeOut',
                onComplete: () => {
                  // Mantener visible por un momento, luego hacer bounce
                  this.tweens.add({
                    targets: this.levelUpText,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 200,
                    ease: 'Bounce.easeOut',
                    onComplete: () => {
                      // Esperar un poco y luego desvanecer
                      this.time.delayedCall(1500, () => {
                        this.tweens.add({
                          targets: this.levelUpText,
                          alpha: 0,
                          scaleX: 0.8,
                          scaleY: 0.8,
                          duration: 400,
                          ease: 'Power2.easeIn',
                          onComplete: () => {
                            if (this.levelUpText) {
                              this.levelUpText.setVisible(false);
                            }
                          }
                        });
                      });
                    }
                  });
                }
              });
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