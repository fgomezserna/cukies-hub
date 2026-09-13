const hre = require('hardhat');
const {
  BSC_MAINNET_CHAIN_ID,
  buildUkiMarketplaceMainnetDeployPlan,
  normalizeAddress,
} = require('./lib/uki-marketplace-mainnet-plan.cjs');

const ERC721_INTERFACE_ID = '0x80ac58cd';
const ERC20_READ_ABI = [
  'function decimals() view returns (uint8)',
];
const ROUTER_READ_ABI = [
  'function WETH() view returns (address)',
  'function getAmountsOut(uint256 amountIn,address[] memory path) view returns (uint256[] memory amounts)',
];

function checkpoint(stage, details) {
  console.error(JSON.stringify({ checkpoint: stage, ...details }));
}

function confirmations() {
  const raw = process.env.UKI_MARKETPLACE_CONFIRMATIONS?.trim() || '12';
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 12 || value > 100) {
    throw new Error('UKI_MARKETPLACE_CONFIRMATIONS debe ser un entero entre 12 y 100.');
  }
  return value;
}

async function requireRuntimeCode(address, label) {
  const runtimeCode = await hre.ethers.provider.getCode(address);
  if (!runtimeCode || runtimeCode === '0x') throw new Error(`${label} no tiene bytecode en ${address}.`);
  return { runtimeCode, runtimeCodeHash: hre.ethers.keccak256(runtimeCode) };
}

async function requireSuccessfulReceipt(transaction, label, confirmationCount) {
  checkpoint('transaction_broadcast', { label, transactionHash: transaction.hash });
  const receipt = await transaction.wait(confirmationCount);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} falló o no produjo receipt exitoso.`);
  checkpoint('transaction_confirmed', { label, transactionHash: transaction.hash, blockNumber: receipt.blockNumber });
  return receipt;
}

async function assertExternalContracts(plan) {
  await Promise.all([
    requireRuntimeCode(plan.ukiToken, 'UKI token'),
    requireRuntimeCode(plan.router, 'PancakeSwap V2 router'),
    requireRuntimeCode(plan.wrappedNative, 'WBNB'),
    requireRuntimeCode(plan.collection, 'Cukies collection'),
  ]);

  const router = new hre.ethers.Contract(plan.router, ROUTER_READ_ABI, hre.ethers.provider);
  const routerWrappedNative = normalizeAddress(await router.WETH(), 'router.WETH');
  if (routerWrappedNative !== plan.wrappedNative) {
    throw new Error(`El router WETH observado ${routerWrappedNative} no coincide con ${plan.wrappedNative}.`);
  }

  const collection = new hre.ethers.Contract(plan.collection, [
    'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  ], hre.ethers.provider);
  if ((await collection.supportsInterface(ERC721_INTERFACE_ID)) !== true) {
    throw new Error(`La colección ${plan.collection} no demuestra soporte ERC721.`);
  }

  const routes = [
    ['BNB', plan.wrappedNative, plan.paths.bnb],
    ['ASM', plan.asmToken, plan.paths.asm],
    ['USDT', plan.usdtToken, plan.paths.usdt],
    ['USDC', plan.usdcToken, plan.paths.usdc],
  ];
  const routeResults = [];
  for (const [label, token, path] of routes) {
    const tokenContract = new hre.ethers.Contract(token, ERC20_READ_ABI, hre.ethers.provider);
    const decimals = Number(await tokenContract.decimals());
    if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36) throw new Error(`${label} decimals inválidos.`);
    const inputAmount = 10n ** BigInt(decimals);
    const amounts = await router.getAmountsOut(inputAmount, path);
    const output = amounts[amounts.length - 1];
    if (amounts.length !== path.length || output <= 0n) throw new Error(`La ruta ${label} no tiene cotización positiva.`);
    routeResults.push({ label, path, decimals, quoteInputRaw: inputAmount.toString(), quoteOutputRaw: output.toString() });
  }
  return routeResults;
}

async function assertState(marketplace, address, plan) {
  const observed = {
    ukiToken: normalizeAddress(await marketplace.ukiToken(), 'marketplace.ukiToken'),
    router: normalizeAddress(await marketplace.router(), 'marketplace.router'),
    wrappedNative: normalizeAddress(await marketplace.wrappedNative(), 'marketplace.wrappedNative'),
    feeRecipient: normalizeAddress(await marketplace.feeRecipient(), 'marketplace.feeRecipient'),
    feeBps: Number(await marketplace.feeBps()),
    owner: normalizeAddress(await marketplace.owner(), 'marketplace.owner'),
    collectionAllowed: await marketplace.collectionAllowed(plan.collection),
    asmAllowed: await marketplace.paymentTokenAllowed(plan.asmToken),
    usdtAllowed: await marketplace.paymentTokenAllowed(plan.usdtToken),
    usdcAllowed: await marketplace.paymentTokenAllowed(plan.usdcToken),
    nativePaymentAllowed: await marketplace.nativePaymentAllowed(),
    paused: await marketplace.paused(),
  };
  const expected = {
    ukiToken: plan.ukiToken,
    router: plan.router,
    wrappedNative: plan.wrappedNative,
    feeRecipient: plan.feeRecipient,
    feeBps: plan.feeBps,
    owner: plan.owner,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (observed[key] !== value) throw new Error(`${key} no coincide: ${observed[key]} != ${value}.`);
  }
  if (!observed.collectionAllowed || !observed.asmAllowed || !observed.usdtAllowed || !observed.usdcAllowed) {
    throw new Error('La configuración de allowlists no quedó persistida.');
  }
  if (!observed.nativePaymentAllowed || observed.paused) throw new Error('El marketplace no quedó activo con pagos nativos habilitados.');
  return observed;
}

async function main() {
  if (hre.network.name !== 'bsc' || hre.network.config.chainId !== BSC_MAINNET_CHAIN_ID) {
    throw new Error(`Este script solo admite BSC Mainnet. network=${hre.network.name}, chainId=${hre.network.config.chainId}.`);
  }
  const network = await hre.ethers.provider.getNetwork();
  if (Number(network.chainId) !== BSC_MAINNET_CHAIN_ID) throw new Error(`El RPC observa chainId=${network.chainId}, se esperaba ${BSC_MAINNET_CHAIN_ID}.`);
  const plan = buildUkiMarketplaceMainnetDeployPlan(process.env);
  const confirmationCount = confirmations();
  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error('DEPLOYER_PRIVATE_KEY es obligatorio.');
  const signerAddress = normalizeAddress(signer.address, 'deployer signer');
  if (signerAddress !== plan.deployer) throw new Error(`La private key resuelve a ${signerAddress}, esperado ${plan.deployer}.`);
  const balanceBefore = await hre.ethers.provider.getBalance(signerAddress);
  if (balanceBefore === 0n) throw new Error('El deployer no tiene BNB para gas.');

  const routeResults = await assertExternalContracts(plan);
  checkpoint('preflight_complete', { chainId: plan.chainId, deployer: plan.deployer, collection: plan.collection, feeBps: plan.feeBps, routes: routeResults.map(({ label, path }) => ({ label, path })) });

  const Marketplace = await hre.ethers.getContractFactory('CukiesMarketplace', signer);
  const marketplace = await Marketplace.deploy(plan.ukiToken, plan.router, plan.wrappedNative, plan.feeRecipient, plan.feeBps, plan.owner);
  const deploymentTransaction = marketplace.deploymentTransaction();
  if (!deploymentTransaction) throw new Error('No se encontró la transacción de deploy.');
  const deploymentReceipt = await requireSuccessfulReceipt(deploymentTransaction, 'CukiesMarketplace deployment', confirmationCount);
  await marketplace.waitForDeployment();
  const address = normalizeAddress(await marketplace.getAddress(), 'marketplace address');
  if (!deploymentReceipt.contractAddress || normalizeAddress(deploymentReceipt.contractAddress, 'receipt contract address') !== address) throw new Error('La address del receipt no coincide con la desplegada.');

  const allowlistReceipt = await requireSuccessfulReceipt(await marketplace.setCollectionAllowed(plan.collection, true), 'Cukies marketplace collection allowlist', confirmationCount);
  const asmReceipt = await requireSuccessfulReceipt(await marketplace.setPaymentTokenAllowed(plan.asmToken, true), 'ASM payment allowlist', confirmationCount);
  const usdtReceipt = await requireSuccessfulReceipt(await marketplace.setPaymentTokenAllowed(plan.usdtToken, true), 'USDT payment allowlist', confirmationCount);
  const usdcReceipt = await requireSuccessfulReceipt(await marketplace.setPaymentTokenAllowed(plan.usdcToken, true), 'USDC payment allowlist', confirmationCount);
  const nativeReceipt = await requireSuccessfulReceipt(await marketplace.setNativePaymentAllowed(true), 'BNB native payment enablement', confirmationCount);
  const state = await assertState(marketplace, address, plan);
  const identity = await requireRuntimeCode(address, 'CukiesMarketplace');
  const balanceAfter = await hre.ethers.provider.getBalance(signerAddress);
  console.log(JSON.stringify({
    script: 'deploy-uki-marketplace.production.cjs',
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: signerAddress,
    marketplace: {
      address,
      deploymentBlock: deploymentReceipt.blockNumber,
      deploymentTransactionHash: deploymentTransaction.hash,
      runtimeCodeHash: identity.runtimeCodeHash,
    },
    configuration: {
      ...state,
      collection: plan.collection,
      paymentTokens: { asm: plan.asmToken, usdt: plan.usdtToken, usdc: plan.usdcToken },
      nativePath: plan.paths.bnb,
      tokenPaths: { asm: plan.paths.asm, usdt: plan.paths.usdt, usdc: plan.paths.usdc },
      routePreflight: routeResults,
    },
    transactions: {
      collectionAllowlist: { hash: allowlistReceipt.hash, blockNumber: allowlistReceipt.blockNumber },
      asmPaymentAllowlist: { hash: asmReceipt.hash, blockNumber: asmReceipt.blockNumber },
      usdtPaymentAllowlist: { hash: usdtReceipt.hash, blockNumber: usdtReceipt.blockNumber },
      usdcPaymentAllowlist: { hash: usdcReceipt.hash, blockNumber: usdcReceipt.blockNumber },
      nativePaymentEnablement: { hash: nativeReceipt.hash, blockNumber: nativeReceipt.blockNumber },
    },
    gas: {
      deployerBnbBefore: hre.ethers.formatEther(balanceBefore),
      deployerBnbAfter: hre.ethers.formatEther(balanceAfter),
    },
    env: {
      NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS: address,
      CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS: address,
      CHAIN_INDEXER_UKI_MARKETPLACE_START_BSC_BLOCK: String(deploymentReceipt.blockNumber),
      CHAIN_INDEXER_UKI_MARKETPLACE_DEPLOYMENT_BSC_BLOCK: String(deploymentReceipt.blockNumber),
      CHAIN_INDEXER_UKI_MARKETPLACE_DEPLOYMENT_TX_HASH: deploymentTransaction.hash,
      CHAIN_INDEXER_UKI_MARKETPLACE_RUNTIME_CODE_HASH: identity.runtimeCodeHash,
      NEXT_PUBLIC_UKI_MARKETPLACE_ROUTER_ADDRESS: plan.router,
      NEXT_PUBLIC_UKI_MARKETPLACE_WBNB_ADDRESS: plan.wrappedNative,
      NEXT_PUBLIC_UKI_MARKETPLACE_ASM_ADDRESS: plan.asmToken,
      NEXT_PUBLIC_UKI_MARKETPLACE_USDT_ADDRESS: plan.usdtToken,
      NEXT_PUBLIC_UKI_MARKETPLACE_USDC_ADDRESS: plan.usdcToken,
      NEXT_PUBLIC_UKI_MARKETPLACE_BNB_PATH: plan.paths.bnb.join(','),
      NEXT_PUBLIC_UKI_MARKETPLACE_ASM_PATH: plan.paths.asm.join(','),
      NEXT_PUBLIC_UKI_MARKETPLACE_USDT_PATH: plan.paths.usdt.join(','),
      NEXT_PUBLIC_UKI_MARKETPLACE_USDC_PATH: plan.paths.usdc.join(','),
    },
    next: [
      'Configurar estas variables en Coolify producción antes de levantar el indexer.',
      'Verificar el source en BscScan con los seis argumentos del constructor.',
      'Ejecutar el smoke firmado de listing, compra UKI/ASM/USDT/USDC/BNB y cancelación con wallets de prueba aprobadas.',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
