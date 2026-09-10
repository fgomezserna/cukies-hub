import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
export type DashboardCacheDocument = DashboardCache & Document;

@Schema({ collection: 'dashboard_cache', timestamps: true })
export class DashboardCache {
  @Prop({ type: String })
  time: string;

  @Prop({ type: Number })
  putOnSale: number;

  @Prop({ type: Number })
  cukiesBought: number;

  @Prop({ type: Number })
  trx: number;

  @Prop({ type: Number })
  bnb: number;
}

export const DashboardCacheSchema =
  SchemaFactory.createForClass(DashboardCache);
