import {
  Injectable,
  UnauthorizedException,
  ExecutionContext,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
  ) {
    // ❌ Token missing or invalid
    if (err || !user) {
      throw new UnauthorizedException(
        'Authentication required or token invalid',
      );
    }

    return user;
  }
}