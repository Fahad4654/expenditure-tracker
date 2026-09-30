import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TokenService } from '../../auth/token.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { errors } from '../http/api-error';

type RequestWithUser = Request & { user?: AuthenticatedUser };

/**
 * Global authentication guard. Every route requires a valid access token
 * unless it is annotated with `@Public()`.
 *
 * `sub` from the verified token is the *only* source of the acting user id —
 * no body or query parameter ever supplies one for authorization.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw errors.unauthorized('Missing access token');

    try {
      const payload = await this.tokens.verifyAccessToken(token);
      request.user = { sub: payload.sub, fid: payload.fid };
      return true;
    } catch {
      // Signature/expiry/claims failure — deliberately indistinguishable.
      throw errors.unauthorized('Invalid or expired access token');
    }
  }
}
