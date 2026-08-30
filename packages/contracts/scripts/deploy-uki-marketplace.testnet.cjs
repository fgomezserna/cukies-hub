const hre = require("hardhat");
const {
  BSC_TESTNET_CHAIN_ID,
  buildUkiMarketplaceTestnetPlan,
  normalizeAddress,
} = require("./lib/uki-marketplace-testnet-plan.cjs");

const ERC721_INTERFACE_ID = "0x80ac58cd";

function checkpoint(stage, details) {
  console.error(JSON.stringify({ checkpoint: stage, ...details }));
}

async function requireRuntimeCode(address, label) {
  const runtimeCode = await hre.ethers.provider.getCode(address);
  if (!runtimeCode || runtimeCode === "0x") {
    throw new Error(`${label} has no runtime bytecode at ${address}.`);
  }
  return {
    runtimeCode,
    runtimeCodeHash: hre.ethers.keccak256(runtimeCode),
  };
}

async function requireSuccessfulReceipt(transaction, label) {
  checkpoint("transaction_broadcast", {
    label,
    transactionHash: transaction.hash,
  });
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`${label} failed or did not produce a successful receipt.`);
  }
  checkpoint("transaction_confirmed", {
    label,
    transactionHash: transaction.hash,
    blockNumber: receipt.blockNumber,
  });
  return receipt;
}

async function assertExternalContracts(plan) {
  await Promise.all([
    requireRuntimeCode(plan.ukiToken, "UKI token"),
    requireRuntimeCode(plan.router, "PancakeSwap V2 router"),
    requireRuntimeCode(plan.wrappedNative, "WBNB"),
    requireRuntimeCode(plan.collection, "Cukies collection"),
  ]);

  const router = new hre.ethers.Contract(
    plan.router,
    ["function WETH() external view returns (address)"],
    hre.ethers.provider
  );
  const routerWrappedNative = normalizeAddress(
    await router.WETH(),
    "router.WETH"
  );
  if (routerWrappedNative !== plan.wrappedNative) {
    throw new Error(
      `PancakeSwap router WETH mismatch: observed ${routerWrappedNative}, expected ${plan.wrappedNative}.`
    );
  }

  const collection = new hre.ethers.Contract(
    plan.collection,
    [
      "function supportsInterface(bytes4 interfaceId) external view returns (bool)",
    ],
    hre.ethers.provider
  );
  if ((await collection.supportsInterface(ERC721_INTERFACE_ID)) !== true) {
    throw new Error(
      `Collection ${plan.collection} does not prove ERC721 support.`
    );
  }
}

async function assertDeploymentState(marketplace, address, plan) {
  const observed = {
    ukiToken: normalizeAddress(
      await marketplace.ukiToken(),
      "marketplace.ukiToken"
    ),
    router: normalizeAddress(await marketplace.router(), "marketplace.router"),
    wrappedNative: normalizeAddress(
      await marketplace.wrappedNative(),
      "marketplace.wrappedNative"
    ),
    feeRecipient: normalizeAddress(
      await marketplace.feeRecipient(),
      "marketplace.feeRecipient"
    ),
    feeBps: Number(await marketplace.feeBps()),
    owner: normalizeAddress(await marketplace.owner(), "marketplace.owner"),
    collectionAllowed: await marketplace.collectionAllowed(plan.collection),
    nativePaymentAllowed: await marketplace.nativePaymentAllowed(),
    paused: await marketplace.paused(),
  };

  const expected = {
    ukiToken: plan.ukiToken,
    router: plan.router,
    wrappedNative: plan.wrappedNative,
    feeRecipient: plan.feeRecipient,
    feeBps: plan.feeBps,
    owner: plan.deployer,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (observed[key] !== value) {
      throw new Error(
        `${address}.${key} mismatch: observed ${observed[key]}, expected ${value}.`
      );
    }
  }
  if (!observed.collectionAllowed)
    throw new Error("Marketplace collection allowlist was not persisted.");
  if (observed.paused)
    throw new Error("Fresh marketplace unexpectedly deployed paused.");
  if (observed.nativePaymentAllowed)
    throw new Error("Fresh marketplace unexpectedly enabled native payments.");

  return observed;
}

async function main() {
  if (
    hre.network.name !== "bscTestnet" ||
    hre.network.config.chainId !== BSC_TESTNET_CHAIN_ID
  ) {
    throw new Error(
      `This script is BSC Testnet-only. Current network=${hre.network.name}, chainId=${hre.network.config.chainId}.`
    );
  }
  const network = await hre.ethers.provider.getNetwork();
  if (Number(network.chainId) !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(
      `RPC chain mismatch: observed ${network.chainId}, expected ${BSC_TESTNET_CHAIN_ID}.`
    );
  }

  const plan = buildUkiMarketplaceTestnetPlan(process.env);
  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("DEPLOYER_PRIVATE_KEY is required.");
  const signerAddress = normalizeAddress(signer.address, "deployer signer");
  if (signerAddress !== plan.deployer) {
    throw new Error(
      `Deployer mismatch: key resolves to ${signerAddress}, expected ${plan.deployer}.`
    );
  }

  await assertExternalContracts(plan);
  checkpoint("preflight_complete", {
    chainId: plan.chainId,
    deployer: plan.deployer,
    collection: plan.collection,
    feeBps: plan.feeBps,
  });

  const Marketplace = await hre.ethers.getContractFactory("CukiesMarketplace");
  const marketplace = await Marketplace.deploy(
    plan.ukiToken,
    plan.router,
    plan.wrappedNative,
    plan.feeRecipient,
    plan.feeBps,
    plan.deployer
  );
  const deploymentTransaction = marketplace.deploymentTransaction();
  if (!deploymentTransaction)
    throw new Error("Marketplace deployment transaction is unavailable.");
  const deploymentReceipt = await requireSuccessfulReceipt(
    deploymentTransaction,
    "CukiesMarketplace deployment"
  );
  await marketplace.waitForDeployment();

  const address = normalizeAddress(
    await marketplace.getAddress(),
    "marketplace address"
  );
  if (
    !deploymentReceipt.contractAddress ||
    normalizeAddress(
      deploymentReceipt.contractAddress,
      "deployment receipt address"
    ) !== address
  ) {
    throw new Error(`Marketplace receipt address does not match ${address}.`);
  }

  const allowlistTransaction = await marketplace.setCollectionAllowed(
    plan.collection,
    true
  );
  const allowlistReceipt = await requireSuccessfulReceipt(
    allowlistTransaction,
    "Cukies marketplace collection allowlist"
  );

  let handover = null;
  if (plan.owner !== plan.deployer) {
    const transaction = await marketplace.transferOwnership(plan.owner);
    const receipt = await requireSuccessfulReceipt(
      transaction,
      "Marketplace ownership handover initiation"
    );
    handover = {
      transactionHash: transaction.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  const state = await assertDeploymentState(marketplace, address, plan);
  const pendingOwnerRaw = hre.ethers.getAddress(
    await marketplace.pendingOwner()
  );
  const pendingOwner =
    pendingOwnerRaw === hre.ethers.ZeroAddress
      ? null
      : normalizeAddress(pendingOwnerRaw, "marketplace pending owner");
  const expectedPendingOwner = plan.owner === plan.deployer ? null : plan.owner;
  if (pendingOwner !== expectedPendingOwner) {
    throw new Error(
      `Marketplace pending owner mismatch: observed ${pendingOwner}, expected ${expectedPendingOwner}.`
    );
  }

  const identity = await requireRuntimeCode(address, "CukiesMarketplace");
  console.log(
    JSON.stringify(
      {
        script: "deploy-uki-marketplace.testnet.cjs",
        network: hre.network.name,
        chainId: plan.chainId,
        marketplace: {
          address,
          deploymentBlock: deploymentReceipt.blockNumber,
          deploymentTransactionHash: deploymentTransaction.hash,
          runtimeCodeHash: identity.runtimeCodeHash,
        },
        configuration: {
          ...state,
          collection: plan.collection,
          requestedOwner: plan.owner,
          pendingOwner,
          paymentTokensEnabled: [],
          nativeRouteEnabled: state.nativePaymentAllowed,
          tokenRouteEnabled: false,
        },
        configurationTransactions: {
          collectionAllowlist: {
            transactionHash: allowlistTransaction.hash,
            blockNumber: allowlistReceipt.blockNumber,
          },
          ownershipHandover: handover,
        },
        env: {
          NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS: address,
          CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS: address,
          CHAIN_INDEXER_UKI_MARKETPLACE_START_BSC_BLOCK: String(
            deploymentReceipt.blockNumber
          ),
          CHAIN_INDEXER_UKI_MARKETPLACE_DEPLOYMENT_BSC_BLOCK: String(
            deploymentReceipt.blockNumber
          ),
          CHAIN_INDEXER_UKI_MARKETPLACE_DEPLOYMENT_TX_HASH:
            deploymentTransaction.hash,
          CHAIN_INDEXER_UKI_MARKETPLACE_RUNTIME_CODE_HASH:
            identity.runtimeCodeHash,
          NEXT_PUBLIC_UKI_MARKETPLACE_ROUTER_ADDRESS: plan.router,
          NEXT_PUBLIC_UKI_MARKETPLACE_WBNB_ADDRESS: plan.wrappedNative,
        },
        next: [
          "Verify the exact constructor arguments and source on BscScan Testnet.",
          "Accept two-step ownership if requestedOwner differs from deployer.",
          "Keep BNB and USDT checkout disabled until their complete routes are verified on chain 97.",
          "Load the emitted identity into Stage and run indexer plus signed listing/buy/cancel smoke tests.",
        ],
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
