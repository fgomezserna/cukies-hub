const ports = { api: 3010, matchmaking: 3011 };

async function main() {
  if (process.env.WORLD_RUNTIME_ENABLED !== 'true') {
    throw new Error('WORLD_RUNTIME_ENABLED must be true when the World runtime is selected');
  }
  const port = ports[process.env.WORLD_SERVICE];
  if (!port) {
    throw new Error('WORLD_SERVICE must be api or matchmaking');
  }
  const endpoint = `http://127.0.0.1:${port}/health/ready`;
  let response;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error('World readiness endpoint is unavailable');
  }
  if (response.status !== 200) throw new Error('World readiness endpoint is not ready');
  let body;
  try { body = await response.json(); } catch { throw new Error('World readiness endpoint returned invalid JSON'); }
  if (body?.status !== 'ready') throw new Error('World readiness endpoint is not ready');
}

main().catch((error) => {
  console.error(`World runtime is not ready: ${error.message}`);
  process.exit(1);
});
