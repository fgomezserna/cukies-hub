import * as mongoose from 'mongoose';

import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type MapDocument = Map & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class Map {
  @Prop({ type: String, required: true })
  name!: string;

  @Prop({
    type: {
      Map: {
        type: {
          mapSize: { type: Number, required: true },
          mapLayers: [{ type: Array, required: true }],
        },
      },
    },
    required: true,
  })
  data!: {
    mapSize: number;
    mapLayers: number[][];
  };

  @Prop([
    {
      type: String,
      ref: 'resourceMap',
      default: [],
    },
  ])
  resourceMaps!: string[];
}

export const MapSchema = SchemaFactory.createForClass(Map);
