import {NextResponse} from 'next/server';

export const dynamic = 'force-dynamic';

function gameHealthPayload(environment: NodeJS.ProcessEnv = process.env) {
  const value = (...names: string[]) => {
    for (const name of names) {
      const candidate = environment[name]?.trim();
      if (candidate) return candidate;
    }
    return null;
  };

  const rawGitSha = value('SOURCE_COMMIT', 'IMAGE_REVISION');
  return {
    status: 'ok' as const,
    app: 'treasure-hunt' as const,
    environment: value('APP_ENV') ?? 'unknown',
    gitSha: rawGitSha && /^[0-9a-f]{40}$/i.test(rawGitSha) ? rawGitSha.toLowerCase() : null,
    coolify: {
      resourceUuid: value('COOLIFY_RESOURCE_UUID'),
    },
  };
}

export async function GET() {
  return NextResponse.json(gameHealthPayload());
}
