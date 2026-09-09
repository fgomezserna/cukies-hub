import { extractToken, matchmakingEnv, verifyWorldToken } from '@cukies/world-shared';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const claims = verifyWorldToken(extractToken(request), matchmakingEnv, 'player');
    request.user = claims;
    request.query = { ...(request.query ?? {}), userId: claims.sub };
    return true;
  }
}
