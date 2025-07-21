"use client";

import dynamic from 'next/dynamic'
import { useGameConnection } from '@/hooks/useGameConnection';
import { useEffect, useRef } from 'react';

const GameContainer = dynamic(() => import('@/components/game-container'), {
  ssr: false,
  loading: () => <p className="text-white">Loading game...</p>
})

export default function Home() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  
  // Initialize game connection
  const gameConnection = useGameConnection();

  // Expose game functions to the GameContainer via window object
  useEffect(() => {
    (window as any).towerBuilderGame = {
      startSession: () => {
        // For direct integration, we don't need to start a session
        // The parent will handle this automatically via the GameLayout
        console.log('🏗️ Tower Builder: Game session ready');
      },
      sendCheckpoint: (score: number, gameTime: number) => {
        if (gameConnection.gameSession) {
          gameConnection.sendCheckpoint(score, gameTime);
        }
      },
      endSession: (finalScore: number, metadata?: any) => {
        console.log('🏁 [TOWER] endSession called with final score:', finalScore, 'metadata:', metadata);
        console.log('🏁 [TOWER] Sending session end to parent...');
        gameConnection.sendSessionEnd(finalScore, metadata);
      }
    };

    return () => {
      delete (window as any).towerBuilderGame;
    };
  }, [gameConnection]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24" style={{ background: 'linear-gradient(to bottom, #87CEEB, #f0f8ff)' }}>
      <div className="text-center mb-8">
        {gameConnection.isAuthenticated && (
          <p className="text-green-400 text-sm mt-2">
            ✅ Connected as {gameConnection.user?.username || 'Player'}
          </p>
        )}
      </div>
      <div ref={gameContainerRef}>
        <GameContainer />
      </div>
    </main>
  );
} 