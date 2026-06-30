import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  LoginDtoSchema,
  RegisterDtoSchema,
  RefreshTokenDto,
  RefreshTokenDtoSchema,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GoogleOAuthUser } from './guards/google.strategy';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

interface GoogleRequest extends Request {
  user: GoogleOAuthUser;
}

@Controller('auth')
export class AuthController {
  private readonly frontendUrl: string;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }

  // 🆕 Register
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(RegisterDtoSchema)) registerDto: RegisterDto,
  ) {
    return this.authService.register(registerDto);
  }

  // 🔑 Login
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginDtoSchema)) loginDto: LoginDto,
  ) {
    return this.authService.login(loginDto);
  }

  // 🔄 Refresh token
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenDtoSchema)) body: RefreshTokenDto,
  ) {
    return this.authService.refreshAccessToken(body.refresh_token);
  }

  // 🛡️ CSRF token — any GET request sets the csrf-token cookie automatically
  @Get('csrf-token')
  @HttpCode(HttpStatus.OK)
  csrfToken() {
    return { message: 'OK' };
  }

  // 🌐 Google OAuth — kick off the redirect to Google's consent screen
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // Passport handles the redirect; this body never runs.
  }

  // 🌐 Google OAuth — callback: issue JWT via httpOnly cookie and bounce to frontend
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(
    @Req() req: GoogleRequest,
    @Res() res: Response,
  ) {
    try {
      const { accessToken, refreshToken } = await this.authService.validateOAuthLogin(
        req.user,
      );

      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 1000, // 1 hour
      });

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return res.redirect(`${this.frontendUrl}/auth/callback`);
    } catch {
      return res.redirect(`${this.frontendUrl}/login?error=oauth_failed`);
    }
  }

  // 👤 Profile (protected)
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() req: AuthenticatedRequest) {
    return req.user;
  }

  // 👤 Current User details (protected, mapped to frontend /auth/me)
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: AuthenticatedRequest) {
    return this.authService.getUserProfile(req.user.id);
  }
}