import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BridgeRelayerConfig } from './config.js';
import {
  parseConfirmedBridgeRequest,
  TronGridBridgeRequestSource,
} from './tron-source.js';

function bridgeEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_name: 'BridgeRequested',
    transaction_id: 'tron-tx-1',
    block_number: 123,
    block_timestamp: 1_788_000_000_000,
    event_index: 2,
    result: {
      transferId: '11'.repeat(32),
      tokenId: '1000000002279',
      sourceOwner: 'TSource1111111111111111111111111111',
      destinationOwner: '0'.repeat(24) + '22'.repeat(20),
      sourceNetwork: '0',
      destinationNetwork: '1',
      nonce: '4',
      metadataHash: '33'.repeat(32),
    },
    ...overrides,
  };
}

describe('parseConfirmedBridgeRequest', () => {
  it('normaliza bytes32, bytes20 y evidencia confirmada de Nile', () => {
    const request = parseConfirmedBridgeRequest(bridgeEvent());

    assert.equal(request.transferId, `0x${'11'.repeat(32)}`);
    assert.equal(request.destinationOwner, `0x${'22'.repeat(20)}`);
    assert.equal(request.metadataHash, `0x${'33'.repeat(32)}`);
    assert.equal(request.sourceNetwork, 0);
    assert.equal(request.destinationNetwork, 1);
  });

  it('consulta solo eventos confirmados y avanza incluso al mandar un evento invalido a DLQ', async () => {
    let requestedUrl = '';
    const source = new TronGridBridgeRequestSource({
      tronApiBaseUrl: 'https://nile.trongrid.io/v1',
      tronEndpointAddress: 'TNileEndpoint',
      tronApiKey: null,
    } as BridgeRelayerConfig, async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        data: [
          bridgeEvent(),
          bridgeEvent({
            transaction_id: 'tron-tx-bad',
            block_timestamp: 1_788_000_000_100,
            result: { metadataHash: '0'.repeat(64) },
          }),
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await source.poll({
      nextTimestampMs: 1_788_000_000_000,
      fingerprint: null,
    });

    const parsedUrl = new URL(requestedUrl);
    assert.equal(parsedUrl.searchParams.get('only_confirmed'), 'true');
    assert.equal(parsedUrl.searchParams.get('event_name'), 'BridgeRequested');
    assert.equal(result.requests.length, 1);
    assert.equal(result.invalidEvents.length, 1);
    assert.equal(result.invalidEvents[0]?.sourceTxHash, 'tron-tx-bad');
    assert.equal(result.nextCursor.nextTimestampMs, 1_788_000_000_101);
  });

  it('rechaza metadata vacia, direccion cero y cualquier direccion de vuelta', () => {
    const base = {
      event_name: 'BridgeRequested',
      transaction_id: 'tron-tx-1',
      block_number: 123,
      block_timestamp: 1_788_000_000_000,
      result: {
        transferId: '11'.repeat(32),
        tokenId: '1000000002279',
        sourceOwner: 'TSource1111111111111111111111111111',
        destinationOwner: '22'.repeat(20),
        sourceNetwork: '0',
        destinationNetwork: '1',
        nonce: '4',
        metadataHash: '33'.repeat(32),
      },
    };
    assert.throws(
      () => parseConfirmedBridgeRequest({
        ...base,
        result: { ...base.result, metadataHash: '0'.repeat(64) },
      }),
      /metadataHash cero/,
    );
    assert.throws(
      () => parseConfirmedBridgeRequest({
        ...base,
        result: { ...base.result, destinationOwner: '0'.repeat(40) },
      }),
      /destinationOwner invalido/,
    );
    assert.throws(
      () => parseConfirmedBridgeRequest({
        ...base,
        result: { ...base.result, sourceNetwork: '1', destinationNetwork: '0' },
      }),
      /TRON Nile -> BSC Testnet/,
    );
  });
});
