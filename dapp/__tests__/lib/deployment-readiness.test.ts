import {
  checkDeploymentReadiness,
  resetDeploymentReadinessForTests,
  type ReadinessDatabase,
} from '@/lib/deployment-readiness';

function database(overrides: Partial<ReadinessDatabase> = {}): ReadinessDatabase {
  return {
    $runCommandRaw: jest.fn().mockResolvedValue({ ok: 1 }),
    ...overrides,
  };
}

describe('deployment readiness probe', () => {
  beforeEach(() => {
    resetDeploymentReadinessForTests();
    delete process.env.CUKIES_READINESS_TIMEOUT_MS;
  });

  it('queda ready solo con un ping Mongo exitoso', async () => {
    const db = database();

    await expect(checkDeploymentReadiness({ database: db })).resolves.toEqual({ status: 'ready' });
    expect(db.$runCommandRaw).toHaveBeenCalledWith({ ping: 1 });
  });

  it('falla cerrado cuando Prisma rechaza el ping', async () => {
    const db = database({
      $runCommandRaw: jest.fn().mockRejectedValue(new Error('private Mongo topology')),
    });

    await expect(checkDeploymentReadiness({ database: db })).resolves.toEqual({ status: 'not_ready' });
  });

  it('falla cerrado al superar el timeout acotado', async () => {
    const db = database({
      $runCommandRaw: jest.fn().mockImplementation(() => new Promise(() => {})),
    });

    await expect(checkDeploymentReadiness({ database: db, timeoutMs: 100 })).resolves.toEqual({
      status: 'not_ready',
    });
  });

  it('deduplica probes simultáneos y reutiliza brevemente su resultado', async () => {
    let resolvePing: ((value: { ok: number }) => void) | undefined;
    const db = database({
      $runCommandRaw: jest.fn().mockImplementation(
        () => new Promise((resolve) => { resolvePing = resolve; }),
      ),
    });

    const first = checkDeploymentReadiness({ database: db });
    const second = checkDeploymentReadiness({ database: db });
    expect(db.$runCommandRaw).toHaveBeenCalledTimes(1);

    resolvePing?.({ ok: 1 });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'ready' },
      { status: 'ready' },
    ]);

    await checkDeploymentReadiness({ database: db });
    expect(db.$runCommandRaw).toHaveBeenCalledTimes(1);
  });
});
