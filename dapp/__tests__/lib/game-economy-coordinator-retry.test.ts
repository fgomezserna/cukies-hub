jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/indexer-db/mongodb', () => ({
  getEconomyDb: jest.fn(),
}));
jest.mock('@/lib/uki-economy/game-economy/control-plane', () => ({
  authorizeGameResult: jest.fn(),
}));
jest.mock('@/lib/uki-economy/game-economy/resource-ports', () => ({
  createMongoGameEconomyPorts: jest.fn(() => ({})),
}));
jest.mock('@/lib/uki-economy/game-economy/service', () => ({
  createMongoGameEconomyService: jest.fn(),
}));

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { authorizeGameResult } from '@/lib/uki-economy/game-economy/control-plane';
import { createMongoGameEconomyService } from '@/lib/uki-economy/game-economy/service';
import {
  completeGameSession,
  type CompleteGameSessionInput,
} from '@/lib/uki-economy/game-economy/coordinator';
import {
  DomainConflictError,
  StaleFenceError,
} from '@/lib/uki-economy/errors';
import type { GameEconomySession } from '@/lib/uki-economy/game-economy/types';

const mockGetEconomyDb = getEconomyDb as jest.MockedFunction<typeof getEconomyDb>;
const mockAuthorize = authorizeGameResult as jest.MockedFunction<typeof authorizeGameResult>;
const mockCreateService = createMongoGameEconomyService as jest.MockedFunction<typeof createMongoGameEconomyService>;

const NOW = new Date('2026-09-12T13:00:00.000Z');
const INPUT: CompleteGameSessionInput = {
  sessionId: 'game-session-1',
  walletAddress: `0x${'1'.repeat(40)}`,
  evidenceReference: 'terminal:evidence-1',
  payloadHash: 'a'.repeat(64),
  scoreRaw: '24',
  idempotencyKey: 'treasure-complete:result-1',
  now: NOW,
};

function session(overrides: Partial<GameEconomySession> = {}) {
  return {
    _id: 'game-session-1',
    sessionId: 'game-session-1',
    status: 'validated',
    revision: 3,
    submission: {
      evidenceReference: INPUT.evidenceReference,
      payloadHash: INPUT.payloadHash,
    },
    ...overrides,
  } as unknown as GameEconomySession;
}

function setup(inputSessions: GameEconomySession[]) {
  const findOne = jest.fn(async () => inputSessions.shift() ?? null);
  mockGetEconomyDb.mockResolvedValue({
    collection: jest.fn(() => ({ findOne })),
  } as never);
  const service = {
    submitResult: jest.fn(),
    validateResult: jest.fn(),
    settleSession: jest.fn(),
  };
  mockCreateService.mockReturnValue(service as never);
  mockAuthorize.mockResolvedValue({} as never);
  return { findOne, service };
}

describe('completeGameSession transient concurrency fence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('relee la sesion tras un StaleFence y termina una sola liquidacion', async () => {
    const submitted = session({ status: 'submitted', revision: 4 });
    const validated = session({ status: 'validated', revision: 5 });
    const settled = session({ status: 'settled', revision: 6 });
    const context = setup([
      session({ status: 'started', revision: 3 }),
      submitted,
    ]);
    context.service.submitResult
      .mockRejectedValueOnce(new StaleFenceError('fence concurrente'))
      .mockResolvedValueOnce(submitted);
    context.service.validateResult.mockResolvedValue(validated);
    context.service.settleSession.mockResolvedValue(settled);

    await expect(completeGameSession(INPUT)).resolves.toEqual(settled);

    expect(context.findOne).toHaveBeenCalledTimes(2);
    expect(context.service.submitResult).toHaveBeenCalledTimes(2);
    expect(context.service.validateResult).toHaveBeenCalledTimes(1);
    expect(context.service.settleSession).toHaveBeenCalledTimes(1);
    expect(mockAuthorize).toHaveBeenCalledTimes(1);
  });

  it('reintenta un lease activo marcado como transitorio y conserva la clave', async () => {
    const validated = session({ status: 'validated', revision: 5 });
    const settled = session({ status: 'settled', revision: 6 });
    const context = setup([validated, validated]);
    context.service.submitResult.mockResolvedValue(validated);
    context.service.settleSession
      .mockRejectedValueOnce(new DomainConflictError('lease en curso', { retryable: true }))
      .mockResolvedValueOnce(settled);

    await expect(completeGameSession(INPUT)).resolves.toEqual(settled);

    expect(context.service.settleSession).toHaveBeenCalledTimes(2);
    expect(context.service.settleSession).toHaveBeenNthCalledWith(1, expect.objectContaining({
      idempotencyKey: `${INPUT.idempotencyKey}:settle`,
      expectedRevision: validated.revision,
    }));
    expect(context.service.settleSession).toHaveBeenNthCalledWith(2, expect.objectContaining({
      idempotencyKey: `${INPUT.idempotencyKey}:settle`,
      expectedRevision: validated.revision,
    }));
  });

  it('no reintenta un conflicto semantico de payload o identidad', async () => {
    const context = setup([session({ status: 'validated', revision: 5 })]);
    const conflict = new DomainConflictError('payload o identidad no coincide');
    context.service.submitResult.mockResolvedValue(session({ status: 'validated', revision: 5 }));
    mockAuthorize.mockRejectedValue(conflict);

    await expect(completeGameSession(INPUT)).rejects.toBe(conflict);

    expect(context.findOne).toHaveBeenCalledTimes(1);
    expect(mockAuthorize).toHaveBeenCalledTimes(1);
    expect(context.service.settleSession).not.toHaveBeenCalled();
  });
});
