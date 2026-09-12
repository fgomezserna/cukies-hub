import { types as utilTypes } from 'node:util';

export type PlainDataLimits = {
  maxDepth?: number;
  maxNodes?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
  maxStringBytes?: number;
  maxTotalBytes?: number;
};

type ResolvedPlainDataLimits = Required<PlainDataLimits>;

const DEFAULT_LIMITS: ResolvedPlainDataLimits = {
  maxDepth: 32,
  maxNodes: 100_000,
  maxArrayLength: 50_000,
  maxObjectKeys: 2_000,
  maxStringBytes: 4 * 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024,
};

type Container = Record<string, unknown> | unknown[];

function fail(label: string, reason: string): never {
  throw new Error(`${label} ${reason}.`);
}

function clonePrimitive(
  value: unknown,
  label: string,
  limits: ResolvedPlainDataLimits,
  counters: { nodes: number; stringBytes: number },
) {
  counters.nodes += 1;
  if (counters.nodes > limits.maxNodes) fail(label, 'node limit exceeded');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(label, 'contains a non-finite number');
    return value;
  }
  if (typeof value === 'string') {
    const bytes = Buffer.byteLength(value, 'utf8');
    if (bytes > limits.maxStringBytes) fail(label, 'string limit exceeded');
    counters.stringBytes += bytes;
    if (counters.stringBytes > limits.maxTotalBytes) fail(label, 'total string limit exceeded');
    return value;
  }
  if (typeof value !== 'object') fail(label, 'must contain only JSON-like values');
  return undefined;
}

function sourceDescriptors(source: object, label: string) {
  if (utilTypes.isProxy(source)) fail(label, 'must not contain Proxy values');
  let prototype: object | null;
  let keys: Array<string | symbol>;
  try {
    prototype = Object.getPrototypeOf(source);
    keys = Reflect.ownKeys(source);
  } catch {
    fail(label, 'cannot be inspected safely');
  }
  const array = Array.isArray(source);
  if (prototype !== (array ? Array.prototype : Object.prototype)) {
    fail(label, 'must use only plain object and array prototypes');
  }
  if (keys.some((key) => typeof key === 'symbol')) fail(label, 'must not contain symbol keys');
  const descriptors = new Map<string, PropertyDescriptor>();
  for (const key of keys as string[]) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(source, key);
    } catch {
      fail(label, 'cannot be inspected safely');
    }
    if (!descriptor || 'get' in descriptor || 'set' in descriptor || !('value' in descriptor)) {
      fail(label, 'must not contain accessors');
    }
    descriptors.set(key, descriptor);
  }
  return { array, descriptors };
}

export function clonePlainData<T>(
  input: T,
  label: string,
  overrides: PlainDataLimits = {},
): T {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  const counters = { nodes: 0, stringBytes: 0 };
  const rootPrimitive = clonePrimitive(input, label, limits, counters);
  if (rootPrimitive !== undefined || input === null) return rootPrimitive as T;

  const rootSource = input as object;
  const rootInfo = sourceDescriptors(rootSource, label);
  const rootTarget: Container = rootInfo.array ? [] : {};
  const stack: Array<{
    source: object;
    target: Container;
    depth: number;
    info: ReturnType<typeof sourceDescriptors>;
  }> = [
    { source: rootSource, target: rootTarget, depth: 0, info: rootInfo },
  ];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.depth > limits.maxDepth) fail(label, 'depth limit exceeded');
    counters.nodes += 1;
    if (counters.nodes > limits.maxNodes) fail(label, 'node limit exceeded');
    const { array, descriptors } = current.info;

    if (array) {
      const lengthDescriptor = descriptors.get('length');
      const length = lengthDescriptor?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > limits.maxArrayLength) {
        fail(label, 'array length limit exceeded');
      }
      const expectedKeys = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
      if (descriptors.size !== expectedKeys.size ||
        [...descriptors.keys()].some((key) => !expectedKeys.has(key))) {
        fail(label, 'arrays must be dense and contain no custom properties');
      }
      if ([...descriptors.entries()].some(([key, descriptor]) => (
        key === 'length' ? descriptor.enumerable : !descriptor.enumerable
      ))) fail(label, 'arrays must use plain enumerable elements');
      (current.target as unknown[]).length = length;
      for (let index = 0; index < length; index += 1) {
        const value = descriptors.get(String(index))!.value;
        const primitive = clonePrimitive(value, label, limits, counters);
        if (primitive !== undefined || value === null) {
          (current.target as unknown[])[index] = primitive;
          continue;
        }
        const childInfo = sourceDescriptors(value as object, label);
        const child: Container = childInfo.array ? [] : {};
        (current.target as unknown[])[index] = child;
        stack.push({
          source: value as object, target: child, depth: current.depth + 1, info: childInfo,
        });
      }
      continue;
    }

    if (descriptors.size > limits.maxObjectKeys) fail(label, 'object key limit exceeded');
    for (const [key, descriptor] of descriptors) {
      if (!descriptor.enumerable) fail(label, 'object properties must be enumerable');
      const keyBytes = Buffer.byteLength(key, 'utf8');
      if (keyBytes > limits.maxStringBytes) fail(label, 'key limit exceeded');
      counters.stringBytes += keyBytes;
      if (counters.stringBytes > limits.maxTotalBytes) fail(label, 'total string limit exceeded');
      const value = descriptor.value;
      const primitive = clonePrimitive(value, label, limits, counters);
      if (primitive !== undefined || value === null) {
        Object.defineProperty(current.target, key, {
          value: primitive, enumerable: true, configurable: true, writable: true,
        });
        continue;
      }
      const childInfo = sourceDescriptors(value as object, label);
      const child: Container = childInfo.array ? [] : {};
      Object.defineProperty(current.target, key, {
        value: child, enumerable: true, configurable: true, writable: true,
      });
      stack.push({
        source: value as object, target: child, depth: current.depth + 1, info: childInfo,
      });
    }
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(rootTarget);
  } catch {
    fail(label, 'cannot be serialized safely');
  }
  if (Buffer.byteLength(serialized, 'utf8') > limits.maxTotalBytes) {
    fail(label, 'serialized byte limit exceeded');
  }
  return rootTarget as T;
}
