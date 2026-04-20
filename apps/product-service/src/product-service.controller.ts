import { Controller } from '@nestjs/common';
import { ProductsService } from './product-service.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CreateProductDto, UpdateProductDto } from '@app/common';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @MessagePattern({ cmd: 'find_all_products' })
  findAll(@Payload() data: { name?: string }) {
    return this.productsService.findAll(data.name);
  }

  @MessagePattern({ cmd: 'find_one_product' })
  findOne(@Payload() data: { id: string }) {
    return this.productsService.findOne(data.id);
  }

  @MessagePattern({ cmd: 'create_product' })
  create(@Payload() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @MessagePattern({ cmd: 'update_product' })
  update(@Payload() data: { id: string; dto: UpdateProductDto }) {
    return this.productsService.update(data.id, data.dto);
  }

  @MessagePattern({ cmd: 'remove_product' })
  remove(@Payload() data: { id: string }) {
    return this.productsService.remove(data.id);
  }
}
