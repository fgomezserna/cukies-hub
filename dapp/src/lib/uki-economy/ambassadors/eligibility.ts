import { createPublicClient, http, isAddress, type Address } from "viem";
import { bsc, bscTestnet } from "viem/chains";

import { vestingVaultAbi, ukiSaleContracts, ukiStakingAbi } from "@/lib/contracts/uki-sale";
import { getCukieMasterWalletStatus } from "../cukie-master/service";
import { stableAmbassadorHash, validAmbassadorWallet } from "./rules";
import type { AmbassadorEligibility } from "./types";

const ONCHAIN_READ_TIMEOUT_MS = 5_000;

function validObservedAt(value: Date) {
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? new Date(value.getTime())
    : new Date();
}

function requirementMet(route: Awaited<ReturnType<typeof getCukieMasterWalletStatus>>["routes"]["uki" | "nft"]) {
  if (!route.source.completeness.complete) return null;
  try {
    if (route.source.route === "uki" && route.currentRequirement.route === "uki") {
      return BigInt(route.source.totalUkiRaw) >= BigInt(route.currentRequirement.ukiRaw);
    }
    if (route.source.route === "nft" && route.currentRequirement.route === "nft") {
      return route.source.originalCukiePoints >= route.currentRequirement.nftPoints;
    }
  } catch {
    return null;
  }
  return null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("ONCHAIN_READ_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

type UkiRequirement = { route: "uki"; ukiRaw: string };

function nftRouteIsApplicable(environment: Record<string, string | undefined> = process.env) {
  // This is the canonical runtime switch for the Cukie Master pipeline. An
  // absent or malformed value is indeterminate and therefore keeps NFT in
  // the composition; only an explicit false disables that route.
  return environment.CHAIN_INDEXER_CUKIE_MASTER_ENABLED?.trim().toLowerCase() !== "false";
}

async function readOnchainUkiEligibility(
  walletNormalized: string,
  observedAt: Date,
  currentRequirement: UkiRequirement,
) {
  let requiredUkiRaw: bigint;
  try {
    requiredUkiRaw = BigInt(currentRequirement.ukiRaw);
  } catch {
    return null;
  }
  if (requiredUkiRaw <= BigInt(0)) return null;

  const chainId = ukiSaleContracts.chainId;
  const ukiStakingAddress = ukiSaleContracts.ukiStakingAddress?.trim()
    || process.env.CHAIN_INDEXER_UKI_STAKING_ADDRESS?.trim();
  const vestingVaultAddress = ukiSaleContracts.vestingVaultAddress?.trim()
    || process.env.CHAIN_INDEXER_VESTING_VAULT_ADDRESS?.trim();
  const config = chainId === 56
    ? { chain: bsc, rpcUrl: (process.env.CHAIN_INDEXER_BSC_RPC_URL || process.env.BSC_RPC_URL)?.trim() }
    : chainId === 97
      ? { chain: bscTestnet, rpcUrl: (process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URL || process.env.BSC_TESTNET_RPC_URL)?.trim() }
      : null;
  if (
    !config?.rpcUrl
    || !ukiStakingAddress
    || !vestingVaultAddress
    || !isAddress(walletNormalized)
    || !isAddress(ukiStakingAddress)
    || !isAddress(vestingVaultAddress)
  ) return null;
  const client = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl, { timeout: ONCHAIN_READ_TIMEOUT_MS }),
  });
  const onchainRead = await withTimeout((async () => {
    const [networkChainId, blockNumber] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
    ]);
    if (networkChainId !== config.chain.id) return null;
    const block = await client.getBlock({ blockNumber });
    if (
      block.number !== blockNumber
      || typeof block.hash !== "string"
      || block.hash.length === 0
      || typeof block.timestamp !== "bigint"
    ) return null;
    const [schedule, staked] = await Promise.all([
      client.readContract({
        address: vestingVaultAddress as Address,
        abi: vestingVaultAbi,
        functionName: "scheduleOf",
        args: [walletNormalized as Address],
        blockNumber,
      }),
      client.readContract({
        address: ukiStakingAddress as Address,
        abi: ukiStakingAbi,
        functionName: "stakedBalance",
        args: [walletNormalized as Address],
        blockNumber,
      }),
    ]);
    return { block, schedule, staked };
  })(), ONCHAIN_READ_TIMEOUT_MS).catch(() => null);
  if (!onchainRead) return null;
  const { block, schedule, staked } = onchainRead;
  if (!schedule || staked === undefined) return null;
  const scheduleRecord = schedule as unknown as {
    totalAmount?: bigint;
    releasedAmount?: bigint;
  } | readonly [bigint, bigint];
  const totalAmount = Array.isArray(scheduleRecord)
    ? scheduleRecord[0]
    : (scheduleRecord as { totalAmount?: unknown }).totalAmount;
  const releasedAmount = Array.isArray(scheduleRecord)
    ? scheduleRecord[1]
    : (scheduleRecord as { releasedAmount?: unknown }).releasedAmount;
  if (typeof totalAmount !== "bigint" || typeof releasedAmount !== "bigint" || typeof staked !== "bigint") {
    return null;
  }
  if (releasedAmount > totalAmount) return null;
  const locked = totalAmount - releasedAmount;
  const totalUkiRaw = locked + (staked as bigint);
  const isCukieMaster = totalUkiRaw >= requiredUkiRaw;
  return {
    isCukieMaster,
    reason: isCukieMaster ? null : "CUKIE_MASTER_REQUIREMENT_NOT_MET",
    sourceHash: stableAmbassadorHash({
      kind: "ambassador-cukie-master-onchain-eligibility-v1",
      walletNormalized,
      chainId,
      vestingVaultAddress,
      ukiStakingAddress,
      lockedUkiRaw: locked.toString(),
      stakedUkiRaw: (staked as bigint).toString(),
      ukiRequirementRaw: currentRequirement.ukiRaw,
      blockNumber: block.number.toString(),
      blockHash: block.hash,
      blockTimestamp: block.timestamp.toString(),
      observedAt,
    }),
    observedAt,
  } satisfies AmbassadorEligibility;
}

/**
 * Lee el estado material de Cukie Master. La elegibilidad no depende de
 * allocatedSlots: una posicion/slot es una consecuencia operativa de la
 * capacidad, mientras que el rol se decide por la fuente canonica de cada
 * ruta y su requisito versionado.
 */
export async function getAmbassadorEligibility(
  wallet: string,
  now = new Date(),
): Promise<AmbassadorEligibility> {
  const observedAt = validObservedAt(now);
  const walletNormalized = validAmbassadorWallet(wallet);
  try {
    const status = await getCukieMasterWalletStatus(walletNormalized, observedAt);
    let uki = requirementMet(status.routes.uki);
    const nft = nftRouteIsApplicable()
      ? requirementMet(status.routes.nft)
      : false;
    let onchainEligibility: AmbassadorEligibility | null = null;
    if (uki === null && status.routes.uki.currentRequirement.route === "uki") {
      try {
        onchainEligibility = await readOnchainUkiEligibility(
          walletNormalized,
          observedAt,
          status.routes.uki.currentRequirement,
        );
        if (onchainEligibility) uki = onchainEligibility.isCukieMaster;
      } catch {
        // La fuente on-chain solo sustituye una proyeccion incompleta cuando
        // puede leerse y verificarse completamente; los errores siguen siendo
        // unknown y nunca se convierten en saldo cero.
      }
    }
    const values = [uki, nft];
    if (values.includes(true)) {
      if (onchainEligibility?.isCukieMaster === true) return onchainEligibility;
      return {
        isCukieMaster: true,
        reason: null,
        sourceHash: stableAmbassadorHash({
          kind: "ambassador-cukie-master-eligibility-v1",
          walletNormalized,
          observedAt,
          ukiSourceHash: status.routes.uki.source.sourceHash,
          nftSourceHash: status.routes.nft.source.sourceHash,
          ukiRequirement: status.routes.uki.currentRequirement,
          nftRequirement: status.routes.nft.currentRequirement,
        }),
        observedAt,
      };
    }
    if (values.includes(null)) {
      return {
        isCukieMaster: null,
        reason: "CUKIE_MASTER_SOURCE_UNKNOWN",
        sourceHash: null,
        observedAt,
      };
    }
    if (onchainEligibility?.isCukieMaster === false) return onchainEligibility;
    return {
      isCukieMaster: false,
      reason: "CUKIE_MASTER_REQUIREMENT_NOT_MET",
      sourceHash: stableAmbassadorHash({
        kind: "ambassador-cukie-master-eligibility-v1",
        walletNormalized,
        observedAt,
        ukiSourceHash: status.routes.uki.source.sourceHash,
        nftSourceHash: status.routes.nft.source.sourceHash,
        ukiRequirement: status.routes.uki.currentRequirement,
        nftRequirement: status.routes.nft.currentRequirement,
      }),
      observedAt,
    };
  } catch {
    return {
      isCukieMaster: null,
      reason: "CUKIE_MASTER_SOURCE_UNKNOWN",
      sourceHash: null,
      observedAt,
    };
  }
}
