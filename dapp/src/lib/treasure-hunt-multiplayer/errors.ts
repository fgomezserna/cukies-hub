export type MultiplayerErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_SNAPSHOT'
  | 'MATCH_ALREADY_EXISTS'
  | 'MATCH_NOT_FOUND'
  | 'MATCH_REVISION_CONFLICT'
  | 'MATCH_FULL'
  | 'MATCH_TERMINAL'
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_ACTIVE_MATCH'
  | 'GAME_SESSION_MATCH_CONFLICT'
  | 'CONCURRENT_UPDATE_LIMIT';

export class MultiplayerDomainError extends Error {
  constructor(
    public readonly code: MultiplayerErrorCode,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'MultiplayerDomainError';
  }
}

export class MatchAlreadyExistsError extends MultiplayerDomainError {
  constructor(message = 'A match already exists for that match id or room code') {
    super('MATCH_ALREADY_EXISTS', message, 409);
    this.name = 'MatchAlreadyExistsError';
  }
}

export class ActiveUserMatchConflictError extends MultiplayerDomainError {
  constructor(message = 'A player already has a non-terminal match') {
    super('PLAYER_ACTIVE_MATCH', message, 409);
    this.name = 'ActiveUserMatchConflictError';
  }
}

export class GameSessionMatchConflictError extends MultiplayerDomainError {
  constructor(message = 'Game session is already bound to another match') {
    super('GAME_SESSION_MATCH_CONFLICT', message, 409);
    this.name = 'GameSessionMatchConflictError';
  }
}

export class MatchNotFoundError extends MultiplayerDomainError {
  constructor(matchId: string) {
    super('MATCH_NOT_FOUND', `Match ${matchId} was not found`, 404);
    this.name = 'MatchNotFoundError';
  }
}

export class MatchRevisionConflictError extends MultiplayerDomainError {
  constructor(matchId: string, expectedRevision: number) {
    super(
      'MATCH_REVISION_CONFLICT',
      `Match ${matchId} is no longer at revision ${expectedRevision}`,
      409,
    );
    this.name = 'MatchRevisionConflictError';
  }
}

export function invalidInput(message: string) {
  return new MultiplayerDomainError('INVALID_INPUT', message, 400);
}

export function invalidSnapshot(message: string) {
  return new MultiplayerDomainError('INVALID_SNAPSHOT', message, 422);
}
