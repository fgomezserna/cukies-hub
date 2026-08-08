#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';

function fail(message) {
  process.stderr.write(`[quality-source] ${message}\n`);
  process.exit(1);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeRelativePath(value) {
  return typeof value === 'string'
    && value !== ''
    && !path.isAbsolute(value)
    && !value.split('/').includes('..')
    && !value.includes('\\')
    && !value.includes('\0');
}

const [workspaceArgument, manifestArgument] = process.argv.slice(2);
if (!workspaceArgument || !manifestArgument) fail('Workspace and manifest paths are required.');

let workspace;
let manifest;
try {
  workspace = realpathSync(workspaceArgument);
  manifest = JSON.parse(readFileSync(manifestArgument, 'utf8'));
} catch {
  fail('Pinned source manifest could not be read.');
}

if (
  manifest?.schemaVersion !== 1
  || !/^[0-9a-f]{40}$/.test(manifest.expectedSha ?? '')
  || !Array.isArray(manifest.entries)
  || manifest.entries.length === 0
) {
  fail('Pinned source manifest is invalid.');
}

const expectedPaths = new Set();
for (const entry of manifest.entries) {
  if (
    !safeRelativePath(entry?.path)
    || !['file', 'symlink'].includes(entry.type)
    || !['100644', '100755', '120000'].includes(entry.mode)
    || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')
    || expectedPaths.has(entry.path)
  ) {
    fail('Pinned source manifest contains an invalid entry.');
  }
  expectedPaths.add(entry.path);
  const absolutePath = path.join(workspace, entry.path);
  try {
    const stats = lstatSync(absolutePath);
    let bytes;
    let mode;
    if (entry.type === 'symlink') {
      if (!stats.isSymbolicLink()) throw new Error('type');
      bytes = Buffer.from(readlinkSync(absolutePath));
      mode = '120000';
    } else {
      if (!stats.isFile()) throw new Error('type');
      bytes = readFileSync(absolutePath);
      mode = (stats.mode & 0o111) === 0 ? '100644' : '100755';
    }
    if (mode !== entry.mode || sha256(bytes) !== entry.sha256) throw new Error('content');
  } catch {
    fail(`Candidate source changed during image preparation: ${entry.path}.`);
  }
}

function isMutablePreparationPath(relativePath) {
  const parts = relativePath.split('/');
  return parts[0] === '.quality' || parts.includes('node_modules');
}

function rejectUnexpected(relativeDirectory = '') {
  const absoluteDirectory = path.join(workspace, relativeDirectory);
  for (const dirent of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = relativeDirectory === ''
      ? dirent.name
      : `${relativeDirectory}/${dirent.name}`;
    if (isMutablePreparationPath(relativePath)) continue;
    if (dirent.isDirectory()) {
      rejectUnexpected(relativePath);
    } else if (!expectedPaths.has(relativePath)) {
      fail(`Unexpected candidate source appeared during image preparation: ${relativePath}.`);
    }
  }
}

rejectUnexpected();
process.stdout.write(`[quality-source] pinned source verified for ${manifest.expectedSha}.\n`);
