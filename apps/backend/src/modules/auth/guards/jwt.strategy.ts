import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService, JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private readonly auth: AuthService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: config.getOrThrow('JWT_SECRET') });
  }
  async validate(payload: JwtPayload) {
    const user = await this.auth.validatePayload(payload);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}