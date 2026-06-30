import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { GoogleOAuthUser } from './guards/google.strategy';

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly saltRounds: number;
  private readonly refreshExpiresInMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.saltRounds = Number(
      this.configService.get<number>('BCRYPT_SALT_ROUNDS', 10),
    );
    this.refreshExpiresInMs = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  }

  // 🔐 Internal user validation
  // A pre-computed bcrypt hash of a random string. Compared against when no
  // matching user exists so login timing does not reveal account existence.
  private static readonly DUMMY_PASSWORD_HASH =
    '$2a$12$JjcpaRHHm.3STTpUWhLsduTu6iWP5mwaagjnA8zaMDiT.iLtSeefS';

  private async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      // Equalize timing with the wrong-password path to prevent user enumeration.
      await bcrypt.compare(password, AuthService.DUMMY_PASSWORD_HASH);
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

  // Hash token before storing so a DB dump cannot replay sessions.
  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.refreshExpiresInMs);
    await this.prisma.session.create({
      data: { userId, refreshToken: this.hashToken(token), expiresAt },
    });
    return token;
  }

  private async issueTokenPair(user: {
    id: string;
    email: string;
    role: string;
  }): Promise<TokenPair> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = await this.generateRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenPair> {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken: this.hashToken(refreshToken) },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.session.delete({ where: { id: session.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: delete old session, create new one
    await this.prisma.session.delete({ where: { id: session.id } });
    return this.issueTokenPair(session.user);
  }

  // 🚪 Login
  async login(loginDto: LoginDto) {
    const user = await this.validateUser(
      loginDto.email,
      loginDto.password,
    );

    if (!user) {
      await this.auditService.log({
        action: 'LOGIN_FAILED',
        resource: 'user',
        metadata: { email: loginDto.email },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.auditService.log({
      userId: user.id,
      action: 'LOGIN',
      resource: 'user',
      resourceId: user.id,
    });

    return {
      ...await this.issueTokenPair(user),
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
        role: 'USER',
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

    await this.auditService.log({
      userId: user.id,
      action: 'REGISTER',
      resource: 'user',
      resourceId: user.id,
      metadata: { email, name },
    });

    return {
      ...await this.issueTokenPair(user),
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
      await this.auditService.log({
        userId: existingLink.user.id,
        action: 'OAUTH_LOGIN',
        resource: 'user',
        resourceId: existingLink.user.id,
        metadata: { provider, providerUid },
      });
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
      await this.auditService.log({
        userId: existingUser.id,
        action: 'OAUTH_LINK',
        resource: 'user',
        resourceId: existingUser.id,
        metadata: { provider, providerUid },
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

    await this.auditService.log({
      userId: user.id,
      action: 'OAUTH_REGISTER',
      resource: 'user',
      resourceId: user.id,
      metadata: { provider, providerUid, email, name },
    });

    return this.issueTokenForUser(user);
  }

  private async issueTokenForUser(user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  }) {
    const tokens = await this.issueTokenPair(user);

    return {
      ...tokens,
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