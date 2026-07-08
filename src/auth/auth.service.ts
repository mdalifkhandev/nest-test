import 'dotenv/config';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { SignupDto } from './dto/signup.dto';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { LoginDto } from './dto/login.dto';

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
    const user = await this.prisma.user.create({
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

    return {
      success: true,
      statusCode: 201,
      message: 'User created successfully',
      data: user,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: loginDto.email,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid email or password');
    }

    if(user.loginBlockedUntil && user.loginBlockedUntil>new Date()){
      throw new UnauthorizedException({
        success: false,
        statusCode: 429,
        message: 'Login temporarily blocked. Try again later.',
        data: null,
      });
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      const now =new Date();
      const blockedUntill = new Date(now.getTime()+2*60*1000);

      await this.prisma.user.update({
        where:{
          email:loginDto.email
        },data:{
          loginFailedCount: { increment: 1 },
          loginBlockedUntil: blockedUntill
        }
      })
      throw new BadRequestException('Invalid email or password');
    }

    const updatedUser = await this.prisma.user.update({
      where: {
        email: loginDto.email,
      },
      data: {
        loginCount: { increment: 1 },
        lastLoginAt: new Date(),
        loginBlockedUntil: null,
        loginFailedCount: 0,
      },
      select:{
          id: true,
        name: true,
        email: true,
        loginCount: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      }
    });

  
    return {
      success: true,
      statusCode: 200,
      message: 'Login successful',
      data: updatedUser,
    };
  }
}
