import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  /** JWT `sub` — the only source of the acting user id. */
  sub: string;
  /** Refresh-token family the access token belongs to. */
  fid: string;
}

/**
 * Resolves the user attached by `JwtAuthGuard`.
 *
 * Usage: `@CurrentUser() user: AuthenticatedUser`
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new Error('CurrentUser used on a route that is not protected by JwtAuthGuard');
    }
    return user;
  },
);
