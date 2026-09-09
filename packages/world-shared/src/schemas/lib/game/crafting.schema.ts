import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type CraftingDocument = Crafting & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class Crafting {
  @Prop([
    {
      type: {
        item: {
          type: String,
          default: [],
          ref: 'Item',
        },
        amount: {
          type: Number,
          default: 0,
        },
      },
      default: [],
    },
  ])
  requirements!: {
    item: string;
    amount: number;
  }[];

  @Prop([
    {
      type: {
        item: {
          type: String,
          default: [],
          ref: 'Item',
        },
        amount: {
          type: Number,
          default: 0,
        },
      },
      default: [],
    },
  ])
  result!: {
    item: string;
    amount: number;
  }[];
}

export const CraftingSchema = SchemaFactory.createForClass(Crafting);
