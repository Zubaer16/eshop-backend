import { User } from '@prisma/client';
import { IUserRepository } from '../repositories/user.repository.interface';
import { AppError } from '@/shared/errors/app-error';

export class UserService {
  constructor(private userRepository: IUserRepository) {}

  async createUser(data: Partial<User>): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(data.email!);
    if (existingUser) {
      throw new AppError('Email already exists', 400);
    }
    return this.userRepository.create(data);
  }

  async getUser(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return this.userRepository.findAll();
  }
}
