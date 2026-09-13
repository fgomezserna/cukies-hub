import { encodeAbiParameters, isHash, keccak256, type Hash } from 'viem';

import type { BridgeMetadata } from './types.js';

const metadataAbi = [{
  type: 'tuple',
  components: [
    { name: 'typeId', type: 'uint256' },
    { name: 'generation', type: 'uint256' },
    { name: 'skills', type: 'uint256[6]' },
    { name: 'energy', type: 'uint256' },
    { name: 'health', type: 'uint256' },
  ],
}] as const;

export function assertBridgeMetadata(metadata: BridgeMetadata) {
  if (metadata.typeId < 1n || metadata.typeId > 6n) {
    throw new PermanentBridgeError(`typeId invalido: ${metadata.typeId}`);
  }
  if (metadata.generation < 1n || metadata.generation > 2n) {
    throw new PermanentBridgeError(`generation invalida: ${metadata.generation}`);
  }
  for (const value of [...metadata.skills, metadata.energy, metadata.health]) {
    if (value < 0n || value > 255n) {
      throw new PermanentBridgeError(`atributo Cukie fuera de uint8: ${value}`);
    }
  }
}

export function hashBridgeMetadata(metadata: BridgeMetadata): Hash {
  assertBridgeMetadata(metadata);
  return keccak256(encodeAbiParameters(metadataAbi, [{
    typeId: metadata.typeId,
    generation: metadata.generation,
    skills: metadata.skills,
    energy: metadata.energy,
    health: metadata.health,
  }]));
}

export function assertMetadataHash(expected: Hash, metadata: BridgeMetadata) {
  if (!isHash(expected)) throw new PermanentBridgeError('metadataHash no es bytes32.');
  const actual = hashBridgeMetadata(metadata);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new PermanentBridgeError(
      `metadataHash no coincide: esperado ${expected}, calculado ${actual}`,
    );
  }
  return actual;
}

export class PermanentBridgeError extends Error {
  readonly permanent = true;
}
