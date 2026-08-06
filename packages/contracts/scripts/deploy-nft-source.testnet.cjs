const hre = require('hardhat');

const BSC_TESTNET_CHAIN_ID = 97;
const FIRST_FIXTURE_TOKEN_ID = 97_000_001n;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the NFT testnet source deploy`);
  return value;
}

function normalizeAddress(value, label) {
  try {
    return hre.ethers.getAddress(value);
  } catch (_error) {
    throw new Error(`${label} must be a valid address.`);
  }
}

async function deploymentEvidence(contract, label) {
  const address = await contract.getAddress();
  const transaction = contract.deploymentTransaction();
  if (!transaction) throw new Error(`${label} deployment transaction is unavailable.`);
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1 || normalizeAddress(receipt.contractAddress, label) !== address) {
    throw new Error(`${label} deployment receipt validation failed.`);
  }
  const code = await hre.ethers.provider.getCode(address);
  if (code === '0x') throw new Error(`${label} has no runtime bytecode.`);
  return {
    address,
    deploymentBlock: receipt.blockNumber,
    deploymentTxHash: receipt.hash,
    runtimeCodeHash: hre.ethers.keccak256(code),
  };
}

async function main() {
  if (hre.network.name !== 'bscTestnet' || hre.network.config.chainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(
      `This script is BSC Testnet-only. Current network=${hre.network.name}, chainId=${hre.network.config.chainId}`,
    );
  }
  if (requireEnv('STAGING_NFT_DEPLOYMENT_CONFIRM') !== 'BSC_TESTNET_97_ONLY') {
    throw new Error('STAGING_NFT_DEPLOYMENT_CONFIRM must be BSC_TESTNET_97_ONLY.');
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required.');
  const expectedDeployer = normalizeAddress(requireEnv('DEPLOYER_ADDRESS'), 'DEPLOYER_ADDRESS');
  const deployerAddress = normalizeAddress(deployer.address, 'deployer');
  if (deployerAddress !== expectedDeployer) {
    throw new Error('DEPLOYER_ADDRESS does not match DEPLOYER_PRIVATE_KEY.');
  }
  const balance = await hre.ethers.provider.getBalance(deployerAddress);
  if (balance === 0n) throw new Error('The BSC Testnet deployer has no tBNB for gas.');

  const Nft = await hre.ethers.getContractFactory('StagingCukiesNft');
  const nft = await Nft.deploy(deployerAddress);
  await nft.waitForDeployment();

  const Marketplace = await hre.ethers.getContractFactory('StagingCukiesMarketplaceSource');
  const marketplace = await Marketplace.deploy(deployerAddress);
  await marketplace.waitForDeployment();

  const Bridge = await hre.ethers.getContractFactory('StagingCukiesBridgeSource');
  const bridge = await Bridge.deploy(deployerAddress);
  await bridge.waitForDeployment();

  const contracts = {
    TOKEN: await deploymentEvidence(nft, 'StagingCukiesNft'),
    MARKETPLACE: await deploymentEvidence(marketplace, 'StagingCukiesMarketplaceSource'),
    BRIDGE: await deploymentEvidence(bridge, 'StagingCukiesBridgeSource'),
  };

  const fixtures = [];
  for (let rarity = 1; rarity <= 6; rarity += 1) {
    const tokenId = FIRST_FIXTURE_TOKEN_ID + BigInt(rarity - 1);
    const tx = await nft.mint(deployerAddress, tokenId, rarity, 1);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`Fixture mint ${tokenId} failed.`);
    const metadata = await nft.cukieMetadata(tokenId);
    if (metadata.rarity !== BigInt(rarity) || metadata.generation !== 1n) {
      throw new Error(`Fixture metadata ${tokenId} failed.`);
    }
    fixtures.push({
      tokenId: tokenId.toString(),
      rarity,
      generation: 1,
      mintTxHash: receipt.hash,
      mintBlock: receipt.blockNumber,
    });
  }

  console.log(JSON.stringify({
    script: 'deploy-nft-source.testnet.cjs',
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployerAddress,
    contracts,
    fixtures,
    expectedFixturePoints: 39,
    expectedNftSlots: 5,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
