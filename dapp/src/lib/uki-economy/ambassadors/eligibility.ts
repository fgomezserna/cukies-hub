import { createPublicClient, http, isAddress, type Address } from "viem";
import { bsc, bscTestnet } from "viem/chains";

import { vestingVaultAbi, ukiSaleContracts, ukiStakingAbi } from "@/lib/contracts/uki-sale";
import { getCukieMasterWalletStatus } from "../cukie-master/service";
import { stableAmbassadorHash, validAmbassadorWallet } from "./rules";
import type { AmbassadorEligibility } from "./types";

const ONCHAIN_READ_TIMEOUT_MS = 5_000;
const ONCHAIN_READ_BUDGET_MS = 8_000;
const DEFAULT_BSC_RPC_URLS = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed-public.bnbchain.org",
  "https://rpc-bnb.blockmachine.io",
  "https://bsc-dataseed1.binance.org",
] as const;
const DEFAULT_BSC_TESTNET_RPC_URLS = [
  "https://data-seed-prebsc-1-s1.binance.org:8545",
] as const;

type AmbassadorEnvironment = Record<string, string | undefined>;
type OnchainRead = {
  block: {
    number: bigint;
    hash: string;
    timestamp: bigint;
  };
  schedule: unknown;
  staked: unknown;
};
type OnchainFailureKind = "timeout" | "chain_mismatch" | "invalid_response" | "provider";

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

function splitRpcUrls(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => /^https?:\/\//i.test(entry));
}

function rpcUrlsForChain(chainId: number, environment: AmbassadorEnvironment = process.env) {
  const configuredValues = chainId === 56
    ? [
        environment.CHAIN_INDEXER_BSC_RPC_URLS,
        environment.CHAIN_INDEXER_BSC_RPC_URL,
        environment.BSC_RPC_URL,
      ]
    : chainId === 97
      ? [
          environment.CHAIN_INDEXER_BSC_TESTNET_RPC_URLS,
          environment.CHAIN_INDEXER_BSC_TESTNET_RPC_URL,
          environment.BSC_TESTNET_RPC_URL,
        ]
      : [];
  const configured = [...new Set(configuredValues.flatMap(splitRpcUrls))];
  if (configured.length > 0) return configured;
  if (chainId === 56) return [...DEFAULT_BSC_RPC_URLS];
  if (chainId === 97) return [...DEFAULT_BSC_TESTNET_RPC_URLS];
  return [];
}

function failureKind(error: unknown): OnchainFailureKind {
  if (error instanceof Error) {
    if (error.message === "ONCHAIN_READ_TIMEOUT") return "timeout";
    if (error.message === "ONCHAIN_CHAIN_MISMATCH") return "chain_mismatch";
    if (error.message === "ONCHAIN_INVALID_RESPONSE") return "invalid_response";
  }
  return "provider";
}

async function readOnchainAtRpc(
  chain: typeof bsc | typeof bscTestnet,
  rpcUrl: string,
  ukiStakingAddress: string,
  vestingVaultAddress: string,
  walletNormalized: string,
  timeoutMs: number,
) {
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: timeoutMs, retryCount: 0 }),
  });
  return withTimeout((async (): Promise<OnchainRead> => {
    const [networkChainId, blockNumber] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
    ]);
    if (networkChainId !== chain.id) throw new Error("ONCHAIN_CHAIN_MISMATCH");
    const block = await client.getBlock({ blockNumber });
    if (
      block.number !== blockNumber
      || typeof block.hash !== "string"
      || block.hash.length === 0
      || typeof block.timestamp !== "bigint"
    ) {
      throw new Error("ONCHAIN_INVALID_RESPONSE");
    }
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
  })(), timeoutMs);
}

function buildOnchainEligibility(
  onchainRead: OnchainRead,
  walletNormalized: string,
  chainId: number,
  vestingVaultAddress: string,
  ukiStakingAddress: string,
  currentRequirement: UkiRequirement,
  observedAt: Date,
) {
  const { block, schedule, staked } = onchainRead;
  if (!schedule || staked === undefined) return null;
  const scheduleRecord = schedule as {
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
  const totalUkiRaw = locked + staked;
  const isCukieMaster = totalUkiRaw >= BigInt(currentRequirement.ukiRaw);
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
      stakedUkiRaw: staked.toString(),
      ukiRequirementRaw: currentRequirement.ukiRaw,
      blockNumber: block.number.toString(),
      blockHash: block.hash,
      blockTimestamp: block.timestamp.toString(),
      observedAt,
    }),
    observedAt,
  } satisfies AmbassadorEligibility;
}

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
    ? { chain: bsc, rpcUrls: rpcUrlsForChain(chainId) }
    : chainId === 97
      ? { chain: bscTestnet, rpcUrls: rpcUrlsForChain(chainId) }
      : null;
  if (
    !config
    || config.rpcUrls.length === 0
    || !ukiStakingAddress
    || !vestingVaultAddress
    || !isAddress(walletNormalized)
    || !isAddress(ukiStakingAddress)
    || !isAddress(vestingVaultAddress)
  ) return null;
  const failures: OnchainFailureKind[] = [];
  const startedAt = Date.now();
  for (const rpcUrl of config.rpcUrls) {
    const remainingMs = ONCHAIN_READ_BUDGET_MS - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      failures.push("timeout");
      break;
    }
    try {
      const onchainRead = await readOnchainAtRpc(
        config.chain,
        rpcUrl,
        ukiStakingAddress,
        vestingVaultAddress,
        walletNormalized,
        Math.min(ONCHAIN_READ_TIMEOUT_MS, remainingMs),
      );
      const eligibility = buildOnchainEligibility(
        onchainRead,
        walletNormalized,
        chainId,
        vestingVaultAddress,
        ukiStakingAddress,
        currentRequirement,
        observedAt,
      );
      if (eligibility) return eligibility;
      failures.push("invalid_response");
    } catch (error) {
      failures.push(failureKind(error));
    }
  }
  if (failures.length > 0) {
    console.warn("Ambassador eligibility on-chain fallback unavailable", {
      chainId,
      providerCount: config.rpcUrls.length,
      failureKinds: [...new Set(failures)],
    });
  }
  return null;
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
