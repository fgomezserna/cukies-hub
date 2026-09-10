import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { WorldConfig } from './config';

@Injectable()
export class WorldWriteGateGuard implements CanActivate {
  constructor(private readonly config: WorldConfig) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method?: string }>();
    if (['GET', 'HEAD', 'OPTIONS'].includes((request.method ?? 'GET').toUpperCase())) return true;
    if (!this.config.gameWritesEnabled) throw new ServiceUnavailableException('WORLD_GAME_WRITES_ENABLED is disabled');
    return true;
  }
}
