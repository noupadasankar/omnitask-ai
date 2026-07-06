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
  LogoutDto,
  LogoutDtoSchema,
  ForgotPasswordDto,
  ForgotPasswordDtoSchema,
  ResetPasswordDto,
  ResetPasswordDtoSchema,
  VerifyEmailDto,
  VerifyEmailDtoSchema,
  RequestEmailVerificationDto,
  RequestEmailVerificationDtoSchema,
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

      // The frontend is Bearer-token based (stores token/refreshToken in
      // localStorage, never reads cookies) — hand tokens back via the
      // callback URL so /auth/callback can persist them the same way
      // email/password login does.
      const params = new URLSearchParams({ token: accessToken, refreshToken });
      return res.redirect(`${this.frontendUrl}/auth/callback?${params.toString()}`);
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

  // 🚪 Logout
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body(new ZodValidationPipe(LogoutDtoSchema)) body: LogoutDto,
  ) {
    return this.authService.logout(body.refresh_token);
  }

  // 🔑 Forgot password
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordDtoSchema)) body: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(body.email);
  }

  // 🔐 Reset password
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordDtoSchema)) body: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(body.token, body.password);
  }

  // 📧 Request email verification
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('request-email-verification')
  @HttpCode(HttpStatus.OK)
  async requestEmailVerification(
    @Body(new ZodValidationPipe(RequestEmailVerificationDtoSchema)) body: RequestEmailVerificationDto,
  ) {
    return this.authService.requestEmailVerification(body.email);
  }

  // ✅ Verify email
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailDtoSchema)) body: VerifyEmailDto,
  ) {
    return this.authService.verifyEmail(body.token);
  }
}