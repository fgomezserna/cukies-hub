import type { RuntimeScope } from '../types.js';

/**
 * Legacy and default workers can observe the same chain transaction while
 * materialising it through different projector contracts. Keep their durable
 * event and cursor identities separate without changing historical default
 * keys already stored in Mongo.
 */
export function runtimeScopedStorageId(runtimeScope: RuntimeScope | undefined, id: string) {
  return runtimeScope === 'legacy' ? `legacy:${id}` : id;
}
