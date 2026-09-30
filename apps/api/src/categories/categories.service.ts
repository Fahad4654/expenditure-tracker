import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Category } from '@exp/types';
import type { CreateCategoryInputDto, UpdateCategoryInputDto } from '@exp/validation';
import { errors } from '../common/http/api-error';
import { PrismaService } from '../prisma/prisma.module';

interface CategoryRecord {
  id: string;
  userId: string | null;
  name: string;
  kind: 'SYSTEM' | 'USER';
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  suggestedType: 'INCOME' | 'EXPENSE';
  createdAt: Date;
  updatedAt: Date;
}

export function toCategory(category: CategoryRecord): Category {
  return {
    id: category.id,
    userId: category.userId,
    name: category.name,
    kind: category.kind,
    icon: category.icon,
    color: category.color,
    isSystem: category.isSystem,
    suggestedType: category.suggestedType,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

/**
 * Categories are either shared (`isSystem`, `userId = null`) or owned by a
 * single user. Every query is scoped to the caller; another user's category is
 * reported as 404 so its existence is never disclosed.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Category[]> {
    const categories = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
        OR: [{ isSystem: true, userId: null }, { userId }],
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return categories.map(toCategory);
  }

  async create(userId: string, input: CreateCategoryInputDto): Promise<Category> {
    try {
      const category = await this.prisma.category.create({
        data: {
          userId,
          name: input.name,
          kind: 'USER',
          isSystem: false,
          icon: input.icon ?? null,
          color: input.color ?? null,
          suggestedType: input.suggestedType,
        },
      });
      return toCategory(category);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw errors.conflict('A category with this name already exists');
      }
      throw error;
    }
  }

  async update(userId: string, id: string, input: UpdateCategoryInputDto): Promise<Category> {
    const category = await this.requireOwned(userId, id);

    try {
      const updated = await this.prisma.category.update({
        where: { id: category.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.icon !== undefined && { icon: input.icon }),
          ...(input.color !== undefined && { color: input.color }),
          ...(input.suggestedType !== undefined && { suggestedType: input.suggestedType }),
        },
      });
      return toCategory(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw errors.conflict('A category with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Soft delete. Blocked while the category still has transactions — a
   * tombstoned category would leave them without a display name.
   */
  async remove(userId: string, id: string): Promise<Category> {
    const category = await this.requireOwned(userId, id);

    const inUse = await this.prisma.transaction.count({
      where: { userId, categoryId: category.id, deletedAt: null },
    });
    if (inUse > 0) {
      throw errors.conflict('Category still has transactions — move or delete them first');
    }

    const deleted = await this.prisma.category.update({
      where: { id: category.id },
      data: { deletedAt: new Date() },
    });
    return toCategory(deleted);
  }

  /** Shared system categories are visible but never mutable. */
  private async requireOwned(userId: string, id: string): Promise<CategoryRecord> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category || category.deletedAt) throw errors.notFound('Category not found');
    if (category.userId && category.userId !== userId) {
      // Another user's category — indistinguishable from "does not exist".
      throw errors.notFound('Category not found');
    }
    if (category.isSystem) {
      throw errors.forbidden('System categories cannot be modified');
    }
    return category;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
