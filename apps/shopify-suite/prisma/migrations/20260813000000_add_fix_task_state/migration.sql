CREATE TABLE "FixTaskState" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixTaskState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixTaskState_shop_productKey_itemId_key" ON "FixTaskState"("shop", "productKey", "itemId");

CREATE INDEX "FixTaskState_shop_productKey_status_idx" ON "FixTaskState"("shop", "productKey", "status");
