import { ServiceUnavailableException } from '@nestjs/common';
import { WorldWriteGateGuard } from './write-gate';

const context = (method: string) => ({ switchToHttp: () => ({ getRequest: () => ({ method }) }) }) as any;

describe('World write gate', () => {
  const config = { gameWritesEnabled: false } as any;
  it.each(['GET', 'HEAD', 'OPTIONS'])('allows %s while writes are disabled', (method) => {
    expect(new WorldWriteGateGuard(config).canActivate(context(method))).toBe(true);
  });
  it('returns identifiable 503 for mutations while disabled', () => {
    expect(() => new WorldWriteGateGuard(config).canActivate(context('POST'))).toThrow(ServiceUnavailableException);
  });
});
