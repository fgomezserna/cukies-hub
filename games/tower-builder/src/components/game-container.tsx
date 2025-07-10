"use client";

import { useEffect, useRef } from 'react';

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
            private blockHeight = 40;
            private moveSpeed = 2;
            private gameState: 'ready' | 'playing' | 'gameOver' = 'ready';
            private separationHeight = 80; // Nueva separación durante el movimiento
            private isBlockFalling = false; // Para controlar si el bloque está cayendo

            private score = 0;
            private scoreText: Phaser.GameObjects.Text | null = null;
            private overlayText: Phaser.GameObjects.Text | null = null;
      
            constructor() {
              super({ key: 'TowerScene' });
            }
      
            preload() {
              this.load.image('block', 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/141552/block_1.png');
            }
      
            create() {
              const width = this.game.config.width as number;
              const height = this.game.config.height as number;

              this.matter.world.setBounds(0, 0, width, height);

              // Score text (always visible)
              this.scoreText = this.add.text(10, 10, 'Score: 0', {
                fontSize: '24px',
                color: '#ffffff'
              }).setDepth(1).setScrollFactor(0);

              // Overlay instruction text (shown in ready / gameOver)
              this.overlayText = this.add.text(width / 2, height / 2, 'Tap to Start', {
                fontSize: '32px',
                color: '#ffffff',
                align: 'center'
              }).setOrigin(0.5).setScrollFactor(0);

              // Extend world bounds upward for camera scrolling
              this.cameras.main.setBounds(0, -10000, width, height + 10000);

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
            }
      
            createBase() {
              const baseImg = this.matter.add.image(
                (this.game.config.width as number) / 2,
                (this.game.config.height as number) - 50,
                'block'
              );
              baseImg.setDisplaySize(this.initialBlockWidth, 50);
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
                blockImg.setDisplaySize(this.initialBlockWidth, this.blockHeight);
                this.blockWidth = 100; // Para los siguientes bloques
              } else {
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
              this.moveSpeed = 2; // Reset speed
              this.blockWidth = 100;
              
              // Reset UI
              if (this.scoreText) this.scoreText.setText('Score: 0');
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
            };

            startGame = () => {
              this.gameState = 'playing';
              this.score = 0;
              this.isBlockFalling = false;
              this.moveSpeed = 2; // Ensure speed is reset
              
              if (this.scoreText) this.scoreText.setText('Score: 0');
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

                // Obtener la posición Y donde cayó el bloque
                const yPos = this.topBlock.y;
                
                // Crear efectos de partes que caen ANTES de destruir el bloque original
                this.createFallingPieces(this.topBlock, supportedLeft, supportedRight);
                
                // Destruir el bloque original
                this.topBlock.destroy();
                this.topBlock = null;

                // Crear un nuevo bloque solo con la parte apoyada
                const supportedBlock = this.matter.add.image(supportedCenterX, yPos, 'block');
                supportedBlock.setDisplaySize(supportedWidth, this.blockHeight);
                supportedBlock.setStatic(true);

                // Agregar el bloque apoyado a la torre
                this.tower.push(supportedBlock);

                // Para el próximo bloque, usar el ancho de la parte que quedó apoyada
                this.blockWidth = supportedWidth;

                // Update score
                this.score += 1;
                if (this.scoreText) this.scoreText.setText(`Score: ${this.score}`);

                // Increase difficulty ligeramente en cada bloque (0.05 px/frame) hasta un máximo de 6
                const sign = Math.sign(this.moveSpeed) || 1;
                const newMag = Math.min(Math.abs(this.moveSpeed) + 0.05, 6);
                this.moveSpeed = sign * newMag;

                // Camera scroll up if near top
                const cameraRelativeY = yPos - this.cameras.main.scrollY;
                if (cameraRelativeY < 150) {
                  this.cameras.main.scrollY -= this.blockHeight;
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
                
                const leftPiece = this.matter.add.image(leftOverhangCenterX, blockY, 'block');
                leftPiece.setDisplaySize(leftOverhangWidth, this.blockHeight);
                leftPiece.setStatic(false); // Hacer que caiga
                
                // ¡EFECTOS ESPECTACULARES! 🎪
                leftPiece.setBounce(0.8); // ¡SÚPER REBOTE!
                leftPiece.setFrictionAir(0.005); // Menos fricción = más vuelo
                leftPiece.setFriction(0.3); // Fricción al tocar superficies
                leftPiece.setTint(0xff4757); // Rojo más vibrante
                
                // ¡Impulso dramático hacia afuera!
                const horizontalForce = -3 - Math.random() * 2; // Entre -3 y -5
                const verticalForce = -1 - Math.random() * 2; // Un poco hacia arriba
                leftPiece.setVelocity(horizontalForce, verticalForce);
                
                // ¡Rotación espectacular!
                leftPiece.setAngularVelocity(-0.1 - Math.random() * 0.2); // Giro hacia la izquierda
                
                // Destruir después de más tiempo para ver el espectáculo
                this.time.delayedCall(5000, () => {
                  if (leftPiece && leftPiece.body) {
                    leftPiece.destroy();
                  }
                });
              }

              // Parte derecha sobresaliente (si existe)
              if (blockRight > supportedRight) {
                const rightOverhangWidth = blockRight - supportedRight;
                const rightOverhangCenterX = supportedRight + rightOverhangWidth / 2;
                
                const rightPiece = this.matter.add.image(rightOverhangCenterX, blockY, 'block');
                rightPiece.setDisplaySize(rightOverhangWidth, this.blockHeight);
                rightPiece.setStatic(false); // Hacer que caiga
                
                // ¡EFECTOS ESPECTACULARES! 🎪
                rightPiece.setBounce(0.8); // ¡SÚPER REBOTE!
                rightPiece.setFrictionAir(0.005); // Menos fricción = más vuelo
                rightPiece.setFriction(0.3); // Fricción al tocar superficies
                rightPiece.setTint(0xff4757); // Rojo más vibrante
                
                // ¡Impulso dramático hacia afuera!
                const horizontalForce = 3 + Math.random() * 2; // Entre 3 y 5
                const verticalForce = -1 - Math.random() * 2; // Un poco hacia arriba
                rightPiece.setVelocity(horizontalForce, verticalForce);
                
                // ¡Rotación espectacular!
                rightPiece.setAngularVelocity(0.1 + Math.random() * 0.2); // Giro hacia la derecha
                
                // Destruir después de más tiempo para ver el espectáculo
                this.time.delayedCall(5000, () => {
                  if (rightPiece && rightPiece.body) {
                    rightPiece.destroy();
                  }
                });
              }
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