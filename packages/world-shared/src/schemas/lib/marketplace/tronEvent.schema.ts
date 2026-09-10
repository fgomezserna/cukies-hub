import * as mongoose from 'mongoose';

import { Document } from 'mongoose';

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type TronEventDocument = TronEvent & Document;

@Schema({ collection: 'contractevent' })
export class TronEvent {
  @Prop()
  timeStamp: number;
  @Prop()
  triggerName: string;
  @Prop()
  uniqueId: string;
  @Prop()
  transactionId: string;
  @Prop()
  contractAddress: string;
  @Prop()
  callerAddress: string;
  @Prop()
  originAddress: string;
  @Prop()
  creatorAddress: string;
  @Prop()
  blockNumber: number;
  @Prop()
  blockHash: string;
  @Prop()
  removed: boolean;
  @Prop()
  latestSolidifiedBlockNumber: number;
  @Prop()
  logInfo: string;
  @Prop()
  abi: string;
  @Prop()
  eventSignature: string;
  @Prop()
  eventSignatureFull: string;
  @Prop()
  eventName: string;
  @Prop({ type: mongoose.Schema.Types.Mixed })
  topicMap;
  @Prop({ type: mongoose.Schema.Types.Mixed })
  dataMap;
}

export const TronEventSchema = SchemaFactory.createForClass(TronEvent);
