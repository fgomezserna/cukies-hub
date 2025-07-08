"use client";

import dynamic from 'next/dynamic'

const GameContainer = dynamic(() => import('@/components/game-container'), {
  ssr: false,
  loading: () => <p className="text-white">Loading game...</p>
})

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24"  style={{ background: 'linear-gradient(to bottom, #87CEEB, #f0f8ff)' }}>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white">Tower Builder</h1>
        <p className="text-white/80">Toca en cualquier punto para colocar el bloque</p>
      </div>
      <GameContainer />
    </main>
  );
} 