import { prisma } from '@/lib/prisma';

const DEFAULT_TIMEOUT_MS = 1_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 250;

export type DeploymentReadinessStatus = 'ready' | 'not_ready';

export type DeploymentReadinessResult = {
  status: DeploymentReadinessStatus;
};

export type ReadinessDatabase = {
  $runCommandRaw(command: { ping: 1 }): Promise<unknown>;
};

export type DeploymentReadinessOptions = {
  database?: ReadinessDatabase;
  timeoutMs?: number;
};

let inFlightProbe: Promise<DeploymentReadinessResult> | null = null;
let cachedProbe: { result: DeploymentReadinessResult; expiresAt: number } | null = null;

function configuredTimeoutMs(value: number | undefined): number {
  if (value !== undefined && Number.isFinite(value)) {
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(value)));
  }

  const configured = Number(process.env.CUKIES_READINESS_TIMEOUT_MS);
  if (Number.isFinite(configured)) {
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(configured)));
  }

  return DEFAULT_TIMEOUT_MS;
}

function isSuccessfulPing(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === 'object'
    && 'ok' in value
    && (value as { ok?: unknown }).ok === 1,
  );
}

async function runPing(
  database: ReadinessDatabase,
  timeoutMs: number,
): Promise<DeploymentReadinessResult> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const ping = database.$runCommandRaw({ ping: 1 });
    const response = await Promise.race([
      ping,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('readiness timeout')), timeoutMs);
      }),
    ]);

    return { status: isSuccessfulPing(response) ? 'ready' : 'not_ready' };
  } catch {
    return { status: 'not_ready' };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export function checkDeploymentReadiness(
  options: DeploymentReadinessOptions = {},
): Promise<DeploymentReadinessResult> {
  const now = Date.now();
  if (cachedProbe && cachedProbe.expiresAt > now) {
    return Promise.resolve(cachedProbe.result);
  }

  if (inFlightProbe) return inFlightProbe;

  const database = options.database ?? (prisma as unknown as ReadinessDatabase);
  const pending = runPing(database, configuredTimeoutMs(options.timeoutMs)).then((result) => {
    cachedProbe = { result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  });

  inFlightProbe = pending;
  void pending.then(() => {
    if (inFlightProbe === pending) inFlightProbe = null;
  });

  return pending;
}

/** @internal Only exposed to keep unit tests independent from module state. */
export function resetDeploymentReadinessForTests(): void {
  inFlightProbe = null;
  cachedProbe = null;
}
