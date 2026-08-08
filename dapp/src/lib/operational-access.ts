import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { normalizeWalletAddress } from '@/lib/wallet-address';
import { isValidEvmWalletAddress, readWalletSession } from '@/lib/wallet-auth';

export type PrivateSecretEnvironmentName =
  | 'TELEGRAM_WEBHOOK_SECRET'
  | 'IFTTT_WEBHOOK_SECRET'
  | 'TELEGRAM_CLEANUP_SECRET';

type AdminAccessDecision =
  | 'allowed'
  | 'unauthenticated'
  | 'forbidden'
  | 'misconfigured';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const LOCAL_ENVIRONMENT_NAMES = new Set(['development', 'local']);
const MINIMUM_PRIVATE_SECRET_BYTES = 32;
const MINIMUM_PRIVATE_SECRET_UNIQUE_CHARACTERS = 12;
const TELEGRAM_WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const PRIVATE_SECRET_ENVIRONMENT_NAMES: readonly PrivateSecretEnvironmentName[] = [
  'TELEGRAM_WEBHOOK_SECRET',
  'IFTTT_WEBHOOK_SECRET',
  'TELEGRAM_CLEANUP_SECRET',
];
const PRIVATE_SECRET_PLACEHOLDERS = [
  'changeme',
  'example',
  'generate-',
  'placeholder',
  'replace-',
  'secret-here',
  'super-secret',
  'todo',
  'your-',
] as const;

function accessError(status: number, error: string) {
  return NextResponse.json(
    { error },
    { status, headers: NO_STORE_HEADERS },
  );
}

function loadAdminWalletAllowlist(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const rawAllowlist = environment.ADMIN_WALLET_ALLOWLIST;
  if (typeof rawAllowlist !== 'string' || rawAllowlist.trim().length === 0) {
    return null;
  }

  const wallets = new Set<string>();
  for (const rawEntry of rawAllowlist.split(',')) {
    const walletAddress = rawEntry.trim();
    if (!walletAddress || !isValidEvmWalletAddress(walletAddress)) {
      return null;
    }

    const normalizedAddress = normalizeWalletAddress(walletAddress);
    if (wallets.has(normalizedAddress)) {
      return null;
    }
    wallets.add(normalizedAddress);
  }

  return wallets.size > 0 ? wallets : null;
}

async function resolveAdminAccess(): Promise<AdminAccessDecision> {
  // Runtime configuration is deliberately loaded per request. Route modules can
  // therefore be built without turning a missing deployment value into a build-
  // time fallback or a permanently cached authorization decision.
  const allowlist = loadAdminWalletAllowlist();
  if (!allowlist) return 'misconfigured';

  let session: Awaited<ReturnType<typeof readWalletSession>>;
  try {
    session = await readWalletSession();
  } catch {
    return 'misconfigured';
  }

  if (!session) return 'unauthenticated';

  const signedWalletAddress = session.signedWalletAddress;
  if (
    session.walletType !== 'evm'
    || typeof signedWalletAddress !== 'string'
    || !isValidEvmWalletAddress(signedWalletAddress)
  ) {
    return 'forbidden';
  }

  return allowlist.has(normalizeWalletAddress(signedWalletAddress))
    ? 'allowed'
    : 'forbidden';
}

function adminAccessResponse(decision: AdminAccessDecision) {
  switch (decision) {
    case 'allowed':
      return null;
    case 'unauthenticated':
      return accessError(401, 'Unauthorized');
    case 'forbidden':
      return accessError(403, 'Forbidden');
    case 'misconfigured':
      return accessError(503, 'Service unavailable');
  }
}

function isLocalDevelopmentRuntime(environment: NodeJS.ProcessEnv = process.env) {
  const configuredEnvironments = [environment.APP_ENV, environment.NODE_ENV]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase());

  return configuredEnvironments.length > 0
    && configuredEnvironments.every((value) => LOCAL_ENVIRONMENT_NAMES.has(value));
}

function configuredPrivateSecret(
  environmentName: PrivateSecretEnvironmentName,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const secret = environment[environmentName];
  if (
    typeof secret !== 'string'
    || secret !== secret.trim()
    || Buffer.byteLength(secret, 'utf8') < MINIMUM_PRIVATE_SECRET_BYTES
    || new Set(secret).size < MINIMUM_PRIVATE_SECRET_UNIQUE_CHARACTERS
  ) {
    return null;
  }

  const normalizedSecret = secret.toLowerCase();
  if (PRIVATE_SECRET_PLACEHOLDERS.some((placeholder) => normalizedSecret.includes(placeholder))) {
    return null;
  }

  // Telegram only accepts this alphabet and a maximum of 256 characters for
  // setWebhook.secret_token. Validate it here so a value cannot look healthy
  // to the app while being impossible to register with the Bot API.
  if (
    environmentName === 'TELEGRAM_WEBHOOK_SECRET'
    && !TELEGRAM_WEBHOOK_SECRET_PATTERN.test(secret)
  ) {
    return null;
  }

  const isPubliclyReused = Object.entries(environment).some(([name, value]) => (
    name.startsWith('NEXT_PUBLIC_') && value === secret
  ));
  if (isPubliclyReused) return null;

  const isReusedByAnotherOperationalContract = PRIVATE_SECRET_ENVIRONMENT_NAMES.some((name) => (
    name !== environmentName && environment[name] === secret
  ));
  if (isReusedByAnotherOperationalContract) return null;

  return secret;
}

function privateSecretsMatch(candidate: string, configured: string) {
  const candidateDigest = createHash('sha256').update(candidate, 'utf8').digest();
  const configuredDigest = createHash('sha256').update(configured, 'utf8').digest();
  return timingSafeEqual(candidateDigest, configuredDigest);
}

export async function requireAdminApiAccess(): Promise<NextResponse | null> {
  return adminAccessResponse(await resolveAdminAccess());
}

export async function hasAdminPageAccess(): Promise<boolean> {
  return (await resolveAdminAccess()) === 'allowed';
}

export async function requireLocalAdminApiAccess(): Promise<NextResponse | null> {
  if (!isLocalDevelopmentRuntime()) {
    return accessError(404, 'Not found');
  }
  return requireAdminApiAccess();
}

export function requirePrivateSecretConfigurationApiAccess(
  environmentName: PrivateSecretEnvironmentName,
): NextResponse | null {
  return configuredPrivateSecret(environmentName)
    ? null
    : accessError(503, 'Service unavailable');
}

export function requirePrivateSecretApiAccess(
  candidate: string | null | undefined,
  environmentName: PrivateSecretEnvironmentName,
): NextResponse | null {
  const configuredSecret = configuredPrivateSecret(environmentName);
  if (!configuredSecret) {
    return accessError(503, 'Service unavailable');
  }
  if (
    typeof candidate !== 'string'
    || !privateSecretsMatch(candidate, configuredSecret)
  ) {
    return accessError(401, 'Unauthorized');
  }
  return null;
}
