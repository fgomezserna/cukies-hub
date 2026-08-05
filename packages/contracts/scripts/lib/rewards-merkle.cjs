const crypto = require('crypto');
const {
  AbiCoder,
  MaxUint256,
  ZeroAddress,
  ZeroHash,
  concat,
  getAddress,
  isHexString,
  keccak256,
  toUtf8Bytes,
} = require('ethers');

const abiCoder = AbiCoder.defaultAbiCoder();

function deriveBatchId(periodId) {
  if (typeof periodId !== 'string' || periodId.length === 0) {
    throw new Error('periodId must be a non-empty string');
  }
  return keccak256(toUtf8Bytes(periodId));
}

function normalizeBatchId(batchId) {
  if (typeof batchId !== 'string' || !isHexString(batchId, 32)) {
    throw new Error('batchId must be a bytes32 hex string');
  }

  const normalized = batchId.toLowerCase();
  if (normalized === ZeroHash) {
    throw new Error('batchId must not be zero');
  }
  return normalized;
}

function normalizeAmountRaw(amountRaw) {
  if (typeof amountRaw !== 'string' || !/^\d+$/.test(amountRaw)) {
    throw new Error('amountRaw must be a positive base-unit integer string');
  }

  const amount = BigInt(amountRaw);
  if (amount <= 0n) {
    throw new Error('amountRaw must be greater than zero');
  }
  if (amount > MaxUint256) {
    throw new Error('amountRaw exceeds uint256');
  }
  return amount.toString();
}

function normalizeChainId(chainId) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('chainId must be a positive safe integer');
  }
  return chainId;
}

function normalizeDistributorAddress(distributorAddress) {
  let normalized;
  try {
    normalized = getAddress(distributorAddress);
  } catch {
    throw new Error('distributorAddress is invalid');
  }
  if (normalized === ZeroAddress) {
    throw new Error('distributorAddress must not be zero');
  }
  return normalized;
}

function normalizeMetadata(metadata) {
  if (typeof metadata !== 'string' || metadata.trim().length === 0) {
    throw new Error('metadata must be a non-empty string');
  }
  return metadata;
}

function normalizeAllocations(allocations) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new Error('allocations must be a non-empty array');
  }

  const seenAddresses = new Set();
  const normalized = allocations.map((allocation, index) => {
    if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) {
      throw new Error(`allocations[${index}] must be an object`);
    }

    let walletAddress;
    try {
      walletAddress = getAddress(allocation.walletAddress);
    } catch {
      throw new Error(`allocations[${index}].walletAddress is invalid`);
    }
    if (walletAddress === ZeroAddress) {
      throw new Error(`allocations[${index}].walletAddress must not be zero`);
    }

    const addressKey = walletAddress.toLowerCase();
    if (seenAddresses.has(addressKey)) {
      throw new Error(`duplicate walletAddress: ${walletAddress}`);
    }
    seenAddresses.add(addressKey);

    return {
      walletAddress,
      amountRaw: normalizeAmountRaw(allocation.amountRaw),
    };
  });

  normalized.sort((left, right) => {
    const leftAddress = left.walletAddress.toLowerCase();
    const rightAddress = right.walletAddress.toLowerCase();
    return leftAddress < rightAddress ? -1 : leftAddress > rightAddress ? 1 : 0;
  });
  return normalized;
}

function leafHash(chainId, distributorAddress, batchId, walletAddress, amountRaw) {
  const innerHash = keccak256(
    abiCoder.encode(
      ['uint256', 'address', 'bytes32', 'address', 'uint256'],
      [chainId, distributorAddress, batchId, walletAddress, amountRaw]
    )
  );
  return keccak256(concat([innerHash]));
}

function hashPair(left, right) {
  const [first, second] = left.toLowerCase() <= right.toLowerCase()
    ? [left, right]
    : [right, left];
  return keccak256(concat([first, second]));
}

function buildMerkleLayers(leaves) {
  if (!Array.isArray(leaves) || leaves.length === 0) {
    throw new Error('at least one leaf is required');
  }

  const layers = [leaves.slice()];
  while (layers[layers.length - 1].length > 1) {
    const currentLayer = layers[layers.length - 1];
    const nextLayer = [];
    for (let index = 0; index < currentLayer.length; index += 2) {
      nextLayer.push(
        index + 1 < currentLayer.length
          ? hashPair(currentLayer[index], currentLayer[index + 1])
          : currentLayer[index]
      );
    }
    layers.push(nextLayer);
  }
  return layers;
}

function proofForIndex(layers, leafIndex) {
  const proof = [];
  let index = leafIndex;

  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    const layer = layers[layerIndex];
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    if (siblingIndex < layer.length) {
      proof.push(layer[siblingIndex]);
    }
    index = Math.floor(index / 2);
  }

  return proof;
}

function canonicalInputHash(canonicalInput) {
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalInput), 'utf8')
    .digest('hex');
  return `0x${digest}`;
}

function generateRewardsMerkle(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('input must be a JSON object');
  }

  const hasPeriodId = Object.prototype.hasOwnProperty.call(input, 'periodId');
  const hasBatchId = Object.prototype.hasOwnProperty.call(input, 'batchId');
  if (!hasPeriodId && !hasBatchId) {
    throw new Error('input must include periodId or batchId');
  }

  let periodId;
  let derivedBatchId;
  if (hasPeriodId) {
    periodId = input.periodId;
    derivedBatchId = deriveBatchId(periodId);
  }

  const providedBatchId = hasBatchId ? normalizeBatchId(input.batchId) : undefined;
  if (derivedBatchId && providedBatchId && derivedBatchId !== providedBatchId) {
    throw new Error('batchId does not match the periodId-derived batchId');
  }

  const batchId = providedBatchId || derivedBatchId;
  const chainId = normalizeChainId(input.chainId);
  const distributorAddress = normalizeDistributorAddress(input.distributorAddress);
  const metadata = normalizeMetadata(input.metadata);
  const metadataHash = keccak256(toUtf8Bytes(metadata));
  const allocations = normalizeAllocations(input.allocations);
  const leaves = allocations.map((allocation) =>
    leafHash(chainId, distributorAddress, batchId, allocation.walletAddress, allocation.amountRaw)
  );
  const layers = buildMerkleLayers(leaves);
  const totalAllocated = allocations.reduce(
    (total, allocation) => total + BigInt(allocation.amountRaw),
    0n
  );
  if (totalAllocated > MaxUint256) {
    throw new Error('totalAllocatedRaw exceeds uint256');
  }

  const canonicalInput = {
    batchId,
    ...(periodId !== undefined ? { periodId } : {}),
    chainId,
    distributorAddress,
    metadata,
    allocations,
  };

  return {
    batchId,
    ...(periodId !== undefined ? { periodId } : {}),
    chainId,
    distributorAddress,
    metadata,
    metadataHash,
    merkleRoot: layers[layers.length - 1][0],
    totalAllocatedRaw: totalAllocated.toString(),
    allocationCount: allocations.length,
    canonicalInputHash: canonicalInputHash(canonicalInput),
    allocations: allocations.map((allocation, index) => ({
      ...allocation,
      leaf: leaves[index],
      proof: proofForIndex(layers, index),
    })),
  };
}

module.exports = {
  buildMerkleLayers,
  canonicalInputHash,
  deriveBatchId,
  generateRewardsMerkle,
  hashPair,
  leafHash,
  normalizeAllocations,
  normalizeAmountRaw,
  normalizeBatchId,
  normalizeChainId,
  normalizeDistributorAddress,
  normalizeMetadata,
  proofForIndex,
};
