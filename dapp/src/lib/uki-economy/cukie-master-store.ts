import {
  buildCukieMasterSnapshot,
  type CukieMasterSnapshotDocument,
  type CukieMasterSnapshotInput,
} from './cukie-master';

/**
 * Read-only compatibility preview. It never persists economy state and must not
 * be used by grants, capacity allocation or authoritative Cukie Master reads.
 */
export function buildCukieMasterPreview(
  input: CukieMasterSnapshotInput,
): CukieMasterSnapshotDocument {
  return buildCukieMasterSnapshot(input);
}
