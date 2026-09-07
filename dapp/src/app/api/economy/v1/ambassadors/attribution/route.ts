import {
  acceptCanonicalAmbassadorInvitation, acceptCanonicalCukiesWorldEnrollment,
  getCanonicalAmbassadorAttribution,
} from '@/lib/uki-economy/ambassadors/service';
import {
  assertAmbassadorAttributionWritesEnabled, assertAmbassadorRuntime,
} from '@/lib/uki-economy/ambassadors/rules';
import { AMBASSADOR_ATTRIBUTION_POLICY } from '@/lib/uki-economy/ambassadors/types';
import {
  ambassadorConfirmationOrigin, clearAmbassadorConfirmation, verifyAmbassadorConfirmation,
} from '@/lib/uki-economy/ambassadors/confirmation';
import {
  ambassadorErrorResponse, ambassadorJson, ambassadorTarget, ambassadorTargetWallet,
  readAmbassadorBody, signedAmbassadorIdentity,
} from '@/lib/uki-economy/ambassadors/http';

export const dynamic = 'force-dynamic';

function responseAttribution(attribution: Awaited<ReturnType<typeof getCanonicalAmbassadorAttribution>>) {
  return attribution ? {
    attributionId: attribution.attributionId,
    referredWalletNormalized: attribution.referredWalletNormalized,
    ambassadorWalletNormalized: attribution.ambassadorWalletNormalized,
    source: attribution.source,
    policyVersion: attribution.policyVersion,
    commissionBps: attribution.commissionBpsSnapshot,
    levels: attribution.levelsSnapshot,
    acceptedAt: attribution.acceptedAt.toISOString(),
    evidenceHash: attribution.evidenceHash,
  } : null;
}


export async function GET() {
  try {
    assertAmbassadorRuntime(process.env);
    const identity = await signedAmbassadorIdentity();
    if (!identity) return ambassadorJson({ status: 'error', code: 'AUTH_REQUIRED' }, 401);
    const attribution = await getCanonicalAmbassadorAttribution(identity.walletAddress);
    return ambassadorJson({ status: 'ok', policy: AMBASSADOR_ATTRIBUTION_POLICY,
      attribution: responseAttribution(attribution) });
  } catch (error) {
    return ambassadorErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const runtime = assertAmbassadorRuntime(process.env);
    assertAmbassadorAttributionWritesEnabled(process.env);
    const identity = await signedAmbassadorIdentity();
    if (!identity) return ambassadorJson({ status: 'error', code: 'AUTH_REQUIRED' }, 401);
    const body = await readAmbassadorBody(request);
    const target = ambassadorTarget(body);
    if (!target) return ambassadorJson({ status: 'error', code: 'INVALID_INVITATION_CODE' }, 400);
    if (typeof body?.signature !== 'string') {
      return ambassadorJson({ status: 'error', code: 'AMBASSADOR_CONFIRMATION_REQUIRED' }, 400);
    }
    const ambassadorWallet = await ambassadorTargetWallet(target);
    if (!ambassadorWallet) return ambassadorJson({ status: 'error', code: 'NOT_FOUND' }, 404);
    const evidence = await verifyAmbassadorConfirmation({
      wallet: identity.walletAddress, sessionEvidenceHash: identity.signedSessionEvidenceHash,
      ambassadorWallet, target, signature: body.signature,
      origin: ambassadorConfirmationOrigin(request), chainId: runtime.chainId,
    });
    if (!evidence) return ambassadorJson({ status: 'error', code: 'INVALID_SIGNATURE' }, 400);
    const input = { referredWallet: identity.walletAddress, signedSessionEvidenceHash: evidence };
    const attribution = 'invitationCode' in target
      ? await acceptCanonicalAmbassadorInvitation({ ...input, invitationCode: target.invitationCode })
      : await acceptCanonicalCukiesWorldEnrollment(input);
    await clearAmbassadorConfirmation();
    return ambassadorJson({ status: 'ok', policy: AMBASSADOR_ATTRIBUTION_POLICY,
      attribution: responseAttribution(attribution) }, 201);
  } catch (error) {
    return ambassadorErrorResponse(error);
  }
}
