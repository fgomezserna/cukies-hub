import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type TileDocument = Tile & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class Tile {
  // @Prop({ type: String })
  // _id!: string;

  @Prop({ type: Number, required: true })
  coordinate_x!: number;

  @Prop({ type: String, default: null, ref: 'Map' })
  map!: string | null;

  @Prop({ type: Number, required: true })
  coordinate_y!: number;

  @Prop({ type: Number, required: true })
  rotation!: number;

  @Prop({ type: Number, required: true })
  bioma!: number;
}

export const TileSchema = SchemaFactory.createForClass(Tile);
