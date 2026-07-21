-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditResult" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSettings" (
    "shop" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'off',
    "apiKey" TEXT,
    "model" TEXT,
    "dailyCap" INTEGER NOT NULL DEFAULT 100,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "shop" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("shop","day")
);

-- CreateTable
CREATE TABLE "AiCache" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BulkScan" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "totalUrls" INTEGER NOT NULL DEFAULT 0,
    "scannedUrls" INTEGER NOT NULL DEFAULT 0,
    "avgScore" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BulkScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchemaConfig" (
    "shop" TEXT NOT NULL,
    "orgEnabled" BOOLEAN NOT NULL DEFAULT false,
    "productEnabled" BOOLEAN NOT NULL DEFAULT false,
    "breadcrumbEnabled" BOOLEAN NOT NULL DEFAULT false,
    "faqEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchemaConfig_pkey" PRIMARY KEY ("shop")
);

-- CreateIndex
CREATE INDEX "AuditResult_shop_createdAt_idx" ON "AuditResult"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "BulkScan_shop_startedAt_idx" ON "BulkScan"("shop", "startedAt");

-- CreateIndex
CREATE INDEX "FixLog_shop_createdAt_idx" ON "FixLog"("shop", "createdAt");
