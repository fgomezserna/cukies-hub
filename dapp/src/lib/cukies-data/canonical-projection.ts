import type { Filter } from 'mongodb';

export const LEGACY_CUKIE_METADATA_SOURCE = 'legacy.cukies';
export const LEGACY_CUKIE_CANONICAL_PROJECTION = 'canonical';

type ProjectionDocument = {
  metadataSource?: unknown;
  legacyProjectionKind?: unknown;
};

/**
 * Historical metadata snapshots use `_id=tokenId`. They remain in the unified
 * collection as a recoverable source, but must never be exposed beside the
 * chain-scoped projection. Non-legacy/V2 rows are unaffected.
 */
export function buildCanonicalCukieReadFilter<TDocument extends ProjectionDocument>() {
  return {
    $nor: [
      {
        metadataSource: LEGACY_CUKIE_METADATA_SOURCE,
        legacyProjectionKind: { $ne: LEGACY_CUKIE_CANONICAL_PROJECTION },
      },
    ],
  } as Filter<TDocument>;
}

export function isCanonicalCukieReadDocument(document: ProjectionDocument) {
  return document.metadataSource !== LEGACY_CUKIE_METADATA_SOURCE
    || document.legacyProjectionKind === LEGACY_CUKIE_CANONICAL_PROJECTION;
}
