const hre = require('hardhat');
const {
  BSC_MAINNET_CHAIN_ID,
  buildUkiMarketplaceMainnetConfigPlan,
  normalizeAddress,
} = require('./lib/uki-marketplace-mainnet-plan.cjs');

const ROUTER_READ_ABI = [
  'function WETH() view returns (address)',
  'function getAmountsOut(uint256 amountIn,address[] memory path) view returns (uint256[] memory amounts)',
];
const ERC20_READ_ABI = ['function decimals() view returns (uint8)'];

function confirmations() {
  const value = Number(process.env.UKI_MARKETPLACE_CONFIRMATIONS?.trim() || '12');
  if (!Number.isSafeInteger(value) || value < 12 || value > 100) throw new Error('UKI_MARKETPLACE_CONFIRMATIONS debe ser un entero entre 12 y 100.');
  return value;
}

async function code(address, label) {
  const runtime = await hre.ethers.provider.getCode(address);
  if (runtime === '0x') throw new Error(`${label} no tiene bytecode en ${address}.`);
  return runtime;
}

async function routePreflight(plan) {
  const router = new hre.ethers.Contract(plan.router, ROUTER_READ_ABI, hre.ethers.provider);
  const observedWeth = normalizeAddress(await router.WETH(), 'router.WETH');
  if (observedWeth !== plan.wrappedNative) throw new Error('Router WETH mismatch.');
  const rows = [
    ['BNB', plan.wrappedNative, plan.paths.bnb],
    ['ASM', plan.asmToken, plan.paths.asm],
    ['USDT', plan.usdtToken, plan.paths.usdt],
    ['USDC', plan.usdcToken, plan.paths.usdc],
  ];
  const result = [];
  for (const [label, token, path] of rows) {
    const decimals = Number(await new hre.ethers.Contract(token, ERC20_READ_ABI, hre.ethers.provider).decimals());
    const input = 10n ** BigInt(decimals);
    const amounts = await router.getAmountsOut(input, path);
    if (amounts.length !== path.length || amounts.at(-1) <= 0n) throw new Error(`La ruta ${label} no devuelve UKI.`);
    result.push({ label, path, inputRaw: input.toString(), outputRaw: amounts.at(-1).toString() });
  }
  return result;
}

async function tx(transaction, label, confirmationCount) {
  console.error(JSON.stringify({ checkpoint: 'transaction_broadcast', label, transactionHash: transaction.hash }));
  const receipt = await transaction.wait(confirmationCount);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} falló.`);
  console.error(JSON.stringify({ checkpoint: 'transaction_confirmed', label, transactionHash: transaction.hash, blockNumber: receipt.blockNumber }));
  return receipt;
}

async function main() {
  if (hre.network.name !== 'bsc' || hre.network.config.chainId !== BSC_MAINNET_CHAIN_ID) throw new Error('Este script solo admite BSC Mainnet.');
  const network = await hre.ethers.provider.getNetwork();
  if (Number(network.chainId) !== BSC_MAINNET_CHAIN_ID) throw new Error(`El RPC observa chainId=${network.chainId}.`);
  const plan = buildUkiMarketplaceMainnetConfigPlan(process.env);
  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error('DEPLOYER_PRIVATE_KEY es obligatorio.');
  const signerAddress = normalizeAddress(signer.address, 'deployer signer');
  if (signerAddress !== plan.owner) throw new Error(`Solo el owner ${plan.owner} puede configurar; la key resuelve a ${signerAddress}.`);
  await Promise.all([
    code(plan.marketplace, 'CukiesMarketplace'),
    code(plan.ukiToken, 'UKI'),
    code(plan.router, 'Pancake router'),
    code(plan.wrappedNative, 'WBNB'),
    code(plan.collection, 'Cukies collection'),
  ]);
  const routes = await routePreflight(plan);
  const marketplace = await hre.ethers.getContractAt('CukiesMarketplace', plan.marketplace, signer);
  const existingOwner = normalizeAddress(await marketplace.owner(), 'marketplace.owner');
  if (existingOwner !== signerAddress) throw new Error(`Marketplace owner observado ${existingOwner}, esperado ${signerAddress}.`);
  const confirmationCount = confirmations();
  const receipts = {};
  if (!(await marketplace.collectionAllowed(plan.collection))) {
    receipts.collection = await tx(await marketplace.setCollectionAllowed(plan.collection, true), 'collection allowlist', confirmationCount);
  }
  for (const [key, token] of [['asm', plan.asmToken], ['usdt', plan.usdtToken], ['usdc', plan.usdcToken]]) {
    if (!(await marketplace.paymentTokenAllowed(token))) {
      receipts[key] = await tx(await marketplace.setPaymentTokenAllowed(token, true), `${key} payment allowlist`, confirmationCount);
    }
  }
  if (!(await marketplace.nativePaymentAllowed())) {
    receipts.native = await tx(await marketplace.setNativePaymentAllowed(true), 'BNB native payment enablement', confirmationCount);
  }
  const state = {
    owner: normalizeAddress(await marketplace.owner(), 'marketplace.owner'),
    collectionAllowed: await marketplace.collectionAllowed(plan.collection),
    asmAllowed: await marketplace.paymentTokenAllowed(plan.asmToken),
    usdtAllowed: await marketplace.paymentTokenAllowed(plan.usdtToken),
    usdcAllowed: await marketplace.paymentTokenAllowed(plan.usdcToken),
    nativePaymentAllowed: await marketplace.nativePaymentAllowed(),
    paused: await marketplace.paused(),
  };
  if (!state.collectionAllowed || !state.asmAllowed || !state.usdtAllowed || !state.usdcAllowed || !state.nativePaymentAllowed || state.paused) throw new Error('La configuración final no quedó activa.');
  console.log(JSON.stringify({ script: 'configure-uki-marketplace.production.cjs', network: hre.network.name, chainId: Number(network.chainId), marketplace: plan.marketplace, state, routes, transactions: Object.fromEntries(Object.entries(receipts).map(([key, receipt]) => [key, { hash: receipt.hash, blockNumber: receipt.blockNumber }])), next: ['Configurar las variables env emitidas en Coolify producción.', 'Esperar al indexer y verificar el cursor UKI_MARKETPLACE antes del smoke de UI.'] }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
