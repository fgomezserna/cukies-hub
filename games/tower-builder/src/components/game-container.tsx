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
                  this.scene.restart();
                }
              });
            }
      
            update() {
              if (this.gameState === 'playing' && this.topBlock) {
                this.topBlock.x += this.moveSpeed;

                if (
                  this.topBlock.x > (this.game.config.width as number) - this.topBlock.displayWidth / 2 ||
                  this.topBlock.x < this.topBlock.displayWidth / 2
                ) {
                  this.moveSpeed *= -1;
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
              const blockImg = this.matter.add.image(
                (this.game.config.width as number) / 2,
                (lastBlock.y) - this.blockHeight,
                'block'
              );
              // El primer bloque móvil debe ser igual de ancho que la base
              if (this.tower.length === 1) {
                blockImg.setDisplaySize(this.initialBlockWidth, this.blockHeight);
                blockImg.setStatic(true);
                this.topBlock = blockImg;
                this.blockWidth = 100; // Para los siguientes bloques
              } else {
                blockImg.setDisplaySize(this.blockWidth, this.blockHeight);
                blockImg.setStatic(true);
                this.topBlock = blockImg;
              }
            }

            startGame = () => {
              this.gameState = 'playing';
              this.score = 0;
              if (this.scoreText) this.scoreText.setText('Score: 0');
              if (this.overlayText) this.overlayText.setVisible(false);

              // Reset tower
              this.tower.forEach(img => img.destroy());
              this.tower = [];
              this.blockWidth = 100;

              this.createBase();
              // El primer bloque móvil debe ser igual de ancho que la base
              this.blockWidth = this.initialBlockWidth;
              this.spawnBlock();
              this.blockWidth = 100; // Para los siguientes bloques
            };

            placeBlock() {
              if (!this.topBlock) return;

              const lastBlock = this.tower[this.tower.length - 1];

              const topLeft = this.topBlock.x - this.topBlock.displayWidth / 2;
              const topRight = this.topBlock.x + this.topBlock.displayWidth / 2;

              const lastLeft = lastBlock.x - lastBlock.displayWidth / 2;
              const lastRight = lastBlock.x + lastBlock.displayWidth / 2;

              const overlap = Math.max(0, Math.min(topRight, lastRight) - Math.max(topLeft, lastLeft));

              if (overlap > 10) {
                const newWidth = overlap;
                const newX = (Math.max(topLeft, lastLeft) + Math.min(topRight, lastRight)) / 2;

                const yPos = this.topBlock.y;
                // Remove the old moving block
                this.topBlock.destroy();

                // Create a new static block with the overlapped width
                const newBlock = this.matter.add.image(newX, yPos, 'block');
                newBlock.setDisplaySize(newWidth, this.blockHeight);
                newBlock.setStatic(true);

                this.blockWidth = newWidth;
                this.tower.push(newBlock);

                // Update score
                this.score += 1;
                if (this.scoreText) this.scoreText.setText(`Score: ${this.score}`);

                // Increase difficulty ligeramente en cada bloque (0.2 px/frame) hasta un máximo de 6
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
      
            gameOver() {
              this.gameState = 'gameOver';

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
              gravity: { y: 0 },
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