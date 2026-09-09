import { NextResponse } from 'next/server';

import { checkDeploymentReadiness } from '@/lib/deployment-readiness';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function publicGitSha(): string | undefined {
  const candidates = [
    process.env.SOURCE_COMMIT,
    process.env.GIT_COMMIT_SHA,
    process.env.NEXT_PUBLIC_BUILD_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
  ];

  return candidates.find((value) => value && /^[0-9a-f]{7,64}$/i.test(value))?.toLowerCase();
}

function publicConfigHash(): string | undefined {
  const value = process.env.CUKIES_BUILD_ENV_HASH ?? process.env.NEXT_PUBLIC_CONFIG_HASH;
  return value && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : undefined;
}

export async function GET() {
  const readiness = await checkDeploymentReadiness();
  const body: { status: 'ready' | 'not_ready'; gitSha?: string; configHash?: string } = {
    status: readiness.status,
  };
  const gitSha = publicGitSha();
  const configHash = publicConfigHash();

  if (gitSha) body.gitSha = gitSha;
  if (configHash) body.configHash = configHash;

  return NextResponse.json(body, {
    status: readiness.status === 'ready' ? 200 : 503,
    headers: NO_STORE_HEADERS,
  });
}
