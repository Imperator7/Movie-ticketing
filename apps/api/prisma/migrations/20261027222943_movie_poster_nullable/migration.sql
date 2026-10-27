-- AlterTable
ALTER TABLE "movies" ALTER COLUMN "poster_url" DROP NOT NULL;

-- Rows seeded before this change got a third-party placeholder URL; the web now renders its own placeholder.
UPDATE "movies" SET "poster_url" = NULL WHERE "poster_url" LIKE 'https://placehold.co/%';
