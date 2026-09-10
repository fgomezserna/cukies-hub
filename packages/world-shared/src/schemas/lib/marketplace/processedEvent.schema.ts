import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
export type ProcessedEventDocument = ProcessedEvent & Document;

@Schema({
  collection: 'processedEvents',
  timestamps: true,
  collation: { locale: 'en', strength: 2 },
})
export class ProcessedEvent {
  @Prop({ type: String })
  _id!: string;

  @Prop({ type: String })
  contractAddress!: string;

  @Prop({ type: String, enum: ['TRON', 'BSC'] })
  network!: string;

  @Prop({ type: String })
  transactionId!: string;

  @Prop({ type: String })
  eventName!: string;

  @Prop({ type: Number })
  timeStamp!: number;

  @Prop({ type: Number })
  blockNumber!: number;

  @Prop({
    type: {
      tokenId: { type: String },
      destOwner: { type: String },
      originOwner: { type: String },
      createdAt: { type: Number },
      from: { type: String },
      to: { type: String },
      user: { type: String },
      points: { type: Number },
      date: { type: Number },
      parent1: { type: String },
      parent2: { type: String },
      newPrice: { type: Number },
      newFee: { type: Number },
      newOwner: { type: String },
      boughtAt: { type: Number },
      owner: { type: String },
      price: { type: Number },
      fee: { type: Number },
      network: { type: String },
      _id: { type: Number, default: 0 },
      result: { type: String },
    },
  })
  data!: {
    tokenId: string;
    destOwner: string;
    originOwner: string;
    createdAt: string;
    from: string;
    to: string;
    user: string;
    points: string;
    date: string;
    parent1: string;
    parent2: string;
    newPrice: string;
    newFee: string;
    newOwner: string;
    boughtAt: string;
    owner: string;
    price: string;
    fee: string;
    network: string;
    result: string;
  };
  // Este campo lo hemos creado para que ciertos eventos incoherentes no se muestren en la dapp para así no tener que borrarlos de la base de datos
  @Prop({ type: Boolean })
  hidden: boolean;

  @Prop({ type: String })
  createdAt: string;

  @Prop({ type: String })
  updatedAt: string;

  @Prop({ type: String })
  date: string;

  @Prop({ type: Boolean })
  processing: boolean;

  @Prop({ type: Boolean })
  processed: boolean;

  @Prop({ type: String })
  processingStarted: string;

  @Prop({ type: String })
  processedAt: string;
}

export const ProcessedEventSchema =
  SchemaFactory.createForClass(ProcessedEvent);
