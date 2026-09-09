import { IInventoryItem } from '../../../interfaces';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Document } from 'mongoose';

const ItemContentType = {
  id: {
    type: String,
    default: '',
  },
  slot: {
    type: Number,
    default: 0,
  },
  amount: {
    type: Number,
    default: 0,
  },
  durability: {
    type: Number,
    default: 0,
  },
};

export type InventoryDocument = Inventory & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
  optimisticConcurrency: true,
})
export class Inventory {
  @Prop([
    {
      type: ItemContentType,
      default: [],
    },
  ])
  content!: IInventoryItem[];

  @Prop({
    type: {
      armour: {
        head: ItemContentType,
        body: ItemContentType,
        feet: ItemContentType,
        hands: ItemContentType,
        face: ItemContentType,
        back: ItemContentType,
      },
      tool: {
        rightHand: ItemContentType,
        leftHand: ItemContentType,
      },
    },
  })
  equipment!: {
    armour: {
      head: IInventoryItem;
      body: IInventoryItem;
      feet: IInventoryItem;
      hands: IInventoryItem;
      face: IInventoryItem;
      back: IInventoryItem;
    };
    tool: {
      rightHand: IInventoryItem;
      leftHand: IInventoryItem;
    };
  };

  @Prop({ type: Number, required: true })
  slots!: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  user!: string;

  @Prop({ type: String, ref: 'Cukie' })
  cuki!: string;
}

export const InventorySchema = SchemaFactory.createForClass(Inventory);
