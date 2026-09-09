#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const sourceArgument = process.argv[2];
if (!sourceArgument) {
  throw new Error(
    'Usage: node tools/record-provenance.mjs <absolute-or-relative-source-repository>'
  );
}

const sourceRoot = resolve(sourceArgument);
const scriptRoot = dirname(fileURLToPath(import.meta.url));
const destinationRoot = resolve(scriptRoot, '..');
const hubRoot = resolve(destinationRoot, '../..');
const excludedPatterns = [
  '.env',
  '.env.*',
  'nx.json',
  'project.json',
  '*.nx.*',
  '*credential*',
  '*secret*',
  '*.e2e.spec.ts',
  'apps/backend/auth/**',
  'apps/backend/data-graphql/**',
  '*saakuru*',
];

const normalize = (value) => value.split('\\').join('/');
const isExcluded = (path) => {
  const value = normalize(path).toLowerCase();
  return (
    value.includes('/.env') ||
    value.endsWith('/nx.json') ||
    value.endsWith('/project.json') ||
    value.includes('/nx.') ||
    value.includes('credential') ||
    value.includes('secret') ||
    value.endsWith('.e2e.spec.ts') ||
    value.includes('/apps/backend/auth/') ||
    value.includes('/apps/backend/data-graphql/') ||
    value.includes('saakuru')
  );
};

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.ts') && !isExcluded(path)) files.push(path);
  }
};
walk(join(destinationRoot, '..', 'world-api', 'src'));
walk(join(destinationRoot, '..', 'world-matchmaking', 'src'));
walk(join(destinationRoot, 'src'));

const sourceFor = (path) => {
  const apiSource = join(destinationRoot, '..', 'world-api', 'src');
  const apiRelative = relative(apiSource, path);
  if (!apiRelative.startsWith('..')) {
    return join(sourceRoot, 'apps/backend/game/src', apiRelative);
  }

  const matchmakingSource = join(destinationRoot, '..', 'world-matchmaking', 'src');
  const matchmakingRelative = relative(matchmakingSource, path);
  if (!matchmakingRelative.startsWith('..')) {
    return join(sourceRoot, 'apps/backend/matchmaking/src', matchmakingRelative);
  }

  const sharedRelative = relative(join(destinationRoot, 'src'), path);
  if (sharedRelative.startsWith('schemas/')) {
    return join(
      sourceRoot,
      'libs/shared/backend/schemas/src',
      sharedRelative.slice('schemas/'.length)
    );
  }
  if (sharedRelative.startsWith('interfaces/')) {
    return join(
      sourceRoot,
      'libs/shared/backend/interfaces-lib/src/lib',
      sharedRelative.slice('interfaces/'.length)
    );
  }
  if (sharedRelative.startsWith('crud/')) {
    return join(
      sourceRoot,
      'libs/shared/backend/crud/src/lib',
      sharedRelative.slice('crud/'.length)
    );
  }
  return undefined;
};

const sha256 = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const git = (cwd, args, options = {}) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    ...options,
  }).trim();

const sourceHead = git(sourceRoot, ['rev-parse', 'HEAD']);
const sourceStatus = git(sourceRoot, ['status', '--short', '--untracked-files=all']);
const sourceStatusByPath = new Map();
for (const line of sourceStatus.split('\n').filter(Boolean)) {
  sourceStatusByPath.set(normalize(line.slice(3)), line.slice(0, 2));
}

const sourcePaths = files
  .map(sourceFor)
  .filter(Boolean)
  .filter(existsSync)
  .map((path) => relative(sourceRoot, path));
const trackedSourcePaths = new Set(
  git(sourceRoot, ['ls-files', '--', ...sourcePaths])
    .split('\n')
    .filter(Boolean)
    .map(normalize)
);

const adaptationFor = (source) => {
  if (!source) {
    return {
      family: 'hub-adapter',
      changes: ['runtime package entrypoint and local service wiring'],
    };
  }
  const normalized = normalize(relative(sourceRoot, source));
  if (normalized.startsWith('apps/backend/game/')) {
    return {
      family: 'world-api',
      changes: [
        'imports aliased to @cukies/world-shared',
        'types and DTO boundaries adapted to standalone Nest package',
        'access control scoped to new World credentials',
        'runtime/readiness/write-gate integration applied locally',
      ],
    };
  }
  if (normalized.startsWith('apps/backend/matchmaking/')) {
    return {
      family: 'world-matchmaking',
      changes: [
        'imports aliased to @cukies/world-shared',
        'types adapted to standalone Nest/CommonJS package',
        'admission and island access use new credential boundaries',
        'Redis/runtime lifecycle integration applied locally',
      ],
    };
  }
  return {
    family: 'world-shared',
    changes: [
      'shared schemas/interfaces/CRUD imported from local package',
      'types preserved or narrowed for standalone compilation',
      'runtime package boundary retained without legacy private registry',
    ],
  };
};

const row = (destination) => {
  const source = sourceFor(destination);
  const adaptation = adaptationFor(source);
  const base = {
    destination: relative(hubRoot, destination),
    adaptationFamily: adaptation.family,
    adaptations: adaptation.changes,
    destinationHash: sha256(destination),
  };
  if (!source || !existsSync(source)) {
    return { ...base, source: null, sourceState: 'new' };
  }

  const sourceRelative = normalize(relative(sourceRoot, source));
  const statusCode = sourceStatusByPath.get(sourceRelative);
  const sourceState = trackedSourcePaths.has(sourceRelative)
    ? statusCode
      ? `tracked-dirty:${statusCode}`
      : 'tracked-clean'
    : 'untracked';

  return {
    ...base,
    source: sourceRelative,
    sourceHead,
    sourceState,
    sourceObservedHash: sha256(source),
    hashObservation: 'final source and destination bytes observed during registration; not an atomic copy proof',
  };
};

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceRepository: sourceRoot,
  sourceHead,
  sourceWorkingTree: sourceStatus || 'clean',
  destinationBranch: git(hubRoot, ['rev-parse', '--abbrev-ref', 'HEAD']),
  exclusions: excludedPatterns,
  hashSemantics:
    'sourceObservedHash and destinationHash are final observed hashes; they do not prove an atomic copy or historical equality',
  files: files.map(row),
};

writeFileSync(
  join(destinationRoot, 'world-port-provenance.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);
console.log(`Recorded ${manifest.files.length} files from ${sourceHead}`);
