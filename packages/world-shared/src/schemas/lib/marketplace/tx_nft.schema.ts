import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type Tx_nftDocument = Tx_nft & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
})
export class Tx_nft {
  @Prop({ type: String })
  _id!: string;

  @Prop({ type: String })
  nftType!: string;

  @Prop({ type: String })
  from!: string;

  @Prop({ type: String })
  to!: string;

  @Prop({ type: Number })
  date!: number;

  @Prop({ type: String })
  txid!: string;

  @Prop({ type: String })
  type!: string;

  @Prop({ type: Number })
  price!: number;
}

export const Tx_nftSchema = SchemaFactory.createForClass(Tx_nft);
