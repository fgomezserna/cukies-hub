import {existsSync} from 'node:fs';
import {NextResponse} from 'next/server';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {'Cache-Control': 'no-store'} as const;
const DEFAULT_DRAIN_MARKER = '/tmp/cukies-dapp-draining';

function value(...names: string[]): string | undefined {
  return names
    .map((name) => process.env[name]?.trim())
    .find((candidate): candidate is string => Boolean(candidate));
}

function isDraining(): boolean {
  const marker = value('CUKIES_DAPP_DRAIN_MARKER_PATH') ?? DEFAULT_DRAIN_MARKER;
  try {
    return existsSync(marker);
  } catch {
    return true;
  }
}

function gameReadinessPayload(environment: NodeJS.ProcessEnv = process.env) {
  const read = (...names: string[]) => names
    .map((name) => environment[name]?.trim())
    .find((candidate): candidate is string => Boolean(candidate));

  const configHash = read('CUKIES_BUILD_ENV_HASH', 'NEXT_PUBLIC_CONFIG_HASH');
  const imageSha = read('CUKIES_IMAGE_REVISION', 'IMAGE_REVISION');
  const gitSha = read('SOURCE_COMMIT', 'IMAGE_REVISION');
  return {
    status: 'ready' as const,
    ...(configHash && /^[0-9a-f]{64}$/i.test(configHash) ? {configHash: configHash.toLowerCase()} : {}),
    ...(imageSha && /^[0-9a-f]{40}$/i.test(imageSha) ? {imageSha: imageSha.toLowerCase()} : {}),
    ...(gitSha && /^[0-9a-f]{40}$/i.test(gitSha) ? {gitSha: gitSha.toLowerCase()} : {}),
  };
}

export async function GET() {
  const draining = isDraining();
  return NextResponse.json(
    draining ? {...gameReadinessPayload(), status: 'not_ready' as const} : gameReadinessPayload(),
    {status: draining ? 503 : 200, headers: NO_STORE_HEADERS},
  );
}
