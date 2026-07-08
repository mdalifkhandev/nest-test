import { BadRequestException, Injectable } from '@nestjs/common';
import { SignupDto } from './dto/signup.dto';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../prisma/generated/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

@Injectable()
export class AuthService {
  private readonly prisma = new PrismaClient({ adapter });

  async signup(signupDto: SignupDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: signupDto.email,
      },
    });

    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(signupDto.password, 10);
    return this.prisma.user.create({
      data: {
        name: signupDto.name,
        email: signupDto.email,
        password: hashedPassword,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
