import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type MovementDocument = Movement & Document;

interface Item {
  itemId: string;
  itemValue: number;
  amount: number;
}

@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class Movement {
  @Prop({ type: String, required: true })
  movementType!: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  user!: string;

  @Prop({
    type: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Item',
          required: true,
        },
        itemValue: { type: Number, required: true },
        amount: { type: Number, required: true },
        _id: false,
      },
    ],
    required: true,
    validate: {
      validator: function (value: Item[] | Item) {
        if (Array.isArray(value)) {
          return value.every((item: Item) =>
            mongoose.Types.ObjectId.isValid(item.itemId)
          );
        }
        return mongoose.Types.ObjectId.isValid(value.itemId);
      },
      message: 'Invalid item ID or item ID array',
    },
  })
  items!: Item[];

  @Prop({ type: String, required: true })
  movementDate!: string;

  @Prop({ type: Number, required: true })
  movementValue!: number;

  @Prop({ type: Number, required: true })
  userBalance!: number;

  @Prop({ type: String, required: true })
  cuki!: string;

  @Prop({ type: String, required: true })
  description!: string;
}

export const MovementSchema = SchemaFactory.createForClass(Movement);
