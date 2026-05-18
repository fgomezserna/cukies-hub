import { ObjectId } from 'mongodb';

import { cukiesDb } from './mongodb-cukies';
import { getHubCollection } from './mongodb-hub';
import { normalizeWalletAddress } from './wallet-address';
import type { WalletAuthType } from './wallet-auth';

type WalletChain = 'BSC' | 'TRON' | 'SAAKURU' | 'EVM' | 'UNKNOWN';

type HubWalletInput = {
  userId: string;
  address: string;
  chain?: string | null;
  walletType?: WalletAuthType;
  legacyWalletId?: string | null;
  legacyUserId?: string | null;
  isPrimary?: boolean;
  authenticated?: boolean;
};

function toUserObjectId(userId: string) {
  return ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
}

function objectIdString(value: unknown) {
  if (!value) return null;
  return String(value);
}

function inferWalletChain(
  address: string,
  chain?: string | null,
  walletType?: WalletAuthType,
): WalletChain {
  const normalizedChain = String(chain || '').toUpperCase();

  if (normalizedChain.includes('TRON') || walletType === 'tron') {
    return 'TRON';
  }

  if (normalizedChain.includes('SAAKURU')) {
    return 'SAAKURU';
  }

  if (normalizedChain.includes('BSC') || normalizedChain.includes('BINANCE')) {
    return 'BSC';
  }

  if (walletType === 'evm' || normalizeWalletAddress(address).startsWith('0x')) {
    return 'EVM';
  }

  return 'UNKNOWN';
}

function legacyWalletRefs(cukiesUser: any): string[] {
  if (!Array.isArray(cukiesUser?.wallets)) {
    return [];
  }

  return cukiesUser.wallets.map((walletRef: unknown) => String(walletRef)).filter(Boolean);
}

export async function findHubUserIdByLegacyWallets(params: {
  legacyUserId?: string | null;
  walletAddresses?: string[];
}) {
  const filters: Record<string, unknown>[] = [];

  if (params.legacyUserId) {
    filters.push({ legacyUserId: params.legacyUserId });
  }

  const normalizedAddresses = (params.walletAddresses || [])
    .filter((address): address is string => typeof address === 'string' && address.length > 0)
    .map((address) => normalizeWalletAddress(address));

  if (normalizedAddresses.length > 0) {
    filters.push({ normalizedAddress: { $in: normalizedAddresses } });
  }

  if (filters.length === 0) {
    return null;
  }

  const userWallets = await getHubCollection('UserWallet');
  const wallet = await userWallets.findOne({ $or: filters });

  return wallet?.userId ? String(wallet.userId) : null;
}

export async function upsertHubWallet(input: HubWalletInput) {
  const userWallets = await getHubCollection('UserWallet');
  const normalizedAddress = normalizeWalletAddress(input.address);
  const now = new Date();
  const setData: Record<string, unknown> = {
    userId: toUserObjectId(input.userId),
    address: input.address,
    normalizedAddress,
    chain: inferWalletChain(input.address, input.chain, input.walletType),
    isPrimary: Boolean(input.isPrimary),
    updatedAt: now,
    ...(input.authenticated ? { lastAuthenticatedAt: now } : {}),
  };

  if (input.legacyWalletId !== undefined) {
    setData.legacyWalletId = input.legacyWalletId || null;
  }

  if (input.legacyUserId !== undefined) {
    setData.legacyUserId = input.legacyUserId || null;
  }

  await userWallets.updateOne(
    { normalizedAddress },
    {
      $set: setData,
      $setOnInsert: {
        _id: new ObjectId(),
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

export async function ensureHubWalletForLogin(
  userId: string,
  walletAddress: string,
  walletType: WalletAuthType,
) {
  await upsertHubWallet({
    userId,
    address: walletAddress,
    walletType,
    isPrimary: true,
    authenticated: true,
  });
}

export async function syncHubWalletsFromLegacyUser(
  userId: string,
  cukiesUser: any,
  currentWalletAddress: string,
) {
  const legacyUserId = objectIdString(cukiesUser?._id);
  const refs = legacyWalletRefs(cukiesUser);
  const objectIds = refs
    .filter((walletId) => ObjectId.isValid(walletId))
    .map((walletId) => new ObjectId(walletId));
  const legacyWalletsCollection = await cukiesDb.wallets();
  const legacyWallets =
    objectIds.length > 0
      ? await legacyWalletsCollection.find({ _id: { $in: objectIds } }).toArray()
      : [];
  const seenAddresses = new Set<string>();

  for (const wallet of legacyWallets) {
    if (!wallet?.address || typeof wallet.address !== 'string') {
      continue;
    }

    seenAddresses.add(normalizeWalletAddress(wallet.address));
    await upsertHubWallet({
      userId,
      address: wallet.address,
      chain: typeof wallet.chain === 'string' ? wallet.chain : null,
      legacyWalletId: objectIdString(wallet._id),
      legacyUserId,
      isPrimary: normalizeWalletAddress(wallet.address) === normalizeWalletAddress(currentWalletAddress),
    });
  }

  if (!seenAddresses.has(normalizeWalletAddress(currentWalletAddress))) {
    await upsertHubWallet({
      userId,
      address: currentWalletAddress,
      legacyUserId,
      isPrimary: true,
    });
  }
}
