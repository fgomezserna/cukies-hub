import { createHash } from 'crypto';

export interface GameCheckpoint {
  timestamp: number;
  score: number;
  gameTime: number;
  hash: string;
  nonce?: string;
  events?: any[];
}

export interface GameSession {
  id: string;
  userId: string;
  gameId: string;
  sessionToken: string;
  startedAt: Date;
  endedAt?: Date;
  finalScore?: number;
  duration?: number;
  checkpoints: GameCheckpoint[];
  honeypotEvents: any[];
  isValid: boolean;
  invalidReason?: string;
}

/**
 * Generate a cryptographic hash for a game checkpoint
 */
export function generateCheckpointHash(checkpoint: Omit<GameCheckpoint, 'hash'>): string {
  const data = JSON.stringify({
    timestamp: checkpoint.timestamp,
    score: checkpoint.score,
    gameTime: checkpoint.gameTime,
    nonce: checkpoint.nonce || ''
  });
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Validate a checkpoint hash
 */
export function validateCheckpointHash(checkpoint: GameCheckpoint): boolean {
  const expectedHash = generateCheckpointHash(checkpoint);
  return checkpoint.hash === expectedHash;
}

/**
 * Validate score progression across checkpoints
 */
export function validateScoreProgression(checkpoints: GameCheckpoint[]): {
  isValid: boolean;
  reason?: string;
} {
  for (let i = 1; i < checkpoints.length; i++) {
    const prev = checkpoints[i - 1];
    const curr = checkpoints[i];
    
    // Score should not decrease
    if (curr.score < prev.score) {
      return { isValid: false, reason: 'Score decreased between checkpoints' };
    }
    
    // Time should progress
    if (curr.timestamp <= prev.timestamp) {
      return { isValid: false, reason: 'Invalid timestamp progression' };
    }
    
    // Game time should progress
    if (curr.gameTime < prev.gameTime) {
      return { isValid: false, reason: 'Game time went backwards' };
    }
  }
  
  return { isValid: true };
}

/**
 * Validate timing patterns for bot detection
 */
export function validateTimingPatterns(checkpoints: GameCheckpoint[]): {
  isValid: boolean;
  reason?: string;
} {
  if (checkpoints.length < 3) {
    return { isValid: true }; // Need at least 3 checkpoints
  }
  
  const intervals: number[] = [];
  for (let i = 1; i < checkpoints.length; i++) {
    intervals.push(checkpoints[i].timestamp - checkpoints[i - 1].timestamp);
  }
  
  // Calculate variance in intervals
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / intervals.length;
  
  // If variance is too low, it might be a bot (too consistent)
  if (variance < 100) {
    return { isValid: false, reason: 'Timing too consistent (possible bot)' };
  }
  
  return { isValid: true };
}

/**
 * Validate reasonable score rates
 */
export function validateScoreRate(session: GameSession): {
  isValid: boolean;
  reason?: string;
} {
  if (!session.finalScore || !session.duration) {
    return { isValid: true };
  }
  
  const scorePerSecond = session.finalScore / (session.duration / 1000);
  
  // Game-specific rate limits
  const rateLimits: Record<string, number> = {
    'sybil-slayer': 100, // Max 100 points per second
    'hyppie-road': 50,   // Max 50 points per second
    'default': 75        // Default limit
  };
  
  const limit = rateLimits[session.gameId] || rateLimits.default;
  
  if (scorePerSecond > limit) {
    return { 
      isValid: false, 
      reason: `Score rate too high: ${scorePerSecond.toFixed(2)} points/second (limit: ${limit})` 
    };
  }
  
  return { isValid: true };
}

/**
 * Comprehensive session validation
 */
export function validateGameSession(session: GameSession): {
  isValid: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  
  // Validate checkpoints
  for (const checkpoint of session.checkpoints) {
    if (!validateCheckpointHash(checkpoint)) {
      reasons.push(`Invalid checkpoint hash at ${checkpoint.timestamp}`);
    }
  }
  
  // Validate progression
  const progression = validateScoreProgression(session.checkpoints);
  if (!progression.isValid) {
    reasons.push(progression.reason!);
  }
  
  // Validate timing patterns
  const timing = validateTimingPatterns(session.checkpoints);
  if (!timing.isValid) {
    reasons.push(timing.reason!);
  }
  
  // Validate score rate
  const scoreRate = validateScoreRate(session);
  if (!scoreRate.isValid) {
    reasons.push(scoreRate.reason!);
  }
  
  // Check for honeypot events
  if (session.honeypotEvents.length > 0) {
    reasons.push('Honeypot events detected');
  }
  
  return {
    isValid: reasons.length === 0,
    reasons
  };
}

/**
 * Generate a random nonce for checkpoint security
 */
export function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Honeypot event types that should trigger anti-cheat
 */
export const HONEYPOT_EVENTS = [
  'dev_mode_enabled',
  'time_manipulation_detected',
  'score_multiplier_x10',
  'god_mode_activated',
  'admin_mode_enabled',
  'debug_mode_active',
  'infinite_lives_activated',
  'auto_play_enabled',
  'speed_hack_detected',
  'memory_manipulation',
  'client_side_validation_bypass'
] as const;

export type HoneypotEvent = typeof HONEYPOT_EVENTS[number];