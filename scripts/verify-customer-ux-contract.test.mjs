import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const sourceRoot = join(root, 'dapp', 'src');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.css', '.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
  });
}

test('la interfaz no reintroduce el antiguo color celeste', () => {
  const forbidden = [
    /\b(?:cyan|teal)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/i,
    /--uki-(?:cyan|teal)\b/i,
    /#(?:008080|44edd6|22e7df|00adef)\b/i,
    /rgba?\(\s*(?:68\s*,\s*237\s*,\s*214|34\s*,\s*231\s*,\s*223)/i,
  ];
  const violations = sourceFiles(sourceRoot).flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return forbidden.some((pattern) => pattern.test(source))
      ? [relative(root, path)]
      : [];
  });

  assert.deepEqual(violations, []);
});

test('las pantallas de cliente no muestran lenguaje interno del despliegue', () => {
  const customerFiles = [
    'dapp/src/app/(app)/dashboard/page.tsx',
    'dapp/src/app/(app)/cukie-master/page.tsx',
    'dapp/src/app/(app)/cukie-hodler/page.tsx',
    'dapp/src/app/(app)/marketplace/page.tsx',
    'dapp/src/components/layout/app-layout.tsx',
    'dapp/src/components/landing/data.tsx',
    'dapp/src/components/landing/sections.tsx',
    'dapp/src/components/launch/info-page.tsx',
    'dapp/src/components/cukie-master/nft-vault-panel.tsx',
    'dapp/src/components/cukie-master/status-panel.tsx',
    'dapp/src/components/cukie-master/uki-staking-panel.tsx',
    'dapp/src/components/cukie-pool/status-panel.tsx',
    'dapp/src/components/games/treasure-hunt-competition-panel.tsx',
    'dapp/src/components/nft-vault/recovery-panel.tsx',
    'dapp/src/components/uki-marketplace/marketplace-client.tsx',
    'dapp/src/components/uki-marketplace/seller-panel.tsx',
    'dapp/src/components/uki-marketplace/buyer-checkout.tsx',
    'dapp/src/components/legacy-marketplace/bridge-client.tsx',
    'dapp/src/components/legacy-marketplace/cukiepoints-client.tsx',
    'dapp/src/components/legacy-marketplace/marketplace-actions.tsx',
    'dapp/src/components/wallet/dashboard-overview-panel.tsx',
    'dapp/src/components/wallet/ambassador-attribution-panel.tsx',
  ];
  const forbidden = [
    /Stage\s*[·-]/,
    /BSC Testnet/,
    /chain 97/i,
    /[Áá]rea de pruebas/,
    /red de pruebas/i,
    /en este Stage/i,
    /en este entorno/i,
    /endpoint privado/i,
    /contrato agregado/i,
    /atribuci[oó]n can[oó]nica/i,
    /partidas legacy/i,
    /batch publicado/i,
    /inventario can[oó]nico/i,
    /Freshness de fuente/i,
    /Fuente:\s/,
    /\bbackend\b/i,
    /indexador/i,
    /confirmado e indexado/i,
    /vault custodial/i,
    /servida por la API/i,
    /incluida en la DApp/i,
    /estado custodial/i,
    /contrato de staking no est[aá] configurado/i,
    /token y contrato coincidan/i,
    /staking custodial NFT/i,
    /posiciones del vault/i,
    /\bEpoch\b/,
    /Calendario de (?:dep[oó]sito|salida) v/i,
  ];
  const violations = customerFiles.flatMap((file) => {
    const source = readFileSync(join(root, file), 'utf8');
    return forbidden.flatMap((pattern) => pattern.test(source) ? [`${file}: ${pattern}`] : []);
  });

  assert.deepEqual(violations, []);
});

test('la interfaz toma la red del entorno sin fijar testnet en los componentes', () => {
  const configurableFiles = [
    'dapp/src/components/landing/sections.tsx',
    'dapp/src/components/uki-marketplace/seller-panel.tsx',
    'dapp/src/components/uki-marketplace/buyer-checkout.tsx',
  ];
  const forbidden = [
    /chainId\s*:\s*97/,
    /chainId\s*[!=]==?\s*97/,
    /switchChain\(\{\s*chainId\s*:\s*97/,
    /appEnv\s*===\s*['"]staging['"]\s*\?/,
  ];
  const violations = configurableFiles.flatMap((file) => {
    const source = readFileSync(join(root, file), 'utf8');
    return forbidden.flatMap((pattern) => pattern.test(source) ? [`${file}: ${pattern}`] : []);
  });

  assert.deepEqual(violations, []);
});

test('staging y producción comparten el contrato estable del dashboard', () => {
  const summary = readFileSync(join(root, 'dapp/src/lib/dashboard/summary.ts'), 'utf8');
  assert.match(summary, /schemaVersion: 'dashboard-v1'/);
  assert.doesNotMatch(summary, /dashboard-staging-v1/);
});
