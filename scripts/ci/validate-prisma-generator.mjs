#!/usr/local/bin/node

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export class PrismaGeneratorPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrismaGeneratorPolicyError';
  }
}

function tokenizePrismaSchema(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '/') {
      const lineEnd = source.indexOf('\n', index + 2);
      index = lineEnd === -1 ? source.length : lineEnd + 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const commentEnd = source.indexOf('*/', index + 2);
      if (commentEnd === -1) {
        throw new PrismaGeneratorPolicyError('Prisma schema contains an unterminated comment.');
      }
      index = commentEnd + 2;
      continue;
    }
    if (character === '"') {
      const start = index;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const current = source[index];
        if (!escaped && current === '"') break;
        if (!escaped && current === '\\') {
          escaped = true;
        } else {
          escaped = false;
        }
        index += 1;
      }
      if (index >= source.length) {
        throw new PrismaGeneratorPolicyError('Prisma schema contains an unterminated string.');
      }
      const rawValue = source.slice(start, index + 1);
      let value;
      try {
        value = JSON.parse(rawValue);
      } catch {
        throw new PrismaGeneratorPolicyError('Prisma schema contains an invalid string.');
      }
      tokens.push(Object.freeze({ type: 'string', value }));
      index += 1;
      continue;
    }
    if (/[A-Za-z_]/u.test(character)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/u.test(source[index])) index += 1;
      tokens.push(Object.freeze({ type: 'identifier', value: source.slice(start, index) }));
      continue;
    }

    tokens.push(Object.freeze({ type: 'symbol', value: character }));
    index += 1;
  }

  return tokens;
}

export function validatePrismaGenerator(source) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new PrismaGeneratorPolicyError('Prisma schema must be a non-empty string.');
  }

  const tokens = tokenizePrismaSchema(source);
  const generators = [];
  let depth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === '{') {
      depth += 1;
      continue;
    }
    if (token.value === '}') {
      depth -= 1;
      if (depth < 0) {
        throw new PrismaGeneratorPolicyError('Prisma schema contains an unmatched closing brace.');
      }
      continue;
    }
    if (depth !== 0 || token.type !== 'identifier' || token.value !== 'generator') continue;

    const name = tokens[index + 1];
    const openingBrace = tokens[index + 2];
    if (name?.type !== 'identifier' || openingBrace?.value !== '{') {
      throw new PrismaGeneratorPolicyError('Prisma schema contains a malformed generator.');
    }

    const body = [];
    let cursor = index + 3;
    let generatorDepth = 1;
    while (cursor < tokens.length && generatorDepth > 0) {
      const bodyToken = tokens[cursor];
      if (bodyToken.value === '{') generatorDepth += 1;
      if (bodyToken.value === '}') generatorDepth -= 1;
      if (generatorDepth > 0) body.push(bodyToken);
      cursor += 1;
    }
    if (generatorDepth !== 0) {
      throw new PrismaGeneratorPolicyError('Prisma schema contains an unclosed generator.');
    }
    generators.push(Object.freeze({ name: name.value, body: Object.freeze(body) }));
    index = cursor - 1;
  }

  if (depth !== 0) {
    throw new PrismaGeneratorPolicyError('Prisma schema contains unbalanced braces.');
  }
  if (generators.length !== 1) {
    throw new PrismaGeneratorPolicyError('Exactly one Prisma generator is allowed.');
  }

  const [{ name, body }] = generators;
  if (
    name !== 'client'
    || body.length !== 3
    || body[0]?.type !== 'identifier'
    || body[0]?.value !== 'provider'
    || body[1]?.value !== '='
    || body[2]?.type !== 'string'
    || body[2]?.value !== 'prisma-client-js'
  ) {
    throw new PrismaGeneratorPolicyError(
      'The only allowed Prisma generator is client with provider prisma-client-js.',
    );
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const [schemaPath, ...unexpected] = process.argv.slice(2);
    if (!schemaPath || unexpected.length !== 0) {
      throw new PrismaGeneratorPolicyError('Exactly one Prisma schema path is required.');
    }
    validatePrismaGenerator(readFileSync(schemaPath, 'utf8'));
    process.stdout.write('[quality-prisma] generator policy verified.\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[quality-prisma] ${message}\n`);
    process.exitCode = 1;
  }
}
