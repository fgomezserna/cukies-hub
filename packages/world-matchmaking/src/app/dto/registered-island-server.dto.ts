export class RegisterIslandServerDto {
  serverId: string;
  connectionUrl: string;
  islandId: string;
  sessionId?: string;
  joinToken: string;
  capacity?: number;
  count?: number;
  ttlSeconds?: number;
}

export class RegisteredIslandServerDto {
  serverId: string;
  connectionUrl: string;
  islandId: string;
  sessionId: string;
  capacity: number;
  count: number;
  pendingJoinCount?: number;
  availableSlots?: number | null;
  status: string;
  fleet: string;
  registeredAt: number;
  expiresAt: number;
}

export class HeartbeatIslandServerDto {
  capacity?: number;
  count?: number;
  status?: string;
  ttlSeconds?: number;
}

export class UnregisterIslandServerDto {
  serverId: string;
  deleted: boolean;
}
