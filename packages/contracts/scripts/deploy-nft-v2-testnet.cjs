const hre = require('hardhat');

const BSC_TESTNET_CHAIN_ID = 97n;
const DEFAULT_FIRST_TOKEN_ID = 98_000_001n;
const LAST_FIXTURE_OFFSET = 11n;
const ERC721_INTERFACE_ID = '0x80ac58cd';

function checkpoint(stage, details) {
  console.error(JSON.stringify({ checkpoint: stage, ...details }));
}

function envValue(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireEnv(name) {
  const value = envValue(name);
  if (!value) throw new Error(`${name} is required for the staging NFT V2 deployment.`);
  return value;
}

function address(value, label) {
  try {
    const normalized = hre.ethers.getAddress(value);
    if (normalized === hre.ethers.ZeroAddress) throw new Error('zero address');
    return normalized;
  } catch (_error) {
    throw new Error(`${label} must be a valid non-zero EVM address.`);
  }
}

function fixtureWallets() {
  const configured = requireEnv('STAGING_NFT_FIXTURE_WALLETS').split(',');
  if (configured.some((item) => !item.trim())) {
    throw new Error('STAGING_NFT_FIXTURE_WALLETS contains an empty item.');
  }
  const wallets = configured.map((item, index) => (
    address(item.trim(), `STAGING_NFT_FIXTURE_WALLETS[${index}]`)
  ));
  if (new Set(wallets.map((item) => item.toLowerCase())).size !== wallets.length) {
    throw new Error('STAGING_NFT_FIXTURE_WALLETS contains duplicates.');
  }
  return wallets;
}

function firstTokenId() {
  const raw = envValue('STAGING_NFT_FIRST_TOKEN_ID');
  if (!raw) return DEFAULT_FIRST_TOKEN_ID;
  if (!/^\d+$/.test(raw) || BigInt(raw) === 0n) {
    throw new Error('STAGING_NFT_FIRST_TOKEN_ID must be a positive uint256 decimal.');
  }
  const parsed = BigInt(raw);
  if (parsed > hre.ethers.MaxUint256 - LAST_FIXTURE_OFFSET) {
    throw new Error(
      `STAGING_NFT_FIRST_TOKEN_ID must leave room for all 12 fixtures (maximum ${hre.ethers.MaxUint256 - LAST_FIXTURE_OFFSET}).`
    );
  }
  return parsed;
}

async function successfulReceipt(transaction, label) {
  checkpoint('transaction_broadcast', { label, transactionHash: transaction.hash });
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`${label} failed or did not produce a successful receipt.`);
  }
  checkpoint('transaction_confirmed', {
    label,
    transactionHash: transaction.hash,
    blockNumber: receipt.blockNumber,
  });
  return receipt;
}

async function main() {
  const providerNetwork = await hre.ethers.provider.getNetwork();
  if (
    hre.network.name !== 'bscTestnet'
    || BigInt(hre.network.config.chainId ?? 0) !== BSC_TESTNET_CHAIN_ID
    || providerNetwork.chainId !== BSC_TESTNET_CHAIN_ID
  ) {
    throw new Error(
      `This script is BSC Testnet-only. Current network=${hre.network.name}, `
      + `configuredChainId=${hre.network.config.chainId}, providerChainId=${providerNetwork.chainId}.`
    );
  }
  if (requireEnv('STAGING_NFT_V2_DEPLOYMENT_CONFIRM') !== 'BSC_TESTNET_97_ONLY') {
    throw new Error('STAGING_NFT_V2_DEPLOYMENT_CONFIRM must be BSC_TESTNET_97_ONLY.');
  }
  for (const name of [
    'STAGING_CUKIES_NFT_V2_ADDRESS',
    'CHAIN_INDEXER_TOKEN_V2_ADDRESS',
  ]) {
    if (envValue(name)) {
      throw new Error(`Fresh deploy refused because ${name} is already configured.`);
    }
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required.');
  const deployerAddress = address(deployer.address, 'deployer signer');
  const expectedDeployer = address(requireEnv('DEPLOYER_ADDRESS'), 'DEPLOYER_ADDRESS');
  if (deployerAddress !== expectedDeployer) {
    throw new Error(`DEPLOYER_ADDRESS mismatch: signer=${deployerAddress}, expected=${expectedDeployer}.`);
  }
  if (await hre.ethers.provider.getBalance(deployerAddress) === 0n) {
    throw new Error(`${deployerAddress} has no testnet BNB for gas.`);
  }

  const recipients = fixtureWallets();
  const initialTokenId = firstTokenId();
  const Factory = await hre.ethers.getContractFactory('StagingCukiesNftV2');
  const nft = await Factory.deploy(deployerAddress);
  const deploymentTransaction = nft.deploymentTransaction();
  if (!deploymentTransaction) throw new Error('Deployment transaction is unavailable.');
  checkpoint('contract_address_reserved', {
    contract: 'StagingCukiesNftV2',
    address: await nft.getAddress(),
    transactionHash: deploymentTransaction.hash,
  });
  const deploymentReceipt = await successfulReceipt(
    deploymentTransaction,
    'StagingCukiesNftV2 deployment',
  );
  await nft.waitForDeployment();
  const nftAddress = address(await nft.getAddress(), 'StagingCukiesNftV2 address');
  if (
    !deploymentReceipt.contractAddress
    || address(deploymentReceipt.contractAddress, 'deployment receipt contract') !== nftAddress
  ) {
    throw new Error('Deployment receipt address does not match StagingCukiesNftV2.');
  }

  const runtimeCode = await hre.ethers.provider.getCode(nftAddress);
  const artifact = await hre.artifacts.readArtifact('StagingCukiesNftV2');
  const runtimeCodeHash = hre.ethers.keccak256(runtimeCode);
  const expectedRuntimeCodeHash = hre.ethers.keccak256(artifact.deployedBytecode);
  if (runtimeCode === '0x' || runtimeCodeHash !== expectedRuntimeCodeHash) {
    throw new Error('StagingCukiesNftV2 runtime bytecode does not match the compiled artifact.');
  }
  if (!await nft.supportsInterface(ERC721_INTERFACE_ID)) {
    throw new Error(`StagingCukiesNftV2 does not expose ERC721 ${ERC721_INTERFACE_ID}.`);
  }

  const fixtures = [];
  for (let generation = 1; generation <= 2; generation += 1) {
    for (let rarity = 1; rarity <= 6; rarity += 1) {
      const fixtureOffset = (generation - 1) * 6 + (rarity - 1);
      const tokenId = initialTokenId + BigInt(fixtureOffset);
      const recipient = recipients[fixtureOffset % recipients.length];
      const transaction = await nft.mint(recipient, tokenId, rarity, generation);
      const receipt = await successfulReceipt(transaction, `fixture mint ${tokenId}`);
      const metadata = await nft.cukieMetadata(tokenId);
      if (
        await nft.ownerOf(tokenId) !== recipient
        || metadata.rarity !== BigInt(rarity)
        || metadata.generation !== BigInt(generation)
      ) {
        throw new Error(`Fixture ${tokenId} failed its owner/metadata verification.`);
      }
      fixtures.push({
        tokenId: tokenId.toString(),
        recipient,
        rarity,
        generation,
        mintTransactionHash: transaction.hash,
        mintBlock: receipt.blockNumber,
      });
    }
  }

  console.log(JSON.stringify({
    script: 'deploy-nft-v2-testnet.cjs',
    network: hre.network.name,
    chainId: Number(providerNetwork.chainId),
    deployer: deployerAddress,
    contract: {
      address: nftAddress,
      deploymentBlock: deploymentReceipt.blockNumber,
      deploymentTransactionHash: deploymentTransaction.hash,
      runtimeCodeHash,
      erc721InterfaceId: ERC721_INTERFACE_ID,
    },
    fixtures,
    expectedOriginalFixturePoints: 39,
    expectedOriginalNftSlots: 5,
    expectedPoolFixturesByGeneration: 6,
    indexerAliases: {
      environmentVariable: 'CHAIN_INDEXER_CONTRACT_ALIASES',
      requiredToMergeWithoutRemovingExistingAliases: ['TOKEN_V2'],
    },
    environment: {
      NEXT_PUBLIC_UKI_CHAIN_ID: String(BSC_TESTNET_CHAIN_ID),
      NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESS: nftAddress,
      NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESSES: nftAddress,
      NEXT_PUBLIC_CUKIES_NFT_RECOVERY_COLLECTION_ADDRESSES: nftAddress,
      NEXT_PUBLIC_BSCSCAN_BASE_URL: 'https://testnet.bscscan.com',
      CUKIE_MASTER_NFT_COLLECTION_ADDRESSES: nftAddress,
      CUKIE_POOL_NFT_COLLECTION_ADDRESSES: nftAddress,
      CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: String(BSC_TESTNET_CHAIN_ID),
      CHAIN_INDEXER_TOKEN_V2_ADDRESS: nftAddress,
      CHAIN_INDEXER_TOKEN_V2_START_BSC_BLOCK: String(deploymentReceipt.blockNumber),
      CHAIN_INDEXER_TOKEN_V2_DEPLOYMENT_BSC_BLOCK: String(deploymentReceipt.blockNumber),
      CHAIN_INDEXER_TOKEN_V2_DEPLOYMENT_TX_HASH: deploymentTransaction.hash,
      CHAIN_INDEXER_TOKEN_V2_RUNTIME_CODE_HASH: runtimeCodeHash,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
