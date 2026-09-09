import { existsSync } from 'node:fs';

export const DEFAULT_DAPP_DRAIN_MARKER_PATH = '/tmp/cukies-dapp-draining';
export const DAPP_DRAIN_MARKER_ENV = 'CUKIES_DAPP_DRAIN_MARKER_PATH';

/**
 * The marker is private container state set by the PID1 wrapper. It is not a
 * public API or a customer-facing configuration value.
 */
export function dappDrainMarkerPath(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment[DAPP_DRAIN_MARKER_ENV]?.trim();
  return configured || DEFAULT_DAPP_DRAIN_MARKER_PATH;
}

export function isDappDraining(environment: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return existsSync(dappDrainMarkerPath(environment));
  } catch {
    // A readiness check must fail closed if the marker cannot be inspected.
    return true;
  }
}
