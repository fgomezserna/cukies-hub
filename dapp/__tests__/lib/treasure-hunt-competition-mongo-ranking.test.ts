jest.mock('@/lib/indexer-db/mongodb', () => ({
  getIndexerDb: jest.fn(),
}));

import {
  selectTopCompetitionAttempts,
} from '@/lib/treasure-hunt-competition/server/mongo-repository';
import type {
  CompetitionAttemptRecord,
} from '@/lib/treasure-hunt-competition/server/models';

function attempt(
  attemptId: string,
  walletAddress: string,
  score: number,
): CompetitionAttemptRecord {
  return {
    attemptId,
    campaignId: 'campaign-1',
    rulesVersion: '1',
    gameId: 'treasure-hunt',
    mode: 'presale_competition',
    walletAddress,
    userId: `user-${walletAddress}`,
    playerAlias: `Player ${walletAddress}`,
    gameSessionId: `session-${attemptId}`,
    seed: `seed-${attemptId}`,
    genesisDigest: `genesis-${attemptId}`,
    status: 'valid',
    score,
    gameTimeMs: 30_000,
    startedAt: '2026-07-17T00:00:00.000Z',
    expiresAt: '2026-07-17T00:05:00.000Z',
    finishedAt: '2026-07-17T00:01:00.000Z',
    nextSequence: 1,
    lastDigest: 'digest',
    lastScore: score,
    lastGameTimeMs: 30_000,
    lastEvidenceAt: '2026-07-17T00:01:00.000Z',
    evidence: [],
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:01:00.000Z',
  };
}

async function* attempts(rows: CompetitionAttemptRecord[]) {
  for (const row of rows) yield row;
}

describe('Treasure Hunt MongoDB 4.4 ranking compatibility', () => {
  it('keeps at most five globally ordered attempts per wallet', async () => {
    const rows = [
      attempt('a-1', '0xaaa', 100),
      attempt('a-2', '0xAAA', 99),
      attempt('a-3', '0xaaa', 98),
      attempt('a-4', '0xaaa', 97),
      attempt('a-5', '0xaaa', 96),
      attempt('a-6', '0xaaa', 95),
      attempt('b-1', '0xbbb', 94),
    ];

    await expect(selectTopCompetitionAttempts(attempts(rows), 6)).resolves.toEqual([
      rows[0],
      rows[1],
      rows[2],
      rows[3],
      rows[4],
      rows[6],
    ]);
  });

  it('stops once the requested global limit is filled', async () => {
    const rows = [
      attempt('a-1', '0xaaa', 100),
      attempt('b-1', '0xbbb', 99),
      attempt('c-1', '0xccc', 98),
    ];

    await expect(selectTopCompetitionAttempts(attempts(rows), 2)).resolves.toEqual([
      rows[0],
      rows[1],
    ]);
  });
});
