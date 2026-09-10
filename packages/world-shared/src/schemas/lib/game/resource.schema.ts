import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type ResourceDocument = Resource & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class Resource {
  @Prop({ type: Number, required: true })
  coordinate_x!: number;

  @Prop({ type: Number, required: true })
  coordinate_y!: number;

  @Prop({ type: String, required: true })
  type!: string;

  @Prop({ type: Number, required: true })
  life!: number;
}

export const ResourceSchema = SchemaFactory.createForClass(Resource);
