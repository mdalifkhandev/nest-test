import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtPayload } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GoogleAuthGuard } from './guards/google-auth.guard';

type GoogleAuthenticatedRequest = Request & {
  user: {
    id: number;
    email: string;
    name: string;
  };
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Email already registered' })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Account temporarily locked' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from current device' })
  @ApiBody({ required: false, type: RefreshTokenDto })
  logout(
    @CurrentUser() user: JwtPayload,
    @Body() dto?: Partial<RefreshTokenDto>,
  ) {
    return this.authService.logout(user.sub, dto?.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices' })
  logoutAll(@CurrentUser() user: JwtPayload) {
    return this.authService.logout(user.sub);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser('sub') userId: number) {
    return this.authService.getProfile(userId);
  }

  //__________________________
  //google
  //__________________________

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Login with Google' })
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth Callback' })
  async googleCallback(
    @Req() req: GoogleAuthenticatedRequest,
    @Res() res: Response,
  ) {
    const { id, email } = req.user;
    const tokens = await this.authService.googleLogin(id, email);
    const frontendUrl = process.env.FRONTEND_URL;

    if (process.env.NODE_ENV === 'production' && frontendUrl) {
      return res.redirect(
        `${frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
      );
    }

    return res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Login Successful</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #f0f2f5;
          }
          .card {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.1);
            max-width: 500px;
            width: 90%;
          }
          h2 { color: #1a73e8; margin-top: 0; }
          .token-box {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 1rem;
            margin: 1rem 0;
            word-break: break-all;
            font-size: 0.75rem;
            font-family: monospace;
          }
          .label {
            font-weight: bold;
            color: #555;
            font-size: 0.85rem;
            margin-bottom: 4px;
          }
          .copy-btn {
            background: #1a73e8;
            color: white;
            border: none;
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.8rem;
            margin-top: 6px;
          }
          .copy-btn:hover { background: #1557b0; }
          .success { color: #34a853; font-size: 0.85rem; margin-left: 8px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>✅ Google Login Successful</h2>
          <p>User: <strong>${req.user.name}</strong> (${email})</p>

          <div class="label">Access Token (15 min):</div>
          <div class="token-box" id="access">${tokens.accessToken}</div>
          <button class="copy-btn" onclick="copy('access')">Copy</button>
          <span class="success" id="access-ok"></span>

          <br/><br/>

          <div class="label">Refresh Token (7 days):</div>
          <div class="token-box" id="refresh">${tokens.refreshToken}</div>
          <button class="copy-btn" onclick="copy('refresh')">Copy</button>
          <span class="success" id="refresh-ok"></span>

          <br/><br/>
          <small style="color:#999">
            Production এ এই page দেখাবে না —
            Frontend এ redirect হবে।
          </small>
        </div>
        <script>
          function copy(id) {
            const text = document.getElementById(id).innerText;
            navigator.clipboard.writeText(text);
            document.getElementById(id + '-ok').innerText = '✓ Copied!';
            setTimeout(() => {
              document.getElementById(id + '-ok').innerText = '';
            }, 2000);
          }
        </script>
      </body>
    </html>
  `);
  }
}
