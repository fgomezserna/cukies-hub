import { DomainConflictError } from "../errors";
import {
  createMongoAmbassadorAttributionRepository,
  findMongoAmbassadorByInvitationCode,
  getOrCreateMongoAmbassadorProfile,
} from "./repository";
import {
  assertAmbassadorAttribution,
  buildAmbassadorAttribution,
  validAmbassadorWallet,
} from "./rules";
import type {
  AmbassadorAttribution,
  AmbassadorAttributionRepository,
  LockedPresaleAmbassador,
} from "./types";

const MAX_AMBASSADOR_CHAIN_DEPTH = 1_024;

function assertSameSponsor(
  current: AmbassadorAttribution,
  ambassadorWalletNormalized: string,
  reason: string
) {
  assertAmbassadorAttribution(current);
  if (current.ambassadorWalletNormalized !== ambassadorWalletNormalized) {
    throw new DomainConflictError(reason, {
      referredWalletNormalized: current.referredWalletNormalized,
      currentAmbassadorWalletNormalized: current.ambassadorWalletNormalized,
    });
  }
  return current;
}

async function persistCandidate(
  repository: AmbassadorAttributionRepository,
  candidate: AmbassadorAttribution,
  conflictMessage: string
) {
  const result = await repository.insertAttribution(candidate);
  if (result === "inserted") return candidate;
  const replay = await repository.findAttribution(
    candidate.referredWalletNormalized
  );
  if (!replay) {
    throw new DomainConflictError(
      "La atribucion ambassador cambio durante su persistencia."
    );
  }
  return assertSameSponsor(
    replay,
    candidate.ambassadorWalletNormalized,
    conflictMessage
  );
}

function fromLockedPresale(locked: LockedPresaleAmbassador, now: Date) {
  return buildAmbassadorAttribution({
    referredWallet: locked.referredWalletNormalized,
    ambassadorWallet: locked.ambassadorWalletNormalized,
    source: "presale_locked",
    sourceReferenceHash: locked.sourceReferenceHash,
    acceptedAt: locked.lockedAt,
    now,
  });
}

async function assertAttributionDoesNotCreateCycle(
  repository: AmbassadorAttributionRepository,
  referredWalletNormalized: string,
  ambassadorWalletNormalized: string,
  now: Date
) {
  const visited = new Set<string>();
  let currentWallet = ambassadorWalletNormalized;

  for (let depth = 0; depth < MAX_AMBASSADOR_CHAIN_DEPTH; depth += 1) {
    if (currentWallet === referredWalletNormalized) {
      throw new DomainConflictError(
        "La atribucion crearia una referencia circular entre embajadores."
      );
    }
    if (visited.has(currentWallet)) {
      throw new DomainConflictError(
        "La cadena del embajador ya contiene una referencia circular y no puede ampliarse."
      );
    }
    visited.add(currentWallet);

    const currentAttribution = await resolveAmbassadorAttribution(
      repository,
      currentWallet,
      now
    );
    if (!currentAttribution) return;
    currentWallet = currentAttribution.ambassadorWalletNormalized;
  }

  throw new DomainConflictError(
    "La cadena del embajador supera el limite seguro de validacion."
  );
}

export async function resolveAmbassadorAttribution(
  repository: AmbassadorAttributionRepository,
  referredWallet: string,
  now = new Date()
) {
  const referredWalletNormalized = validAmbassadorWallet(
    referredWallet,
    "referredWallet"
  );
  const locked = await repository.findLockedPresaleAmbassador(
    referredWalletNormalized
  );
  const current = await repository.findAttribution(referredWalletNormalized);
  if (!locked) return current ? assertAmbassadorAttribution(current) : null;

  const candidate = fromLockedPresale(locked, now);
  if (current) {
    return assertSameSponsor(
      current,
      candidate.ambassadorWalletNormalized,
      "La atribucion existente contradice el sponsor bloqueado de preventa."
    );
  }
  return persistCandidate(
    repository,
    candidate,
    "La atribucion concurrente contradice el sponsor bloqueado de preventa."
  );
}

export async function acceptDirectAmbassadorAttribution(
  repository: AmbassadorAttributionRepository,
  input: {
    referredWallet: string;
    ambassadorWallet: string;
    signedSessionEvidenceHash: string;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const referredWalletNormalized = validAmbassadorWallet(
    input.referredWallet,
    "referredWallet"
  );
  const ambassadorWalletNormalized = validAmbassadorWallet(
    input.ambassadorWallet,
    "ambassadorWallet"
  );
  await repository.acquireGraphWriteFence(now);
  const canonical = await resolveAmbassadorAttribution(
    repository,
    referredWalletNormalized,
    now
  );
  if (canonical) {
    return assertSameSponsor(
      canonical,
      ambassadorWalletNormalized,
      canonical.source === "presale_locked"
        ? "El sponsor bloqueado de preventa tiene precedencia y no puede cambiarse."
        : "La wallet ya tiene un embajador distinto y la atribucion es inmutable."
    );
  }
  const candidate = buildAmbassadorAttribution({
    referredWallet: referredWalletNormalized,
    ambassadorWallet: ambassadorWalletNormalized,
    source: "signed_wallet_session",
    sourceReferenceHash: input.signedSessionEvidenceHash,
    acceptedAt: now,
    now,
  });
  await assertAttributionDoesNotCreateCycle(
    repository,
    referredWalletNormalized,
    ambassadorWalletNormalized,
    now
  );
  return persistCandidate(
    repository,
    candidate,
    "Otra atribucion ambassador fue fijada de forma concurrente."
  );
}

export async function getCanonicalAmbassadorAttribution(
  referredWallet: string,
  now = new Date()
) {
  const { getEconomyDb } = await import("@/lib/indexer-db/mongodb");
  const db = await getEconomyDb();
  return resolveAmbassadorAttribution(
    createMongoAmbassadorAttributionRepository(db),
    referredWallet,
    now
  );
}

export async function acceptCanonicalAmbassadorAttribution(input: {
  referredWallet: string;
  ambassadorWallet: string;
  signedSessionEvidenceHash: string;
  now?: Date;
}) {
  const { withEconomyTransaction } = await import("@/lib/indexer-db/mongodb");
  return withEconomyTransaction((db, session) =>
    acceptDirectAmbassadorAttribution(
      createMongoAmbassadorAttributionRepository(db, session),
      input
    )
  );
}

export async function acceptCanonicalAmbassadorInvitation(input: {
  referredWallet: string;
  invitationCode: string;
  signedSessionEvidenceHash: string;
  now?: Date;
}) {
  const { withEconomyTransaction } = await import("@/lib/indexer-db/mongodb");
  return withEconomyTransaction(async (db, session) => {
    const profile = await findMongoAmbassadorByInvitationCode(
      db,
      input.invitationCode,
      session
    );
    if (!profile) {
      const { DomainNotFoundError } = await import("../errors");
      throw new DomainNotFoundError("El codigo de invitacion no existe.");
    }
    return acceptDirectAmbassadorAttribution(
      createMongoAmbassadorAttributionRepository(db, session),
      {
        referredWallet: input.referredWallet,
        ambassadorWallet: profile.walletNormalized,
        signedSessionEvidenceHash: input.signedSessionEvidenceHash,
        now: input.now,
      }
    );
  });
}

export async function getCanonicalAmbassadorProfile(
  wallet: string,
  now = new Date()
) {
  const { getEconomyDb } = await import("@/lib/indexer-db/mongodb");
  return getOrCreateMongoAmbassadorProfile(await getEconomyDb(), wallet, now);
}
