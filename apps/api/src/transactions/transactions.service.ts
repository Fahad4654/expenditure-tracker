import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Transaction as PrismaTransaction } from '@prisma/client';
import type { Paginated, Transaction } from '../shared/types';
import type {
  CreateTransactionInputDto,
  ListTransactionsQueryDto,
  UpdateTransactionInputDto,
} from '../shared/validation';
import { dateRangeWhere, resolveDateRange } from '../common/utils/date-range';
import { errors } from '../common/http/api-error';
import { toDecimalString } from '../common/utils/money';
import { withTx } from '../common/utils/with-tx';
import { recordChange } from '../sync/change-feed';
import { PrismaService } from '../prisma/prisma.module';
import { UsersService } from '../users/users.service';

type TransactionRecord = PrismaTransaction;

/** Only these two shapes are ever readable by a user: system or their own. */
const VISIBLE_CATEGORIES = (userId: string) =>
  ({ OR: [{ isSystem: true, userId: null }, { userId }] }) satisfies Prisma.CategoryWhereInput;

export function toTransaction(transaction: TransactionRecord): Transaction {
  return {
    id: transaction.id,
    clientId: transaction.clientId,
    deviceId: transaction.deviceId,
    userId: transaction.userId,
    type: transaction.type,
    amount: toDecimalString(transaction.amount),
    currency: transaction.currency,
    categoryId: transaction.categoryId,
    title: transaction.title,
    description: transaction.description,
    transactionDate: transaction.transactionDate.toISOString().slice(0, 10),
    version: transaction.version,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
    deletedAt: transaction.deletedAt?.toISOString() ?? null,
  };
}

/**
 * Transaction CRUD.
 *
 * Two invariants drive the design:
 *  - every read and write is scoped to `userId` from the JWT, and an id owned by
 *    somebody else is reported as 404 so existence is not disclosed;
 *  - `clientId` makes creation idempotent for offline clients, and `version`
 *    gives every subsequent write an optimistic-concurrency check.
 */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async create(
    userId: string,
    input: CreateTransactionInputDto,
    db?: Prisma.TransactionClient,
  ): Promise<{ transaction: Transaction; created: boolean }> {
    const clientId = input.clientId ?? randomUUID();

    return withTx(this.prisma, db, async (tx) => {
      if (input.clientId) {
        const existing = await tx.transaction.findUnique({
          where: { userId_clientId: { userId, clientId } },
        });
        if (existing) return { transaction: toTransaction(existing), created: false };
      }

      await this.requireVisibleCategory(userId, input.categoryId, tx);

      try {
        const created = await tx.transaction.create({
          data: {
            clientId,
            deviceId: input.deviceId ?? null,
            userId,
            type: input.type,
            amount: input.amount,
            currency:
              input.currency ?? (await this.users.financeDefaults(userId)).defaultCurrency,
            categoryId: input.categoryId,
            title: input.title,
            description: input.description ?? null,
            transactionDate: `${input.transactionDate}T00:00:00.000Z`,
          },
        });
        await recordChange(tx, {
          userId,
          deviceId: created.deviceId,
          entityType: 'TRANSACTION',
          entityId: created.id,
          kind: 'UPSERT',
          version: created.version,
        });
        return { transaction: toTransaction(created), created: true };
      } catch (error) {
        // Lost the race against a concurrent replay of the same `clientId`.
        // Read via the root client: a caught P2002 poisons the interactive
        // transaction, so no further statement may run on `tx` here.
        if (isUniqueViolation(error)) {
          const existing = await this.prisma.transaction.findUnique({
            where: { userId_clientId: { userId, clientId } },
          });
          if (existing) return { transaction: toTransaction(existing), created: false };
        }
        throw error;
      }
    });
  }

  async list(userId: string, query: ListTransactionsQueryDto): Promise<Paginated<Transaction>> {
    const { timezone } = await this.users.financeDefaults(userId);
    const range = resolveDateRange(
      { from: query.from, to: query.to, preset: query.preset },
      timezone,
    );

    const where: Prisma.TransactionWhereInput = {
      userId,
      deletedAt: null,
      ...(query.type && { type: query.type }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...dateRangeWhere(range),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: orderByFor(query.sort, query.order),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      items: rows.map(toTransaction),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async get(userId: string, id: string): Promise<Transaction> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!transaction) throw errors.notFound('Transaction not found');
    return toTransaction(transaction);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateTransactionInputDto,
    db?: Prisma.TransactionClient,
  ): Promise<Transaction> {
    const { baseVersion, ...fields } = input;

    return withTx(this.prisma, db, async (tx) => {
      if (input.categoryId) await this.requireVisibleCategory(userId, input.categoryId, tx);

      const result = await tx.transaction.updateMany({
        where: {
          id,
          userId,
          deletedAt: null,
          // Optimistic concurrency: only apply if the caller saw this version.
          ...(baseVersion !== undefined && { version: baseVersion }),
        },
        data: {
          ...(fields.type !== undefined && { type: fields.type }),
          ...(fields.amount !== undefined && { amount: fields.amount }),
          ...(fields.currency !== undefined && { currency: fields.currency }),
          ...(fields.categoryId !== undefined && { categoryId: fields.categoryId }),
          ...(fields.title !== undefined && { title: fields.title }),
          ...(fields.description !== undefined && { description: fields.description }),
          ...(fields.transactionDate !== undefined && {
            transactionDate: `${fields.transactionDate}T00:00:00.000Z`,
          }),
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        const current = await tx.transaction.findFirst({
          where: { id, userId, deletedAt: null },
          select: { version: true },
        });
        if (!current) throw errors.notFound('Transaction not found');
        throw errors.conflict(
          `Transaction was modified by someone else (expected version ${baseVersion}, found ${current.version})`,
        );
      }

      const updated = await tx.transaction.findFirst({
        where: { id, userId, deletedAt: null },
      });
      if (!updated) throw errors.notFound('Transaction not found');
      // REST edits carry no deviceId — broadcast to every device.
      await recordChange(tx, {
        userId,
        deviceId: null,
        entityType: 'TRANSACTION',
        entityId: updated.id,
        kind: 'UPSERT',
        version: updated.version,
      });
      return toTransaction(updated);
    });
  }

  async remove(
    userId: string,
    id: string,
    db?: Prisma.TransactionClient,
  ): Promise<Transaction> {
    return withTx(this.prisma, db, async (tx) => {
      const result = await tx.transaction.updateMany({
        where: { id, userId, deletedAt: null },
        // Tombstone, not a hard delete: sync still needs to announce the removal.
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      if (result.count === 0) throw errors.notFound('Transaction not found');

      const deleted = await tx.transaction.findFirst({ where: { id, userId } });
      if (!deleted) throw errors.notFound('Transaction not found');
      await recordChange(tx, {
        userId,
        deviceId: null,
        entityType: 'TRANSACTION',
        entityId: deleted.id,
        kind: 'DELETE',
        version: deleted.version,
      });
      return toTransaction(deleted);
    });
  }

  /** A category outside the caller's visibility is "not found", not "forbidden". */
  private async requireVisibleCategory(
    userId: string,
    categoryId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const category = await tx.category.findFirst({
      where: { id: categoryId, deletedAt: null, ...VISIBLE_CATEGORIES(userId) },
      select: { id: true },
    });
    if (!category) throw errors.notFound('Category not found');
  }
}

function orderByFor(
  sort: 'transactionDate' | 'createdAt' | 'amount',
  order: 'asc' | 'desc',
): Prisma.TransactionOrderByWithRelationInput {
  switch (sort) {
    case 'amount':
      return { amount: order };
    case 'createdAt':
      return { createdAt: order };
    default:
      return { transactionDate: order };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
