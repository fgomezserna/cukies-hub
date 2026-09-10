/* import * as mongoose from "mongoose"; */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CukieDocument = Cukie & Document;
@Schema({
  collation: { locale: 'en', strength: 2 },
})
export class Cukie {
  @Prop({ type: String })
  _id!: string;

  @Prop({ type: Number })
  cukiNumber!: number;

  @Prop({ type: Number })
  type!: number;

  @Prop({ type: String })
  img!: string;

  @Prop({ type: String })
  user!: string;

  @Prop({ type: String, enum: ['mint', 'breed'] })
  origin!: string;

  @Prop({ type: String, enum: ['TRON', 'BSC'] })
  birthNetwork!: string;

  @Prop([{ type: String, default: null, ref: 'Cukie' }])
  parents!: string[] | null;

  @Prop({ type: String, enum: ['TRON', 'BSC'] })
  network!: string;

  @Prop([{ type: String, ref: 'Tx_nft' }])
  history!: string[] | null;

  @Prop([{ type: Number }])
  skinVariables!: number[];

  @Prop({
    type: {
      miner: { type: Number },
      engineer: { type: Number },
      farmer: { type: Number },
      gatherer: { type: Number },
      scout: { type: Number },
      breeder: { type: Number },
      life: { type: Number },
      energy: { type: Number },
      generation: { type: Number },
      _id: { type: Number, default: 0 },
    },
  })
  skills!: {
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

  // First element is the total experience, second element is the experience spent
  @Prop({
    type: {
      xp: {
        type: {
          miner: [{ type: Number }] /* [total, spent] */,
          engineer: [{ type: Number }],
          farmer: [{ type: Number }],
          gatherer: [{ type: Number }],
          scout: [{ type: Number }],
          breeder: [{ type: Number }],
          life: [{ type: Number }],
          energy: [{ type: Number }],
          generation: [{ type: Number }],
        },
      },
      life: { type: Number, default: 0 },
      energy: { type: Number, default: 0 },
    },
  })
  inGameStats?: {
    xp: {
      miner: number[];
      engineer: number[];
      farmer: number[];
      gatherer: number[];
      scout: number[];
      breeder: number[];
      life: number[];
      energy: number[];
      generation: number[];
    };
    life: number;
    energy: number;
  };

  @Prop([{ type: String, default: null, ref: 'Cukie' }])
  children!: string[] | null;

  @Prop({ type: Number })
  numChildren!: number;

  @Prop({ type: Number })
  numChildrenTron!: number;

  @Prop({ type: Number })
  numChildrenBsc!: number;

  @Prop({
    type: String,
    enum: ['available', 'onSale', 'breeding', 'staking', 'inBridge'],
  })
  state!: string;

  @Prop({ type: Number })
  price!: number;

  @Prop({ type: String })
  priceEther!: string;

  @Prop({ type: Number })
  timeStamp!: number;

  @Prop([
    {
      type: {
        category: { type: String, default: '' },
        timestamp: { type: Number, default: 0 },
      },
      default: [],
    },
  ])
  lastChanges?: {
    category: string;
    timestamp: number;
  }[];

  @Prop({ type: String })
  priceOriginal?: string;

  @Prop({ type: Number, default: 0 })
  cwTutorial?: number;
}

export const CukieSchema = SchemaFactory.createForClass(Cukie);
