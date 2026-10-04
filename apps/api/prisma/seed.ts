import { DEFAULT_SYSTEM_CATEGORIES } from '../src/shared/types';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { loadApiEnv } from '../src/config/load-env';

loadApiEnv();

/** Same argon2id parameters as `PasswordService` (verify reads them from the hash). */
const ARGON2_OPTIONS = {
  algorithm: 2 /* argon2id */,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

const DEMO_PASSWORD = 'Password123!';

const DEMO_USERS = [
  // The maintainer account: the only one that reaches `/admin/bug-reports`.
  {
    name: 'Demo User',
    email: 'demo@example.com',
    role: 'ADMIN',
    timezone: 'Asia/Dhaka',
    defaultCurrency: 'BDT',
  },
  {
    name: 'Alice Rahman',
    email: 'alice@example.com',
    timezone: 'Asia/Dhaka',
    defaultCurrency: 'BDT',
  },
  { name: 'Bob Khan', email: 'bob@example.com', timezone: 'UTC', defaultCurrency: 'USD' },
] as const;

/**
 * Idempotent seed: creates the shared system categories exactly once, plus
 * demo users outside production. Safe to run repeatedly (`npm run db:seed`).
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

    const categoryCount = await prisma.category.count({ where: { isSystem: true } });
    console.log(`Seed complete — ${categoryCount} system categories present.`);

    if (process.env.NODE_ENV === 'production') {
      console.log('Demo users skipped (NODE_ENV=production).');
      return;
    }

    const passwordHash = await hash(DEMO_PASSWORD, ARGON2_OPTIONS);
    for (const user of DEMO_USERS) {
      const existing = await prisma.user.findUnique({
        where: { email: user.email },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.user.create({
        data: { ...user, passwordHash, emailVerified: true },
      });
    }

    const userCount = await prisma.user.count({
      where: { email: { in: DEMO_USERS.map((u) => u.email) } },
    });
    // Re-running the seed promotes the demo maintainer in place, so an
    // existing local account can reach the admin panel without a reset.
    await prisma.user.updateMany({
      where: { email: 'demo@example.com' },
      data: { role: 'ADMIN' },
    });
    console.log(`Demo users — ${userCount} present: ${DEMO_USERS.map((u) => u.email).join(', ')}`);
    console.log(`Password for all demo users: ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
