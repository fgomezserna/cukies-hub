import type { CukiDocument } from './types.js';

export type ResolvedCukiMetadata = {
  type: number;
  generation: number;
};

export type CukiMetadataResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; value: ResolvedCukiMetadata };

type MetadataResolution =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; value: number };

function resolveValue(value: unknown, minimum: number, maximum: number): MetadataResolution {
  if (value === undefined) return { status: 'missing' };
  const numberValue = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof numberValue !== 'number' || !Number.isInteger(numberValue) || numberValue < minimum || numberValue > maximum) {
    return { status: 'invalid' };
  }
  return { status: 'valid', value: numberValue };
}

function resolvePreferred(primary: unknown, fallback: unknown, minimum: number, maximum: number) {
  const primaryResult = resolveValue(primary, minimum, maximum);
  if (primaryResult.status !== 'missing') return primaryResult;
  return resolveValue(fallback, minimum, maximum);
}

export function resolveCukiMetadata(cuki: CukiDocument): CukiMetadataResult {
  const type = resolvePreferred(cuki.type, cuki.rarity, 1, 6);
  const generation = resolvePreferred(cuki.skills?.generation, cuki.generation, 1, 2);
  if (type.status === 'invalid' || generation.status === 'invalid') return { status: 'invalid' };
  if (type.status === 'missing' || generation.status === 'missing') return { status: 'missing' };
  return { status: 'valid', value: { type: type.value, generation: generation.value } };
}
