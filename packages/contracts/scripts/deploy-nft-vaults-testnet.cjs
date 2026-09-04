const hre = require('hardhat');

const BSC_TESTNET_CHAIN_ID = 97n;
const ERC721_INTERFACE_ID = '0x80ac58cd';
const ZERO_ADDRESS = hre.ethers.ZeroAddress;

const MASTER_COLLECTIONS_ENV = 'CUKIE_MASTER_NFT_COLLECTION_ADDRESSES';
const POOL_COLLECTIONS_ENV = 'CUKIE_POOL_NFT_COLLECTION_ADDRESSES';
const DEPLOYMENT_CONFIRM_ENV = 'STAGING_NFT_VAULTS_DEPLOYMENT_CONFIRM';
const DEPLOYMENT_CONFIRM_VALUE = 'BSC_TESTNET_97_ONLY';

function checkpoint(stage, details) {
  console.error(JSON.stringify({ checkpoint: stage, ...details }));
}

function envValue(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function requireEnv(name) {
  const value = envValue(name);
  if (!value) throw new Error(`${name} is required for the NFT vault testnet deploy.`);
  return value;
}

function normalizeAddress(value, label) {
  try {
    const address = hre.ethers.getAddress(value);
    if (address === ZERO_ADDRESS) throw new Error('zero address');
    return address;
  } catch (_error) {
    throw new Error(`${label} must be a valid non-zero address. Received: ${value}`);
  }
}

function requireAddress(name) {
  return normalizeAddress(requireEnv(name), name);
}

function requireAddressList(name) {
  const rawItems = requireEnv(name).split(',');
  if (rawItems.some((item) => item.trim() === '')) {
    throw new Error(`${name} contains an empty comma-separated item.`);
  }

  const addresses = rawItems.map((item, index) => (
    normalizeAddress(item.trim(), `${name}[${index}]`)
  ));
  const normalized = addresses.map((address) => address.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${name} contains duplicate collection addresses.`);
  }
  return addresses;
}

function requireRepresentableCollectionConfig(masterCollections, poolCollections) {
  if (
    masterCollections.length !== 1
    || poolCollections.length !== 1
    || masterCollections[0].toLowerCase() !== poolCollections[0].toLowerCase()
  ) {
    throw new Error(
      'The current staging DApp and chain indexer require exactly one shared canonical NFT '
      + `collection in ${MASTER_COLLECTIONS_ENV} and ${POOL_COLLECTIONS_ENV}. `
      + 'Refusing to deploy a vault configuration that staging cannot represent safely.'
    );
  }
  return masterCollections[0];
}

function assertFreshDeployEnvironment() {
  const configuredVaultAddresses = Object.keys(process.env)
    .filter((name) => /(^|_)CUKIE_(MASTER|POOL)(_NFT)?_VAULT_ADDRESS$/.test(name))
    .filter((name) => envValue(name));

  if (configuredVaultAddresses.length > 0) {
    throw new Error(
      `Fresh deploy refused: existing NFT vault address env detected (${configuredVaultAddresses.sort().join(', ')}). `
      + 'Clear those variables or use a separate attach/preflight workflow.'
    );
  }
}

async function requireSuccessfulReceipt(transaction, label) {
  checkpoint('transaction_broadcast', { label, transactionHash: transaction.hash });
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`${label} transaction failed or did not produce a successful receipt: ${transaction.hash}`);
  }
  checkpoint('transaction_confirmed', {
    label,
    transactionHash: transaction.hash,
    blockNumber: receipt.blockNumber,
  });
  return receipt;
}

async function runtimeIdentity(address, label) {
  const runtimeCode = await hre.ethers.provider.getCode(address);
  if (!runtimeCode || runtimeCode === '0x') {
    throw new Error(`${label} has no runtime bytecode at ${address}.`);
  }
  return {
    runtimeCode,
    runtimeCodeHash: hre.ethers.keccak256(runtimeCode),
  };
}

async function validateErc721Collection(address, sourceEnv) {
  const identity = await runtimeIdentity(address, `ERC721 collection from ${sourceEnv}`);
  const erc165 = new hre.ethers.Contract(
    address,
    ['function supportsInterface(bytes4 interfaceId) external view returns (bool)'],
    hre.ethers.provider
  );

  let supportsErc721;
  try {
    supportsErc721 = await erc165.supportsInterface(ERC721_INTERFACE_ID);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Collection ${address} from ${sourceEnv} could not prove ERC721 support via supportsInterface(${ERC721_INTERFACE_ID}): ${detail}`
    );
  }
  if (supportsErc721 !== true) {
    throw new Error(
      `Collection ${address} from ${sourceEnv} does not support ERC721 interface ${ERC721_INTERFACE_ID}.`
    );
  }

  return {
    address,
    supportsInterface: ERC721_INTERFACE_ID,
    runtimeCodeHash: identity.runtimeCodeHash,
  };
}

async function expectedRuntimeCodeHash(contractName) {
  const artifact = await hre.artifacts.readArtifact(contractName);
  if (!artifact.deployedBytecode || artifact.deployedBytecode === '0x') {
    throw new Error(`${contractName} artifact has no deployed bytecode.`);
  }
  return hre.ethers.keccak256(artifact.deployedBytecode);
}

async function deployVault(contractName, deployerAddress) {
  const Factory = await hre.ethers.getContractFactory(contractName);
  const contract = contractName === 'CukiePoolNftVault'
    ? await Factory.deploy(deployerAddress, 86400)
    : await Factory.deploy(deployerAddress);
  const deploymentTransaction = contract.deploymentTransaction();
  if (!deploymentTransaction) {
    throw new Error(`${contractName} did not expose its deployment transaction.`);
  }
  checkpoint('contract_address_reserved', {
    contract: contractName,
    address: await contract.getAddress(),
    transactionHash: deploymentTransaction.hash,
  });

  const receipt = await requireSuccessfulReceipt(
    deploymentTransaction,
    `${contractName} deployment`
  );
  await contract.waitForDeployment();

  const address = normalizeAddress(await contract.getAddress(), `${contractName} deployment address`);
  if (!receipt.contractAddress || normalizeAddress(receipt.contractAddress, `${contractName} receipt address`) !== address) {
    throw new Error(`${contractName} deployment receipt address does not match ${address}.`);
  }

  const identity = await runtimeIdentity(address, contractName);
  const expectedCodeHash = await expectedRuntimeCodeHash(contractName);
  if (identity.runtimeCodeHash.toLowerCase() !== expectedCodeHash.toLowerCase()) {
    throw new Error(
      `${contractName} runtime bytecode mismatch at ${address}: observed ${identity.runtimeCodeHash}, expected ${expectedCodeHash}.`
    );
  }

  return {
    contract,
    address,
    deploymentBlock: receipt.blockNumber,
    deploymentTransactionHash: deploymentTransaction.hash,
    runtimeCodeHash: identity.runtimeCodeHash,
  };
}

async function configureCollections(deployment, collections, label) {
  const transactions = [];
  for (const collection of collections) {
    if (await deployment.contract.collectionAllowed(collection)) {
      throw new Error(`${label} unexpectedly allowlists ${collection} before configuration.`);
    }

    const transaction = await deployment.contract.setCollectionAllowed(collection, true);
    const receipt = await requireSuccessfulReceipt(
      transaction,
      `${label} allowlist ${collection}`
    );
    if (!await deployment.contract.collectionAllowed(collection)) {
      throw new Error(`${label} failed to allowlist ${collection}.`);
    }

    transactions.push({
      collection,
      transactionHash: transaction.hash,
      blockNumber: receipt.blockNumber,
    });
  }
  return transactions;
}

async function configureOwnership(deployment, deployerAddress, requestedOwner, label) {
  const ownerBefore = normalizeAddress(await deployment.contract.owner(), `${label}.owner`);
  const pendingBefore = normalizeOptionalAddress(
    await deployment.contract.pendingOwner(),
    `${label}.pendingOwner`
  );
  if (ownerBefore !== deployerAddress || pendingBefore !== null) {
    throw new Error(
      `${label} ownership is not in its expected fresh state: owner=${ownerBefore}, pendingOwner=${pendingBefore}.`
    );
  }

  if (requestedOwner === deployerAddress) {
    return {
      mode: 'DEPLOYER_OWNED',
      transferTransactionHash: null,
      transferBlock: null,
    };
  }

  const transaction = await deployment.contract.transferOwnership(requestedOwner);
  const receipt = await requireSuccessfulReceipt(transaction, `${label} ownership handover initiation`);
  return {
    mode: 'PENDING_ACCEPTANCE',
    transferTransactionHash: transaction.hash,
    transferBlock: receipt.blockNumber,
  };
}

function normalizeOptionalAddress(value, label) {
  const normalized = hre.ethers.getAddress(value);
  return normalized === ZERO_ADDRESS ? null : normalizeAddress(normalized, label);
}

async function verifyDeployment(
  deployment,
  contractName,
  deployerAddress,
  requestedOwner,
  collections
) {
  const identity = await runtimeIdentity(deployment.address, contractName);
  const expectedCodeHash = await expectedRuntimeCodeHash(contractName);
  if (
    identity.runtimeCodeHash.toLowerCase() !== expectedCodeHash.toLowerCase()
    || identity.runtimeCodeHash.toLowerCase() !== deployment.runtimeCodeHash.toLowerCase()
  ) {
    throw new Error(`${contractName} final runtime bytecode verification failed.`);
  }

  const owner = normalizeAddress(await deployment.contract.owner(), `${contractName}.owner`);
  const pendingOwner = normalizeOptionalAddress(
    await deployment.contract.pendingOwner(),
    `${contractName}.pendingOwner`
  );
  const expectedPendingOwner = requestedOwner === deployerAddress ? null : requestedOwner;
  if (owner !== deployerAddress || pendingOwner !== expectedPendingOwner) {
    throw new Error(
      `${contractName} final ownership mismatch: owner=${owner}, pendingOwner=${pendingOwner}, `
      + `expected owner=${deployerAddress}, expected pendingOwner=${expectedPendingOwner}.`
    );
  }

  if (await deployment.contract.paused()) {
    throw new Error(`${contractName} must not be paused after deployment.`);
  }
  for (const collection of collections) {
    if (!await deployment.contract.collectionAllowed(collection)) {
      throw new Error(`${contractName} final allowlist verification failed for ${collection}.`);
    }
  }

  let calendar = null;
  if (contractName === 'CukiePoolNftVault') {
    const versionCount = await deployment.contract.calendarVersionCount();
    const periodDuration = await deployment.contract.PERIOD_DURATION();
    const initialPeriodStart = await deployment.contract.INITIAL_PERIOD_START();
    const initialVersion = await deployment.contract.calendarVersion(1);
    const effectiveAt = initialVersion.effectiveAt ?? initialVersion[0];
    const firstCutoffAt = initialVersion.firstCutoffAt ?? initialVersion[1];
    const firstPeriodId = initialVersion.firstPeriodId ?? initialVersion[2];
    if (
      versionCount !== 1n
      || periodDuration !== 86_400n
      || initialPeriodStart !== 50_400n
      || effectiveAt !== initialPeriodStart
      || firstCutoffAt !== initialPeriodStart + periodDuration
      || firstPeriodId !== 0n
    ) {
      throw new Error(
        'CukiePoolNftVault initial calendar mismatch: expected daily periods anchored at 14:00 UTC.'
      );
    }
    calendar = {
      versionCount: versionCount.toString(),
      periodDurationSeconds: periodDuration.toString(),
      initialPeriodStart: initialPeriodStart.toString(),
      firstCutoffAt: firstCutoffAt.toString(),
      firstPeriodId: firstPeriodId.toString(),
      periodAnchorSecondsUtc: Number(firstCutoffAt % periodDuration),
    };
  }

  return {
    bytecodeMatchesArtifact: true,
    owner,
    pendingOwner,
    paused: false,
    allowlistedCollections: collections,
    ...(calendar ? { calendar } : {}),
  };
}

function publicDeployment(deployment, allowlistTransactions, ownership, checks) {
  return {
    address: deployment.address,
    deploymentBlock: deployment.deploymentBlock,
    deploymentTransactionHash: deployment.deploymentTransactionHash,
    runtimeCodeHash: deployment.runtimeCodeHash,
    transactions: {
      allowlists: allowlistTransactions,
      ownershipTransfer: ownership.transferTransactionHash
        ? {
          transactionHash: ownership.transferTransactionHash,
          blockNumber: ownership.transferBlock,
        }
        : null,
    },
    ownershipMode: ownership.mode,
    checks,
  };
}

async function main() {
  const providerNetwork = await hre.ethers.provider.getNetwork();
  if (
    hre.network.name !== 'bscTestnet'
    || BigInt(hre.network.config.chainId ?? 0) !== BSC_TESTNET_CHAIN_ID
    || providerNetwork.chainId !== BSC_TESTNET_CHAIN_ID
  ) {
    throw new Error(
      `This script is BSC Testnet-only. Use --network bscTestnet. `
      + `Current network=${hre.network.name}, configuredChainId=${hre.network.config.chainId}, `
      + `providerChainId=${providerNetwork.chainId}.`
    );
  }
  if (requireEnv(DEPLOYMENT_CONFIRM_ENV) !== DEPLOYMENT_CONFIRM_VALUE) {
    throw new Error(`${DEPLOYMENT_CONFIRM_ENV} must be ${DEPLOYMENT_CONFIRM_VALUE}.`);
  }

  assertFreshDeployEnvironment();

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required by the bscTestnet Hardhat network.');

  const deployerAddress = normalizeAddress(deployer.address, 'deployer signer');
  const expectedDeployer = requireAddress('DEPLOYER_ADDRESS');
  if (deployerAddress !== expectedDeployer) {
    throw new Error(
      `DEPLOYER_ADDRESS mismatch. Private key resolves to ${deployerAddress}, expected ${expectedDeployer}.`
    );
  }
  if (await hre.ethers.provider.getBalance(deployerAddress) === 0n) {
    throw new Error(`DEPLOYER_ADDRESS ${deployerAddress} has no testnet BNB for gas.`);
  }

  const requestedOwner = envValue('NFT_VAULT_OWNER_ADDRESS')
    ? requireAddress('NFT_VAULT_OWNER_ADDRESS')
    : deployerAddress;
  const masterCollections = requireAddressList(MASTER_COLLECTIONS_ENV);
  const poolCollections = requireAddressList(POOL_COLLECTIONS_ENV);
  const canonicalCollection = requireRepresentableCollectionConfig(
    masterCollections,
    poolCollections
  );

  // Complete all externally discoverable preflight checks before broadcasting a deployment.
  const [masterCollectionChecks, poolCollectionChecks] = await Promise.all([
    Promise.all(masterCollections.map((address) => (
      validateErc721Collection(address, MASTER_COLLECTIONS_ENV)
    ))),
    Promise.all(poolCollections.map((address) => (
      validateErc721Collection(address, POOL_COLLECTIONS_ENV)
    ))),
  ]);
  await Promise.all([
    expectedRuntimeCodeHash('CukieMasterNftVault'),
    expectedRuntimeCodeHash('CukiePoolNftVault'),
  ]);

  const master = await deployVault('CukieMasterNftVault', deployerAddress);
  const pool = await deployVault('CukiePoolNftVault', deployerAddress);

  const masterAllowlistTransactions = await configureCollections(
    master,
    masterCollections,
    'CukieMasterNftVault'
  );
  const poolAllowlistTransactions = await configureCollections(
    pool,
    poolCollections,
    'CukiePoolNftVault'
  );

  const masterOwnership = await configureOwnership(
    master,
    deployerAddress,
    requestedOwner,
    'CukieMasterNftVault'
  );
  const poolOwnership = await configureOwnership(
    pool,
    deployerAddress,
    requestedOwner,
    'CukiePoolNftVault'
  );

  const masterChecks = await verifyDeployment(
    master,
    'CukieMasterNftVault',
    deployerAddress,
    requestedOwner,
    masterCollections
  );
  const poolChecks = await verifyDeployment(
    pool,
    'CukiePoolNftVault',
    deployerAddress,
    requestedOwner,
    poolCollections
  );

  const ownershipPending = requestedOwner !== deployerAddress;
  console.log(JSON.stringify({
    script: 'deploy-nft-vaults-testnet.cjs',
    network: hre.network.name,
    chainId: Number(providerNetwork.chainId),
    deployer: deployerAddress,
    requestedOwner,
    ownership: {
      pendingAcceptance: ownershipPending,
      currentOwner: deployerAddress,
      pendingOwner: ownershipPending ? requestedOwner : null,
      requiredNextAction: ownershipPending
        ? `${requestedOwner} must call acceptOwnership() independently on both vaults.`
        : null,
    },
    validatedCollections: {
      cukieMaster: masterCollectionChecks,
      cukiePool: poolCollectionChecks,
    },
    contracts: {
      cukieMasterNftVault: publicDeployment(
        master,
        masterAllowlistTransactions,
        masterOwnership,
        masterChecks
      ),
      cukiePoolNftVault: publicDeployment(
        pool,
        poolAllowlistTransactions,
        poolOwnership,
        poolChecks
      ),
    },
    indexerAliases: {
      environmentVariable: 'CHAIN_INDEXER_CONTRACT_ALIASES',
      requiredToMergeWithoutRemovingExistingAliases: [
        'TOKEN_V2',
        'CUKIE_MASTER_NFT_VAULT',
        'CUKIE_POOL_NFT_VAULT',
      ],
    },
    dappEnvironment: {
      NEXT_PUBLIC_UKI_CHAIN_ID: String(BSC_TESTNET_CHAIN_ID),
      NEXT_PUBLIC_CUKIE_MASTER_NFT_VAULT_ADDRESS: master.address,
      NEXT_PUBLIC_CUKIE_POOL_NFT_VAULT_ADDRESS: pool.address,
      NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESS: canonicalCollection,
      NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESSES: canonicalCollection,
      NEXT_PUBLIC_CUKIES_NFT_RECOVERY_COLLECTION_ADDRESSES: canonicalCollection,
      NEXT_PUBLIC_BSCSCAN_BASE_URL: 'https://testnet.bscscan.com',
    },
    serverEnvironment: {
      CUKIE_MASTER_NFT_COLLECTION_ADDRESSES: canonicalCollection,
      CUKIE_POOL_NFT_COLLECTION_ADDRESSES: canonicalCollection,
    },
    indexerEnvironment: {
      CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: String(BSC_TESTNET_CHAIN_ID),
      CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_ADDRESS: master.address,
      CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_START_BSC_BLOCK: String(master.deploymentBlock),
      CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_DEPLOYMENT_BSC_BLOCK: String(master.deploymentBlock),
      CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_DEPLOYMENT_TX_HASH: master.deploymentTransactionHash,
      CHAIN_INDEXER_CUKIE_MASTER_NFT_VAULT_RUNTIME_CODE_HASH: master.runtimeCodeHash,
      CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_ADDRESS: pool.address,
      CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_START_BSC_BLOCK: String(pool.deploymentBlock),
      CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_DEPLOYMENT_BSC_BLOCK: String(pool.deploymentBlock),
      CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_DEPLOYMENT_TX_HASH: pool.deploymentTransactionHash,
      CHAIN_INDEXER_CUKIE_POOL_NFT_VAULT_RUNTIME_CODE_HASH: pool.runtimeCodeHash,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
