import * as mongoose from 'mongoose';

import { Document } from 'mongoose';

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type UserDocument = User & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
})
export class User {
  @Prop({ type: String })
  name!: string;

  @Prop({ type: String })
  lastName!: string;

  @Prop({ type: String })
  username!: string;

  @Prop({ type: String })
  email!: string;

  @Prop({ type: String })
  phone!: string;

  @Prop([{ type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' }])
  wallets!: string[];

  @Prop([{ type: mongoose.Schema.Types.ObjectId, ref: 'UserMap' }])
  maps!: string[];

  @Prop({ type: String })
  password!: string;

  @Prop({ type: String, enum: ['USER', 'ADMIN'] })
  role!: string;

  @Prop({ type: Number, default: 0 })
  tokenBalance!: number;

  @Prop([
    {
      type: {
        category: { type: String, default: '' },
        timestamp: { type: Number, default: 0 },
      },
      default: [],
    },
  ])
  lastChanges?: {
    category: string;
    timestamp: number;
  }[];
}

export const UserSchema = SchemaFactory.createForClass(User);
