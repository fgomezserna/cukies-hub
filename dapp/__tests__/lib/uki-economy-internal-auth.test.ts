import {
  ECONOMY_INTERNAL_MAX_BODY_BYTES,
  InternalEconomyAuthError,
  buildInternalEconomyCanonicalRequest,
  createMongoInternalEconomyNonceRepository,
  loadGameEconomyAuthConfig,
  loadInternalEconomyAuthConfig,
  readLimitedInternalEconomyRequestBody,
  signInternalEconomyRequest,
  verifyAndConsumeInternalEconomyRequest,
  type InternalEconomyNonceDocument,
  type InternalEconomyNonceRepository,
} from '@/lib/uki-economy/internal-auth';
import type { Db } from 'mongodb';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';

const NOW = new Date('2026-07-10T12:00:00.000Z');
const STRONG_SECRET = 'B7!qL2@zN9#vR4$xC8%mK5&wT1*eY6+pD3=sH0_uF7-jS2.a';
const TestReadableStream = NodeReadableStream as unknown as typeof globalThis.ReadableStream;

function config() {
  return loadInternalEconomyAuthConfig({
    ECONOMY_INTERNAL_HMAC_KEY_ID: 'game-backend-2026-01',
    ECONOMY_INTERNAL_HMAC_SECRET: STRONG_SECRET,
    ECONOMY_INTERNAL_HMAC_MAX_SKEW_MS: '30000',
    ECONOMY_INTERNAL_HMAC_NONCE_TTL_MS: '600000',
  });
}

class MemoryNonces implements InternalEconomyNonceRepository {
  readonly documents = new Map<string, InternalEconomyNonceDocument>();
  failNext = false;

  async consume(document: InternalEconomyNonceDocument) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('mongo unavailable');
    }
    if (this.documents.has(document._id)) return false;
    this.documents.set(document._id, document);
    return true;
  }
}

function unsigned(overrides: Partial<{
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  keyId: string;
  rawBody: string;
}> = {}) {
  return {
    method: 'POST',
    path: '/api/economy/v1/internal/credits/reservations?game=treasure-hunt',
    timestamp: String(NOW.getTime()),
    nonce: '0123456789abcdef0123456789abcdef',
    keyId: 'game-backend-2026-01',
    rawBody: '{"externalSessionId":"game-1","costCode":"treasure-hunt"}',
    ...overrides,
  };
}

function expectAuthError(error: unknown, code: InternalEconomyAuthError['code']) {
  expect(error).toBeInstanceOf(InternalEconomyAuthError);
  expect((error as InternalEconomyAuthError).code).toBe(code);
}

describe('economy internal HMAC auth', () => {
  it('fails closed without an explicit strong server-side key', () => {
    expect(() => loadInternalEconomyAuthConfig({})).toThrow(InternalEconomyAuthError);
    expect(() => loadInternalEconomyAuthConfig({
      ECONOMY_INTERNAL_HMAC_KEY_ID: 'key-1',
      ECONOMY_INTERNAL_HMAC_SECRET: 'short',
    })).toThrow('al menos 32 bytes');
    expect(() => loadInternalEconomyAuthConfig({
      ECONOMY_INTERNAL_HMAC_KEY_ID: 'key-1',
      ECONOMY_INTERNAL_HMAC_SECRET: STRONG_SECRET,
      NEXT_PUBLIC_OTHER_SECRET: `  ${STRONG_SECRET}  `,
    })).toThrow('no puede reutilizar');
    expect(() => loadInternalEconomyAuthConfig({
      ECONOMY_INTERNAL_HMAC_KEY_ID: 'key-1',
      ECONOMY_INTERNAL_HMAC_SECRET: 'a'.repeat(64),
    })).toThrow('predecible');
    expect(() => loadInternalEconomyAuthConfig({
      ECONOMY_INTERNAL_HMAC_KEY_ID: 'key-1',
      ECONOMY_INTERNAL_HMAC_SECRET: STRONG_SECRET,
      ECONOMY_INTERNAL_HMAC_MAX_SKEW_MS: '30000',
      ECONOMY_INTERNAL_HMAC_NONCE_TTL_MS: '60000',
    })).toThrow('dos veces');
  });

  it('requires a dedicated game-server credential distinct from admin', () => {
    expect(() => loadGameEconomyAuthConfig({
      ECONOMY_GAMES_HMAC_KEY_ID: 'games-v1',
      ECONOMY_GAMES_HMAC_SECRET: STRONG_SECRET,
      ECONOMY_INTERNAL_HMAC_SECRET: STRONG_SECRET,
    })).toThrow('distinta');
    expect(loadGameEconomyAuthConfig({
      ECONOMY_GAMES_HMAC_KEY_ID: 'games-v1',
      ECONOMY_GAMES_HMAC_SECRET: `${STRONG_SECRET}-games`,
      ECONOMY_INTERNAL_HMAC_SECRET: STRONG_SECRET,
    }).keyId).toBe('games-v1');
  });

  it('builds a domain-separated deterministic canonical request', () => {
    const request = unsigned();
    const bodyHash = signInternalEconomyRequest(request, config()).bodyHash;
    expect(buildInternalEconomyCanonicalRequest({ ...request, bodyHash })).toBe([
      'cukies-economy-hmac-v1',
      request.keyId,
      request.method,
      request.path,
      request.timestamp,
      request.nonce,
      bodyHash,
    ].join('\n'));
  });

  it('verifies the raw body and consumes a hashed nonce exactly once', async () => {
    const request = unsigned();
    const signed = signInternalEconomyRequest(request, config());
    const nonces = new MemoryNonces();
    const authenticated = await verifyAndConsumeInternalEconomyRequest({
      request: { ...request, signature: signed.signature },
      config: config(),
      nonces,
      now: NOW,
    });

    expect(authenticated.bodyHash).toBe(signed.bodyHash);
    expect(authenticated.requestHash).toBe(signed.requestHash);
    expect(authenticated.nonceHash).not.toContain(request.nonce);
    expect(nonces.documents.size).toBe(1);

    try {
      await verifyAndConsumeInternalEconomyRequest({
        request: { ...request, signature: signed.signature },
        config: config(),
        nonces,
        now: NOW,
      });
      throw new Error('expected replay rejection');
    } catch (error) {
      expectAuthError(error, 'REPLAYED_REQUEST');
    }
  });

  it('rejects body, path, method, key and signature tampering', async () => {
    const request = unsigned();
    const signed = signInternalEconomyRequest(request, config());
    const tampered = [
      { ...request, rawBody: '{}', signature: signed.signature },
      { ...request, path: `${request.path}&admin=true`, signature: signed.signature },
      { ...request, method: 'PUT', signature: signed.signature },
      { ...request, keyId: 'other-key', signature: signed.signature },
      { ...request, signature: `v1=${'0'.repeat(64)}` },
    ];

    for (const candidate of tampered) {
      await expect(verifyAndConsumeInternalEconomyRequest({
        request: candidate,
        config: config(),
        nonces: new MemoryNonces(),
        now: NOW,
      })).rejects.toBeInstanceOf(InternalEconomyAuthError);
    }
  });

  it('rejects stale and future requests outside the symmetric clock window', async () => {
    for (const timestamp of [NOW.getTime() - 30_001, NOW.getTime() + 30_001]) {
      const request = unsigned({ timestamp: String(timestamp) });
      const signed = signInternalEconomyRequest(request, config());
      try {
        await verifyAndConsumeInternalEconomyRequest({
          request: { ...request, signature: signed.signature },
          config: config(),
          nonces: new MemoryNonces(),
          now: NOW,
        });
        throw new Error('expected rejection');
      } catch (error) {
        expectAuthError(error, 'EXPIRED_REQUEST');
      }
    }
  });

  it('fails closed if nonce persistence is unavailable', async () => {
    const request = unsigned();
    const signed = signInternalEconomyRequest(request, config());
    const nonces = new MemoryNonces();
    nonces.failNext = true;

    await expect(verifyAndConsumeInternalEconomyRequest({
      request: { ...request, signature: signed.signature },
      config: config(),
      nonces,
      now: NOW,
    })).rejects.toThrow('mongo unavailable');
  });

  it('rejects oversized bodies, non-internal paths and malformed nonces', () => {
    expect(() => signInternalEconomyRequest(
      unsigned({ rawBody: 'x'.repeat(1024 * 1024 + 1) }),
      config(),
    )).toThrow('supera el limite');
    expect(() => signInternalEconomyRequest(
      unsigned({ path: '/api/games/end-session' }),
      config(),
    )).toThrow('Ruta interna invalida');
    expect(() => signInternalEconomyRequest(
      unsigned({ path: '/api/economy/v1/internal/credits/../admin' }),
      config(),
    )).toThrow('Ruta interna invalida');
    expect(() => signInternalEconomyRequest(
      unsigned({ nonce: 'short' }),
      config(),
    )).toThrow('Nonce base64url invalido');
    expect(() => signInternalEconomyRequest(
      unsigned({ nonce: '0123456789abcdef012345' }),
      config(),
    )).toThrow('128 bits');
  });

  it('enforces the body limit before materializing input and while streaming HTTP', async () => {
    const oversized = new Uint8Array(ECONOMY_INTERNAL_MAX_BODY_BYTES + 1);
    expect(() => signInternalEconomyRequest(
      { ...unsigned(), rawBody: oversized },
      config(),
    )).toThrow('supera el limite');

    const stream = new TestReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(ECONOMY_INTERNAL_MAX_BODY_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    await expect(readLimitedInternalEconomyRequestBody({
      headers: new Headers(),
      body: stream as unknown as Pick<Request, 'body'>['body'],
    })).rejects.toThrow('supera el limite');
    await expect(readLimitedInternalEconomyRequestBody({
      headers: new Headers({ 'content-length': String(ECONOMY_INTERNAL_MAX_BODY_BYTES + 1) }),
      body: null,
    })).rejects.toThrow('supera el limite');
  });

  it('persists nonce consumption with majority write concern', async () => {
    let options: unknown;
    const fakeDb = {
      collection: () => ({
        insertOne: async (_document: unknown, receivedOptions: unknown) => {
          options = receivedOptions;
        },
      }),
    } as unknown as Db;
    const repository = createMongoInternalEconomyNonceRepository(fakeDb);
    const document: InternalEconomyNonceDocument = {
      _id: '1'.repeat(64),
      keyId: 'key-1',
      nonceHash: '1'.repeat(64),
      requestHash: '2'.repeat(64),
      bodyHash: '3'.repeat(64),
      requestedAt: NOW,
      consumedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 60_001),
    };
    await expect(repository.consume(document)).resolves.toBe(true);
    expect(options).toEqual({ writeConcern: { w: 'majority' } });
  });
});
