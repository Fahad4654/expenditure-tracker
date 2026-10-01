import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';

/**
 * Runs `fn` in an interactive transaction when the caller did not supply one,
 * and reuses the caller's transaction when they did (sync batches must nest by
 * reuse — Prisma cannot open a transaction inside a transaction).
 *
 * The discriminator is explicit (`db === undefined`), not runtime reflection:
 * the Prisma interactive-transaction client is not reliably distinguishable
 * from the root client by shape or `instanceof`.
 */
export function withTx<T>(
  root: PrismaService,
  db: Prisma.TransactionClient | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db ? fn(db) : root.$transaction(fn);
}
