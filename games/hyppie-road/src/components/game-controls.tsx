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
    <div className="w-full max-w-4xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button
          onClick={onCashOut}
          disabled={!canCashOut || isAnimating}
          variant="outline"
          className="w-full h-14 text-base bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300 hover:text-green-800"
        >
          <DollarSign className="h-5 w-5 mr-2" />
          Cash Out ${potentialWinning.toFixed(2)}
        </Button>

        <Button
          onClick={onAdvance}
          disabled={!canAdvance || isAnimating}
          className="w-full h-14 text-base"
        >
          <ArrowRight className={`h-5 w-5 mr-2 ${isAnimating ? 'animate-pulse' : ''}`} />
          {isAnimating ? 'Advancing...' : 'Advance'}
        </Button>

        {!canCashOut && (
          <p className="col-span-full text-sm text-amber-600 text-center mt-3">
            ⚠️ You must advance at least one tile to cash out
          </p>
        )}
        {!canAdvance && canCashOut && (
          <p className="col-span-full text-sm text-blue-600 text-center mt-3">
            🎉 You've reached the end! You can only cash out
          </p>
        )}
      </div>
    </div>
  );
}