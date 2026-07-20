import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PassportModule } from '@nestjs/passport';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GoogleStrategy } from './strategies/google.strategy';

@Module({
  imports: [JwtModule.register({}), PassportModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, GoogleStrategy, GoogleAuthGuard],
  exports: [AuthService],
})
export class AuthModule {}
