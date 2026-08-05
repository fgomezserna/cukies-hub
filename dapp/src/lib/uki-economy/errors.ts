export type UkiEconomyErrorCode =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'STALE_FENCE'
  | 'SCHEMA_NOT_READY';

export class UkiEconomyError extends Error {
  readonly code: UkiEconomyErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: UkiEconomyErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'UkiEconomyError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DomainValidationError extends UkiEconomyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION', message, details);
    this.name = 'DomainValidationError';
  }
}

export class DomainConflictError extends UkiEconomyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, details);
    this.name = 'DomainConflictError';
  }
}

export class DomainNotFoundError extends UkiEconomyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('NOT_FOUND', message, details);
    this.name = 'DomainNotFoundError';
  }
}

export class StaleFenceError extends UkiEconomyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('STALE_FENCE', message, details);
    this.name = 'StaleFenceError';
  }
}

export class SchemaNotReadyError extends UkiEconomyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('SCHEMA_NOT_READY', message, details);
    this.name = 'SchemaNotReadyError';
  }
}

export { DomainConflictError as DomainConflict };
export { DomainNotFoundError as DomainNotFound };
export { DomainValidationError as DomainValidation };
export { SchemaNotReadyError as SchemaNotReady };
export { StaleFenceError as DomainStaleFence };
