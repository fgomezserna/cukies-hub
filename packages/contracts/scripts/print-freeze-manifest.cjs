const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const contracts = ['UKIToken', 'VestingVault', 'Presale'];

function optionalEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value !== '') return value;
  }
  return null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function gitCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: path.resolve(root, '../..'), encoding: 'utf8' }).trim();
  } catch (_error) {
    return null;
  }
}

function artifactSummary(contractName) {
  const artifactPath = path.join(root, 'artifacts/contracts', `${contractName}.sol`, `${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const abiJson = JSON.stringify(artifact.abi);
  const deployedBytecode = artifact.deployedBytecode || '';

  return {
    artifactPath: path.relative(path.resolve(root, '../..'), artifactPath),
    abiSha256: sha256(abiJson),
    deployedBytecodeSha256: deployedBytecode ? sha256(deployedBytecode) : null,
  };
}

const chainId = optionalEnv('NEXT_PUBLIC_UKI_CHAIN_ID', 'UKI_CHAIN_ID') || null;
const explorerBaseUrl = optionalEnv('NEXT_PUBLIC_BSCSCAN_BASE_URL', 'BSCSCAN_BASE_URL') || null;
const addresses = {
  asmToken: optionalEnv('NEXT_PUBLIC_ASM_TOKEN_ADDRESS', 'ASM_TOKEN_ADDRESS'),
  ukiToken: optionalEnv('NEXT_PUBLIC_UKI_TOKEN_ADDRESS', 'UKI_TOKEN_ADDRESS'),
  vestingVault: optionalEnv('NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS', 'UKI_VESTING_VAULT_ADDRESS'),
  presale: optionalEnv('NEXT_PUBLIC_UKI_PRESALE_ADDRESS', 'UKI_PRESALE_ADDRESS'),
  owner: optionalEnv('SALE_OWNER_ADDRESS'),
  treasury: optionalEnv('SALE_TREASURY_ADDRESS'),
};

const manifest = {
  schema: 'cukies.uki.contract-freeze.v1',
  generatedAt: new Date().toISOString(),
  gitCommit: gitCommit(),
  chain: {
    id: chainId,
    explorerBaseUrl,
  },
  addresses,
  artifacts: Object.fromEntries(contracts.map((contractName) => [contractName, artifactSummary(contractName)])),
  readiness: {
    hasContractAddresses: Boolean(addresses.ukiToken && addresses.vestingVault && addresses.presale),
    hasSaleAddresses: Boolean(addresses.asmToken && addresses.treasury),
    hasOwner: Boolean(addresses.owner),
    hasChain: Boolean(chainId),
  },
};

console.log(`${JSON.stringify(manifest, null, 2)}\n`);
