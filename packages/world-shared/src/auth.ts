import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { WorldConfig } from './config';

export interface WorldClaims extends JwtPayload {
  sub: string;
  scope?: string | string[];
  kind?: 'world-session';
  env?: string;
  namespace?: string;
}

const JWT_TRANSPORT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const strictToken = (value: string): string => {
  const token = value.trim();
  if (!JWT_TRANSPORT.test(token)) throw new UnauthorizedException('Malformed World session');
  return token;
};

export function extractToken(request: { headers?: Record<string, unknown>; cookies?: Record<string, unknown> }): string | undefined {
  const header = request.headers?.authorization;
  if (header !== undefined) {
    if (typeof header !== 'string' || !/^Bearer\s+[^\s]+$/i.test(header)) throw new UnauthorizedException('Malformed Authorization header');
    return strictToken(header.slice(7));
  }
  const cookie = request.cookies?.token;
  if (typeof cookie !== 'string' || cookie.trim().length === 0) return undefined;
  const value = cookie.trim();
  if (/^Bearer\s+/i.test(value)) {
    if (!/^Bearer\s+[^\s]+$/i.test(value)) throw new UnauthorizedException('Malformed World session cookie');
    return strictToken(value.slice(7));
  }
  return strictToken(value);
}

export function verifyWorldToken(token: string | undefined, config: WorldConfig, requiredScope?: string): WorldClaims {
  if (!token) throw new UnauthorizedException('World session required');
  let claims: WorldClaims;
  try {
    claims = jwt.verify(token, config.sessionSecret, {
      algorithms: ['HS256'], issuer: config.sessionIssuer, audience: config.sessionAudience,
    }) as WorldClaims;
  } catch { throw new UnauthorizedException('Invalid World session'); }
  const now = Math.floor(Date.now() / 1000);
  if (!claims.sub || !/^[a-f\d]{24}$/i.test(claims.sub) || claims.kind !== 'world-session' || claims.env !== config.appEnv || claims.namespace !== config.namespace || typeof claims.exp !== 'number' || typeof claims.iat !== 'number' || claims.iat > now || claims.exp <= now || claims.exp <= claims.iat || claims.exp - claims.iat > config.sessionMaxTtlSeconds || Object.prototype.hasOwnProperty.call(claims, 'role')) {
    throw new UnauthorizedException('Invalid World identity');
  }
  if (requiredScope) {
    const scopes = Array.isArray(claims.scope)
      ? claims.scope.filter((scope): scope is string => typeof scope === 'string')
      : typeof claims.scope === 'string'
        ? claims.scope.split(' ').filter(Boolean)
        : [];
    if (!scopes.includes(requiredScope)) throw new ForbiddenException('World scope required');
  }
  return claims;
}

export function signWorldToken(subject: string, config: WorldConfig, scopes: string[] = [], options?: SignOptions): string {
  if (!/^[a-f\d]{24}$/i.test(subject)) throw new Error('World subject must be an ObjectId');
  return jwt.sign({ sub: subject, kind: 'world-session', env: config.appEnv, namespace: config.namespace, scope: scopes }, config.sessionSecret, {
    ...options,
    algorithm: 'HS256', issuer: config.sessionIssuer, audience: config.sessionAudience,
    expiresIn: options?.expiresIn ?? config.sessionExpiresIn as SignOptions['expiresIn'],
  });
}
