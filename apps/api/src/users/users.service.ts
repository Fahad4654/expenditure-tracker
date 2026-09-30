import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { errors } from '../common/http/api-error';
import { toUserProfile, UserRecord } from './user.mapper';
import type { UpdateProfileInputDto } from '@exp/validation';
import type { UserProfile } from '@exp/types';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string): Promise<UserProfile> {
    return toUserProfile(await this.require(userId));
  }

  async update(userId: string, input: UpdateProfileInputDto): Promise<UserProfile> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.defaultCurrency !== undefined && { defaultCurrency: input.defaultCurrency }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
      },
    });
    return toUserProfile(user);
  }

  /**
   * Per-user defaults used to interpret queries: the timezone decides what
   * "today"/"this month" means, the currency is what a new transaction gets
   * when the caller does not specify one.
   */
  async financeDefaults(userId: string): Promise<{ timezone: string; defaultCurrency: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { timezone: true, defaultCurrency: true },
    });
    if (!user) throw errors.notFound('User not found');
    return { timezone: user.timezone, defaultCurrency: user.defaultCurrency };
  }

  private async require(userId: string): Promise<UserRecord> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw errors.notFound('User not found');
    return user;
  }
}
