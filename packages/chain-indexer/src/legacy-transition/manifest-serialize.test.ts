import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { compareCodePoints } from './canonical.js';
import {
  assertCanonicalLegacySnapshot,
  assertLegacyTransitionManifestIntegrity,
  assertLegacyTransitionPackageIntegrity,
  buildLegacyTransitionPackage,
} from './manifest.js';
import {
  serializeCsv,
  stableJsonStringify,
} from './serialize.js';
import {
  buildLegacySnapshot,
  buildSourceBalanceBindingSha256,
} from './snapshot.js';
import {
  BSC_OWNER,
  BSC_USER,
  BYTECODE_HASH,
  TRON_USER,
  emptySnapshotInput,
  realLegacyContracts,
  stagingCutoffs,
  testCoverage,
  testObservation,
} from './test-fixtures.js';
import type { LegacySnapshotResult, LegacyTransitionManifest } from './types.js';

function oneWalletInput() {
  const coverage = testCoverage({
    BSC: { wallets: 1, observed: 1, claimedRaw: '90071992547409930000', pendingRaw: '7' },
  });
  return {
    coverage,
    discoveries: [{ network: 'BSC' as const, wallet: BSC_USER, userId: 'user-1', source: 'bsc-wallets' }],
    observations: [testObservation({
      network: 'BSC', wallet: BSC_USER, claimedRaw: '90071992547409930000',
      pendingRaw: '7', tokenIds: ['1'], coverage,
    })],
  };
}

function rehashSnapshot(snapshot: LegacySnapshotResult) {
  snapshot.integritySha256 = createHash('sha256').update(stableJsonStringify({
    previewOnly: snapshot.previewOnly,
    cutoverAuthorized: snapshot.cutoverAuthorized,
    complete: snapshot.complete,
    coverage: snapshot.coverage,
    wallets: snapshot.wallets,
    totals: snapshot.totals,
    issues: snapshot.issues,
  })).digest('hex');
  return snapshot;
}

test('loads all six real dapp ABIs and builds a canonical raw-input package', () => {
  const first = buildLegacyTransitionPackage({
    snapshotInput: oneWalletInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: realLegacyContracts(),
  });
  const second = buildLegacyTransitionPackage({
    snapshotInput: oneWalletInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: realLegacyContracts(),
  });

  assert.deepEqual(first, second);
  assert.equal(first.previewOnly, true);
  assert.equal(first.cutoverAuthorized, false);
  assert.equal(first.manifest.complete, true);
  assert.equal(first.manifest.environment, 'staging');
  assert.equal(first.manifest.target.databaseName, 'cukieshub-new');
  assert.equal(first.manifest.target.economySchemaVersion, 2);
  assert.equal(first.manifest.contracts.length, 6);
  assert.ok(first.manifest.contracts.every((contract) => contract.expectedSelectors.length > 0));
  assert.match(first.manifest.manifestSha256, /^[0-9a-f]{64}$/);
});

test('rejects a fabricated complete snapshot result and tampered canonical state', () => {
  const fabricated = {
    previewOnly: true,
    cutoverAuthorized: false,
    complete: true,
    coverage: testCoverage(),
    wallets: [],
    totals: {
      BSC: { wallets: 0, claimedRaw: '0', pendingRaw: '0', totalRaw: '0', tokens: 0 },
      TRON: { wallets: 0, claimedRaw: '0', pendingRaw: '0', totalRaw: '0', tokens: 0 },
    },
    issues: [],
    integritySha256: '0'.repeat(64),
  } as LegacySnapshotResult;
  assert.throws(() => assertCanonicalLegacySnapshot(fabricated), /integrity hash is invalid/);

  const real = buildLegacySnapshot(emptySnapshotInput());
  const tampered = { ...real, complete: false };
  assert.throws(() => assertCanonicalLegacySnapshot(tampered), /not a canonical preview result/);

  const extraCoverageField = structuredClone(real);
  (extraCoverageField.coverage[0].wallets as typeof extraCoverageField.coverage[0]['wallets'] & {
    unexpected: boolean;
  }).unexpected = true;
  assert.throws(
    () => assertCanonicalLegacySnapshot(rehashSnapshot(extraCoverageField)),
    /coverage metadata is invalid/,
  );

  const invalidCoverageHash = structuredClone(real);
  invalidCoverageHash.coverage[0].wallets.querySha256 = 'not-a-hash';
  assert.throws(
    () => assertCanonicalLegacySnapshot(rehashSnapshot(invalidCoverageHash)),
    /coverage metadata is invalid/,
  );

  const invalidIssue = buildLegacySnapshot({
    ...emptySnapshotInput(),
    errors: [{ network: 'BSC', code: 'TIMEOUT', message: 'untrusted detail' }],
  });
  invalidIssue.issues[0].message = 'attacker-controlled canonical-looking text';
  assert.throws(
    () => assertCanonicalLegacySnapshot(rehashSnapshot(invalidIssue)),
    /issue runtime shape or message is not canonical/,
  );
});

test('closed package verifier rejects any artifact not byte-identical to its manifest', () => {
  const transitionPackage = buildLegacyTransitionPackage({
    snapshotInput: oneWalletInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: realLegacyContracts(),
  });
  const artifacts = transitionPackage.artifacts.map((file) =>
    file.path === 'totals.json' ? { ...file, contents: '{"tampered":true}\n' } : file,
  );
  assert.throws(() => assertLegacyTransitionPackageIntegrity({
    ...transitionPackage, artifacts,
  }, transitionPackage.manifest.manifestSha256), /does not match its manifest/);
});

test('closed package rejects extra root fields even when the manifest hash is recomputed', () => {
  const transitionPackage = buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: realLegacyContracts(),
  });
  const forgedManifest = {
    ...transitionPackage.manifest,
    unexpectedField: true,
  } as LegacyTransitionManifest & { unexpectedField: boolean };
  const { manifestSha256: _previous, ...body } = forgedManifest;
  forgedManifest.manifestSha256 = createHash('sha256')
    .update(stableJsonStringify(body))
    .digest('hex');

  assert.throws(() => assertLegacyTransitionPackageIntegrity({
    ...transitionPackage,
    manifest: forgedManifest,
  }, forgedManifest.manifestSha256), /manifest integrity or runtime flags are invalid/i);
  assert.throws(() => assertLegacyTransitionPackageIntegrity({
    ...transitionPackage,
    unexpectedField: true,
  } as never, transitionPackage.manifest.manifestSha256), /package runtime shape or flags are invalid/i);
  assert.throws(() => assertLegacyTransitionPackageIntegrity({
    ...transitionPackage,
    artifacts: transitionPackage.artifacts.map((artifact, index) => index === 0
      ? { ...artifact, unexpectedField: true }
      : artifact),
  } as never, transitionPackage.manifest.manifestSha256), /package artifact shape is invalid/i);
});

test('public boundaries reject getters, proxies and non-plain prototypes before observing them', () => {
  const contracts = realLegacyContracts();
  let getterReads = 0;
  const getterInput = {
    snapshotInput: emptySnapshotInput(), environment: 'staging' as const,
    cutoffs: stagingCutoffs(),
  } as Record<string, unknown>;
  Object.defineProperty(getterInput, 'contracts', {
    enumerable: true,
    get() {
      getterReads += 1;
      return getterReads === 1 ? contracts : [...contracts].reverse();
    },
  });
  assert.throws(() => buildLegacyTransitionPackage(getterInput as never), /must not contain accessors/);
  assert.equal(getterReads, 0);

  let proxyReads = 0;
  const proxyContracts = new Proxy(contracts, {
    get(target, property, receiver) {
      proxyReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(() => buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: proxyContracts,
  }), /must not contain Proxy values/);
  assert.equal(proxyReads, 0);

  const inherited = Object.create({ unexpected: true }) as Record<string, unknown>;
  Object.assign(inherited, {
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts,
  });
  assert.throws(() => buildLegacyTransitionPackage(inherited as never), /plain object and array prototypes/);
});

test('package derivation is isolated from caller mutation after its single parse', () => {
  const contracts = realLegacyContracts();
  const input = {
    snapshotInput: emptySnapshotInput(), environment: 'staging' as const,
    cutoffs: stagingCutoffs(), contracts,
  };
  const transitionPackage = buildLegacyTransitionPackage(input);
  const originalAddress = transitionPackage.manifest.contracts[0].address;
  input.contracts[0].address = input.contracts[1].address;
  input.cutoffs[0].ref = 'mutated-after-parse';
  assert.equal(transitionPackage.manifest.contracts[0].address, originalAddress);
  assert.notEqual(transitionPackage.manifest.cutoffs[0].ref, input.cutoffs[0].ref);
});

test('mutating one package target cannot poison subsequent manifests', () => {
  const first = buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: realLegacyContracts(),
  });
  first.manifest.target.databaseName = 'attacker-db' as 'cukieshub-new';

  const second = buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: realLegacyContracts(),
  });
  assert.equal(second.manifest.target.databaseName, 'cukieshub-new');
  assert.doesNotThrow(() => assertLegacyTransitionManifestIntegrity(
    second.manifest,
    second.manifest.manifestSha256,
  ));
});

test('bounded plain parser rejects depth bombs and oversized strings without RangeError', () => {
  const transitionPackage = buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: realLegacyContracts(),
  });
  let deep: Record<string, unknown> = { leaf: true };
  for (let index = 0; index < 20_000; index += 1) deep = { next: deep };
  assert.throws(() => assertLegacyTransitionManifestIntegrity({
    ...transitionPackage.manifest,
    unexpectedField: deep,
  } as never, transitionPackage.manifest.manifestSha256), (error: unknown) => (
    error instanceof Error && !(error instanceof RangeError) && /depth limit exceeded/.test(error.message)
  ));
  assert.throws(() => assertLegacyTransitionManifestIntegrity({
    ...transitionPackage.manifest,
    unexpectedField: 'x'.repeat(1024 * 1024 + 1),
  } as never, transitionPackage.manifest.manifestSha256), /string limit exceeded/);
  assert.throws(() => assertLegacyTransitionPackageIntegrity(
    transitionPackage,
    undefined as never,
  ), /anchor is missing or does not match/);
});

test('canonical zero-wallet JSONL is non-empty and explicitly preview-only', () => {
  const transitionPackage = buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: realLegacyContracts(),
  });
  const jsonl = transitionPackage.artifacts.find((artifact) => artifact.path === 'wallets.jsonl')?.contents;
  assert.equal(typeof jsonl, 'string');
  assert.notEqual(jsonl, '');
  assert.match(jsonl as string, /"recordType":"snapshot-metadata"/);
  assert.match(jsonl as string, /"cutoverAuthorized":false/);
});

test('ABI validation is case-insensitive but requires complete real signatures', () => {
  const snapshotInput = emptySnapshotInput();
  const contracts = realLegacyContracts();
  const tronPoints = contracts.find((item) => item.network === 'TRON' && item.alias === 'POINTS')!;
  assert.ok((tronPoints.abi as Array<{ type: string }>).some((entry) => entry.type === 'Function'));
  assert.ok(contracts.every((contract) => (contract.abi as Array<{ type: string; name?: string }>)
    .some((entry) => entry.type.toLowerCase() === 'function' && entry.name === 'owner')));

  const wrongName = contracts.map((item) => item.alias === 'POINTS'
    ? { ...item, abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }] }
    : item);
  assert.throws(() => buildLegacyTransitionPackage({
    snapshotInput, environment: 'staging', cutoffs: stagingCutoffs(), contracts: wrongName,
  }), /getPoints\(address\)/);

  const wrongInput = contracts.map((item) => item.alias === 'STAKING_POINTS'
    ? { ...item, abi: (item.abi as Array<Record<string, unknown>>).map((entry) =>
      entry.name === 'calcPoints' ? { ...entry, inputs: [{ type: 'address' }] } : entry) }
    : item);
  assert.throws(() => buildLegacyTransitionPackage({
    snapshotInput, environment: 'staging', cutoffs: stagingCutoffs(), contracts: wrongInput,
  }), /calcPoints\(uint256\)/);

  const wrongMutability = contracts.map((item) => item.alias === 'BREEDING_POINTS'
    ? { ...item, abi: (item.abi as Array<Record<string, unknown>>).map((entry) =>
      entry.name === 'pauseOn' ? { ...entry, stateMutability: 'View' } : entry) }
    : item);
  assert.throws(() => buildLegacyTransitionPackage({
    snapshotInput, environment: 'staging', cutoffs: stagingCutoffs(), contracts: wrongMutability,
  }), /pauseOn\(\)/);
});

test('environment fixes chain identities and contract metadata is non-zero/distinct', () => {
  assert.throws(() => buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'production',
    cutoffs: stagingCutoffs(), contracts: realLegacyContracts(),
  }), /invalid for the environment/);

  const repeated = realLegacyContracts();
  repeated[1] = { ...repeated[1], address: repeated[0].address };
  assert.throws(() => buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: repeated,
  }), /distinct canonical addresses/);

  const zeroHash = realLegacyContracts();
  zeroHash[0] = { ...zeroHash[0], expectedBytecodeHash: `0x${'0'.repeat(64)}` };
  assert.throws(() => buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: zeroHash,
  }), /non-zero 32-byte hex/);

  const invalidOwner = realLegacyContracts();
  invalidOwner[0] = { ...invalidOwner[0], expectedOwner: BSC_OWNER.slice(0, -1) };
  assert.throws(() => buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: invalidOwner,
  }), /expected owner is invalid/);
});

test('portable paths reject traversal before normalization and stable JSON rejects NFC key collisions', () => {
  const transitionPackage = buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: realLegacyContracts(),
  });
  for (const unsafe of ['a/../wallets.jsonl', 'C:\\wallets.jsonl', '\\\\server\\wallets.jsonl', 'wallets\u0000.jsonl']) {
    assert.throws(() => assertLegacyTransitionPackageIntegrity({
      ...transitionPackage,
      artifacts: transitionPackage.artifacts.map((file) =>
        file.path === 'wallets.jsonl' ? { ...file, path: unsafe } : file),
    }, transitionPackage.manifest.manifestSha256), /parent-directory|portable safe/);
  }
  assert.throws(() => stableJsonStringify({ é: 1, é: 2 }), /colliding Unicode-normalized keys/);
  assert.equal(compareCodePoints('e\u0301', '\u00e9'), 0);
});

test('public API cannot build a manifest from a caller-supplied snapshot or expose its hash primitive', async () => {
  const [localApi, rootApi] = await Promise.all([import('./index.js'), import('../index.js')]);
  for (const api of [localApi, rootApi]) {
    assert.equal('buildLegacyTransitionManifest' in api, false);
    assert.equal('computeLegacySnapshotIntegrity' in api, false);
    assert.equal('buildCanonicalLegacyArtifacts' in api, false);
    assert.equal(typeof api.buildLegacyTransitionPackage, 'function');
    assert.equal(typeof api.assertCanonicalLegacySnapshot, 'function');
  }
});

test('recalculated integrity cannot hide globally duplicated source balance ids', () => {
  const coverage = testCoverage({
    BSC: { wallets: 1, observed: 1, claimedRaw: '1', pendingRaw: '2' },
    TRON: { wallets: 1, observed: 1, claimedRaw: '2', pendingRaw: '3' },
  });
  const snapshot = buildLegacySnapshot({
    coverage,
    discoveries: [
      { network: 'BSC', wallet: BSC_USER, userId: 'user-1', source: 'bsc-wallets' },
      { network: 'TRON', wallet: TRON_USER, userId: 'user-2', source: 'tron-wallets' },
    ],
    observations: [
      testObservation({
        network: 'BSC', wallet: BSC_USER, claimedRaw: '1', pendingRaw: '2',
        balanceSuffix: 'first', coverage,
      }),
      testObservation({
        network: 'TRON', wallet: TRON_USER, claimedRaw: '2', pendingRaw: '3',
        balanceSuffix: 'second', coverage,
      }),
    ],
  });
  assert.equal(snapshot.complete, true);
  const forged = structuredClone(snapshot);
  const [first, second] = forged.wallets;
  second.claimedSourceBalanceId = first.claimedSourceBalanceId;
  second.pendingSourceBalanceId = first.pendingSourceBalanceId;
  const tronCoverage = forged.coverage.find((item) => item.network === 'TRON')!;
  second.claimedSourceRowSha256 = buildSourceBalanceBindingSha256({
    network: 'TRON', cutoffRef: tronCoverage.cutoffRef, sourceId: second.claimedSourceId!,
    wallet: second.wallet, sourceBalanceId: second.claimedSourceBalanceId!, raw: second.claimedRaw,
  });
  second.pendingSourceRowSha256 = buildSourceBalanceBindingSha256({
    network: 'TRON', cutoffRef: tronCoverage.cutoffRef, sourceId: second.pendingSourceId!,
    wallet: second.wallet, sourceBalanceId: second.pendingSourceBalanceId!, raw: second.pendingRaw,
  });
  forged.integritySha256 = createHash('sha256').update(stableJsonStringify({
    previewOnly: forged.previewOnly,
    cutoverAuthorized: forged.cutoverAuthorized,
    complete: forged.complete,
    coverage: forged.coverage,
    wallets: forged.wallets,
    totals: forged.totals,
    issues: forged.issues,
  })).digest('hex');

  assert.throws(
    () => assertCanonicalLegacySnapshot(forged),
    /source balance ids and row bindings must be globally unique/,
  );
});

test('CSV neutralizes formulas hidden behind whitespace, BOM and zero-width prefixes', () => {
  const csv = serializeCsv([
    { value: '  =SUM(1,1)' }, { value: '\ufeff+CMD' }, { value: '\u200b@IMPORT' },
  ], ['value']);
  assert.match(csv, /"'  =SUM\(1,1\)"/);
  assert.match(csv, new RegExp(`"'${String.fromCharCode(0xfeff)}\\+CMD"`));
  assert.match(csv, new RegExp(`"'${String.fromCharCode(0x200b)}@IMPORT"`));
});
