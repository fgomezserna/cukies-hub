import { createPublicClient, http, keccak256, type Hex } from 'viem';
import { bsc } from 'viem/chains';
import { TronWeb } from 'tronweb';

import type { LegacyIndexerConfig } from '../config/legacy-env.js';
import {
  LEGACY_BSC_CONTRACT_ALIASES,
  LEGACY_CONTRACTS,
  LEGACY_TRON_CONTRACT_ALIASES,
  legacyContractProof,
} from './contracts.js';
import type { LegacyIndexerStore } from './storage/mongo.js';

type TronContractInfo = Record<string, unknown>;

function errorText(error: unknown) {
  return error instanceof Error ? error.message.replace(/https?:\/\/[^\s)]+/gi, '[endpoint]') : 'error desconocido';
}

function cleanHex(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^0x/i, '');
  return normalized.length > 0 && /^[0-9a-f]+$/i.test(normalized) && normalized.length % 2 === 0
    ? `0x${normalized}` as Hex
    : null;
}

async function verifyBsc(config: LegacyIndexerConfig) {
  const client = createPublicClient({ chain: bsc, transport: http(config.bscRpcUrls[0]) });
  const chainId = await client.getChainId();
  if (chainId !== 56) throw new Error(`RPC BSC devolvió chainId ${chainId}; se exige 56.`);
  const observedAtBlock = await client.getBlockNumber();
  const checkedAt = new Date();
  return Promise.all(LEGACY_BSC_CONTRACT_ALIASES.map(async (alias) => {
    const expected = legacyContractProof('BSC', alias);
    const address = LEGACY_CONTRACTS.BSC[alias] as `0x${string}`;
    const bytecode = await client.getBytecode({ address, blockNumber: observedAtBlock });
    if (!bytecode) throw new Error(`BSC ${alias} no tiene bytecode en el RPC.`);
    const observedRuntimeHash = keccak256(bytecode);
    if (observedRuntimeHash.toLowerCase() !== expected.runtimeHash.toLowerCase()) {
      throw new Error(`BSC ${alias} runtime hash no coincide con la evidencia fijada.`);
    }
    return {
      _id: `BSC:56:${alias}`,
      chain: 'BSC', chainId, alias, address, network: 'mainnet',
      expectedRuntimeHash: expected.runtimeHash,
      observedRuntimeHash,
      observedAtBlock: Number(observedAtBlock),
      observedAt: checkedAt,
      proofSource: expected.evidence,
      verification: 'live-rpc-runtime-keccak256',
    };
  }));
}

async function verifyTronContract(config: LegacyIndexerConfig, alias: keyof typeof LEGACY_CONTRACTS.TRON) {
  if (config.tronApiBaseUrl !== 'https://api.trongrid.io/v1') {
    throw new Error('TRON legacy exige https://api.trongrid.io/v1 para eventos.');
  }
  const address = LEGACY_CONTRACTS.TRON[alias];
  let payload: TronContractInfo | undefined;
  const proofUrl = new URL('/wallet/getcontractinfo', config.tronApiBaseUrl).toString();
  const retryBaseDelayMs = config.tronApiKey ? Math.max(config.tronRequestDelayMs, 250) : 2_000;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(proofUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(config.tronApiKey ? { 'TRON-PRO-API-KEY': config.tronApiKey } : {}),
      },
      body: JSON.stringify({ value: address, visible: true }),
    });
    if (response.ok) {
      payload = await response.json() as TronContractInfo;
      break;
    }
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`TRON ${alias} getcontractinfo HTTP ${response.status}.`);
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryBaseDelayMs * (2 ** attempt), 8_000)));
    }
  }
  if (!payload) throw new Error(`TRON ${alias} getcontractinfo no respondió tras reintentos.`);
  const smartContract = payload.smart_contract;
  if (!smartContract || typeof smartContract !== 'object') {
    throw new Error(`TRON ${alias} no devolvió smart_contract verificable.`);
  }
  const smartContractRecord = smartContract as Record<string, unknown>;
  const returnedAddressRaw = smartContractRecord.contract_address;
  if (typeof returnedAddressRaw !== 'string') {
    throw new Error(`TRON ${alias} no devolvió contract_address verificable.`);
  }
  let returnedAddress = returnedAddressRaw;
  try {
    if (/^(?:41|0x41)[0-9a-f]{40}$/i.test(returnedAddressRaw)) {
      returnedAddress = TronWeb.address.fromHex(returnedAddressRaw.replace(/^0x/i, ''));
    }
  } catch {
    throw new Error(`TRON ${alias} devolvió una address hexadecimal inválida.`);
  }
  if (returnedAddress !== address) {
    throw new Error(`TRON ${alias} respondió una address distinta.`);
  }
  const runtimecode = cleanHex(payload.runtimecode);
  const reportedHashRaw = smartContractRecord.code_hash;
  const reportedHash = typeof reportedHashRaw === 'string'
    ? reportedHashRaw.toLowerCase().replace(/^0x/, '')
    : null;
  if (!runtimecode || !reportedHash) throw new Error(`TRON ${alias} no devolvió runtimecode y code_hash.`);
  const observedRuntimeHash = keccak256(runtimecode).replace(/^0x/, '').toLowerCase();
  const expected = legacyContractProof('TRON', alias);
  if (reportedHash !== expected.runtimeHash.toLowerCase() || observedRuntimeHash !== expected.runtimeHash.toLowerCase()) {
    throw new Error(`TRON ${alias} runtime hash no coincide con la evidencia fijada.`);
  }
  return {
    _id: `TRON:mainnet:${alias}`,
    chain: 'TRON', network: 'mainnet', alias, address,
    expectedRuntimeHash: expected.runtimeHash,
    reportedRuntimeHash: reportedHash,
    observedRuntimeHash,
    observedAt: new Date(),
    proofSource: expected.evidence,
    verification: 'trongrid-runtimecode-keccak256',
  };
}

async function verifyTron(config: LegacyIndexerConfig) {
  const proofs = [];
  for (const [index, alias] of LEGACY_TRON_CONTRACT_ALIASES.entries()) {
    proofs.push(await verifyTronContract(config, alias));
    if (index < LEGACY_TRON_CONTRACT_ALIASES.length - 1) {
      const delayMs = config.tronApiKey ? config.tronRequestDelayMs : 2_000;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  return proofs;
}

export async function verifyLegacySources(config: LegacyIndexerConfig, store: LegacyIndexerStore) {
  if (config.bscExpectedChainId !== 56) throw new Error('Runtime legacy BSC debe usar chainId 56.');
  if (config.tronApiBaseUrl !== 'https://api.trongrid.io/v1') {
    throw new Error('Runtime legacy TRON debe usar https://api.trongrid.io/v1 para eventos.');
  }
  try {
    const [bsc, tron] = await Promise.all([verifyBsc(config), verifyTron(config)]);
    const proofs = [...bsc, ...tron];
    const collection = store.db.collection<any>('legacy_source_proofs');
    await Promise.all(proofs.map((proof) => collection.updateOne(
      { _id: proof._id },
      { $set: { ...proof, runtimeScope: 'legacy', updatedAt: new Date() } },
      { upsert: true },
    )));
    store.legacySourcesVerified = true;
    return proofs;
  } catch (error) {
    store.legacySourcesVerified = false;
    throw new Error(`Verificación live legacy bloqueada: ${errorText(error)}`);
  }
}
