import { NextRequest, NextResponse } from 'next/server';

import { verifyWalletAuth } from '@/lib/auth-utils';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';
import {
  getCukieMasterWalletStatus,
  getCukieMasterNftInventory,
  mutateCukieMasterNft,
  type CukieMasterWalletStatus,
  type CukieMasterNftOperation,
} from '@/lib/uki-economy/cukie-master';
import { UkiEconomyError } from '@/lib/uki-economy/errors';

export const dynamic = 'force-dynamic';

function publicRouteStatus(
  route: CukieMasterWalletStatus['routes']['uki'],
) {
  const position = route.position;
  return {
    position: position ? {
      route: position.route,
      status: position.status,
      desiredSlots: position.desiredSlots,
      allocatedSlots: position.allocatedSlots,
      protectedSlots: position.protectedSlots,
      qualifiedSince: position.qualifiedSince ?? null,
      activeFrom: position.activeFrom ?? null,
      waitlistedAt: position.waitlistedAt ?? null,
      inactiveAt: position.inactiveAt ?? null,
      graceEndsAt: position.graceEndsAt ?? null,
      requirement: position.requirementSnapshot,
      pendingRequirement: position.pendingRequirementSnapshot ?? null,
      ruleVersion: position.ruleVersion,
      roundId: position.roundId,
    } : null,
    slots: route.slots.map((slot) => ({
      route: slot.route,
      ordinal: slot.ordinal,
      eligibilityEpoch: slot.eligibilityEpoch,
      status: slot.status,
      qualifiedSince: slot.qualifiedSince,
      creditEligibleFrom: slot.creditEligibleFrom,
      inactiveAt: slot.inactiveAt ?? null,
      graceEndsAt: slot.graceEndsAt ?? null,
      ruleVersion: slot.ruleVersion,
      roundId: slot.roundId,
    })),
    nextSlotRequirement: route.nextSlotRequirement,
    currentRequirement: route.currentRequirement,
    pendingRequirement: route.pendingRequirement,
    requirementGraceEndsAt: route.requirementGraceEndsAt,
    deficitToNextSlot: route.deficitToNextSlot,
    deficitToPreserveSlots: route.deficitToPreserveSlots,
    countdownEndsAt: route.countdownEndsAt,
    source: {
      complete: route.sourceCompleteness.complete,
      status: route.sourceCompleteness.complete ? 'available' : 'unavailable',
      route: route.source.route,
      ...(route.source.route === 'uki' ? {
        totalUkiRaw: route.source.totalUkiRaw,
        presaleLockedRaw: route.source.presaleLockedRaw,
        stakedUkiRaw: route.source.stakedUkiRaw,
      } : {
        originalCukiePoints: route.source.originalCukiePoints,
      }),
    },
  };
}

export async function GET(request: NextRequest) {
  const walletAddress = request.nextUrl.searchParams.get('walletAddress')?.trim();
  if (!walletAddress || walletAddress.length > 80) {
    return NextResponse.json(
      { status: 'error', code: 'INVALID_WALLET' },
      { status: 400 },
    );
  }

  try {
    await verifyWalletAuth(walletAddress);
  } catch {
    return NextResponse.json(
      { status: 'error', code: 'WALLET_SESSION_REQUIRED' },
      { status: 401 },
    );
  }

  try {
    const [status, nftInventory] = await Promise.all([
      getCukieMasterWalletStatus(walletAddress),
      getCukieMasterNftInventory(walletAddress),
    ]);
    const response = NextResponse.json({
      status: 'ok',
      data: {
        walletAddress: status.walletAddress,
        walletNormalized: status.walletNormalized,
        routes: {
          uki: publicRouteStatus(status.routes.uki),
          nft: publicRouteStatus(status.routes.nft),
        },
        totals: status.totals,
        nftInventory,
        nftCustody: {
          mode: ukiNftVaults.mode.cukieMaster,
          chainId: ukiNftVaults.chainId,
          vaultAddress: ukiNftVaults.cukieMasterNftVaultAddress,
          collectionAddresses: ukiNftVaults.collectionAddresses,
          recoveryCollectionAddresses: ukiNftVaults.recoveryCollectionAddresses,
          explorerBaseUrl: ukiNftVaults.explorerBaseUrl,
          indexer: {
            status: status.routes.nft.sourceCompleteness.complete
              ? 'ready'
              : 'unavailable',
          },
        },
      },
    });
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch (error) {
    if (error instanceof UkiEconomyError && error.code === 'VALIDATION') {
      return NextResponse.json(
        { status: 'error', code: 'INVALID_WALLET' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { status: 'error', code: 'CUKIE_MASTER_UNAVAILABLE' },
      { status: 503 },
    );
  }
}

function parsePostBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('INVALID_BODY');
  }
  const body = value as Record<string, unknown>;
  const allowed = new Set([
    'walletAddress',
    'operation',
    'assetId',
    'lockId',
    'expectedFencingToken',
    'idempotencyKey',
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new Error('INVALID_BODY');
  if (
    typeof body.walletAddress !== 'string'
    || typeof body.assetId !== 'string'
    || typeof body.idempotencyKey !== 'string'
    || (body.operation !== 'soft_stake' && body.operation !== 'unstake')
  ) throw new Error('INVALID_BODY');
  const operation = body.operation as CukieMasterNftOperation;
  return {
    walletAddress: body.walletAddress,
    operation,
    assetId: body.assetId,
    ...(typeof body.lockId === 'string' ? { lockId: body.lockId } : {}),
    ...(typeof body.expectedFencingToken === 'number'
      ? { expectedFencingToken: body.expectedFencingToken }
      : {}),
    idempotencyKey: body.idempotencyKey,
  };
}

export async function POST(request: NextRequest) {
  if (ukiNftVaults.mode.cukieMaster === 'invalid') {
    return NextResponse.json(
      { status: 'error', code: 'CUKIE_MASTER_NFT_VAULT_CONFIG_INVALID' },
      { status: 503 },
    );
  }
  if (ukiNftVaults.mode.cukieMaster === 'custodial') {
    return NextResponse.json(
      { status: 'error', code: 'CUKIE_MASTER_NFT_ONCHAIN_REQUIRED' },
      { status: 410 },
    );
  }

  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > 16_384)) {
      return NextResponse.json({ status: 'error', code: 'INVALID_BODY' }, { status: 400 });
    }
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 16_384) {
      return NextResponse.json({ status: 'error', code: 'INVALID_BODY' }, { status: 400 });
    }
    const command = parsePostBody(JSON.parse(raw));
    try {
      await verifyWalletAuth(command.walletAddress);
    } catch {
      return NextResponse.json(
        { status: 'error', code: 'WALLET_SESSION_REQUIRED' },
        { status: 401 },
      );
    }
    const result = await mutateCukieMasterNft(command);
    const response = NextResponse.json({
      status: 'ok',
      data: {
        operation: result.operation,
        assetId: result.assetId,
        lock: result.lock,
        position: {
          status: result.nftPosition.status,
          desiredSlots: result.nftPosition.desiredSlots,
          allocatedSlots: result.nftPosition.allocatedSlots,
          protectedSlots: result.nftPosition.protectedSlots,
        },
      },
    });
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'INVALID_BODY')) {
      return NextResponse.json({ status: 'error', code: 'INVALID_BODY' }, { status: 400 });
    }
    if (error instanceof UkiEconomyError) {
      const status = error.code === 'VALIDATION'
        ? 400
        : error.code === 'NOT_FOUND'
          ? 404
          : 409;
      return NextResponse.json(
        { status: 'error', code: `CUKIE_MASTER_NFT_${error.code}` },
        { status },
      );
    }
    return NextResponse.json(
      { status: 'error', code: 'CUKIE_MASTER_NFT_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
