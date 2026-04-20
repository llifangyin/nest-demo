import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from '@app/common';

@Injectable()
export class ProductDao {
  constructor(
    @InjectModel(Product.name)
    private productModel: Model<ProductDocument>,
  ) {}

  findAll(filter: { name?: string } = {}): Promise<Product[]> {
    const query: { name?: RegExp } = {};
    if (filter.name) {
      query.name = new RegExp(filter.name, 'i');
    }
    return this.productModel.find(query).exec();
  }

  findById(id: string): Promise<Product | null> {
    return this.productModel.findById(id).exec();
  }

  create(product: Partial<Product>): Promise<Product> {
    return this.productModel.create(product);
  }

  updateById(id: string, product: Partial<Product>): Promise<Product | null> {
    return this.productModel
      .findByIdAndUpdate(id, product, { new: true })
      .exec();
  }

  deleteById(id: string): Promise<Product | null> {
    return this.productModel.findByIdAndDelete(id).exec();
  }
}
