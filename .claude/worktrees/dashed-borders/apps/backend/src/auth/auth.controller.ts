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
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  LoginDtoSchema,
  RegisterDtoSchema,
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
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) { }

  // 🆕 Register
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(RegisterDtoSchema)) registerDto: RegisterDto,
  ) {
    return this.authService.register(registerDto);
  }

  // 🔑 Login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginDtoSchema)) loginDto: LoginDto,
  ) {
    return this.authService.login(loginDto);
  }

  // 🌐 Google OAuth — kick off the redirect to Google's consent screen
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // Passport handles the redirect; this body never runs.
  }

  // 🌐 Google OAuth — callback: issue JWT and bounce back to the frontend
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(
    @Req() req: GoogleRequest,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    try {
      const { accessToken } = await this.authService.validateOAuthLogin(
        req.user,
      );
      return res.redirect(
        `${frontendUrl}/auth/callback?token=${encodeURIComponent(accessToken)}`,
      );
    } catch {
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
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