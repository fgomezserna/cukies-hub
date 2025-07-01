'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Trophy, Target, DollarSign, Zap } from 'lucide-react';

interface GameStatsProps {
  betAmount: number;
  currentStep: number;
  totalSteps: number;
  completionPercentage: number;
  currentMultiplier: number;
  potentialWinning: number;
}

export function GameStats({
  betAmount,
  currentStep,
  totalSteps,
  completionPercentage,
  currentMultiplier,
  potentialWinning
}: GameStatsProps) {
  const [previousMultiplier, setPreviousMultiplier] = useState(currentMultiplier);
  const [isAnimating, setIsAnimating] = useState(false);

  const profitAmount = potentialWinning - betAmount;
  const profitPercentage = ((profitAmount / betAmount) * 100);

  // Detectar cambios en el multiplicador
  useEffect(() => {
    if (currentMultiplier > previousMultiplier) {
      setIsAnimating(true);
      
      // Remover la clase de animación después de que termine
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 600); // Duración de la animación multiplierExpand

      return () => clearTimeout(timer);
    }
    setPreviousMultiplier(currentMultiplier);
  }, [currentMultiplier, previousMultiplier]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Initial bet */}
      <Card className="game-card">
        <CardHeader className="card-header-custom flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-white">Initial Bet</CardTitle>
          <DollarSign className="h-3 w-3 text-white/70" />
        </CardHeader>
        <CardContent className="card-content-custom">
          <div className="text-base font-bold text-white">${betAmount.toFixed(2)}</div>
          <p className="text-xs text-white/70">Amount wagered</p>
        </CardContent>
      </Card>

      {/* Progress */}
      <Card className="game-card">
        <CardHeader className="card-header-custom flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-white">Progress</CardTitle>
          <Target className="h-3 w-3 text-white/70" />
        </CardHeader>
        <CardContent className="card-content-custom">
          <div className="text-base font-bold text-white">{currentStep}/{totalSteps}</div>
          <Progress value={completionPercentage} className="mt-1" />
          <p className="text-xs text-white/70 mt-1">
            {completionPercentage.toFixed(1)}% completed
          </p>
        </CardContent>
      </Card>

      {/* Potential winnings */}
      <Card className="game-card">
        <CardHeader className="card-header-custom flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-white">Potential Winnings</CardTitle>
          <Trophy className="h-3 w-3 text-white/70" />
        </CardHeader>
        <CardContent className="card-content-custom">
          <div className="text-base font-bold text-green-400">${potentialWinning.toFixed(2)}</div>
          <p className={`text-xs ${profitAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {profitAmount >= 0 ? '+' : ''}{profitPercentage.toFixed(1)}% ({profitAmount >= 0 ? '+' : ''}${profitAmount.toFixed(2)})
          </p>
        </CardContent>
      </Card>

      {/* Multiplier */}
      <Card className={`game-card ${isAnimating ? 'multiplier-expand' : ''}`}>
        <CardHeader className="card-header-custom flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-white">Multiplier</CardTitle>
          <Zap className={`h-3 w-3 text-white/70 ${isAnimating ? 'text-yellow-400' : ''}`} />
        </CardHeader>
        <CardContent className="card-content-custom flex flex-col items-center justify-center">
          <div className={`text-2xl font-bold text-yellow-400 ${isAnimating ? 'text-yellow-300' : ''}`}>
            {currentMultiplier.toFixed(1)}x
          </div>
          <p className="text-xs text-white/70 text-center">Current factor</p>
        </CardContent>
      </Card>
    </div>
  );
}