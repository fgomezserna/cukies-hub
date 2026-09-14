import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const DEFAULT_DAPP_DRAIN_MARKER_PATH = '/tmp/cukies-dapp-draining';
export const DAPP_DRAIN_MARKER_ENV = 'CUKIES_DAPP_DRAIN_MARKER_PATH';

// Docker provider propagation and Traefik active health are intentionally
// bounded defaults. The provider must add active health labels to the new
// service; this wrapper only makes the retiring container fail readiness after
// that propagation window and does not modify proxy configuration.
export const DEFAULT_DRAIN_TIMINGS_MS = Object.freeze({
  providerPropagation: 5_000,
  proxyRetirement: 5_000,
  forceKill: 25_000,
});

function markerPath(environment = process.env) {
  return environment[DAPP_DRAIN_MARKER_ENV]?.trim() || DEFAULT_DAPP_DRAIN_MARKER_PATH;
}

function removeMarker(path, filesystem = { existsSync, unlinkSync }) {
  try {
    if (filesystem.existsSync(path)) filesystem.unlinkSync(path);
  } catch (error) {
    console.error(`[dapp-drain] no se pudo limpiar ${path}: ${error.message}`);
  }
}

function createMarker(path, filesystem = { mkdirSync, writeFileSync }) {
  try {
    filesystem.mkdirSync(dirname(path), { recursive: true });
    filesystem.writeFileSync(path, `${Date.now()}\n`, { flag: 'w', mode: 0o600 });
    return true;
  } catch (error) {
    console.error(`[dapp-drain] no se pudo crear ${path}: ${error.message}`);
    return false;
  }
}

function signalExitCode(signal) {
  const signalNumber = { SIGINT: 2, SIGTERM: 15 }[signal];
  return signalNumber ? 128 + signalNumber : 1;
}

function validateTimings(timings) {
  const values = ['providerPropagation', 'proxyRetirement', 'forceKill'];
  for (const key of values) {
    if (!Number.isFinite(timings[key]) || timings[key] < 0 || timings[key] > 29_000) {
      throw new RangeError(`timing ${key} fuera de límites`);
    }
  }
  if (timings.forceKill >= 30_000) throw new RangeError('forceKill debe ser menor que 30 segundos');
  if (timings.providerPropagation + timings.proxyRetirement >= timings.forceKill) {
    throw new RangeError('providerPropagation + proxyRetirement debe ser menor que forceKill');
  }
  return timings;
}

/**
 * Starts the standalone Next server as a child while this process remains
 * PID1. `timers`, `spawnProcess`, and `onExit` are injectable for deterministic
 * sequence tests; production uses the defaults above and real Node timers.
 */
export function createDappServerController({
  serverPath,
  serverArgs = [],
  environment = process.env,
  spawnProcess = spawn,
  filesystem = { existsSync, unlinkSync, mkdirSync, writeFileSync },
  timers = { setTimeout, clearTimeout },
  timings = DEFAULT_DRAIN_TIMINGS_MS,
  onExit = (code) => process.exit(code),
  logger = console,
} = {}) {
  if (!serverPath) throw new Error('serverPath es obligatorio');
  const boundedTimings = validateTimings({ ...DEFAULT_DRAIN_TIMINGS_MS, ...timings });
  const drainMarkerPath = markerPath(environment);
  environment[DAPP_DRAIN_MARKER_ENV] = drainMarkerPath;
  removeMarker(drainMarkerPath, filesystem);
  // Fail before starting Next if this container cannot maintain its private
  // readiness marker. A candidate with an unwritable /tmp must never replace
  // the healthy instance and only discover the problem when it is retired.
  if (!createMarker(drainMarkerPath, filesystem)) throw new Error('El marcador de drenaje no es escribible');
  removeMarker(drainMarkerPath, filesystem);
  if (filesystem.existsSync(drainMarkerPath)) throw new Error('El marcador de drenaje no se puede limpiar');

  let child;
  try {
    child = spawnProcess(process.execPath, [serverPath, ...serverArgs], {
      env: environment,
      stdio: 'inherit',
    });
  } catch (error) {
    logger.error(`[dapp-drain] no se pudo iniciar el servidor: ${error.message}`);
    onExit(1);
    return { child: null, handleSignal: () => undefined };
  }

  let shutdownStarted = false;
  let settled = false;
  let propagationTimer;
  let retirementTimer;
  let forceKillTimer;

  const clearTimers = () => {
    for (const timer of [propagationTimer, retirementTimer, forceKillTimer]) {
      if (timer !== undefined) timers.clearTimeout(timer);
    }
  };

  const finish = (code, signal) => {
    if (settled) return;
    settled = true;
    clearTimers();
    removeMarker(drainMarkerPath, filesystem);
    const exitCode = typeof code === 'number' ? code : signalExitCode(signal);
    onExit(exitCode);
  };

  const terminateChild = () => {
    if (settled || !child || child.exitCode !== null || child.signalCode) return;
    try {
      child.kill('SIGTERM');
    } catch (error) {
      logger.error(`[dapp-drain] no se pudo enviar SIGTERM: ${error.message}`);
    }
  };

  const markDraining = () => {
    if (settled) return;
    createMarker(drainMarkerPath, filesystem);
    retirementTimer = timers.setTimeout(terminateChild, boundedTimings.proxyRetirement);
  };

  const handleSignal = (signal) => {
    if (shutdownStarted || settled) return;
    shutdownStarted = true;
    // Keep the child healthy and serving during this first window so Docker's
    // provider can propagate the candidate before readiness starts failing.
    propagationTimer = timers.setTimeout(markDraining, boundedTimings.providerPropagation);
    forceKillTimer = timers.setTimeout(() => {
      if (settled || !child || child.exitCode !== null || child.signalCode) return;
      try {
        child.kill('SIGKILL');
      } catch (error) {
        logger.error(`[dapp-drain] no se pudo forzar la salida: ${error.message}`);
      }
    }, boundedTimings.forceKill);
    logger.info(`[dapp-drain] ${signal} recibido; drenaje gradual iniciado`);
  };

  child.once('error', (error) => {
    logger.error(`[dapp-drain] fallo del servidor: ${error.message}`);
    finish(1);
  });
  child.once('exit', (code, signal) => finish(code, signal));

  return { child, handleSignal, markerPath: drainMarkerPath };
}

function main() {
  const [serverPath, ...serverArgs] = process.argv.slice(2);
  if (!serverPath) {
    console.error('Uso: node scripts/docker-dapp-server.mjs <server.js> [...args]');
    process.exit(1);
  }

  const controller = createDappServerController({ serverPath, serverArgs });
  // `handleSignal` is idempotent, so keep both handlers alive during the
  // drain window. A second SIGTERM must not make PID1 exit before the child
  // has had its propagation and proxy-retirement phases.
  process.on('SIGTERM', () => controller.handleSignal('SIGTERM'));
  process.on('SIGINT', () => controller.handleSignal('SIGINT'));
}

if (process.argv[1] === new URL(import.meta.url).pathname) main();
