import { getHubDb } from '@/lib/mongodb-hub';
import { getIndexerDb } from '@/lib/indexer-db/mongodb';
import { TREASURE_HUNT_WEEKLY_ALIAS_SCOPE } from '@/lib/treasure-hunt-competition/alias';
import { findMongoAmbassadorPublicName } from '@/lib/uki-economy/ambassadors/repository';

jest.mock('@/lib/mongodb-hub', () => ({
  getHubDb: jest.fn(),
}));

jest.mock('@/lib/indexer-db/mongodb', () => ({
  getIndexerDb: jest.fn(),
}));

const mockGetHubDb = getHubDb as jest.MockedFunction<typeof getHubDb>;
const mockGetIndexerDb = getIndexerDb as jest.MockedFunction<typeof getIndexerDb>;
const SPONSOR = '0x2222222222222222222222222222222222222222';
const COMPETITION_ID = 'uki-staking-mainnet-2026-08';

describe('findMongoAmbassadorPublicName', () => {
  const usersFindOne = jest.fn();
  const walletsFindOne = jest.fn();
  const participantsFindOne = jest.fn();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalCompetitionId = process.env.TREASURE_HUNT_COMPETITION_ID;
  const db = {
    collection: jest.fn((name: string) => name === 'User'
      ? { findOne: usersFindOne }
      : { findOne: walletsFindOne }),
  };
  const indexerDb = {
    collection: jest.fn(() => ({ findOne: participantsFindOne })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'mongodb://db.invalid/cukies-hub';
    delete process.env.TREASURE_HUNT_COMPETITION_ID;
    mockGetHubDb.mockResolvedValue(db as unknown as Awaited<ReturnType<typeof getHubDb>>);
    mockGetIndexerDb.mockResolvedValue(indexerDb as unknown as Awaited<ReturnType<typeof getIndexerDb>>);
    usersFindOne.mockResolvedValue({
      _id: 'user-1',
      walletAddress: SPONSOR,
      username: 'TreasurePlayer',
    });
    participantsFindOne.mockResolvedValue(null);
  });

  afterAll(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalCompetitionId === undefined) delete process.env.TREASURE_HUNT_COMPETITION_ID;
    else process.env.TREASURE_HUNT_COMPETITION_ID = originalCompetitionId;
  });

  it('lee el username público de la wallet exacta tras ignorar el scope semanal sin alias elegido', async () => {
    await expect(findMongoAmbassadorPublicName(SPONSOR)).resolves.toBe('TreasurePlayer');

    expect(indexerDb.collection).toHaveBeenCalledWith('presale_game_participants');
    expect(db.collection).toHaveBeenCalledWith('User');
    expect(usersFindOne).toHaveBeenCalledWith(
      { walletAddress: SPONSOR },
      { projection: { _id: 1, walletAddress: 1, username: 1 } },
    );
    expect(walletsFindOne).not.toHaveBeenCalled();
  });

  it('prefiere el alias semanal elegido frente a una campaña histórica', async () => {
    process.env.TREASURE_HUNT_COMPETITION_ID = COMPETITION_ID;
    participantsFindOne.mockImplementation(async (filter: { campaignId: string }) => (
      filter.campaignId === TREASURE_HUNT_WEEKLY_ALIAS_SCOPE
        ? {
          campaignId: TREASURE_HUNT_WEEKLY_ALIAS_SCOPE,
          walletAddress: SPONSOR,
          alias: 'WeeklyChosen',
          aliasChangedAt: '2026-09-10T12:00:00.000Z',
        }
        : {
          campaignId: COMPETITION_ID,
          walletAddress: SPONSOR,
          alias: 'HistoricalAlias',
          aliasChangedAt: '2026-09-09T12:00:00.000Z',
        }
    ));

    await expect(findMongoAmbassadorPublicName(SPONSOR)).resolves.toBe('WeeklyChosen');

    expect(participantsFindOne).toHaveBeenCalledWith(
      { campaignId: TREASURE_HUNT_WEEKLY_ALIAS_SCOPE, walletAddress: SPONSOR },
      { projection: { _id: 0, campaignId: 1, walletAddress: 1, alias: 1, aliasChangedAt: 1 } },
    );
    expect(participantsFindOne).toHaveBeenCalledWith(
      { campaignId: COMPETITION_ID, walletAddress: SPONSOR },
      { projection: { _id: 0, campaignId: 1, walletAddress: 1, alias: 1, aliasChangedAt: 1 } },
    );
  });

  it('ignora el alias semanal automático y usa el alias elegido de la campaña configurada', async () => {
    process.env.TREASURE_HUNT_COMPETITION_ID = COMPETITION_ID;
    participantsFindOne.mockImplementation(async (filter: { campaignId: string }) => (
      filter.campaignId === TREASURE_HUNT_WEEKLY_ALIAS_SCOPE
        ? {
          campaignId: TREASURE_HUNT_WEEKLY_ALIAS_SCOPE,
          walletAddress: SPONSOR,
          alias: 'GeneratedAlias',
          aliasChangedAt: null,
        }
        : {
          campaignId: COMPETITION_ID,
          walletAddress: SPONSOR,
          alias: 'CompetitionChosen',
          aliasChangedAt: '2026-09-09T12:00:00.000Z',
        }
    ));

    await expect(findMongoAmbassadorPublicName(SPONSOR)).resolves.toBe('CompetitionChosen');
  });

  it('ignora alias automático o de otra campaña y cae al username público exacto', async () => {
    process.env.TREASURE_HUNT_COMPETITION_ID = COMPETITION_ID;
    participantsFindOne.mockResolvedValueOnce({
      campaignId: 'otro-campaign',
      walletAddress: SPONSOR,
      alias: 'AutomaticAlias',
      aliasChangedAt: null,
    });

    await expect(findMongoAmbassadorPublicName(SPONSOR)).resolves.toBe('TreasurePlayer');

    expect(usersFindOne).toHaveBeenCalledWith(
      { walletAddress: SPONSOR },
      { projection: { _id: 1, walletAddress: 1, username: 1 } },
    );
  });

  it('conserva el username cuando la lectura de alias queda pendiente', async () => {
    process.env.TREASURE_HUNT_COMPETITION_ID = COMPETITION_ID;
    participantsFindOne.mockImplementation(() => new Promise(() => undefined));

    await expect(findMongoAmbassadorPublicName(SPONSOR)).resolves.toBe('TreasurePlayer');
    expect(usersFindOne).toHaveBeenCalledWith(
      { walletAddress: SPONSOR },
      { projection: { _id: 1, walletAddress: 1, username: 1 } },
    );
  });

  it('puede resolver el alias de juego sin abrir la base de usuarios del hub', async () => {
    process.env.TREASURE_HUNT_COMPETITION_ID = COMPETITION_ID;
    delete process.env.DATABASE_URL;
    participantsFindOne.mockImplementation(async (filter: { campaignId: string }) => (
      filter.campaignId === COMPETITION_ID
        ? {
          campaignId: COMPETITION_ID,
          walletAddress: SPONSOR,
          alias: 'CompetitionOnly',
          aliasChangedAt: '2026-09-10T12:00:00.000Z',
        }
        : null
    ));

    await expect(findMongoAmbassadorPublicName(SPONSOR)).resolves.toBe('CompetitionOnly');
    expect(mockGetHubDb).not.toHaveBeenCalled();
  });

  it('descarta alias de juego sin marca pública o con formato de wallet', async () => {
    process.env.TREASURE_HUNT_COMPETITION_ID = COMPETITION_ID;
    participantsFindOne
      .mockResolvedValueOnce({
        campaignId: COMPETITION_ID,
        walletAddress: SPONSOR,
        alias: SPONSOR,
        aliasChangedAt: '2026-09-10T12:00:00.000Z',
      });

    await expect(findMongoAmbassadorPublicName(SPONSOR)).resolves.toBe('TreasurePlayer');
  });

  it('ignora un username que solo repite la wallet y deja el fallback de dirección', async () => {
    usersFindOne.mockResolvedValueOnce({
      _id: 'user-1',
      walletAddress: SPONSOR,
      username: SPONSOR.toUpperCase(),
    });

    await expect(findMongoAmbassadorPublicName(SPONSOR)).resolves.toBeNull();
    expect(walletsFindOne).not.toHaveBeenCalled();
  });

  it('resuelve una cuenta enlazada por UserWallet sin cambiar la wallet objetivo', async () => {
    usersFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 'user-2', username: 'LinkedPlayer' });
    walletsFindOne.mockResolvedValueOnce({ userId: 'user-2', normalizedAddress: SPONSOR });

    await expect(findMongoAmbassadorPublicName(SPONSOR)).resolves.toBe('LinkedPlayer');
    expect(walletsFindOne).toHaveBeenCalledWith(
      { normalizedAddress: SPONSOR },
      { projection: { _id: 0, userId: 1, normalizedAddress: 1 } },
    );
    expect(usersFindOne).toHaveBeenLastCalledWith(
      { _id: 'user-2' },
      { projection: { _id: 1, walletAddress: 1, username: 1 } },
    );
  });
});
