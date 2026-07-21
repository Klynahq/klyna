CREATE TABLE "RedirectInventory" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "paths" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedirectInventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RedirectChange" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "shopifyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedirectChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RedirectInventory_shop_createdAt_idx" ON "RedirectInventory"("shop", "createdAt");
CREATE INDEX "RedirectChange_shop_createdAt_idx" ON "RedirectChange"("shop", "createdAt");
