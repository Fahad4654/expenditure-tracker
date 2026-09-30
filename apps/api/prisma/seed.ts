import { DEFAULT_SYSTEM_CATEGORIES } from '@exp/types';
import { PrismaClient } from '@prisma/client';
import { loadRepoEnv } from '../src/config/load-env';

loadRepoEnv();

/**
 * Idempotent seed: creates the shared system categories exactly once.
 * Safe to run repeatedly (`npm run db:seed`).
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    for (const category of DEFAULT_SYSTEM_CATEGORIES) {
      const existing = await prisma.category.findFirst({
        where: { userId: null, name: category.name, isSystem: true },
        select: { id: true },
      });

      if (existing) continue;

      await prisma.category.create({
        data: {
          userId: null,
          name: category.name,
          kind: 'SYSTEM',
          isSystem: true,
          icon: category.icon,
          color: category.color,
          suggestedType: category.suggestedType,
        },
      });
    }

    const count = await prisma.category.count({ where: { isSystem: true } });
    console.log(`Seed complete — ${count} system categories present.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
