-- Runs once when the PostgreSQL data directory is first initialised.

-- gen_random_uuid() backs every UUID primary key in the Prisma schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Trigram index support for fuzzy title search on transactions.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
