import * as mongoose from 'mongoose';

import { Document } from 'mongoose';

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type StatsDocument = Stats & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
})
export class Stats {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    unique: true,
    ref: 'User',
    required: true,
  })
  user!: string;

  @Prop({
    type: [
      {
        item: {
          type: String,
          required: true,
        },
        amount: { type: Number, required: true },
        operation: { type: String, required: true },
        cuki: { type: String, ref: 'Cukie' },
        date: { type: Date, required: true },
      },
    ],
  })
  itemHistory!: {
    item: string;
    amount: number;
    operation: string;
    cuki?: string;
    date: Date;
  }[];
}

export const StatsSchema = SchemaFactory.createForClass(Stats);
