import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  fallback,
  http,
  type Address,
  type Hash,
  type Log,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

import type { BridgeRelayerConfig } from './config.js';
import { AmbiguousBridgeSubmissionError } from './types.js';
import type {
  BridgeMetadata,
  BridgeReconciliation,
  BscBridgeDestination,
  ConfirmedBridgeRequest,
  SubmissionInspection,
} from './types.js';

/** ABI of the deployed legacy CukiesNFTBridge, not CukiesBridgeEndpoint. */
export const legacyBridgeAbi = [
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'jumpOutBridge',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'destOwner', type: 'address' },
      { name: 'typeId', type: 'uint256' },
      { name: 'generation', type: 'uint256' },
      { name: 'skills', type: 'uint8[6]' },
      { name: 'energy', type: 'uint8' },
      { name: 'health', type: 'uint8' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'JumpOutBridge',
    anonymous: false,
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: false },
      { name: 'destOwner', type: 'address', indexed: false },
      { name: 'createdAt', type: 'uint256', indexed: false },
    ],
  },
] as const;

const collectionAbi = [{
  type: 'function',
  name: 'ownerOf',
  stateMutability: 'view',
  inputs: [{ name: 'tokenId', type: 'uint256' }],
  outputs: [{ name: '', type: 'address' }],
}, {
  type: 'function',
  name: 'isMinter',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const;

function isReceiptMissing(error: unknown) {
  return error instanceof Error && (
    error.name === 'TransactionReceiptNotFoundError'
    || error.message.includes('could not be found')
    || error.message.includes('TransactionReceiptNotFound')
  );
}

function eventSignature(log: Log) {
  return log.topics[0]?.toLowerCase();
}

const missingTokenReason = /(?:TRC721|ERC721): owner query for nonexistent token|(?:TRC721|ERC721): invalid token id/i;

/**
 * `ownerOf` is the existence probe exposed by the deployed legacy token.  A
 * contract revert for a missing id means "absent"; all other failures (RPC,
 * transport, malformed response, etc.) are indeterminate and must bubble up
 * so the engine cannot accidentally submit a mint.
 */
export function isMissingTokenOwnerOfError(error: unknown) {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    if (
      (current instanceof ContractFunctionExecutionError
        || current instanceof ContractFunctionRevertedError)
      && missingTokenReason.test(
        [
          'shortMessage' in current ? current.shortMessage : '',
          'message' in current ? current.message : '',
        ].join(' '),
      )
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}

/**
 * Decode only logs emitted by the configured bridge and return an exact
 * token/destination match.  Any missing or malformed event is ambiguous: a
 * successful receipt without the legacy event must never be treated as proof
 * that the mint happened.
 */
function hasMatchingJumpOut(
  logs: readonly Log[],
  bridgeAddress: Address,
  request: ConfirmedBridgeRequest,
) {
  let found = false;
  for (const log of logs) {
    if (log.address.toLowerCase() !== bridgeAddress.toLowerCase()) continue;
    if (!eventSignature(log)) continue;
    try {
      const decoded = decodeEventLog({
        abi: legacyBridgeAbi,
        data: log.data,
        topics: log.topics,
        strict: false,
      });
      if (decoded.eventName !== 'JumpOutBridge') continue;
      const args = decoded.args as readonly [bigint, Address, bigint] | {
        tokenId?: bigint;
        destOwner?: Address;
      };
      const tokenId: bigint | undefined = Array.isArray(args)
        ? args[0]
        : (args as { tokenId?: bigint }).tokenId;
      const destOwner: Address | undefined = Array.isArray(args)
        ? args[1]
        : (args as { destOwner?: Address }).destOwner;
      if (
        tokenId !== undefined
        && destOwner !== undefined
        && tokenId === BigInt(request.tokenId)
        && destOwner.toLowerCase() === request.destinationOwner.toLowerCase()
      ) {
        found = true;
      }
    } catch {
      // A log with the right address but invalid ABI is not positive evidence.
    }
  }
  return found;
}

export class ViemBscBridgeDestination implements BscBridgeDestination {
  private readonly account;
  private readonly publicClient;
  private readonly walletClient;

  constructor(private readonly config: BridgeRelayerConfig) {
    this.account = privateKeyToAccount(config.bscRelayerPrivateKey);
    if (this.account.address.toLowerCase() !== config.bscExpectedSignerAddress.toLowerCase()) {
      throw new Error('La private key no coincide con la address signer configurada.');
    }
    const transport = fallback(
      config.bscRpcUrls.map((rpcUrl) => http(rpcUrl, {
        retryCount: 1,
        timeout: 8_000,
      })),
      { rank: true },
    );
    this.publicClient = createPublicClient({ chain: bsc, transport });
    this.walletClient = createWalletClient({
      account: this.account,
      chain: bsc,
      transport,
    });
  }

  async assertMainnet() {
    const chainId = await this.publicClient.getChainId();
    if (chainId !== 56 || this.config.bscChainId !== 56) {
      throw new Error(`RPC BSC incorrecto: se esperaba chain 56 y llego ${chainId}.`);
    }
    const [owner, bridgeIsMinter] = await Promise.all([
      this.publicClient.readContract({
        address: this.config.bscBridgeAddress,
        abi: legacyBridgeAbi,
        functionName: 'owner',
      }),
      this.publicClient.readContract({
        address: this.config.bscCollectionAddress,
        abi: collectionAbi,
        functionName: 'isMinter',
        args: [this.config.bscBridgeAddress],
      }),
    ]);
    if (owner.toLowerCase() !== this.account.address.toLowerCase()) {
      throw new Error('El signer BSC no es owner() del bridge legacy.');
    }
    if (!bridgeIsMinter) {
      throw new Error('El bridge BSC no tiene el rol minter del NFT legacy.');
    }
  }

  async tokenExists(request: ConfirmedBridgeRequest) {
    return (await this.ownerOfOrNull(request.tokenId)) !== null;
  }

  async submit(request: ConfirmedBridgeRequest, metadata: BridgeMetadata) {
    const simulation = await this.publicClient.simulateContract({
      account: this.account,
      address: this.config.bscBridgeAddress,
      abi: legacyBridgeAbi,
      functionName: 'jumpOutBridge',
      args: [
        request.destinationOwner,
        metadata.typeId,
        metadata.generation,
        metadata.skills.map((value) => Number(value)) as [number, number, number, number, number, number],
        Number(metadata.energy),
        Number(metadata.health),
        BigInt(request.tokenId),
      ],
    });
    try {
      return await this.walletClient.writeContract(simulation.request);
    } catch (error) {
      // Once a write is handed to the wallet/RPC we cannot prove whether the
      // node broadcast it before the response was lost. Never let the engine
      // retry this request automatically and risk a duplicate mint.
      throw new AmbiguousBridgeSubmissionError(
        `No se pudo obtener el hash del mint BSC; requiere revision manual: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }

  async inspect(
    txHash: Hash,
    request: ConfirmedBridgeRequest,
  ): Promise<SubmissionInspection> {
    let receipt;
    try {
      receipt = await this.publicClient.getTransactionReceipt({ hash: txHash });
    } catch (error) {
      if (isReceiptMissing(error)) return { state: 'pending' };
      throw error;
    }
    const blockNumber = Number(receipt.blockNumber);
    if (receipt.status === 'reverted') return { state: 'reverted', blockNumber };
    const head = await this.publicClient.getBlockNumber();
    const confirmations = head - receipt.blockNumber + 1n;
    if (confirmations < BigInt(this.config.bscConfirmations)) {
      return { state: 'pending' };
    }
    const jumpOutObserved = hasMatchingJumpOut(
      receipt.logs,
      this.config.bscBridgeAddress,
      request,
    );
    if (!jumpOutObserved) {
      return {
        state: 'ambiguous',
        blockNumber,
        reason: 'Receipt confirmado sin JumpOutBridge legacy coincidente.',
      };
    }
    const destinationOwner = await this.ownerOfOrNull(request.tokenId);
    if (!destinationOwner || destinationOwner.toLowerCase() !== request.destinationOwner.toLowerCase()) {
      return {
        state: 'ambiguous',
        blockNumber,
        reason: 'JumpOutBridge observado pero ownerOf no coincide con destOwner.',
      };
    }
    return {
      state: 'confirmed',
      jumpOutObserved: true,
      destinationOwner,
      blockNumber,
    };
  }

  async reconcile(request: ConfirmedBridgeRequest): Promise<BridgeReconciliation> {
    const [destinationOwner, blockNumber] = await Promise.all([
      this.ownerOfOrNull(request.tokenId),
      this.publicClient.getBlockNumber(),
    ]);
    // Without a transaction receipt, ownership alone cannot prove that this
    // relayer performed the mint. The engine therefore only completes when it
    // has the matching JumpOutBridge receipt as well.
    return {
      destinationOwner,
      jumpOutObserved: false,
      blockNumber: Number(blockNumber),
    };
  }

  private async ownerOf(tokenId: string): Promise<Address> {
    return this.publicClient.readContract({
      address: this.config.bscCollectionAddress,
      abi: collectionAbi,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    });
  }

  private async ownerOfOrNull(tokenId: string): Promise<Address | null> {
    try {
      return await this.ownerOf(tokenId);
    } catch (error) {
      if (!isMissingTokenOwnerOfError(error)) throw error;
      return null;
    }
  }
}
