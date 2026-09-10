export interface IInGameStats {
  xp: {
    miner: number;
    engineer: number;
    farmer: number;
    gatherer: number;
    scout: number;
    breeder: number;
    life: number;
    energy: number;
    generation: number;
  };
  life: number;
  energy: number;
}

export interface ISkills {
  miner: number;
  engineer: number;
  farmer: number;
  gatherer: number;
  scout: number;
  breeder: number;
  life: number;
  energy: number;
  generation: number;
}

export interface IInventoryItem {
  id: string;
  amount: number;
  slot: number;
  durability: number;
}
