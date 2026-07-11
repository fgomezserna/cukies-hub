"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MultiplayerClientError,
  TreasureHuntMultiplayerController,
  createTreasureHuntParentTransport,
  type MatchResult,
  type PlayerLifecycle,
  type PublicMatchPlayer,
  type SuddenDeathState,
  type MultiplayerControllerState,
} from '@/lib/multiplayer-client';
import { randomManager } from '@/lib/random';
import { isTreasureHuntMultiplayerEnabled } from '@/lib/multiplayer-feature';

export type MultiplayerStatus =
  | 'idle'
  | 'searching'
  | 'waiting'
  | 'countdown'
  | 'running'
  | 'paused_reconnect'
  | 'sudden_death'
  | 'completed'
  | 'abandoned'
  | 'error';

export interface MatchConfig {
  readonly matchId: string;
  readonly seed: string | null;
  readonly targetDifference: number;
  readonly startAt: number | null;
  readonly resumeAt: number | null;
}

export interface PlayerSnapshot extends PublicMatchPlayer {
  readonly id: string;
  readonly status: PlayerLifecycle;
}

export interface UseMultiplayerMatchValue {
  readonly status: MultiplayerStatus;
  readonly isHost: boolean;
  readonly playerId: string | null;
  readonly slot: 0 | 1 | null;
  readonly roomCode: string | null;
  readonly inviteUrl: string | null;
  readonly matchConfig: MatchConfig | null;
  readonly localPlayer: PlayerSnapshot | null;
  readonly opponent: PlayerSnapshot | null;
  readonly opponentId: string | null;
  readonly matchResult: MatchResult | null;
  readonly suddenDeath: SuddenDeathState | null;
  readonly startSignal: number;
  readonly resumeSignal: number;
  readonly error: string | null;
  readonly hasOpponent: boolean;
  readonly scoreDifference: number;
  readonly targetDifference: number;
  initiateMatch(roomCode: string): Promise<void>;
  publishLocalSnapshot(snapshot: {
    score: number;
    hearts: number;
    lifecycle?: PlayerLifecycle;
    status?: PlayerLifecycle;
  }): void;
  notifyGameStart(): void;
  notifyGameOver(reason: string, finalScore: number, lifecycle?: PlayerLifecycle): void;
  reset(): Promise<void>;
}

const INITIAL_STATE: MultiplayerControllerState = {
  playerId: null,
  slot: null,
  roomCode: null,
  inviteUrl: null,
  match: null,
  error: null,
  joining: false,
  startSignal: 0,
  resumeSignal: 0,
};

function toPlayer(player: PublicMatchPlayer | undefined): PlayerSnapshot | null {
  return player ? { ...player, id: player.playerId, status: player.lifecycle } : null;
}

function toStatus(state: MultiplayerControllerState, setupError: string | null): MultiplayerStatus {
  if (setupError) return 'error';
  if (!state.match) {
    if (state.joining) return 'searching';
    return state.error ? 'error' : 'idle';
  }
  if (state.match.status === 'finished') return 'completed';
  return state.match.status;
}

export function useMultiplayerMatch(): UseMultiplayerMatchValue {
  const multiplayerEnabled = isTreasureHuntMultiplayerEnabled();
  const controllerRef = useRef<TreasureHuntMultiplayerController | null>(null);
  const [controllerState, setControllerState] = useState<MultiplayerControllerState>(INITIAL_STATE);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const transport = createTreasureHuntParentTransport();
      const controller = new TreasureHuntMultiplayerController({
        transport,
        enabled: multiplayerEnabled,
        onSeed: (seed) => randomManager.setSeed(seed),
        onState: (state) => setControllerState({ ...state }),
      });
      controllerRef.current = controller;
      setSetupError(null);
      return () => {
        controller.dispose();
        if (controllerRef.current === controller) controllerRef.current = null;
      };
    } catch (error) {
      setSetupError(
        error instanceof MultiplayerClientError
          ? error.message
          : 'No se pudo iniciar el cliente multiplayer seguro',
      );
      return undefined;
    }
  }, [multiplayerEnabled]);

  const initiateMatch = useCallback(async (roomCode: string) => {
    if (!multiplayerEnabled) {
      setSetupError('El modo multiplayer no está habilitado');
      return;
    }
    const controller = controllerRef.current;
    if (!controller) {
      setSetupError(setupError ?? 'El cliente multiplayer aún no está disponible');
      return;
    }
    try {
      await controller.join(roomCode);
    } catch {
      // The controller already exposes a sanitized public error through state.
    }
  }, [multiplayerEnabled, setupError]);

  const publishLocalSnapshot = useCallback(
    (snapshot: {
      score: number;
      hearts: number;
      lifecycle?: PlayerLifecycle;
      status?: PlayerLifecycle;
    }) => {
      controllerRef.current?.publishSnapshot({
        score: snapshot.score,
        hearts: snapshot.hearts,
        lifecycle: snapshot.lifecycle ?? snapshot.status ?? 'playing',
      });
    },
    [],
  );

  const notifyGameStart = useCallback(() => {
    const local = controllerRef.current?.getState().match?.players.find(
      (player) => player.playerId === controllerRef.current?.getState().playerId,
    );
    if (local) {
      controllerRef.current?.publishSnapshot({
        score: local.score,
        hearts: local.hearts,
        lifecycle: 'playing',
      });
    }
  }, []);

  const notifyGameOver = useCallback(
    (_reason: string, finalScore: number, lifecycle: PlayerLifecycle = 'finished') => {
      const local = controllerRef.current?.getState().match?.players.find(
        (player) => player.playerId === controllerRef.current?.getState().playerId,
      );
      controllerRef.current?.publishSnapshot({
        score: finalScore,
        hearts: lifecycle === 'eliminated' ? 0 : (local?.hearts ?? 1),
        lifecycle,
      });
    },
    [],
  );

  const reset = useCallback(async () => {
    try {
      await controllerRef.current?.reset();
      randomManager.clear();
    } catch {
      // The controller already publishes a sanitized reset error.
    }
  }, []);

  return useMemo(() => {
    const match = controllerState.match;
    const local = match?.players.find((player) => player.playerId === controllerState.playerId);
    const rival = match?.players.find((player) => player.playerId !== controllerState.playerId);
    const localPlayer = toPlayer(local);
    const opponent = toPlayer(rival);
    const targetDifference = match?.config.winDelta ?? 500;

    return {
      status: toStatus(controllerState, setupError),
      isHost: controllerState.slot === 0,
      playerId: controllerState.playerId,
      slot: controllerState.slot,
      roomCode: controllerState.roomCode,
      inviteUrl: controllerState.inviteUrl,
      matchConfig: match
        ? {
            matchId: match.matchId,
            seed: match.config.seed,
            targetDifference,
            startAt: match.config.startAt,
            resumeAt: match.config.resumeAt,
          }
        : null,
      localPlayer,
      opponent,
      opponentId: opponent?.playerId ?? null,
      matchResult: match?.result ?? null,
      suddenDeath: match?.suddenDeath ?? null,
      startSignal: controllerState.startSignal,
      resumeSignal: controllerState.resumeSignal,
      error: setupError ?? controllerState.error,
      hasOpponent: Boolean(opponent),
      scoreDifference: localPlayer && opponent ? localPlayer.score - opponent.score : 0,
      targetDifference,
      initiateMatch,
      publishLocalSnapshot,
      notifyGameStart,
      notifyGameOver,
      reset,
    };
  }, [
    controllerState,
    initiateMatch,
    notifyGameOver,
    notifyGameStart,
    publishLocalSnapshot,
    reset,
    setupError,
  ]);
}

export default useMultiplayerMatch;
