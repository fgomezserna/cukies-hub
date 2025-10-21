"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel } from 'pusher-js';
import type { SessionData } from './usePusherConnection';
import { randomManager } from '@/lib/random';

type MultiplayerStatus =
  | 'idle'
  | 'searching'
  | 'waiting'
  | 'configuring'
  | 'countdown'
  | 'running'
  | 'sudden_death'
  | 'completed'
  | 'error';

type PlayerLifecycle = 'waiting' | 'ready' | 'playing' | 'eliminated' | 'finished';

export interface MatchConfig {
  matchId: string;
  hostId: string;
  seed: string;
  targetDifference: number;
  startAt: number; // epoch ms
}

export interface PlayerSnapshot {
  id: string;
  score: number;
  hearts: number;
  status: PlayerLifecycle;
  lastUpdate: number;
  gameStatus?: 'idle' | 'countdown' | 'playing' | 'paused' | 'gameOver';
  gameOverReason?: string;
}

interface SuddenDeathState {
  chasingPlayerId: string;
  targetScore: number;
  leaderId: string;
}

interface MatchResult {
  winnerId: string;
  reason: 'score_difference' | 'elimination' | 'sudden_death' | 'forfeit';
  finalScores: Record<string, number>;
}

interface UseMultiplayerMatchParams {
  channel: Channel | null;
  sessionData: SessionData | null;
  isConnected: boolean;
  targetDifference?: number;
}

interface UseMultiplayerMatchValue {
  status: MultiplayerStatus;
  isHost: boolean;
  matchConfig: MatchConfig | null;
  localPlayer: PlayerSnapshot | null;
  opponent: PlayerSnapshot | null;
  opponentId: string | null;
  matchResult: MatchResult | null;
  suddenDeath: SuddenDeathState | null;
  startSignal: number | null;
  error: string | null;
  hasOpponent: boolean;
  scoreDifference: number;
  targetDifference: number;
  initiateMatch: () => void;
  publishLocalSnapshot: (snapshot: Partial<PlayerSnapshot>) => void;
  notifyGameStart: () => void;
  notifyGameOver: (reason: string, finalScore: number, lifecycle?: PlayerLifecycle) => void;
  reset: () => void;
}

const DEFAULT_TARGET_DIFFERENCE = 500;
const MATCH_COUNTDOWN_MS = 3000;

const generateRandomToken = (): number => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }
  // Linear congruential fallback based on time
  const now = safeNow();
  return (now * 1664525 + 1013904223) >>> 0;
};

const createInitialPlayerSnapshot = (id: string): PlayerSnapshot => ({
  id,
  score: 0,
  hearts: 3,
  status: 'waiting',
  lastUpdate: Date.now(),
  gameStatus: 'idle',
});

const safeNow = () => Date.now();

export function useMultiplayerMatch({
  channel,
  sessionData,
  isConnected,
  targetDifference = DEFAULT_TARGET_DIFFERENCE,
}: UseMultiplayerMatchParams): UseMultiplayerMatchValue {
  const localId = sessionData?.sessionId ?? 'local';
  const [status, setStatus] = useState<MultiplayerStatus>('idle');
  const [players, setPlayers] = useState<Record<string, PlayerSnapshot>>({});
  const [matchConfig, setMatchConfig] = useState<MatchConfig | null>(null);
  const [suddenDeath, setSuddenDeath] = useState<SuddenDeathState | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startSignal, setStartSignal] = useState<number | null>(null);

  const hasEmittedJoinRef = useRef(false);
  const configSentRef = useRef(false);
  const endBroadcastRef = useRef(false);
  const startTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const opponentId = useMemo(() => {
    const ids = Object.keys(players).filter(id => id !== localId);
    return ids.length > 0 ? ids[0] : null;
  }, [players, localId]);

  const localPlayer = players[localId] ?? null;
  const opponent = opponentId ? players[opponentId] ?? null : null;

  const playerIds = useMemo(() => Object.keys(players).sort(), [players]);
  const isHost = useMemo(() => {
    if (!localId) return false;
    if (playerIds.length === 0) return true;
    return playerIds[0] === localId;
  }, [playerIds, localId]);

  const hasOpponent = Boolean(opponentId);

  const scoreDifference = useMemo(() => {
    if (!localPlayer || !opponent) return 0;
    return localPlayer.score - opponent.score;
  }, [localPlayer, opponent]);

  const broadcast = useCallback(
    (eventName: string, payload: Record<string, unknown>) => {
      console.log('[MATCH] Broadcasting event:', eventName, payload);
      if (!channel) {
        console.warn('[MATCH] No channel available for broadcast');
        return;
      }
      try {
        channel.trigger(eventName, {
          senderId: localId,
          timestamp: safeNow(),
          ...payload,
        });
        console.log('[MATCH] Event broadcasted successfully');
      } catch (err) {
        console.error('[MATCH] Error emitting event', eventName, err);
      }
    },
    [channel, localId]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setPlayers({});
    setMatchConfig(null);
    setSuddenDeath(null);
    setMatchResult(null);
    setError(null);
    setStartSignal(null);
    hasEmittedJoinRef.current = false;
    configSentRef.current = false;
    endBroadcastRef.current = false;
    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }
    randomManager.clear();
  }, []);

  const registerPlayer = useCallback((playerId: string) => {
    setPlayers(prev => {
      if (prev[playerId]) return prev;
      return {
        ...prev,
        [playerId]: createInitialPlayerSnapshot(playerId),
      };
    });
  }, []);

  const initiateMatch = useCallback(() => {
    console.log('[MATCH] initiateMatch called', {
      hasSessionData: !!sessionData,
      sessionId: sessionData?.sessionId,
      roomId: sessionData?.roomId,
      isConnected,
      hasChannel: !!channel,
      hasEmittedJoin: hasEmittedJoinRef.current
    });
    
    // If prerequisites are not yet ready, enter 'searching' and wait for auto-retry
    if (!sessionData || !isConnected || !channel) {
      if (status !== 'searching') {
        console.log('[MATCH] Prereqs missing (session/channel/connection). Entering searching state');
        setStatus('searching');
      }
      return;
    }

    if (!hasEmittedJoinRef.current) {
      console.log('[MATCH] Announcing presence to match channel', sessionData.sessionId, 'room:', sessionData.roomId);
      registerPlayer(localId);
      broadcast('client-match-join', { 
        playerId: localId,
        roomId: sessionData.roomId // Include room ID in join message
      });
      hasEmittedJoinRef.current = true;
      setStatus('waiting');
    } else {
      console.log('[MATCH] Already emitted join, current status:', status);
    }
  }, [sessionData, isConnected, channel, registerPlayer, broadcast, localId, status]);

  const publishLocalSnapshot = useCallback(
    (partial: Partial<PlayerSnapshot>) => {
      if (!sessionData || !channel) return;

      setPlayers(prev => {
        const current = prev[localId] ?? createInitialPlayerSnapshot(localId);
        const updated: PlayerSnapshot = {
          ...current,
          ...partial,
          lastUpdate: safeNow(),
          id: localId,
        };
        broadcast('client-match-state', { playerId: localId, state: updated });
        return {
          ...prev,
          [localId]: updated,
        };
      });
    },
    [broadcast, channel, localId, sessionData]
  );

  const notifyGameStart = useCallback(() => {
    publishLocalSnapshot({ status: 'playing', gameStatus: 'playing' });
  }, [publishLocalSnapshot]);

  const notifyGameOver = useCallback((reason: string, finalScore: number, lifecycle: PlayerLifecycle = 'finished') => {
    publishLocalSnapshot({
      status: lifecycle,
      gameStatus: 'gameOver',
      gameOverReason: reason,
      score: finalScore,
    });
  }, [publishLocalSnapshot]);

  // Handle incoming events
  useEffect(() => {
    if (!channel) return;

    const handleJoin = (data: any) => {
      if (!data?.playerId) return;
      registerPlayer(data.playerId);
      if (status === 'idle') {
        setStatus('waiting');
      }
    };

    const handleState = (data: any) => {
      const { playerId, state } = data || {};
      if (!playerId || !state) return;
      registerPlayer(playerId);
      setPlayers(prev => ({
        ...prev,
        [playerId]: { ...state, id: playerId },
      }));
    };

    const handleConfig = (data: any) => {
      if (!data?.matchId) return;
      const config: MatchConfig = {
        matchId: data.matchId,
        hostId: data.hostId,
        seed: data.seed,
        targetDifference: data.targetDifference ?? targetDifference,
        startAt: data.startAt,
      };
      console.log('[MATCH] Received config', config);
      configSentRef.current = true;
      randomManager.setSeed(config.seed);
      setMatchConfig(config);
      setStatus('countdown');
    };

    const handleEnd = (data: any) => {
      if (!data?.winnerId) return;
      endBroadcastRef.current = true;
      setStatus('completed');
      setMatchResult({
        winnerId: data.winnerId,
        reason: data.reason ?? 'score_difference',
        finalScores: data.finalScores || {},
      });
      setSuddenDeath(null);
    };

    channel.bind('client-match-join', handleJoin);
    channel.bind('client-match-state', handleState);
    channel.bind('client-match-config', handleConfig);
    channel.bind('client-match-ended', handleEnd);

    return () => {
      channel.unbind('client-match-join', handleJoin);
      channel.unbind('client-match-state', handleState);
      channel.unbind('client-match-config', handleConfig);
      channel.unbind('client-match-ended', handleEnd);
    };
  }, [channel, registerPlayer, targetDifference]);

  // Auto initiate state for host when both players present
  useEffect(() => {
    if (!isHost) return;
    if (!hasOpponent) return;
    if (configSentRef.current) return;

    const hostPlayer = players[localId];
    const opponentPlayer = opponentId ? players[opponentId] : null;
    if (!hostPlayer || !opponentPlayer) return;

    const now = safeNow();
    const seedToken = generateRandomToken();
    const config: MatchConfig = {
      matchId: `${localId}-${now}`,
      hostId: localId,
      seed: `${localId}-${now}-${seedToken}`,
      targetDifference,
      startAt: now + 4000,
    };

    configSentRef.current = true;
    randomManager.setSeed(config.seed);
    setMatchConfig(config);
    setStatus('countdown');
    const payload: Record<string, unknown> = { ...config };
    broadcast('client-match-config', payload);
  }, [isHost, hasOpponent, players, localId, opponentId, targetDifference, broadcast]);

  // Schedule game start based on startAt
  useEffect(() => {
    if (!matchConfig) return;
    if (status !== 'countdown') return;
    if (startTimeoutRef.current) return;

    const now = safeNow();
    const countdownStart = matchConfig.startAt - MATCH_COUNTDOWN_MS;
    const delay = Math.max(0, countdownStart - now);
    startTimeoutRef.current = setTimeout(() => {
      setStatus('running');
      setStartSignal(safeNow());
      publishLocalSnapshot({ status: 'playing', gameStatus: 'playing' });
    }, delay);

    return () => {
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
    };
  }, [matchConfig, status, publishLocalSnapshot]);

  // Host evaluates victory conditions
  useEffect(() => {
    if (!isHost) return;
    if (!matchConfig) return;
    if (!opponentId) return;
    if (status !== 'running' && status !== 'sudden_death') return;
    if (endBroadcastRef.current) return;

    const self = players[localId];
    const rival = players[opponentId];
    if (!self || !rival) return;

    const diff = self.score - rival.score;

    const attemptFinalize = (winnerId: string, reason: MatchResult['reason']) => {
      if (endBroadcastRef.current) return;
      endBroadcastRef.current = true;
      const scores: Record<string, number> = {
        [localId]: self.score,
        [opponentId]: rival.score,
      };
      setMatchResult({ winnerId, reason, finalScores: scores });
      setStatus('completed');
      broadcast('client-match-ended', { winnerId, reason, finalScores: scores });
      setSuddenDeath(null);
    };

    // Score difference victory
    if (Math.abs(diff) >= matchConfig.targetDifference) {
      const winnerId = diff > 0 ? localId : opponentId;
      attemptFinalize(winnerId, 'score_difference');
      return;
    }

    // Handle eliminations
    const selfEliminated = self.status === 'eliminated' || self.gameStatus === 'gameOver';
    const rivalEliminated = rival.status === 'eliminated' || rival.gameStatus === 'gameOver';

    if (selfEliminated && rivalEliminated) {
      const winnerId = self.score >= rival.score ? localId : opponentId;
      attemptFinalize(winnerId, 'elimination');
      return;
    }

    if (selfEliminated && !rivalEliminated) {
      if (self.score <= rival.score) {
        attemptFinalize(opponentId, 'elimination');
      } else {
        setSuddenDeath({
          chasingPlayerId: opponentId,
          leaderId: localId,
          targetScore: self.score,
        });
        setStatus('sudden_death');
      }
      return;
    }

    if (rivalEliminated && !selfEliminated) {
      if (rival.score <= self.score) {
        attemptFinalize(localId, 'elimination');
      } else {
        setSuddenDeath({
          chasingPlayerId: localId,
          leaderId: opponentId,
          targetScore: rival.score,
        });
        setStatus('sudden_death');
      }
      return;
    }

    if (status === 'sudden_death' && suddenDeath) {
      const chaser = suddenDeath.chasingPlayerId === localId ? self : rival;
      const leaderScore = suddenDeath.leaderId === localId ? self.score : rival.score;

      if (chaser.score > leaderScore) {
        attemptFinalize(chaser.id, 'sudden_death');
        return;
      }

      const chaserEliminated = chaser.status === 'eliminated' || chaser.gameStatus === 'gameOver';
      if (chaserEliminated) {
        attemptFinalize(suddenDeath.leaderId, 'sudden_death');
      }
    }
  }, [
    isHost,
    matchConfig,
    players,
    opponentId,
    status,
    suddenDeath,
    localId,
    broadcast,
  ]);

  // React to connection availability
  useEffect(() => {
    if (!isConnected || !channel) return;
    if (status === 'searching') {
      console.log('[MATCH] Connection available, calling initiateMatch');
      initiateMatch();
    }
  }, [isConnected, channel, status]);

  useEffect(() => {
    return () => {
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    status,
    isHost,
    matchConfig,
    localPlayer,
    opponent,
    opponentId,
    matchResult,
    suddenDeath,
    startSignal,
    error,
    hasOpponent,
    scoreDifference,
    targetDifference,
    initiateMatch,
    publishLocalSnapshot,
    notifyGameStart,
    notifyGameOver,
    reset,
  };
}

export default useMultiplayerMatch;
