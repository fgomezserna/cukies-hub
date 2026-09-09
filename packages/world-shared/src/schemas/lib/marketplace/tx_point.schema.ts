import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type Tx_pointDocument = Tx_point & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
})
export class Tx_point {
  @Prop({ type: String })
  address!: string;

  @Prop({ type: Number })
  points!: number;

  @Prop({ type: String })
  type!: string;

  @Prop({ type: String })
  date!: string;

  @Prop({ type: String })
  txID!: string;

  @Prop({ type: String })
  network!: string;
}

export const Tx_pointSchema = SchemaFactory.createForClass(Tx_point);
