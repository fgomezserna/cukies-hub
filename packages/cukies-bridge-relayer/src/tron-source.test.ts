import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BridgeRelayerConfig } from './config.js';
import {
  parseConfirmedBridgeRequest,
  TronGridBridgeRequestSource,
} from './tron-source.js';

function bridgeEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_name: 'JumpInBridge',
    transaction_id: 'aa'.repeat(32),
    block_number: 123,
    block_timestamp: 1_788_000_000_000,
    event_index: 2,
    result: {
      tokenId: '1000000002279',
      originOwner: '41' + '11'.repeat(20),
      destOwner: '0x' + '0'.repeat(24) + '22'.repeat(20),
      network: '1',
    },
    ...overrides,
  };
}

describe('parseConfirmedBridgeRequest', () => {
  it('normaliza el evento JumpInBridge confirmado de TRON mainnet', () => {
    const request = parseConfirmedBridgeRequest(bridgeEvent());

    assert.match(request.transferId, /^0x[0-9a-f]{64}$/);
    assert.equal(request.destinationOwner, `0x${'22'.repeat(20)}`);
    assert.equal(request.sourceOwner, '41' + '11'.repeat(20));
    assert.equal(request.sourceTxHash, 'aa'.repeat(32));
    assert.equal(request.tokenId, '1000000002279');
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
            transaction_id: 'bb'.repeat(32),
            block_timestamp: 1_788_000_000_100,
            result: { tokenId: '' },
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
    assert.equal(parsedUrl.searchParams.get('event_name'), 'JumpInBridge');
    assert.equal(result.requests.length, 1);
    assert.equal(result.invalidEvents.length, 1);
    assert.equal(result.invalidEvents[0]?.sourceTxHash, 'bb'.repeat(32));
    assert.equal(result.nextCursor.nextTimestampMs, 1_788_000_000_101);
  });

  it('rechaza un destino cero y cualquier red distinta de BSC mainnet', () => {
    const base = {
      event_name: 'JumpInBridge',
      transaction_id: 'aa'.repeat(32),
      block_number: 123,
      block_timestamp: 1_788_000_000_000,
      event_index: 2,
      result: {
        tokenId: '1000000002279',
        originOwner: '41' + '11'.repeat(20),
        destOwner: '0x' + '0'.repeat(24) + '22'.repeat(20),
        network: '1',
      },
    };
    assert.throws(
      () => parseConfirmedBridgeRequest({
        ...base,
        result: { ...base.result, destOwner: '0x' + '0'.repeat(64) },
      }),
      /destOwner invalido/,
    );
    assert.throws(
      () => parseConfirmedBridgeRequest({
        ...base,
        result: { ...base.result, network: '0' },
      }),
      /BSC mainnet/,
    );
  });
});
