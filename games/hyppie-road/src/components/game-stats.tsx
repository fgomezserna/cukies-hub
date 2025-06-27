'use client';

import React from 'react';
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
  const profitAmount = potentialWinning - betAmount;
  const profitPercentage = ((profitAmount / betAmount) * 100);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Apuesta inicial */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Apuesta Inicial</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${betAmount.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground">Cantidad apostada</p>
        </CardContent>
      </Card>

      {/* Progreso */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Progreso</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{currentStep}/{totalSteps}</div>
          <Progress value={completionPercentage} className="mt-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {completionPercentage.toFixed(1)}% completado
          </p>
        </CardContent>
      </Card>

      {/* Multiplicador */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Multiplicador</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">{currentMultiplier.toFixed(1)}x</div>
          <p className="text-xs text-muted-foreground">Factor actual</p>
        </CardContent>
      </Card>

      {/* Ganancia potencial */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ganancia Potencial</CardTitle>
          <Trophy className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">${potentialWinning.toFixed(2)}</div>
          <p className={`text-xs ${profitAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {profitAmount >= 0 ? '+' : ''}{profitPercentage.toFixed(1)}% ({profitAmount >= 0 ? '+' : ''}${profitAmount.toFixed(2)})
          </p>
        </CardContent>
      </Card>
    </div>
  );
}