const { expect } = require('chai');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ethers } = require('hardhat');

const { writeJsonAtomically } = require('../scripts/generate-rewards-merkle.cjs');
const {
  deriveBatchId,
  generateRewardsMerkle,
  hashPair,
  leafHash,
} = require('../scripts/lib/rewards-merkle.cjs');

describe('rewards Merkle generator', function () {
  async function domain(overrides = {}) {
    const [, , , distributor] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    return {
      chainId: Number(network.chainId),
      distributorAddress: distributor.address,
      metadata: 'ipfs://bafy-rewards-period-2026-w27',
      ...overrides,
    };
  }

  function processProof(leaf, proof) {
    return proof.reduce((hash, sibling) => hashPair(hash, sibling), leaf);
  }

  it('is reproducible across input order and normalizes addresses and raw amounts', async function () {
    const [alice, bob, carol] = await ethers.getSigners();
    const inputDomain = await domain();
    const first = generateRewardsMerkle({
      periodId: '2026-W27-gameplay',
      ...inputDomain,
      allocations: [
        { walletAddress: carol.address.toLowerCase(), amountRaw: '00300' },
        { walletAddress: alice.address, amountRaw: '100' },
        { walletAddress: bob.address.toLowerCase(), amountRaw: '200' },
      ],
    });
    const second = generateRewardsMerkle({
      periodId: '2026-W27-gameplay',
      ...inputDomain,
      allocations: [
        { walletAddress: bob.address, amountRaw: '200' },
        { walletAddress: carol.address, amountRaw: '300' },
        { walletAddress: alice.address.toLowerCase(), amountRaw: '100' },
      ],
    });

    expect(first).to.deep.equal(second);
    expect(first.batchId).to.equal(deriveBatchId('2026-W27-gameplay'));
    expect(first.totalAllocatedRaw).to.equal('600');
    expect(first.allocationCount).to.equal(3);
    expect(first.chainId).to.equal(inputDomain.chainId);
    expect(first.distributorAddress).to.equal(ethers.getAddress(inputDomain.distributorAddress));
    expect(first.metadata).to.equal(inputDomain.metadata);
    expect(first.metadataHash).to.equal(ethers.keccak256(ethers.toUtf8Bytes(inputDomain.metadata)));

    const sortedAddresses = first.allocations.map((allocation) => allocation.walletAddress.toLowerCase());
    expect(sortedAddresses).to.deep.equal([...sortedAddresses].sort());
    for (const allocation of first.allocations) {
      expect(processProof(allocation.leaf, allocation.proof)).to.equal(first.merkleRoot);
    }
  });

  it('uses the exact domain-separated OpenZeppelin-style double hash', async function () {
    const [alice] = await ethers.getSigners();
    const inputDomain = await domain();
    const batchId = deriveBatchId('double-hash-contract');
    const amountRaw = '123456789012345678901';
    const manifest = generateRewardsMerkle({
      periodId: 'double-hash-contract',
      ...inputDomain,
      allocations: [{ walletAddress: alice.address, amountRaw }],
    });

    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'bytes32', 'address', 'uint256'],
      [inputDomain.chainId, inputDomain.distributorAddress, batchId, alice.address, amountRaw]
    );
    const expectedLeaf = ethers.keccak256(ethers.concat([ethers.keccak256(encoded)]));

    expect(leafHash(
      inputDomain.chainId,
      inputDomain.distributorAddress,
      batchId,
      alice.address,
      amountRaw
    )).to.equal(expectedLeaf);
    expect(manifest.allocations[0].leaf).to.equal(expectedLeaf);
    expect(manifest.merkleRoot).to.equal(expectedLeaf);
    expect(manifest.allocations[0].proof).to.deep.equal([]);
  });

  it('includes the normalized domain, metadata and allocations in the canonical SHA-256 hash', async function () {
    const [alice] = await ethers.getSigners();
    const inputDomain = await domain();
    const manifest = generateRewardsMerkle({
      periodId: 'canonical-input',
      ...inputDomain,
      allocations: [{ walletAddress: alice.address.toLowerCase(), amountRaw: '00042' }],
    });
    const canonicalInput = {
      batchId: manifest.batchId,
      periodId: 'canonical-input',
      chainId: inputDomain.chainId,
      distributorAddress: ethers.getAddress(inputDomain.distributorAddress),
      metadata: inputDomain.metadata,
      allocations: [{ walletAddress: ethers.getAddress(alice.address), amountRaw: '42' }],
    };
    const expectedHash = `0x${crypto.createHash('sha256')
      .update(JSON.stringify(canonicalInput), 'utf8')
      .digest('hex')}`;

    expect(manifest.canonicalInputHash).to.equal(expectedHash);
    expect(ethers.isHexString(manifest.canonicalInputHash, 32)).to.equal(true);
  });

  it('accepts an explicit matching batchId and rejects an inconsistent one', async function () {
    const [alice] = await ethers.getSigners();
    const inputDomain = await domain();
    const batchId = deriveBatchId('explicit-batch');
    const manifest = generateRewardsMerkle({
      periodId: 'explicit-batch',
      batchId,
      ...inputDomain,
      allocations: [{ walletAddress: alice.address, amountRaw: '1' }],
    });
    expect(manifest.batchId).to.equal(batchId);

    expect(() => generateRewardsMerkle({
      periodId: 'explicit-batch',
      batchId: ethers.id('different-batch'),
      ...inputDomain,
      allocations: [{ walletAddress: alice.address, amountRaw: '1' }],
    })).to.throw('batchId does not match');
  });

  it('supports batchId-only input without adding a periodId to the output', async function () {
    const [alice] = await ethers.getSigners();
    const inputDomain = await domain();
    const manifest = generateRewardsMerkle({
      batchId: ethers.id('batch-only'),
      ...inputDomain,
      allocations: [{ walletAddress: alice.address, amountRaw: '1' }],
    });

    expect(manifest).not.to.have.property('periodId');
    expect(manifest.batchId).to.equal(ethers.id('batch-only'));
  });

  it('separates roots by chain and distributor while binding metadata in manifest hashes', async function () {
    const [alice, bob, , distributor, otherDistributor] = await ethers.getSigners();
    const baseDomain = await domain();
    const input = {
      periodId: 'domain-change',
      ...baseDomain,
      allocations: [
        { walletAddress: alice.address, amountRaw: '10' },
        { walletAddress: bob.address, amountRaw: '20' },
      ],
    };
    const baseline = generateRewardsMerkle(input);
    const otherChain = generateRewardsMerkle({ ...input, chainId: baseDomain.chainId + 1 });
    const otherContract = generateRewardsMerkle({
      ...input,
      distributorAddress: otherDistributor.address,
    });
    const otherMetadata = generateRewardsMerkle({ ...input, metadata: 'ipfs://other-metadata' });

    expect(baseline.distributorAddress).to.equal(distributor.address);
    expect(otherChain.merkleRoot).not.to.equal(baseline.merkleRoot);
    expect(otherContract.merkleRoot).not.to.equal(baseline.merkleRoot);
    expect(otherMetadata.merkleRoot).to.equal(baseline.merkleRoot);
    expect(otherMetadata.canonicalInputHash).not.to.equal(baseline.canonicalInputHash);
    expect(otherMetadata.metadataHash).not.to.equal(baseline.metadataHash);
  });

  it('rejects duplicates, invalid wallets, invalid amounts and incomplete domains', async function () {
    const [alice] = await ethers.getSigners();
    const inputDomain = await domain();
    const validAllocation = { walletAddress: alice.address, amountRaw: '1' };

    expect(() => generateRewardsMerkle({
      periodId: 'duplicate',
      ...inputDomain,
      allocations: [validAllocation, { walletAddress: alice.address.toLowerCase(), amountRaw: '2' }],
    })).to.throw('duplicate walletAddress');

    const invalidCases = [
      [{ ...inputDomain, allocations: [{ walletAddress: 'not-an-address', amountRaw: '1' }] }, 'walletAddress is invalid'],
      [{ ...inputDomain, allocations: [{ walletAddress: ethers.ZeroAddress, amountRaw: '1' }] }, 'must not be zero'],
      [{ ...inputDomain, allocations: [{ walletAddress: alice.address, amountRaw: '0' }] }, 'greater than zero'],
      [{ ...inputDomain, allocations: [{ walletAddress: alice.address, amountRaw: '-1' }] }, 'integer string'],
      [{ ...inputDomain, allocations: [{ walletAddress: alice.address, amountRaw: '1.5' }] }, 'integer string'],
      [{ ...inputDomain, allocations: [{ walletAddress: alice.address, amountRaw: 1 }] }, 'integer string'],
      [{ ...inputDomain, allocations: [{ walletAddress: alice.address, amountRaw: (ethers.MaxUint256 + 1n).toString() }] }, 'amountRaw exceeds uint256'],
      [{ ...inputDomain, chainId: 0, allocations: [validAllocation] }, 'chainId'],
      [{ ...inputDomain, chainId: '56', allocations: [validAllocation] }, 'chainId'],
      [{ ...inputDomain, distributorAddress: ethers.ZeroAddress, allocations: [validAllocation] }, 'must not be zero'],
      [{ ...inputDomain, metadata: '   ', allocations: [validAllocation] }, 'metadata'],
      [{ ...inputDomain, allocations: [] }, 'non-empty array'],
    ];

    for (const [fields, message] of invalidCases) {
      expect(() => generateRewardsMerkle({ periodId: 'invalid-case', ...fields })).to.throw(message);
    }
  });

  it('rejects a canonical allocation total that cannot fit publishBatch uint256', async function () {
    const [alice, bob] = await ethers.getSigners();
    const inputDomain = await domain();

    expect(() => generateRewardsMerkle({
      periodId: 'uint256-overflow',
      ...inputDomain,
      allocations: [
        { walletAddress: alice.address, amountRaw: ethers.MaxUint256.toString() },
        { walletAddress: bob.address, amountRaw: ethers.MaxUint256.toString() },
      ],
    })).to.throw('totalAllocatedRaw exceeds uint256');
  });

  it('writes the output atomically without leaving a temporary file', async function () {
    const [alice] = await ethers.getSigners();
    const manifest = generateRewardsMerkle({
      periodId: 'atomic-output',
      ...(await domain()),
      allocations: [{ walletAddress: alice.address, amountRaw: '1' }],
    });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cukies-rewards-merkle-'));
    const outputPath = path.join(directory, 'manifest.json');

    try {
      expect(writeJsonAtomically(outputPath, manifest)).to.equal(outputPath);
      expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).to.deep.equal(manifest);
      expect(fs.readdirSync(directory)).to.deep.equal(['manifest.json']);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('executes the CommonJS CLI with the documented input and output arguments', async function () {
    const [alice] = await ethers.getSigners();
    const input = {
      periodId: 'cli-output',
      ...(await domain()),
      allocations: [{ walletAddress: alice.address, amountRaw: '5' }],
    };
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cukies-rewards-cli-'));
    const inputPath = path.join(directory, 'input.json');
    const outputPath = path.join(directory, 'output.json');
    const cliPath = path.resolve(__dirname, '../scripts/generate-rewards-merkle.cjs');

    try {
      fs.writeFileSync(inputPath, JSON.stringify(input), 'utf8');
      const result = spawnSync(
        process.execPath,
        [cliPath, '--', '--input', inputPath, '--output', outputPath],
        { encoding: 'utf8' }
      );

      expect(result.status, result.stderr).to.equal(0);
      expect(result.stdout).to.include(`Rewards Merkle manifest written to ${outputPath}`);
      expect(JSON.parse(fs.readFileSync(outputPath, 'utf8')))
        .to.deep.equal(generateRewardsMerkle(input));
      expect(fs.readdirSync(directory).sort()).to.deep.equal(['input.json', 'output.json']);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
