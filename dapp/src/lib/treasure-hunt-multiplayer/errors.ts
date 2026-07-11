export type MultiplayerErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_SNAPSHOT'
  | 'MATCH_ALREADY_EXISTS'
  | 'MATCH_NOT_FOUND'
  | 'MATCH_REVISION_CONFLICT'
  | 'MATCH_FULL'
  | 'MATCH_TERMINAL'
  | 'PLAYER_NOT_FOUND'
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
