import { getHubDb } from '@/lib/mongodb-hub';
import { findMongoAmbassadorPublicName } from '@/lib/uki-economy/ambassadors/repository';

jest.mock('@/lib/mongodb-hub', () => ({
  getHubDb: jest.fn(),
}));

const mockGetHubDb = getHubDb as jest.MockedFunction<typeof getHubDb>;
const SPONSOR = '0x2222222222222222222222222222222222222222';

describe('findMongoAmbassadorPublicName', () => {
  const usersFindOne = jest.fn();
  const walletsFindOne = jest.fn();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const db = {
    collection: jest.fn((name: string) => name === 'User'
      ? { findOne: usersFindOne }
      : { findOne: walletsFindOne }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'mongodb://db.invalid/cukies-hub';
    mockGetHubDb.mockResolvedValue(db as unknown as Awaited<ReturnType<typeof getHubDb>>);
    usersFindOne.mockResolvedValue({
      _id: 'user-1',
      walletAddress: SPONSOR,
      username: 'TreasurePlayer',
    });
  });

  afterAll(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('lee el username público de la wallet exacta y no consulta otra identidad', async () => {
    await expect(findMongoAmbassadorPublicName(SPONSOR)).resolves.toBe('TreasurePlayer');

    expect(db.collection).toHaveBeenCalledWith('User');
    expect(usersFindOne).toHaveBeenCalledWith(
      { walletAddress: SPONSOR },
      { projection: { _id: 1, walletAddress: 1, username: 1 } },
    );
    expect(db.collection).not.toHaveBeenCalledWith('presale_game_participants');
    expect(walletsFindOne).not.toHaveBeenCalled();
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
