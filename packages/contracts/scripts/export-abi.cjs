const fs = require('fs');
const path = require('path');

const contracts = ['UKIToken', 'VestingVault', 'Presale'];
const root = path.resolve(__dirname, '..');
const dappTarget = path.resolve(root, '../../dapp/src/lib/contracts/abis');

fs.mkdirSync(dappTarget, { recursive: true });

for (const contractName of contracts) {
  const artifactPath = path.join(root, 'artifacts/contracts', `${contractName}.sol`, `${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const targetPath = path.join(dappTarget, `${contractName}.json`);
  fs.writeFileSync(targetPath, `${JSON.stringify(artifact.abi, null, 2)}\n`);
  console.log(`Exported ${contractName} ABI to ${targetPath}`);
}
