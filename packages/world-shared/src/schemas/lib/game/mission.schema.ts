import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type Reward = {
  exp: { skill: string; quantity: number }[];
  item: { ItemID: mongoose.Schema.Types.ObjectId; quantity: number }[];
};

export type MissionDocument = Mission & Document;
@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class Mission extends Document {
  @Prop({ type: String, required: true, unique: true })
  MissionId: string;

  @Prop({ type: String, required: true })
  MissionName: string;

  @Prop({ type: String })
  Description: string;

  @Prop({ type: Number, required: true })
  tier: number;

  @Prop({ type: Object, required: true })
  reward: Reward;

  @Prop({ type: [String], default: [] })
  actions: string[];

  @Prop({
    type: [
      {
        ItemID: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
        quantity: { type: Number },
      },
    ],
    default: [],
  })
  materials: { ItemID: mongoose.Schema.Types.ObjectId; quantity: number }[];

  @Prop({
    type: [String],
    default: [],
  })
  requirements: string[];
}

export const MissionSchema = SchemaFactory.createForClass(Mission);
