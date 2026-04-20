import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true }) // 这个装饰器会自动为User模式添加createdAt和updatedAt字段，并在每次创建或更新文档时自动更新它们的值。
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  // 这个装饰器会将password字段设置为默认不返回，
  // 除非在查询时显式指定select('+password')。  
  @Prop({ required: false, select: false }) 
  password: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
