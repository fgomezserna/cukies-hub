const configuredGameBasePath = process.env.NEXT_PUBLIC_GAME_BASE_PATH?.trim() ?? '';

export function gamePublicPath(path: string): string {
  if (!path.startsWith('/') || !configuredGameBasePath) return path;
  if (path === configuredGameBasePath || path.startsWith(`${configuredGameBasePath}/`)) {
    return path;
  }
  return `${configuredGameBasePath}${path}`;
}

export function gameServiceWorkerScope(): string {
  return configuredGameBasePath ? `${configuredGameBasePath}/` : '/';
}
