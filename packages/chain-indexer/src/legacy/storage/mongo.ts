import type { IndexDescription } from 'mongodb';

import { IndexerStore } from '../../storage/mongo.js';
import type { LegacyIndexerConfig } from '../../config/legacy-env.js';
import {
  LEGACY_CONTRACT_ALIASES,
  legacyContractAddress,
  legacyContractProof,
  type LegacyContractAlias,
} from '../contracts.js';
import type { ChainEvent, ChainName, ContractEventConfig, ChainCursor } from '../../types.js';

type LegacySourceProofDocument = {
  _id: string;
  runtimeScope?: string;
  chain?: ChainName;
  chainId?: number;
  network?: string;
  alias?: string;
  address?: string;
  expectedRuntimeHash?: string;
  observedRuntimeHash?: string;
  observedAt?: unknown;
  observedAtBlock?: number;
  proofSource?: string;
  verification?: string;
};

const LIVE_PROOF_VERIFICATIONS = new Set([
  'live-rpc-runtime-keccak256',
  'trongrid-runtimecode-keccak256',
]);

function proofId(chain: ChainName, alias: LegacyContractAlias) {
  return `${chain}:${chain === 'BSC' ? '56' : 'mainnet'}:${alias}`;
}

function sameAddress(chain: ChainName, left: unknown, right: string) {
  return typeof left === 'string'
    && (chain === 'BSC' ? left.toLowerCase() === right.toLowerCase() : left === right);
}

function assertLegacyDescriptor(input: {
  chain: ChainName;
  alias: string;
  address: string;
  chainId?: number;
}) {
  if (!LEGACY_CONTRACT_ALIASES.includes(input.alias as LegacyContractAlias)) {
    throw new Error(`${input.alias} no pertenece al manifiesto legacy canónico.`);
  }
  const alias = input.alias as LegacyContractAlias;
  const canonicalAddress = legacyContractAddress(input.chain, alias);
  if (!canonicalAddress) {
    throw new Error(`${alias} no tiene address legacy canónica para ${input.chain}.`);
  }
  if (!sameAddress(input.chain, input.address, canonicalAddress)) {
    throw new Error(`${alias} legacy no coincide con la address canónica de ${input.chain}.`);
  }
  if (input.chain === 'BSC' && input.chainId !== 56) {
    throw new Error(`${alias} legacy BSC exige chainId 56.`);
  }
  if (input.chain === 'TRON' && input.chainId !== undefined) {
    throw new Error(`${alias} legacy TRON no admite un chainId BSC.`);
  }
  return { alias, canonicalAddress };
}

function assertLiveProof(
  input: { chain: ChainName; alias: LegacyContractAlias; canonicalAddress: string },
  proof: LegacySourceProofDocument | undefined,
) {
  const expected = legacyContractProof(input.chain, input.alias);
  if (
    !proof
    || proof.runtimeScope !== 'legacy'
    || proof.chain !== input.chain
    || proof.alias !== input.alias
    || proof.network !== 'mainnet'
    || !sameAddress(input.chain, proof.address, input.canonicalAddress)
    || typeof proof.expectedRuntimeHash !== 'string'
    || proof.expectedRuntimeHash.toLowerCase() !== expected.runtimeHash.toLowerCase()
    || typeof proof.observedRuntimeHash !== 'string'
    || proof.observedRuntimeHash.toLowerCase() !== expected.runtimeHash.toLowerCase()
    || !(proof.observedAt instanceof Date)
    || !LIVE_PROOF_VERIFICATIONS.has(proof.verification ?? '')
    || proof.proofSource !== expected.evidence
  ) {
    throw new Error(`${input.alias} legacy no tiene prueba RPC viva y canónica persistida.`);
  }
  if (input.chain === 'BSC') {
    const observedAtBlock = proof.observedAtBlock;
    if (proof.chainId !== 56 || typeof observedAtBlock !== 'number' || !Number.isSafeInteger(observedAtBlock) || observedAtBlock < 0) {
      throw new Error(`${input.alias} BSC legacy no tiene bloque de prueba observado válido.`);
    }
  } else if (proof.chainId !== undefined && proof.chainId !== null) {
    throw new Error(`${input.alias} TRON legacy no tiene red mainnet canónica.`);
  }
}

/**
 * Store del worker legacy. Reutiliza la conexión y el motor de eventos del
 * indexer, pero crea únicamente índices de la base legacy dedicada.
 */
export class LegacyIndexerStore extends IndexerStore {
  constructor(config: LegacyIndexerConfig) {
    super(config);
  }

  override async ensureIndexes() {
    const indexes: Array<{ collection: string; index: IndexDescription['key']; options?: IndexDescription['name'] extends never ? never : Record<string, unknown> }> = [
      { collection: 'chain_events', index: { chain: 1, contractAlias: 1, contractAddress: 1, eventName: 1, blockNumber: 1 } },
      { collection: 'chain_events', index: { status: 1, timestampMs: 1, blockNumber: 1, logIndex: 1 } },
      { collection: 'chain_events', index: { txHash: 1 } },
      { collection: 'chain_events', index: { runtimeScope: 1, chain: 1, contractAddress: 1, eventName: 1 } },
      { collection: 'chain_cursors', index: { chain: 1, contractAlias: 1, eventName: 1 }, options: { unique: true } },
      { collection: 'tx_nfts', index: { eventId: 1 }, options: { unique: true, sparse: true } },
      { collection: 'tx_nfts', index: { chain: 1, collectionAddressNormalized: 1, tokenId: 1, timestampMs: -1 } },
      { collection: 'point_transactions', index: { eventId: 1 }, options: { unique: true, sparse: true } },
      { collection: 'point_transactions', index: { chain: 1, pointsContractAddressNormalized: 1, walletNormalized: 1, timestampMs: -1 } },
      { collection: 'point_balances', index: { chain: 1, pointsContractAddressNormalized: 1, walletNormalized: 1 }, options: { unique: true } },
      { collection: 'marketplace_listings', index: { chain: 1, collectionAddressNormalized: 1, tokenId: 1 }, options: { unique: true, name: 'legacy_listing_identity' } },
      { collection: 'marketplace_listings', index: { status: 1, chain: 1, updatedAt: -1 } },
      { collection: 'cukies', index: { chain: 1, collectionAddressNormalized: 1, tokenId: 1 }, options: { unique: true, name: 'legacy_nft_identity' } },
      { collection: 'cukies', index: { chain: 1, ownerNormalized: 1, updatedAt: -1 } },
      { collection: 'bridge_transfers', index: { eventId: 1 }, options: { unique: true } },
      { collection: 'chain_dead_letters', index: { eventId: 1 }, options: { unique: true } },
      { collection: 'chain_indexer_runs', index: { startedAt: -1 } },
      { collection: 'legacy_source_proofs', index: { chain: 1, alias: 1 }, options: { unique: true } },
    ];
    await Promise.all(indexes.map(({ collection, index, options }) => (
      this.db.collection(collection).createIndex(index, options)
    )));
  }

  private async assertEventsCanBeWritten(events: ChainEvent[]) {
    if (this.runtimeScope !== 'legacy') {
      throw new Error('LegacyIndexerStore exige runtimeScope legacy.');
    }
    if (!this.legacySourcesVerified) {
      throw new Error('Fuentes legacy sin verificación live en el store.');
    }
    const descriptors = events.map((event) => {
      if (event.runtimeScope !== 'legacy') {
        throw new Error(`Evento ${event._id} sin runtimeScope legacy; escritura rechazada.`);
      }
      return assertLegacyDescriptor({
        chain: event.chain,
        alias: event.contractAlias,
        address: event.contractAddress,
        chainId: event.chainId,
      });
    });
    const ids = [...new Set(events.map((event) => proofId(event.chain, event.contractAlias as LegacyContractAlias)))];
    const proofs = await this.db.collection<LegacySourceProofDocument>('legacy_source_proofs')
      .find({ _id: { $in: ids }, runtimeScope: 'legacy' })
      .toArray();
    const proofById = new Map(proofs.map((proof) => [
      `${proof.chain}:${proof.chain === 'BSC' ? '56' : 'mainnet'}:${proof.alias}`,
      proof,
    ]));
    for (const [index, event] of events.entries()) {
      const descriptor = descriptors[index];
      assertLiveProof(
        {
          chain: event.chain,
          alias: descriptor.alias,
          canonicalAddress: descriptor.canonicalAddress,
        },
        proofById.get(proofId(event.chain, descriptor.alias)),
      );
    }
  }

  override async upsertEvents(events: ChainEvent[]) {
    if (events.length === 0) return { inserted: 0 };
    await this.assertEventsCanBeWritten(events);
    return super.upsertEvents(events);
  }

  override async updateCursor(config: ContractEventConfig, update: Partial<ChainCursor>) {
    if (this.runtimeScope !== 'legacy') {
      throw new Error('LegacyIndexerStore exige runtimeScope legacy.');
    }
    if (!this.legacySourcesVerified) {
      throw new Error('Fuentes legacy sin verificación live en el store.');
    }
    const descriptor = assertLegacyDescriptor({
      chain: config.chain,
      alias: config.contractAlias,
      address: config.contractAddress,
      chainId: config.chain === 'BSC' ? 56 : undefined,
    });
    const proof = await this.db.collection<LegacySourceProofDocument>('legacy_source_proofs')
      .findOne({ _id: proofId(config.chain, descriptor.alias), runtimeScope: 'legacy' });
    assertLiveProof({
      chain: config.chain,
      alias: descriptor.alias,
      canonicalAddress: descriptor.canonicalAddress,
    }, proof ?? undefined);
    await super.updateCursor(config, { ...update, runtimeScope: 'legacy' } as Partial<ChainCursor>);
  }

  override async listUnresolvedCompetitionCreditCutoffs() {
    return [];
  }

  override async reconcileVerifiedUkiStakingBootstrap() {
    return undefined;
  }
}
