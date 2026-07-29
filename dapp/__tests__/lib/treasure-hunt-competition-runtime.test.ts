import {
  createCheckpointReceipt,
  getCompetitionProofSecret,
  resolveCompetitionRuntime,
  verifyCheckpointReceipt,
  type CheckpointReceiptPayload,
} from '@/lib/treasure-hunt-competition/server';

const configuredEnv = {
  TREASURE_HUNT_COMPETITION_ENABLED: 'true',
  TREASURE_HUNT_COMPETITION_ID: 'uki-presale-2026',
  TREASURE_HUNT_COMPETITION_RULES_VERSION: '1',
  TREASURE_HUNT_COMPETITION_PRESALE_ADDRESS: `0x${'9'.repeat(40)}`,
  TREASURE_HUNT_COMPETITION_STARTS_AT: '2026-07-10T00:00:00.000Z',
  TREASURE_HUNT_COMPETITION_ENDS_AT: '2026-07-20T00:00:00.000Z',
};

describe('Treasure Hunt competition runtime config', () => {
  it('fails closed while dates are not configured', () => {
    expect(resolveCompetitionRuntime({}, new Date('2026-07-15T00:00:00.000Z')))
      .toMatchObject({ configured: false, enabled: false, phase: 'unconfigured' });
  });

  it.each([
    ['2026-07-09T23:59:59.999Z', 'scheduled'],
    ['2026-07-10T00:00:00.000Z', 'active'],
    ['2026-07-20T00:00:00.000Z', 'active'],
    ['2026-07-20T00:00:00.001Z', 'closed'],
  ])('resolves %s as %s', (now, phase) => {
    expect(resolveCompetitionRuntime(configuredEnv, new Date(now))).toMatchObject({
      configured: true,
      enabled: true,
      phase,
      campaign: {
        campaignId: 'uki-presale-2026',
        presaleContractAddress: `0x${'9'.repeat(40)}`,
        startsAt: '2026-07-10T00:00:00.000Z',
        endsAt: '2026-07-20T00:00:00.000Z',
      },
    });
  });

  it('fails closed without a presale address and accepts the indexer/public fallbacks', () => {
    const {
      TREASURE_HUNT_COMPETITION_PRESALE_ADDRESS: _address,
      ...withoutDedicatedAddress
    } = configuredEnv;
    expect(resolveCompetitionRuntime(
      withoutDedicatedAddress,
      new Date('2026-07-15T00:00:00.000Z'),
    )).toMatchObject({ configured: false, phase: 'unconfigured' });
    expect(resolveCompetitionRuntime({
      ...withoutDedicatedAddress,
      CHAIN_INDEXER_PRESALE_ADDRESS: `0x${'8'.repeat(40)}`,
    }, new Date('2026-07-15T00:00:00.000Z'))).toMatchObject({
      configured: true,
      campaign: { presaleContractAddress: `0x${'8'.repeat(40)}` },
    });
    expect(resolveCompetitionRuntime({
      ...withoutDedicatedAddress,
      NEXT_PUBLIC_UKI_PRESALE_ADDRESS: `0x${'7'.repeat(40)}`,
    }, new Date('2026-07-15T00:00:00.000Z'))).toMatchObject({
      configured: true,
      campaign: { presaleContractAddress: `0x${'7'.repeat(40)}` },
    });
  });

  it('keeps a valid campaign disabled behind its explicit launch flag', () => {
    expect(resolveCompetitionRuntime({
      ...configuredEnv,
      TREASURE_HUNT_COMPETITION_ENABLED: 'false',
    }, new Date('2026-07-15T00:00:00.000Z'))).toMatchObject({
      configured: true,
      enabled: false,
      phase: 'disabled',
    });
  });

  it('keeps a disabled campaign closed after its immutable window ends', () => {
    expect(resolveCompetitionRuntime({
      ...configuredEnv,
      TREASURE_HUNT_COMPETITION_ENABLED: 'false',
    }, new Date('2026-07-20T00:00:00.001Z'))).toMatchObject({
      configured: true,
      enabled: false,
      phase: 'closed',
    });
  });

  it('requires a dedicated proof secret in production and permits auth-secret fallback locally', () => {
    expect(() => getCompetitionProofSecret({ NODE_ENV: 'production' })).toThrow();
    expect(getCompetitionProofSecret({
      NODE_ENV: 'production',
      TREASURE_HUNT_COMPETITION_PROOF_SECRET: 'a'.repeat(32),
    })).toBe('a'.repeat(32));
    expect(getCompetitionProofSecret({
      NODE_ENV: 'test',
      NEXTAUTH_SECRET: 'local-auth-secret',
    })).toBe('local-auth-secret');
  });
});

describe('Treasure Hunt checkpoint receipts', () => {
  const payload: CheckpointReceiptPayload = {
    version: 1,
    campaignId: 'uki-presale-2026',
    attemptId: 'attempt-1',
    walletAddress: '0x1111111111111111111111111111111111111111',
    gameSessionId: 'game-session-1',
    nextSequence: 3,
    previousDigest: 'abc123',
    expiresAt: '2026-07-10T01:00:00.000Z',
  };
  const secret = 'competition-proof-secret-with-enough-length';

  it('round-trips an untampered receipt', () => {
    const receipt = createCheckpointReceipt(payload, secret);

    expect(verifyCheckpointReceipt(
      receipt,
      secret,
      new Date('2026-07-10T00:30:00.000Z'),
    )).toEqual(payload);
  });

  it('rejects tampering, another secret and expiry', () => {
    const receipt = createCheckpointReceipt(payload, secret);
    const [body, signature] = receipt.split('.');
    const tamperedBody = `${body.slice(0, -1)}${body.endsWith('A') ? 'B' : 'A'}`;

    expect(verifyCheckpointReceipt(
      `${tamperedBody}.${signature}`,
      secret,
      new Date('2026-07-10T00:30:00.000Z'),
    )).toBeNull();
    expect(verifyCheckpointReceipt(receipt, 'another-secret', new Date('2026-07-10T00:30:00.000Z')))
      .toBeNull();
    expect(verifyCheckpointReceipt(receipt, secret, new Date('2026-07-10T01:00:00.001Z')))
      .toBeNull();
  });
});
