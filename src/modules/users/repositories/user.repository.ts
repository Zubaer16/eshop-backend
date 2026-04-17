import { User } from '@prisma/client';
import { prisma } from '@/infrastructure/database/db';
import { IUserRepository } from './user.repository.interface';

export class UserRepository implements IUserRepository {
  async create(data: Partial<User>): Promise<User> {
    return prisma.user.create({
      data: data as any
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findAll(): Promise<User[]> {
    return prisma.user.findMany();
  }
}
