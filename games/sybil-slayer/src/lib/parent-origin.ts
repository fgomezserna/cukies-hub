const DEVELOPMENT_PARENT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const;

function normalizeHttpOrigin(candidate: string | undefined): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin !== 'null'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  const hostname = new URL(origin).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function getAllowedParentOrigins(
  nodeEnv: string | undefined,
  ...configuredValues: Array<string | undefined>
): string[] {
  const configured = configuredValues
    .flatMap((value) => value?.split(',') ?? [])
    .map((value) => normalizeHttpOrigin(value.trim()))
    .filter((value): value is string => Boolean(value))
    .filter((origin) => nodeEnv !== 'production' || !isLocalDevelopmentOrigin(origin));

  if (nodeEnv !== 'production') configured.push(...DEVELOPMENT_PARENT_ORIGINS);
  return [...new Set(configured)];
}

export function resolveConfiguredParentOrigin(
  referrer: string,
  dappOrigin?: string,
  parentUrl?: string,
  nodeEnv: string | undefined = 'production',
): string {
  const allowedOrigins = getAllowedParentOrigins(nodeEnv, dappOrigin, parentUrl);
  if (allowedOrigins.length === 0) {
    throw new Error('No configured parent origin is available');
  }

  const referrerOrigin = normalizeHttpOrigin(referrer);
  return referrerOrigin && allowedOrigins.includes(referrerOrigin)
    ? referrerOrigin
    : allowedOrigins[0];
}

export function buildFrameAncestorsPolicy(
  nodeEnv: string | undefined,
  dappOrigin?: string,
  parentUrl?: string,
): string {
  const allowedOrigins = getAllowedParentOrigins(nodeEnv, dappOrigin, parentUrl);
  const developmentWildcards = nodeEnv === 'production'
    ? []
    : ['http://localhost:*', 'http://127.0.0.1:*'];
  return ["'self'", ...allowedOrigins, ...developmentWildcards]
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' ');
}
