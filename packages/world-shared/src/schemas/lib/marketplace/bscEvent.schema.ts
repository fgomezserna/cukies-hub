import * as mongoose from 'mongoose';

import { Document } from 'mongoose';

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type BscEventDocument = BscEvent & Document;

@Schema({ collection: 'bscContractEvents' })
export class BscEvent {
  @Prop()
  logIndex: string;
  @Prop()
  blockNumber: number;
  @Prop()
  address: string;
  @Prop()
  event: string;
  @Prop()
  transactionHash: string;
  @Prop({ type: mongoose.Schema.Types.Mixed })
  data;
  @Prop()
  timeStamp: number;
}

export const BscEventSchema = SchemaFactory.createForClass(BscEvent);
