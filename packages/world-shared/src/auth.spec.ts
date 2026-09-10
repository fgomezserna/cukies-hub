import { UnauthorizedException } from '@nestjs/common';
import { extractToken, readWorldConfig, signWorldToken, verifyWorldToken } from './index';

describe('World session contract', () => {
  const config = readWorldConfig('api', { test: true });
  const subject = '0123456789abcdef01234567';

  it('requires a new namespaced token with bounded expiry and ObjectId subject', () => {
    const token = signWorldToken(subject, config, ['player']);
    expect(verifyWorldToken(token, config).sub).toBe(subject);
    expect(() => verifyWorldToken(signWorldToken('user-name' as string, config), config)).toThrow();
  });

  it('accepts strict bearer or raw JWT cookie transport', () => {
    const token = signWorldToken(subject, config);
    expect(extractToken({ headers: { authorization: `Bearer ${token}` }, cookies: {} })).toBe(token);
    expect(extractToken({ headers: {}, cookies: { token: `Bearer ${token}` } })).toBe(token);
    expect(extractToken({ headers: {}, cookies: { token } })).toBe(token);
    expect(() => extractToken({ headers: { authorization: token }, cookies: { token } })).toThrow(UnauthorizedException);
    expect(() => extractToken({ headers: {}, cookies: { token: 'not-a-jwt' } })).toThrow(UnauthorizedException);
  });

  it('rejects a token from another environment namespace', () => {
    const token = signWorldToken(subject, { ...config, namespace: 'other-world' });
    expect(() => verifyWorldToken(token, config)).toThrow(UnauthorizedException);
  });
});
