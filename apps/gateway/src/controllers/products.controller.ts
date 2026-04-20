import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { PRODUCT_SERVICE, CreateProductDto, UpdateProductDto } from '@app/common';

@Controller('products')
export class ProductsController {
  constructor(
    @Inject(PRODUCT_SERVICE) private readonly productClient: ClientProxy,
  ) {}

  @Get()
  async findAll(@Query('name') name?: string) {
    return firstValueFrom(
      this.productClient.send({ cmd: 'find_all_products' }, { name }),
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return firstValueFrom(
      this.productClient.send({ cmd: 'find_one_product' }, { id }),
    );
  }

  @Post()
  async create(@Body() dto: CreateProductDto) {
    return firstValueFrom(
      this.productClient.send({ cmd: 'create_product' }, dto),
    );
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return firstValueFrom(
      this.productClient.send({ cmd: 'update_product' }, { id, dto }),
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return firstValueFrom(
      this.productClient.send({ cmd: 'remove_product' }, { id }),
    );
  }
}