import type {
  GameEconomyCukieSelectionPolicy,
  GameEconomyRuleSnapshot,
  GameEconomySession,
} from "./types";

export type GameResourceReservationResult = {
  reservationId: string;
  evidenceHash: string;
};

export type GameResourceTerminalOutcome = "consumed" | "released";

export type GameResourceFinishResult = {
  outcome: GameResourceTerminalOutcome;
  reservation: GameResourceReservationResult | null;
};

export type ReserveGameCreditInput = {
  sessionId: string;
  walletNormalized: string;
  gameId: string;
  costCode: string;
  creditRuleVersion: string;
  creditRuleConfigHash: string;
  idempotencyKey: string;
  requestHash: string;
  fenceToken: number;
  expiresAt: Date;
};

export type ReserveGameCukieInput = {
  sessionId: string;
  walletNormalized: string;
  gameId: string;
  role: string;
  selectionPolicy: GameEconomyCukieSelectionPolicy;
  assetIds: string[];
  idempotencyKey: string;
  requestHash: string;
  fenceToken: number;
  expiresAt: Date;
};

export type FinishGameResourceInput = {
  sessionId: string;
  reservationId: string | null;
  reservationIdempotencyKey: string;
  idempotencyKey: string;
  fenceToken: number;
  expectedOutcome: GameResourceTerminalOutcome;
  /** Authoritative saga decision time; permits a committed settlement to finish after TTL. */
  committedAt?: Date;
  now: Date;
};

export interface GameCreditResourcePort {
  /** Must bind requestHash and reject a stale fence for the reservation key. */
  reserve(input: ReserveGameCreditInput): Promise<GameResourceReservationResult>;
  /** Must atomically CAS one terminal outcome per reservation and fence stale calls. */
  consume(input: FinishGameResourceInput): Promise<GameResourceFinishResult>;
  /** Must resolve a missing reservationId by reservationIdempotencyKey for cleanup. */
  release(input: FinishGameResourceInput): Promise<GameResourceFinishResult>;
}

export interface GameCukieResourcePort {
  /** Must bind requestHash and reject a stale fence for the reservation key. */
  reserve(input: ReserveGameCukieInput): Promise<GameResourceReservationResult>;
  /** Must atomically CAS one terminal outcome per reservation and fence stale calls. */
  consume(input: FinishGameResourceInput): Promise<GameResourceFinishResult>;
  /** Must resolve a missing reservationId by reservationIdempotencyKey for cleanup. */
  release(input: FinishGameResourceInput): Promise<GameResourceFinishResult>;
}

export type VerifyGameResultInput = {
  sessionId: string;
  walletNormalized: string;
  gameId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  evidenceReference: string;
  submissionPayloadHash: string;
  startedAt: Date;
  submittedAt: Date;
};

export type VerifiedGameResult = {
  authorization: "server_authorized";
  evidenceId: string;
  evidenceHash: string;
  scoreRaw: string;
};

export interface GameResultEvidencePort {
  verify(input: VerifyGameResultInput): Promise<VerifiedGameResult>;
}

export type GameEconomyPorts = {
  credits: GameCreditResourcePort;
  cukies: GameCukieResourcePort;
  evidence: GameResultEvidencePort;
};

export type BoundGameEvidenceContext = Pick<
  GameEconomySession,
  "sessionId" | "walletNormalized" | "gameId" | "startedAt" | "submission"
> & {
  rule: GameEconomyRuleSnapshot;
};
