import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';

import type { BridgeRelayerConfig } from './config.js';
import type {
  BridgeMetadata,
  BridgeReconciliation,
  BscBridgeDestination,
  ConfirmedBridgeRequest,
  SubmissionInspection,
} from './types.js';

const endpointAbi = [
  {
    type: 'function',
    name: 'processedTransfers',
    stateMutability: 'view',
    inputs: [{ name: 'transferId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'completeBridge',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'transferId', type: 'bytes32' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'destinationOwner', type: 'address' },
      { name: 'sourceNetwork', type: 'uint8' },
      { name: 'sourceMetadataHash', type: 'bytes32' },
      {
        name: 'metadata',
        type: 'tuple',
        components: [
          { name: 'typeId', type: 'uint256' },
          { name: 'generation', type: 'uint256' },
          { name: 'skills', type: 'uint256[6]' },
          { name: 'energy', type: 'uint256' },
          { name: 'health', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const collectionAbi = [{
  type: 'function',
  name: 'ownerOf',
  stateMutability: 'view',
  inputs: [{ name: 'tokenId', type: 'uint256' }],
  outputs: [{ name: '', type: 'address' }],
}] as const;

function isReceiptMissing(error: unknown) {
  return error instanceof Error && (
    error.name === 'TransactionReceiptNotFoundError'
    || error.message.includes('could not be found')
    || error.message.includes('TransactionReceiptNotFound')
  );
}

export class ViemBscBridgeDestination implements BscBridgeDestination {
  private readonly account;
  private readonly publicClient;
  private readonly walletClient;

  constructor(private readonly config: BridgeRelayerConfig) {
    this.account = privateKeyToAccount(config.bscRelayerPrivateKey);
    const transport = http(config.bscRpcUrls[0]);
    this.publicClient = createPublicClient({ chain: bscTestnet, transport });
    this.walletClient = createWalletClient({
      account: this.account,
      chain: bscTestnet,
      transport,
    });
  }

  async assertTestnet() {
    const chainId = await this.publicClient.getChainId();
    if (chainId !== 97 || this.config.bscChainId !== 97) {
      throw new Error(`RPC BSC incorrecto: chainId ${chainId}.`);
    }
  }

  async isProcessed(transferId: Hash) {
    return this.publicClient.readContract({
      address: this.config.bscEndpointAddress,
      abi: endpointAbi,
      functionName: 'processedTransfers',
      args: [transferId],
    });
  }

  async submit(request: ConfirmedBridgeRequest, metadata: BridgeMetadata) {
    const simulation = await this.publicClient.simulateContract({
      account: this.account,
      address: this.config.bscEndpointAddress,
      abi: endpointAbi,
      functionName: 'completeBridge',
      args: [
        request.transferId,
        BigInt(request.tokenId),
        request.destinationOwner,
        request.sourceNetwork,
        request.metadataHash,
        metadata,
      ],
    });
    return this.walletClient.writeContract(simulation.request);
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
    const reconciliation = await this.reconcile(request);
    return { state: 'confirmed', ...reconciliation, blockNumber };
  }

  async reconcile(request: ConfirmedBridgeRequest): Promise<BridgeReconciliation> {
    const [processed, destinationOwner, blockNumber] = await Promise.all([
      this.isProcessed(request.transferId),
      this.ownerOf(request.tokenId),
      this.publicClient.getBlockNumber(),
    ]);
    return {
      processed,
      destinationOwner,
      blockNumber: Number(blockNumber),
    };
  }

  private async ownerOf(tokenId: string): Promise<Address | null> {
    try {
      return await this.publicClient.readContract({
        address: this.config.bscCollectionAddress,
        abi: collectionAbi,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      });
    } catch {
      return null;
    }
  }
}
