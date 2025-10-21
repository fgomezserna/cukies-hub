"use client";

/**
 * Deterministic pseudo-random number generator manager.
 * Allows creating multiple independent streams derived from a base seed,
 * guaranteeing that clients sharing the same base seed consume identical sequences.
 */

type GeneratorFn = () => number;

interface RandomStream {
  name: string;
  generator: GeneratorFn;
}

const DEFAULT_STREAM = 'default';

const streams = new Map<string, RandomStream>();
let baseSeed: number | null = null;

// Mulberry32 PRNG - fast, deterministic with 32-bit seed
const createMulberry32 = (seed: number): GeneratorFn => {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const defaultRandom = () => Math.random();

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
};

const normalizeSeed = (seed: string | number): number => {
  if (typeof seed === 'number') {
    return seed >>> 0;
  }
  return hashString(seed);
};

const deriveStreamSeed = (seed: number, name: string): number => {
  const nameHash = hashString(name);
  // Simple mixing using 32-bit arithmetic
  const mixed = (seed ^ (nameHash + 0x9E3779B9 + ((seed << 6) >>> 0) + (seed >>> 2))) >>> 0;
  return mixed;
};

const getOrCreateStream = (name: string): GeneratorFn => {
  if (baseSeed === null) {
    return defaultRandom;
  }

  const streamName = name || DEFAULT_STREAM;
  const existing = streams.get(streamName);
  if (existing) {
    return existing.generator;
  }

  const streamSeed = deriveStreamSeed(baseSeed, streamName);
  const generator = createMulberry32(streamSeed);
  streams.set(streamName, { name: streamName, generator });
  return generator;
};

const next = (streamName: string = DEFAULT_STREAM): number => {
  const generator = getOrCreateStream(streamName);
  return generator();
};

const getInt = (min: number, max: number, streamName?: string): number => {
  const random = next(streamName);
  const minCeil = Math.ceil(min);
  const maxFloor = Math.floor(max);
  return Math.floor(random * (maxFloor - minCeil) + minCeil);
};

const getFloat = (min: number, max: number, streamName?: string): number => {
  const random = next(streamName);
  return random * (max - min) + min;
};

/**
 * Reset current streams while keeping the active base seed.
 * Useful when restarting a match but keeping deterministic order.
 */
const resetStreams = () => {
  streams.clear();
};

export const randomManager = {
  /**
   * Set base seed for deterministic generation.
   * Resets all existing streams using the new seed.
   */
  setSeed(seed: string | number) {
    baseSeed = normalizeSeed(seed);
    resetStreams();
  },

  /**
   * Clear the deterministic seed and fall back to Math.random.
   */
  clear() {
    baseSeed = null;
    resetStreams();
  },

  /**
   * Fetch raw pseudo-random value in [0, 1).
   */
  random(streamName?: string): number {
    return next(streamName);
  },

  /**
   * Deterministic float helper for convenience.
   */
  float(min: number, max: number, streamName?: string): number {
    return getFloat(min, max, streamName);
  },

  /**
   * Deterministic integer helper.
   */
  int(min: number, max: number, streamName?: string): number {
    return getInt(min, max, streamName);
  },

  /**
   * Allows consuming the next value explicitly from a named stream.
   */
  next(streamName?: string): number {
    return next(streamName);
  },
};

export default randomManager;

