import { PrismaClient, Product } from '@prisma/client';
import { CreateProductDto, UpdateProductDto, ProductListQuery, ProductWithRelations } from '@/modules/products/dtos/product.dto';
import { IProductRepository } from '@/modules/products/interfaces/product.repository.interface';
import { Prisma } from '@prisma/client';

export class ProductRepository implements IProductRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateProductDto): Promise<Product> {
    return this.prisma.product.create({ data });
  }

  async findById(id: string): Promise<ProductWithRelations | null> {
    return this.prisma.product.findUnique({
      where: { id },
      include: { category: true, images: true },
    });
  }

  async findBySlug(slug: string): Promise<ProductWithRelations | null> {
    return this.prisma.product.findUnique({
      where: { slug },
      include: { category: true, images: true },
    });
  }

  async findAll(query: ProductListQuery): Promise<{ products: ProductWithRelations[]; total: number }> {
    const { categoryId, search, minPrice, maxPrice, inStock, onSale, page, limit } = query;

    const where: Prisma.ProductWhereInput = {};

    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.originalPrice = {};
      if (minPrice !== undefined) where.originalPrice.gte = minPrice;
      if (maxPrice !== undefined) where.originalPrice.lte = maxPrice;
    }
    if (inStock) where.stock = { gt: 0 };
    if (onSale) where.isOnSale = true;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: true, images: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { products, total };
  }

  async update(id: string, data: UpdateProductDto): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.product.delete({ where: { id } });
  }

  async findByCategory(categoryId: string): Promise<Product[]> {
    return this.prisma.product.findMany({ where: { categoryId } });
  }
}