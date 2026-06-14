import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

import * as bcrypt from 'bcryptjs';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { GoogleOAuthUser } from './guards/google.strategy';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly saltRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.saltRounds = Number(
      this.configService.get<number>('BCRYPT_SALT_ROUNDS', 10),
    );
  }

  // 🔐 Internal user validation
  private async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      return null;
    }

    const passwordValid = await bcrypt.compare(
      password,
      user.passwordHash,
    );

    if (!passwordValid) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  // 🔑 Centralized token generation
  private generateAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }

  // 🚪 Login
  async login(loginDto: LoginDto) {
    const user = await this.validateUser(
      loginDto.email,
      loginDto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.generateAccessToken(payload),
      user,
    };
  }

  // 🆕 Register
  async register(registerDto: RegisterDto) {
    const { email, password, name } = registerDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(
      password,
      this.saltRounds,
    );

    const resetAt = new Date();
    resetAt.setHours(24, 0, 0, 0);

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: 'USER', // ✅ explicit default
        quota: {
          create: {
            plan: 'FREE',
            resetAt,
          },
        },
        preferences: {
          create: {},
        },
      },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.generateAccessToken(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  // 🌐 OAuth login (Google) — find-or-create user, link OAuth account, issue JWT
  async validateOAuthLogin(oauthUser: GoogleOAuthUser) {
    const { provider, providerUid, email, name, avatarUrl } = oauthUser;

    // 1) Already linked to this provider account?
    const existingLink = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUid: { provider, providerUid } },
      include: { user: true },
    });

    if (existingLink?.user) {
      return this.issueTokenForUser(existingLink.user);
    }

    // 2) An account with this email exists? Link the provider to it.
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      await this.prisma.oAuthAccount.create({
        data: { userId: existingUser.id, provider, providerUid },
      });
      return this.issueTokenForUser(existingUser);
    }

    // 3) Brand new user — create with linked OAuth account, quota and prefs.
    const resetAt = new Date();
    resetAt.setHours(24, 0, 0, 0);

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        avatarUrl,
        role: 'USER',
        emailVerified: true,
        oauthAccounts: {
          create: { provider, providerUid },
        },
        quota: {
          create: { plan: 'FREE', resetAt },
        },
        preferences: {
          create: {},
        },
      },
    });

    return this.issueTokenForUser(user);
  }

  private issueTokenForUser(user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.generateAccessToken(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}