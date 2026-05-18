import { getCardWorkerConfig } from './config/env.js';
import {
  generateTokenCard,
  getCardWorkerStatus,
  processOneCard,
  renderTokenCard,
  runCardWorker,
  setupCardWorker,
} from './worker.js';

type Command = 'setup' | 'status' | 'render-token' | 'generate-token' | 'process-once' | 'run';

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function requireTokenId(value: string | undefined) {
  if (!value) {
    throw new Error('Falta tokenId.');
  }

  return value;
}

async function main() {
  const [command = 'status', tokenId] = process.argv
    .slice(2)
    .filter((arg) => arg !== '--') as [Command | undefined, string | undefined];
  const config = getCardWorkerConfig();

  switch (command) {
    case 'setup':
      printJson(await setupCardWorker(config));
      break;
    case 'status':
      printJson(await getCardWorkerStatus(config));
      break;
    case 'render-token':
      printJson(await renderTokenCard(requireTokenId(tokenId), config));
      break;
    case 'generate-token':
      printJson(await generateTokenCard(requireTokenId(tokenId), config));
      break;
    case 'process-once':
      printJson(await processOneCard(config));
      break;
    case 'run':
      await runCardWorker(config);
      break;
    default:
      throw new Error(`Comando no soportado: ${command}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
