CREATE TABLE IF NOT EXISTS "UsageEvent" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UsageEvent_shop_event_day_key"
  ON "UsageEvent"("shop", "event", "day");

CREATE INDEX IF NOT EXISTS "UsageEvent_shop_createdAt_idx"
  ON "UsageEvent"("shop", "createdAt");
