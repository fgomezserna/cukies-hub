import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ItemDocument = Item & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class Item {
  @Prop({ type: String })
  ItemName!: string;

  @Prop({ type: String })
  ItemDescription!: string;

  @Prop({ type: String, required: true, unique: true })
  ItemID!: string;

  @Prop({ type: Number })
  ItemTier!: number;

  @Prop({ type: Number })
  ItemStackMax!: number;

  @Prop({ type: String })
  ItemEffectDescription!: string;

  @Prop({ type: String })
  ItemRarity!: string;

  @Prop({ type: Boolean, default: true })
  Tradeable!: boolean;

  @Prop({ type: Number })
  ItemValue!: number;
}

export const ItemSchema = SchemaFactory.createForClass(Item);
