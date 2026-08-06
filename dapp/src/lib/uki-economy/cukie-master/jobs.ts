import 'server-only';

import { DomainConflictError, DomainValidationError } from '../errors';
import type { CukieMasterRoute } from '../rules';
import { createReadonlyMongoCukieMasterRepository, type CukieMasterRepository } from './repository';
import {
  activateMaturedPosition,
  type ActivateMaturedPositionResult,
  finalizeRequirementGrace,
  recalculateCukieMasterWallet,
} from './service';
import type { CukieMasterRecalculationResult, CukieMasterRouteRound } from './types';

export type CloseRequirementGraceCursor = {
  phase: 'allocated' | 'waitlisted';
  id?: string;
  waitlistedAt?: Date;
};

export type CloseRequirementGraceBatchResult = {
  route: CukieMasterRoute;
  jobRunId: string;
  phase: CloseRequirementGraceCursor['phase'];
  scanned: number;
  recalculated: number;
  done: boolean;
  nextCursor: CloseRequirementGraceCursor | null;
  finalizedRound: CukieMasterRouteRound | null;
};

export type CukieMasterGraceJobDependencies = {
  getRepository: () => Promise<CukieMasterRepository>;
  recalculate: (
    walletAddress: string,
    now: Date,
    idempotencyKey: string,
  ) => Promise<CukieMasterRecalculationResult>;
  finalize: (
    route: CukieMasterRoute,
    now: Date,
    jobRunId: string,
  ) => Promise<CukieMasterRouteRound>;
};

export type ActivateMaturedCursor = {
  afterId?: string;
};

export type ActivateMaturedBatchResult = {
  jobRunId: string;
  scanned: number;
  activated: number;
  done: boolean;
  nextCursor: ActivateMaturedCursor | null;
};

export type CukieMasterActivationJobDependencies = {
  getRepository: () => Promise<CukieMasterRepository>;
  activate: (
    slotId: string,
    now: Date,
    idempotencyKey: string,
  ) => Promise<ActivateMaturedPositionResult>;
};

function validLimit(limit = 100) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new DomainValidationError('limit debe ser un entero entre 1 y 500.');
  }
  return limit;
}

export function createCukieMasterGraceJobs(dependencies: CukieMasterGraceJobDependencies) {
  const jobs = {
    async closeRequirementGraceBatch(
      route: CukieMasterRoute,
      now: Date,
      jobRunId: string,
      cursor: CloseRequirementGraceCursor = { phase: 'allocated' },
      limit = 100,
    ): Promise<CloseRequirementGraceBatchResult> {
      const pageSize = validLimit(limit);
      const repository = await dependencies.getRepository();
      const round = await repository.findActiveRound(route);
      if (!round) throw new DomainConflictError(`No existe ronda activa para ${route}.`);
      if (round.pendingRequirement && round.graceEndsAt && now.getTime() < round.graceEndsAt.getTime()) {
        throw new DomainConflictError(`La gracia de ${route} todavia no ha terminado.`);
      }

      if (!round.pendingRequirement) {
        const finalizedRound = await dependencies.finalize(route, now, jobRunId);
        return {
          route,
          jobRunId,
          phase: cursor.phase,
          scanned: 0,
          recalculated: 0,
          done: true,
          nextCursor: null,
          finalizedRound,
        };
      }

      const allocatedOnly = cursor.phase === 'allocated';
      const positions = await repository.listRoutePositions({
        route,
        allocatedOnly,
        ...(cursor.id && (allocatedOnly || cursor.waitlistedAt) ? {
          after: {
            id: cursor.id,
            waitlistedAt: cursor.waitlistedAt ?? new Date(0),
          },
        } : {}),
        limit: pageSize,
      });

      for (const position of positions) {
        await dependencies.recalculate(
          position.walletAddress,
          now,
          `grace-close:${jobRunId}:${route}:${cursor.phase}:${position.walletNormalized}`,
        );
      }

      if (positions.length === pageSize) {
        const last = positions[positions.length - 1];
        return {
          route,
          jobRunId,
          phase: cursor.phase,
          scanned: positions.length,
          recalculated: positions.length,
          done: false,
          nextCursor: {
            phase: cursor.phase,
            id: last._id,
            ...(cursor.phase === 'waitlisted' && last.waitlistedAt
              ? { waitlistedAt: last.waitlistedAt }
              : {}),
          },
          finalizedRound: null,
        };
      }

      if (cursor.phase === 'allocated') {
        return {
          route,
          jobRunId,
          phase: cursor.phase,
          scanned: positions.length,
          recalculated: positions.length,
          done: false,
          nextCursor: { phase: 'waitlisted' },
          finalizedRound: null,
        };
      }

      const finalizedRound = await dependencies.finalize(route, now, jobRunId);
      return {
        route,
        jobRunId,
        phase: cursor.phase,
        scanned: positions.length,
        recalculated: positions.length,
        done: true,
        nextCursor: null,
        finalizedRound,
      };
    },

    async closeRequirementGrace(
      route: CukieMasterRoute,
      now: Date,
      jobRunId: string,
      limit = 100,
    ) {
      let cursor: CloseRequirementGraceCursor = { phase: 'allocated' };
      let scanned = 0;
      let recalculated = 0;

      while (true) {
        const batch = await jobs.closeRequirementGraceBatch(
          route,
          now,
          jobRunId,
          cursor,
          limit,
        );
        scanned += batch.scanned;
        recalculated += batch.recalculated;
        if (batch.done) return { ...batch, scanned, recalculated };
        cursor = batch.nextCursor ?? { phase: 'waitlisted' };
      }
    },
  };

  return jobs;
}

export type PromoteWaitlistCursor = {
  waitlistedAt: Date;
  id: string;
};

export function createCukieMasterWaitlistJobs(dependencies: {
  getRepository: () => Promise<CukieMasterRepository>;
  recalculate: CukieMasterGraceJobDependencies['recalculate'];
}) {
  return {
    async promoteCukieMasterWaitlist(
      route: CukieMasterRoute,
      now: Date,
      jobRunId: string,
      cursor?: PromoteWaitlistCursor,
      limit = 100,
    ) {
      const pageSize = validLimit(limit);
      const repository = await dependencies.getRepository();
      const candidates = await repository.listRoutePositions({
        route,
        allocatedOnly: false,
        ...(cursor ? { after: cursor } : {}),
        limit: pageSize,
      });
      let promoted = 0;
      let slotsAllocated = 0;
      let scanned = 0;
      let capacityBlocked = false;
      for (const candidate of candidates) {
        scanned += 1;
        const allocatedBefore = candidate.allocatedSlots;
        const result = await dependencies.recalculate(
          candidate.walletAddress,
          now,
          `waitlist-promote:${jobRunId}:${route}:${candidate._id}`,
        );
        const updated = result.positions[route];
        if (updated.allocatedSlots > allocatedBefore) {
          promoted += 1;
          slotsAllocated += updated.allocatedSlots - allocatedBefore;
        }
        if (updated.desiredSlots > updated.allocatedSlots) {
          capacityBlocked = true;
          break;
        }
      }
      const processed = candidates.slice(0, scanned);
      const last = processed[processed.length - 1];
      return {
        route,
        scanned,
        promoted,
        slotsAllocated,
        done: capacityBlocked || candidates.length < pageSize,
        nextCursor: capacityBlocked || candidates.length < pageSize || !last || !last.waitlistedAt
          ? null
          : { waitlistedAt: last.waitlistedAt, id: last._id },
      };
    },
  };
}

export function createCukieMasterActivationJobs(
  dependencies: CukieMasterActivationJobDependencies,
) {
  return {
    async activateMaturedCukieMasterPositions(
      now: Date,
      jobRunId: string,
      cursor: ActivateMaturedCursor = {},
      limit = 100,
    ): Promise<ActivateMaturedBatchResult> {
      const pageSize = validLimit(limit);
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        throw new DomainValidationError('now debe ser una fecha valida.');
      }
      if (typeof jobRunId !== 'string' || jobRunId.trim().length === 0) {
        throw new DomainValidationError('jobRunId no puede estar vacio.');
      }
      const repository = await dependencies.getRepository();
      const slots = await repository.listMaturedQualifyingSlots({
        now,
        afterId: cursor.afterId,
        limit: pageSize,
      });
      let activated = 0;
      for (const slot of slots) {
        const result = await dependencies.activate(
          slot._id,
          now,
          jobRunId.trim(),
        );
        if (result.activated) activated += 1;
      }
      const last = slots[slots.length - 1];
      const done = slots.length < pageSize;
      return {
        jobRunId: jobRunId.trim(),
        scanned: slots.length,
        activated,
        done,
        nextCursor: done || !last ? null : { afterId: last._id },
      };
    },
  };
}

const defaultJobs = createCukieMasterGraceJobs({
  getRepository: createReadonlyMongoCukieMasterRepository,
  recalculate: recalculateCukieMasterWallet,
  finalize: finalizeRequirementGrace,
});
const defaultActivationJobs = createCukieMasterActivationJobs({
  getRepository: createReadonlyMongoCukieMasterRepository,
  activate: activateMaturedPosition,
});
const defaultWaitlistJobs = createCukieMasterWaitlistJobs({
  getRepository: createReadonlyMongoCukieMasterRepository,
  recalculate: recalculateCukieMasterWallet,
});

export const closeRequirementGraceBatch = defaultJobs.closeRequirementGraceBatch;
export const closeRequirementGrace = defaultJobs.closeRequirementGrace;
export const activateMaturedCukieMasterPositions = (
  defaultActivationJobs.activateMaturedCukieMasterPositions
);
export const promoteCukieMasterWaitlist = defaultWaitlistJobs.promoteCukieMasterWaitlist;
