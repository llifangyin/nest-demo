import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductDao } from './dao/product.dao';
import { CreateProductDto } from '../../../../libs/common/src/dto/create-product.dto';
import { UpdateProductDto } from '../../../../libs/common/src/dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly productDao: ProductDao) {}

  async findAll(name?: string) {
    return this.productDao.findAll({ name });
  }

  async findOne(id: string) {
    const product = await this.productDao.findById(id);
    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }
    return product;
  }

  async create(dto: CreateProductDto) {
    return this.productDao.create(dto);
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    return this.productDao.updateById(id, dto);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.productDao.deleteById(id);
  }
}
