import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../../shared/types';
import { PrismaService } from '../../prisma/prisma.module';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { errors } from '../http/api-error';

type RequestWithUser = Request & { user?: AuthenticatedUser };

/**
 * Admin-only guard. Applied per controller/route with `@UseGuards(AdminGuard)`,
 * so the global `JwtAuthGuard` has already run and `request.user` is populated.
 *
 * The role is read from the database on every request rather than trusted from
 * the token: the JWT payload only carries `sub`/`fid`, so demoting an admin
 * takes effect immediately instead of at the next refresh.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const actor = request.user;
    if (!actor) throw errors.unauthorized('Missing access token');

    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { role: true, deletedAt: true },
    });
    // Missing, soft-deleted or non-admin: all the same 403 to the caller.
    if (!user || user.deletedAt || !this.isAdmin(user.role)) {
      throw errors.forbidden('Admin access required');
    }
    return true;
  }

  private isAdmin(role: UserRole): boolean {
    return role === 'ADMIN';
  }
}
