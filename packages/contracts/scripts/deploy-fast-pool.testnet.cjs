// Pool-only deployment. Never moves existing NFTs or deploys to mainnet.
const hre = require('hardhat');

async function main() {
  const { ethers } = hre;
  const network = await ethers.provider.getNetwork();
  const duration = Number(process.env.ECONOMY_CYCLE_SECONDS);
  const expectedOwner = process.env.STAGING_POOL_EXPECTED_OWNER;
  const collections = (process.env.STAGING_POOL_COLLECTIONS || '').split(',').filter(Boolean);
  if (network.chainId !== 97n || hre.network.name !== 'bscTestnet'
    || process.env.APP_ENV !== 'staging' || process.env.STAGING_ONLY_GUARD !== 'true'
    || ![1800, 3600].includes(duration) || !ethers.isAddress(expectedOwner)
    || !collections.length || collections.some((address) => !ethers.isAddress(address))
    || new Set(collections.map((address) => address.toLowerCase())).size !== collections.length) {
    throw new Error('Requires isolated staging, BSC Testnet, duration, expected owner and distinct collections.');
  }
  const [owner] = await ethers.getSigners();
  if (owner.address.toLowerCase() !== expectedOwner.toLowerCase()) throw new Error('Unexpected deployment signer.');
  for (const address of collections) {
    const collection = new ethers.Contract(address,
      ['function supportsInterface(bytes4) view returns (bool)'], ethers.provider);
    if (!(await collection.supportsInterface('0x80ac58cd'))) throw new Error('Collection is not ERC721.');
  }
  console.log(JSON.stringify({ chainId: 97, duration, owner: owner.address, collections }));
  if (process.env.STAGING_POOL_DEPLOY_CONFIRM !== 'DEPLOY_FAST_POOL_TESTNET_97') {
    console.log('Preflight only; no transactions sent.');
    return;
  }
  const Factory = await ethers.getContractFactory('CukiePoolNftVault');
  const vault = await Factory.deploy(owner.address, duration);
  const tx = vault.deploymentTransaction();
  console.log(JSON.stringify({ deploymentTransaction: tx.hash, address: await vault.getAddress() }));
  const receipt = await tx.wait(2);
  if (receipt.status !== 1) throw new Error('Deployment reverted.');
  const address = await vault.getAddress();
  const runtimeHash = ethers.keccak256(await ethers.provider.getCode(address));
  const artifact = await hre.artifacts.readArtifact('CukiePoolNftVault');
  if (runtimeHash !== ethers.keccak256(artifact.deployedBytecode)
    || (await vault.PERIOD_DURATION()) !== BigInt(duration)
    || (await vault.owner()) !== owner.address) throw new Error('Deployment verification failed.');
  for (const collection of collections) {
    const allowed = await vault.setCollectionAllowed(collection, true);
    console.log(JSON.stringify({ allowlistTransaction: allowed.hash, collection }));
    if ((await allowed.wait(2)).status !== 1 || !(await vault.collectionAllowed(collection))) {
      throw new Error('Collection configuration failed.');
    }
  }
  console.log(JSON.stringify({ verified: true, chainId: 97, duration,
    NEXT_PUBLIC_CUKIE_POOL_NFT_VAULT_ADDRESS: address,
    CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_ADDRESS: address,
    CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_START_BSC_BLOCK: receipt.blockNumber,
    CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_DEPLOYMENT_BSC_BLOCK: receipt.blockNumber,
    CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_DEPLOYMENT_TX_HASH: tx.hash,
    CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_RUNTIME_CODE_HASH: runtimeHash,
  }, null, 2));
}
main().catch((error) => { console.error(error.shortMessage || error.message); process.exitCode = 1; });
