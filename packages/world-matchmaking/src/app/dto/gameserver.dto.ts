export class GameServerDto {
  name: string;
  namespace: string;
  labels: {
    'agones.dev/fleet': string;
    'agones.dev/gameserverset': string;
  };
  addr: string;
  port: number;
  state: string;
  node_name: string;
  players: {
    capacity: number;
    count: number;
  };
}
