'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, DollarSign, TrendingUp } from 'lucide-react';

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
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Información actual */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-2xl font-bold text-primary">
                <TrendingUp className="h-6 w-6" />
                {currentMultiplier.toFixed(1)}x
              </div>
              <p className="text-sm text-muted-foreground">Multiplicador Actual</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-2xl font-bold text-green-600">
                <DollarSign className="h-6 w-6" />
                {potentialWinning.toFixed(2)}
              </div>
              <p className="text-sm text-muted-foreground">Ganancia Potencial</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Próximo multiplicador */}
      {nextMultiplier && (
        <Card className="border-dashed border-2 border-muted-foreground/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-lg font-semibold text-muted-foreground mb-1">
                Próximo multiplicador: {nextMultiplier.toFixed(1)}x
              </div>
              <div className="text-sm text-muted-foreground">
                Ganancia potencial: ${((potentialWinning / currentMultiplier) * nextMultiplier).toFixed(2)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Button
          onClick={onCashOut}
          disabled={!canCashOut || isAnimating}
          variant="outline"
          size="lg"
          className="w-full bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300 hover:text-green-800"
        >
          <DollarSign className="h-5 w-5 mr-2" />
          Retirar ${potentialWinning.toFixed(2)}
        </Button>

        <Button
          onClick={onAdvance}
          disabled={!canAdvance || isAnimating}
          size="lg"
          className="w-full"
        >
          <ArrowRight className={`h-5 w-5 mr-2 ${isAnimating ? 'animate-pulse' : ''}`} />
          {isAnimating ? 'Avanzando...' : 'Avanzar'}
        </Button>
      </div>

      {/* Advertencias */}
      <div className="text-xs text-muted-foreground text-center space-y-1">
        {!canCashOut && (
          <p className="text-amber-600">⚠️ Debes avanzar al menos una casilla para poder retirar</p>
        )}
        {!canAdvance && canCashOut && (
          <p className="text-blue-600">🎉 ¡Has llegado al final! Solo puedes retirar</p>
        )}
      </div>
    </div>
  );
}