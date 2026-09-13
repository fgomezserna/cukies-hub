import {
  runBridgeRelayer,
  runBridgeRelayerOnce,
  setupBridgeRelayer,
} from './worker.js';

const command = process.argv[2] ?? 'run';

try {
  const result = command === 'setup'
    ? await setupBridgeRelayer()
    : command === 'run-once'
      ? await runBridgeRelayerOnce()
      : command === 'run'
        ? await runBridgeRelayer()
        : (() => { throw new Error(`Comando desconocido: ${command}`); })();
  if (result !== undefined) process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[cukies-bridge-relayer] ${message}\n`);
  process.exitCode = 1;
}
