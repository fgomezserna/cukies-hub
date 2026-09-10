export class IslandServerConnectionDto {
  connectionUrl: string;
  ip: string;
  port: number;
  islandId: string;
  sessionId: string;
  joinToken?: string;
  islandPermissionToken?: string;
  islandRole?: string;
  islandPermissions?: string[];
  canHarvest?: boolean;
  canBuild?: boolean;
  canManageAccess?: boolean;
  status: string;
  fleet: string;
  gameServerName: string;
  message?: string;
}
