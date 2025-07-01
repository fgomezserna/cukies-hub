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
    <div className="w-full max-w-lg mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Button
          onClick={onCashOut}
          disabled={!canCashOut || isAnimating}
          variant="outline"
          size="lg"
          className="w-full bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300 hover:text-green-800"
        >
          <DollarSign className="h-5 w-5 mr-2" />
          Cash Out ${potentialWinning.toFixed(2)}
        </Button>

        <Button
          onClick={onAdvance}
          disabled={!canAdvance || isAnimating}
          size="lg"
          className="w-full"
        >
          <ArrowRight className={`h-5 w-5 mr-2 ${isAnimating ? 'animate-pulse' : ''}`} />
          {isAnimating ? 'Advancing...' : 'Advance'}
        </Button>

        {!canCashOut && (
          <p className="col-span-full text-xs text-amber-600 text-center mt-2">
            ⚠️ You must advance at least one tile to cash out
          </p>
        )}
        {!canAdvance && canCashOut && (
          <p className="col-span-full text-xs text-blue-600 text-center mt-2">
            🎉 You've reached the end! You can only cash out
          </p>
        )}
      </div>
    </div>
  );
}