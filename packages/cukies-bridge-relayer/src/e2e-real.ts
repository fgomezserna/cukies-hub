/**
 * A production signer E2E is intentionally not automated in this repository.
 * Running it would broadcast a TRON request and a BSC mainnet mint, which is
 * outside local verification and requires an explicit operational runbook.
 */
export async function runLegacyMainnetE2e() {
  throw new Error(
    'El E2E firmado legacy mainnet esta bloqueado: requiere una ejecucion manual autorizada.',
  );
}

if (process.argv[1]?.endsWith('/e2e-real.ts') || process.argv[1]?.endsWith('/e2e-real.js')) {
  runLegacyMainnetE2e().catch((error: unknown) => {
    process.stderr.write(
      `[bridge-e2e-real] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
