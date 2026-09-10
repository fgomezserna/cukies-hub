import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Document } from 'mongoose';
import { User } from './user.schema';

export type WalletDocument = Wallet & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
})
export class Wallet {
  @Prop({ type: String, enum: ['TRON', 'BSC'] })
  chain!: string;

  @Prop({ type: String })
  address!: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  user!: User;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
