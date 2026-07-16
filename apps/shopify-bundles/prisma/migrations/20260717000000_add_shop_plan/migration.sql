CREATE TABLE IF NOT EXISTS "ShopPlan" (
  "shop" TEXT NOT NULL,
  "handle" TEXT NOT NULL DEFAULT 'starter',
  "rawHandle" TEXT,
  "source" TEXT NOT NULL DEFAULT 'default',
  "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShopPlan_pkey" PRIMARY KEY ("shop")
);
