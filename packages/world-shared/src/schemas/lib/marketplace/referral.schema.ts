import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReferralDocument = Referral & Document;

type Profile = {
  name: string;
  phone: string;
  telegram: string;
  wallet: string;
};

@Schema()
export class Referral {
  @Prop({ type: String })
  _id!: string;

  @Prop({ type: String })
  user!: string;

  @Prop({ type: String })
  referrals!: string[];

  @Prop({ type: String })
  referralstwo!: string[];

  @Prop({ type: String })
  referralsthree!: string[];

  @Prop({ type: Number })
  levelone!: number;

  @Prop({ type: Number })
  leveltwo!: number;

  @Prop({ type: Number })
  levelthree!: number;

  @Prop({ type: Number })
  comision_levelone!: number;

  @Prop({ type: Number })
  comision_leveltwo!: number;

  @Prop({ type: Number })
  comision_levelthree!: number;

  @Prop({ type: Boolean })
  buyed!: boolean;

  @Prop({ type: Number })
  num!: number;

  @Prop({ type: Number })
  cost!: number;

  @Prop({
    type: {
      name: { type: String },
      phone: { type: String },
      telegram: { type: String },
      wallet: { type: String },
    },
  })
  profile!: Profile;

  @Prop({ type: String })
  address!: string;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);
