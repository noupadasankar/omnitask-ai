-- CreateEnum
CREATE TYPE "ProductTrackStatus" AS ENUM ('MATCHED', 'SKIPPED', 'WATCHING', 'PENDING_APPROVAL', 'PURCHASED', 'FAILED');

-- CreateTable
CREATE TABLE "ShoppingPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mustHaveFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avoidKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredBrands" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxPrice" INTEGER,
    "minRating" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
    "minScore" INTEGER NOT NULL DEFAULT 60,
    "autoBuyLimit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedProduct" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "url" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "lastPrice" INTEGER,
    "targetPrice" INTEGER,
    "rating" DOUBLE PRECISION,
    "score" INTEGER NOT NULL DEFAULT 0,
    "matchReasons" JSONB,
    "priceHistory" JSONB,
    "status" "ProductTrackStatus" NOT NULL DEFAULT 'MATCHED',
    "sessionId" TEXT,
    "errorMessage" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingPreference_userId_key" ON "ShoppingPreference"("userId");

-- CreateIndex
CREATE INDEX "ShoppingPreference_userId_idx" ON "ShoppingPreference"("userId");

-- CreateIndex
CREATE INDEX "TrackedProduct_userId_idx" ON "TrackedProduct"("userId");

-- CreateIndex
CREATE INDEX "TrackedProduct_status_idx" ON "TrackedProduct"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedProduct_userId_site_externalProductId_key" ON "TrackedProduct"("userId", "site", "externalProductId");
