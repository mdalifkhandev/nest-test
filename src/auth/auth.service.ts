import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SignupDto } from './dto/signup.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ──────────────────────────────────────────────
  // SIGNUP
  // ──────────────────────────────────────────────

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
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
      message: 'Account created successfully',
      data: user,
    };
  }

  // ──────────────────────────────────────────────
  // LOGIN
  // ──────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.loginBlockedUntil && user.loginBlockedUntil > new Date()) {
      const retryAfter = Math.ceil(
        (user.loginBlockedUntil.getTime() - Date.now()) / 1000,
      );
      throw new ForbiddenException(
        `Account temporarily locked. Try again in ${retryAfter} seconds`,
      );
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      await this.handleFaildLogin(user.id, user.loginFailedCount);
      throw new UnauthorizedException('Invalid credentials');
    }

    const updatedUser = await this.prisma.user.update({
      where: {
        email: dto.email,
      },
      data: {
        loginCount: { increment: 1 },
        lastLoginAt: new Date(),
        loginBlockedUntil: null,
        loginFailedCount: 0,
      },
      select: {
        id: true,
        name: true,
        email: true,
        loginCount: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const tokens = await this.generateTokens(updatedUser.id, updatedUser.email);

    return {
      success: true,
      statusCode: 200,
      message: 'Login successful',
      data: { updatedUser, ...tokens },
    };
  }

  // ──────────────────────────────────────────────
  // REFRESH TOKEN
  // ──────────────────────────────────────────────

  async refreshToken(rawRefreshToken: string) {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: {
        token: rawRefreshToken,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        await this.prisma.refreshToken.delete({
          where: { id: storedToken.id },
        });
      }

      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    await this.prisma.refreshToken.delete({
      where: {
        id: storedToken.id,
      },
    });

    const tokens = await this.generateTokens(
      storedToken.user.id,
      storedToken.user.email,
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Tokens refreshed',
      data: tokens,
    };
  }

  // ──────────────────────────────────────────────
  // LOGOUT
  // ──────────────────────────────────────────────

  async logout(userId: number, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({
        where: {
          token: refreshToken,
          userId,
        },
      });
    } else {
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Logged Out successfully',
      data: null,
    };
  }

  // ──────────────────────────────────────────────
  // GET PROFILE
  // ──────────────────────────────────────────────

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        loginCount: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exixit');
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Profile fetched successfully',
      data: user,
    };
  }

  // ──────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────

  private async handleFaildLogin(userId: number, currentFailedCount: number) {
    const newFailedCount = currentFailedCount + 1;
    const shouldBlock = newFailedCount >= MAX_FAILED_ATTEMPTS;

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        loginFailedCount: newFailedCount,
        loginBlockedUntil: shouldBlock
          ? new Date(Date.now() + BLOCK_DURATION_MS)
          : undefined,
      },
    });
  }

  private async generateTokens(userId: number, email: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email },
      {
        secret: this.configService.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );

    const rawRefreshToken = randomBytes(64).toString('hex');

    const refreshexpiresAt = new Date(Date.now() + 7 * 24 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        token: rawRefreshToken,
        userId,
        expiresAt: refreshexpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      accessTokenExpiresIn: 15 * 60,
    };
  }
}
