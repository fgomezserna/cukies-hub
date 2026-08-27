const hre = require('hardhat');

const BSC_TESTNET_CHAIN_ID = 97n;
const REQUIRED_CONFIRMATIONS = 12;
const LP_TRANSFER_INTERFACE = new hre.ethers.Interface([
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to complete the testnet rehearsal.`);
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

function sameAddress(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

async function confirmedBalances(lpToken, lockerAddress, beneficiary, expectedAmount) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [lockedAfter, beneficiaryAfter] = await Promise.all([
      lpToken.balanceOf(lockerAddress),
      lpToken.balanceOf(beneficiary),
    ]);
    if (lockedAfter === 0n && beneficiaryAfter >= expectedAmount) {
      return { lockedAfter, beneficiaryAfter };
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error('Confirmed RPC state did not converge to the release receipt within 30 seconds.');
}

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  if (hre.network.name !== 'bscTestnet' || network.chainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(
      `This rehearsal is BSC Testnet-only. Current network=${hre.network.name}, chainId=${network.chainId}`,
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required.');
  const deployerAddress = address(deployer.address, 'deployer');
  const expectedDeployer = address(requireEnv('DEPLOYER_ADDRESS'), 'DEPLOYER_ADDRESS');
  if (deployerAddress !== expectedDeployer) {
    throw new Error(`DEPLOYER_ADDRESS mismatch: signer is ${deployerAddress}.`);
  }

  const lockerAddress = address(requireEnv('LIQUIDITY_LOCKER_ADDRESS'), 'LIQUIDITY_LOCKER_ADDRESS');
  const runtimeCode = await hre.ethers.provider.getCode(lockerAddress);
  if (runtimeCode === '0x') throw new Error(`No contract exists at ${lockerAddress}.`);

  const locker = await hre.ethers.getContractAt('LiquidityLocker', lockerAddress, deployer);
  const beneficiary = address(await locker.owner(), 'locker.owner');
  if (beneficiary !== deployerAddress) {
    throw new Error(`The rehearsal beneficiary ${beneficiary} is not the configured deployer.`);
  }
  const lpTokenAddress = address(await locker.lpToken(), 'locker.lpToken');
  const lpToken = await hre.ethers.getContractAt(
    ['function balanceOf(address) view returns (uint256)'],
    lpTokenAddress,
    deployer,
  );
  const unlockTime = await locker.unlockTime();
  const latest = await hre.ethers.provider.getBlock('latest');
  if (BigInt(latest.timestamp) < unlockTime) {
    throw new Error(
      `Liquidity remains locked until ${unlockTime} (${new Date(Number(unlockTime) * 1000).toISOString()}); `
      + `latest block timestamp is ${latest.timestamp}.`,
    );
  }

  const lockedBefore = await lpToken.balanceOf(lockerAddress);
  if (lockedBefore === 0n) throw new Error('The LiquidityLocker contains no LP tokens to release.');
  const beneficiaryBefore = await lpToken.balanceOf(beneficiary);
  const transaction = await locker.releaseLiquidity();
  const receipt = await transaction.wait(REQUIRED_CONFIRMATIONS);
  if (!receipt || receipt.status !== 1) throw new Error('Liquidity release transaction failed.');

  const liquidityReleaseLog = receipt.logs
    .filter((log) => sameAddress(log.address, lockerAddress))
    .map((log) => {
      try { return locker.interface.parseLog(log); } catch (_error) { return null; }
    })
    .find((event) => event && event.name === 'LiquidityReleased');
  if (
    !liquidityReleaseLog
    || !sameAddress(liquidityReleaseLog.args.beneficiary, beneficiary)
    || liquidityReleaseLog.args.amount !== lockedBefore
  ) {
    throw new Error('LiquidityReleased receipt evidence does not match the intended beneficiary and amount.');
  }

  const lpTransferLog = receipt.logs
    .filter((log) => sameAddress(log.address, lpTokenAddress))
    .map((log) => {
      try { return LP_TRANSFER_INTERFACE.parseLog(log); } catch (_error) { return null; }
    })
    .find((event) => (
      event
      && event.name === 'Transfer'
      && sameAddress(event.args.from, lockerAddress)
      && sameAddress(event.args.to, beneficiary)
      && event.args.value === lockedBefore
    ));
  if (!lpTransferLog) {
    throw new Error('LP Transfer receipt evidence does not match locker -> beneficiary for the locked amount.');
  }

  const { lockedAfter, beneficiaryAfter } = await confirmedBalances(
    lpToken,
    lockerAddress,
    beneficiary,
    beneficiaryBefore + lockedBefore,
  );
  const releasedRaw = await locker['released(address)'](lpTokenAddress);
  if (lockedAfter !== 0n || beneficiaryAfter - beneficiaryBefore !== lockedBefore) {
    throw new Error('Post-release LP balance invariant failed.');
  }

  console.log(JSON.stringify({
    schema: 'cukies.liquidity-locker-testnet-completion.v1',
    network: hre.network.name,
    chainId: Number(network.chainId),
    locker: lockerAddress,
    lpToken: lpTokenAddress,
    beneficiary,
    unlockTime: unlockTime.toString(),
    unlockTimeIso: new Date(Number(unlockTime) * 1000).toISOString(),
    releaseTxHash: receipt.hash,
    releaseBlock: receipt.blockNumber,
    requiredConfirmations: REQUIRED_CONFIRMATIONS,
    lockedBeforeRaw: lockedBefore.toString(),
    lockedAfterRaw: lockedAfter.toString(),
    beneficiaryBeforeRaw: beneficiaryBefore.toString(),
    beneficiaryAfterRaw: beneficiaryAfter.toString(),
    releasedRaw: releasedRaw.toString(),
    releasedExactlyToBeneficiary: true,
    runtimeCodeHash: hre.ethers.keccak256(runtimeCode),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
