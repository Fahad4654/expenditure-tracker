-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- Backfill the change feed so devices that sync for the first time (cursor
-- null/0) receive data that was written before Phase 5 shipped. Soft-deleted
-- rows are skipped: no device ever saw them, so their tombstones would be
-- pure noise. System categories are delivered dynamically on a cursor-null
-- pull instead (they have no per-user ChangeLog rows to backfill).
INSERT INTO "ChangeLog" ("userId", "deviceId", "entityType", "entityId", "kind", "version", "createdAt")
SELECT "userId", NULL, 'TRANSACTION', "id", 'UPSERT', "version", NOW()
FROM "Transaction"
WHERE "deletedAt" IS NULL;

INSERT INTO "ChangeLog" ("userId", "deviceId", "entityType", "entityId", "kind", "version", "createdAt")
SELECT "userId", NULL, 'CATEGORY', "id", 'UPSERT', "version", NOW()
FROM "Category"
WHERE "userId" IS NOT NULL AND "deletedAt" IS NULL;
