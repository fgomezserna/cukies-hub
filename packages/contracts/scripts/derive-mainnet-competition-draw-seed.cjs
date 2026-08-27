const hre = require('hardhat');

const {
  BSC_MAINNET_CHAIN_ID,
  findFirstBlockAfterTimestamp,
} = require('./lib/mainnet-uki-launch.cjs');

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to derive the competition draw seed.`);
  return value;
}

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  if (hre.network.name !== 'bsc' || network.chainId !== BSC_MAINNET_CHAIN_ID) {
    throw new Error(
      `This seed derivation is BSC Mainnet-only. Current network=${hre.network.name}, chainId=${network.chainId}.`,
    );
  }
  const endsAt = requireEnv('TREASURE_HUNT_COMPETITION_ENDS_AT');
  const cutoffMs = Date.parse(endsAt);
  if (!Number.isFinite(cutoffMs) || cutoffMs <= 0 || cutoffMs % 1_000 !== 0) {
    throw new Error('TREASURE_HUNT_COMPETITION_ENDS_AT must be a valid whole-second ISO timestamp.');
  }
  const confirmations = process.env.DRAW_SEED_CONFIRMATIONS?.trim()
    ? Number(process.env.DRAW_SEED_CONFIRMATIONS.trim())
    : 12;
  if (!Number.isSafeInteger(confirmations) || confirmations < 12 || confirmations > 100) {
    throw new Error('DRAW_SEED_CONFIRMATIONS must be an integer between 12 and 100.');
  }
  const latest = await hre.ethers.provider.getBlockNumber();
  if (latest + 1 < confirmations) throw new Error('Chain height is below the confirmation requirement.');
  const safeBlockNumber = BigInt(latest - confirmations + 1);
  const source = await findFirstBlockAfterTimestamp({
    safeBlockNumber,
    cutoffTimestamp: BigInt(cutoffMs / 1_000),
    getBlock: (blockNumber) => hre.ethers.provider.getBlock(Number(blockNumber)),
  });

  console.log(JSON.stringify({
    schema: 'cukies.treasure-hunt-mainnet-draw-seed.v1',
    policy: 'first-bsc-mainnet-block-strictly-after-competition-end-v1',
    chainId: Number(network.chainId),
    competitionEndsAt: new Date(cutoffMs).toISOString(),
    confirmations,
    safeHeadBlock: Number(safeBlockNumber),
    drawSourceBlock: Number(source.blockNumber),
    drawSourceBlockHash: source.blockHash,
    drawSourceBlockTimestamp: source.blockTimestamp.toString(),
    drawSourceBlockTimestampIso: new Date(Number(source.blockTimestamp) * 1_000).toISOString(),
    environment: {
      TREASURE_HUNT_COMPETITION_DRAW_SEED: source.blockHash,
      TREASURE_HUNT_COMPETITION_DRAW_SOURCE_BLOCK: source.blockNumber.toString(),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
