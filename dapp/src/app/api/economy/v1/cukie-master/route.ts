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
  const previewSlots = (() => {
    if (!route.sourceCompleteness.complete) return null;
    try {
      const available = route.source.route === 'uki'
        ? BigInt(route.source.totalUkiRaw)
        : BigInt(route.source.originalCukiePoints);
      const requirement = route.nextSlotRequirement.route === 'uki'
        ? BigInt(route.nextSlotRequirement.ukiRaw)
        : BigInt(route.nextSlotRequirement.nftPoints);
      if (requirement <= BigInt(0)) return null;
      return Number(available / requirement > BigInt(5) ? BigInt(5) : available / requirement);
    } catch {
      return null;
    }
  })();
  const positionShapeValid = position
    ? previewSlots !== null
      && Number.isSafeInteger(position.desiredSlots)
      && Number.isSafeInteger(position.allocatedSlots)
      && Number.isSafeInteger(position.protectedSlots)
      && position.desiredSlots === previewSlots
      && position.desiredSlots >= 0
      && position.desiredSlots <= 5
      && position.allocatedSlots >= 0
      && position.allocatedSlots <= 5
      && position.protectedSlots >= 0
      && position.protectedSlots <= position.allocatedSlots
      && position.allocatedSlots <= Math.max(position.desiredSlots, position.protectedSlots)
    : previewSlots === 0;
  const positionMatchesSource = position
    ? positionShapeValid
      && position.sourceHash === route.source.sourceHash
      && position.roundId === route.roundId
      && position.ruleVersion === route.ruleVersion
    : positionShapeValid;
  const liveSlots = route.slots.filter((slot) => slot.status !== 'inactive');
  const liveOrdinals = new Set(liveSlots.map((slot) => slot.ordinal));
  const slotsMatchSource = liveSlots.length === (position?.allocatedSlots ?? 0)
    && liveOrdinals.size === liveSlots.length
    && liveSlots.every((slot) => (
      slot.ordinal >= 1
      && slot.ordinal <= (position?.allocatedSlots ?? 0)
      && slot.sourceHash === route.source.sourceHash
      && slot.roundId === route.roundId
      && slot.ruleVersion === route.ruleVersion
    ));
  const projectionFresh = route.sourceCompleteness.complete
    && positionMatchesSource
    && slotsMatchSource;
  const synchronizing = route.sourceCompleteness.complete && !projectionFresh;
  const publicPosition = projectionFresh ? position : null;
  const publicSlots = projectionFresh ? liveSlots : [];
  return {
    position: publicPosition ? {
      route: publicPosition.route,
      status: publicPosition.status,
      desiredSlots: publicPosition.desiredSlots,
      allocatedSlots: publicPosition.allocatedSlots,
      protectedSlots: publicPosition.protectedSlots,
      qualifiedSince: publicPosition.qualifiedSince ?? null,
      activeFrom: publicPosition.activeFrom ?? null,
      waitlistedAt: publicPosition.waitlistedAt ?? null,
      inactiveAt: publicPosition.inactiveAt ?? null,
      graceEndsAt: publicPosition.graceEndsAt ?? null,
      requirement: publicPosition.requirementSnapshot,
      pendingRequirement: publicPosition.pendingRequirementSnapshot ?? null,
      ruleVersion: publicPosition.ruleVersion,
      roundId: publicPosition.roundId,
    } : null,
    slots: publicSlots.map((slot) => ({
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
    deficitToPreserveSlots: projectionFresh ? route.deficitToPreserveSlots : null,
    countdownEndsAt: projectionFresh ? route.countdownEndsAt : null,
    projectionFresh,
    synchronizing,
    previewSlots,
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
    const publicRoutes = {
      uki: publicRouteStatus(status.routes.uki),
      nft: publicRouteStatus(status.routes.nft),
    };
    const response = NextResponse.json({
      status: 'ok',
      data: {
        walletAddress: status.walletAddress,
        walletNormalized: status.walletNormalized,
        routes: publicRoutes,
        totals: {
          desiredSlots: (publicRoutes.uki.position?.desiredSlots ?? 0)
            + (publicRoutes.nft.position?.desiredSlots ?? 0),
          allocatedSlots: (publicRoutes.uki.position?.allocatedSlots ?? 0)
            + (publicRoutes.nft.position?.allocatedSlots ?? 0),
          maxPotentialSlots: 10,
        },
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
