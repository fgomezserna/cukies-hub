import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== '') {
      return value;
    }
  }

  return null;
}

export async function GET() {
  const gitSha = envValue(
    'SOURCE_COMMIT',
    'GIT_COMMIT_SHA',
    'VERCEL_GIT_COMMIT_SHA',
    'NEXT_PUBLIC_BUILD_SHA',
  );
  const gitRef = envValue('COOLIFY_BRANCH', 'GIT_BRANCH', 'VERCEL_GIT_COMMIT_REF');

  return NextResponse.json({
    status: 'ok',
    app: 'cukies-hub',
    environment: envValue('APP_ENV', 'COOLIFY_ENVIRONMENT_NAME', 'NODE_ENV') ?? 'unknown',
    gitSha,
    gitRef,
    buildTime: envValue('BUILD_TIME', 'NEXT_PUBLIC_BUILD_TIME'),
    coolify: {
      resourceUuid: envValue('COOLIFY_RESOURCE_UUID'),
      fqdn: envValue('COOLIFY_FQDN'),
    },
  });
}
