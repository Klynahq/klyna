ALTER TABLE "DiagnosticScan"
ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'manual';

WITH ranked_scans AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "shop", "productKey"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_number
  FROM "DiagnosticScan"
)
UPDATE "DiagnosticScan" AS scan
SET "origin" = 'baseline'
FROM ranked_scans
WHERE scan."id" = ranked_scans."id"
  AND ranked_scans.row_number = 1;
