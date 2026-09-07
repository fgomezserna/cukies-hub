import { createAmbassadorConfirmation, ambassadorConfirmationOrigin } from '@/lib/uki-economy/ambassadors/confirmation';
import { getCanonicalAmbassadorEnrollment } from '@/lib/uki-economy/ambassadors/service';
import { assertAmbassadorAttributionWritesEnabled, assertAmbassadorRuntime } from '@/lib/uki-economy/ambassadors/rules';
import {
  ambassadorErrorResponse, ambassadorJson, ambassadorTarget, ambassadorTargetWallet,
  readAmbassadorBody, signedAmbassadorIdentity,
} from '@/lib/uki-economy/ambassadors/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const runtime = assertAmbassadorRuntime(process.env);
    assertAmbassadorAttributionWritesEnabled(process.env);
    const identity = await signedAmbassadorIdentity();
    if (!identity) return ambassadorJson({ status: 'error', code: 'AUTH_REQUIRED' }, 401);
    const target = ambassadorTarget(await readAmbassadorBody(request));
    if (!target) return ambassadorJson({ status: 'error', code: 'INVALID_INVITATION_CODE' }, 400);
    const enrollment = await getCanonicalAmbassadorEnrollment(identity.walletAddress);
    if (!enrollment.canChooseSponsor) {
      return ambassadorJson({ status: 'error', code: enrollment.isPresaleParticipant
        ? 'PRESALE_SPONSOR_LOCKED' : 'AMBASSADOR_ALREADY_CONFIRMED' }, 409);
    }
    const ambassadorWallet = await ambassadorTargetWallet(target);
    if (!ambassadorWallet) return ambassadorJson({ status: 'error', code: 'NOT_FOUND' }, 404);
    if (ambassadorWallet === identity.walletAddress) {
      return ambassadorJson({ status: 'error', code: 'AMBASSADOR_CYCLE' }, 409);
    }
    const challenge = await createAmbassadorConfirmation({
      wallet: identity.walletAddress,
      sessionEvidenceHash: identity.signedSessionEvidenceHash,
      ambassadorWallet, target,
      origin: ambassadorConfirmationOrigin(request), chainId: runtime.chainId,
    });
    return ambassadorJson({ status: 'ok', ...challenge });
  } catch (error) {
    return ambassadorErrorResponse(error);
  }
}
