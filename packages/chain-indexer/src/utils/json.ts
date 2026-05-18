import { TronWeb } from 'tronweb';

import type { ChainName, JsonRecord, JsonValue } from '../types.js';

const tronAddressFields = new Set([
  'address',
  'from',
  'to',
  'owner',
  'newOwner',
  'originOwner',
  'destOwner',
  'user',
]);

export function toJsonValue(value: unknown): JsonValue {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(objectValue)
        .filter(([key]) => !/^\d+$/.test(key))
        .map(([key, item]) => [key, toJsonValue(item)]),
    );
  }

  return String(value);
}

export function toJsonRecord(value: unknown): JsonRecord {
  const json = toJsonValue(value);
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    return json;
  }

  return {};
}

export function normalizeAddress(chain: ChainName, value: unknown) {
  if (typeof value !== 'string' || value.length === 0) return null;

  if (chain === 'BSC') return value.toLowerCase();

  return value.toUpperCase();
}

export function normalizeTronArg(key: string, value: unknown) {
  if (typeof value !== 'string') return value;
  if (!tronAddressFields.has(key)) return value;

  if (/^41[0-9a-fA-F]{40}$/.test(value)) {
    try {
      return TronWeb.address.fromHex(value);
    } catch {
      return value;
    }
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
    try {
      return TronWeb.address.fromHex(`41${value.slice(2)}`);
    } catch {
      return value;
    }
  }

  return value;
}

export function normalizeTronArgs(args: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(args)
      .filter(([key]) => !/^\d+$/.test(key))
      .map(([key, value]) => [key, normalizeTronArg(key, value)]),
  );
}

export function getString(value: unknown) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  return null;
}

export function getNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function tokenIdFromArgs(args: Record<string, unknown>, key = 'tokenId') {
  return getString(args[key]);
}

export function now() {
  return new Date();
}
