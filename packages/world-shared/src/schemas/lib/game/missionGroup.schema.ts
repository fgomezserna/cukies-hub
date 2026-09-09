import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type MissionGroupDocument = MissionGroup & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class MissionGroup {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  description!: string;

  @Prop({ type: String, required: true })
  type!: string;

  @Prop([{ type: String, required: true, ref: 'Mission' }])
  missions!: string[];
}

export const MissionGroupSchema = SchemaFactory.createForClass(MissionGroup);
