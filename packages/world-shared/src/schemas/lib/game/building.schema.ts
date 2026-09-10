import { Document, Schema as MongooseSchema } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type BuildingDocument = Building & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
})
export class Building {
  @Prop({
    type: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    default: { x: 0, y: 0 },
  })
  size!: { x: number; y: number };

  @Prop([{ type: Number, required: true }])
  orientation!: number[];

  @Prop({ type: Number, default: 1, required: true })
  tier!: number;

  @Prop([
    {
      type: {
        item: {
          type: String,
          default: '',
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
  resources!: {
    item: string;
    amount: number;
  }[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Building' })
  child?: string;
}

export const BuildingSchema = SchemaFactory.createForClass(Building);
