'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, DollarSign } from 'lucide-react';

interface GameControlsProps {
  currentMultiplier: number;
  potentialWinning: number;
  nextMultiplier?: number | null;
  canAdvance: boolean;
  canCashOut: boolean;
  onAdvance: () => void;
  onCashOut: () => void;
  isAnimating?: boolean;
}

export function GameControls({
  currentMultiplier,
  potentialWinning,
  nextMultiplier,
  canAdvance,
  canCashOut,
  onAdvance,
  onCashOut,
  isAnimating = false
}: GameControlsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 max-w-4xl mx-auto">
        <Button
          onClick={onCashOut}
          disabled={!canCashOut || isAnimating}
          className="w-full h-[90px] text-base pixellari-title text-white font-bold text-xl border-none bg-transparent hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
          style={{
            backgroundImage: 'url(/assets/images/button_442x75_groc.png)',
            backgroundSize: '100% 100%',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            textShadow: '2px 2px 0px rgba(0,0,0,0.8)'
          }}
        >
          <DollarSign className="h-5 w-5 mr-2" />
          Cash Out ${potentialWinning.toFixed(2)}
        </Button>

        <Button
          onClick={onAdvance}
          disabled={!canAdvance || isAnimating}
          className="w-full h-[90px] text-base pixellari-title text-white font-bold text-xl border-none bg-transparent hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
          style={{
            backgroundImage: 'url(/assets/images/button_442x75_groc.png)',
            backgroundSize: '100% 100%',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            textShadow: '2px 2px 0px rgba(0,0,0,0.8)'
          }}
        >
          <ArrowRight className={`h-5 w-5 mr-2 ${isAnimating ? 'animate-pulse' : ''}`} />
          {isAnimating ? 'Advancing...' : 'Advance'}
        </Button>

        {!canAdvance && canCashOut && (
          <p className="col-span-full text-sm text-blue-600 text-center mt-3">
            🎉 You've reached the end! You can only cash out
          </p>
        )}
    </div>
  );
}